import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { cn } from '@/lib/utils';
import { Fracao, Projeto, Divisao, TIPOLOGIAS, NIVEIS_QUALIDADE, TIPOS_DIVISAO, TipoDivisao } from '@/types/project';
import { v4 } from '@/lib/utils';
import { gerarTarefas } from '@/lib/wbs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, ArrowLeft, Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';

function NumericInput({ value, min, max, step, onChange, className, title }: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  className?: string;
  title?: string;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => { setRaw(String(value)); }, [value]);
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={raw}
      className={`${className} [appearance:textfield]`}
      title={title}
      onChange={e => setRaw(e.target.value)}
      onBlur={() => {
        const n = parseFloat(raw.replace(',', '.'));
        if (isNaN(n)) { setRaw(String(value)); return; }
        const clamped = min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, n) : n) : n;
        onChange(clamped);
        setRaw(String(clamped));
      }}
    />
  );
}

const defaultDivisoes = (): Divisao[] => [
  { id: v4(), tipo: 'Sala', area: 25, peDireito: 2.7 },
  { id: v4(), tipo: 'Quarto', area: 14, peDireito: 2.7 },
  { id: v4(), tipo: 'Quarto', area: 12, peDireito: 2.7 },
  { id: v4(), tipo: 'Casa de Banho', area: 6, peDireito: 2.7 },
  { id: v4(), tipo: 'Cozinha', area: 10, peDireito: 2.7 },
  { id: v4(), tipo: 'Circulação', area: 8, peDireito: 2.7 },
];

export default function NovoProjeto() {
  const { adicionarProjeto, projetos } = useApp();
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [parentId, setParentId] = useState<string>(() => sessionStorage.getItem('novaEstimativaParentId') ?? '');

  useEffect(() => {
    const pid = sessionStorage.getItem('novaEstimativaParentId');
    if (pid) { setParentId(pid); sessionStorage.removeItem('novaEstimativaParentId'); }
  }, []);

  const projetosTopo = projetos.filter(p => p.tipo === 'projeto');
  const [fracoes, setFracoes] = useState<Fracao[]>([
    { id: v4(), nome: 'Fração A', tipologia: 'T2', divisoes: defaultDivisoes(), qualidade: 'Médio', quantidade: 1 },
  ]);

  const adicionarFracao = () => {
    setFracoes(prev => [
      ...prev,
      { id: v4(), tipo: 'Fracao' as const, nome: `Fração ${String.fromCharCode(65 + prev.length)}`, tipologia: 'T2', divisoes: defaultDivisoes(), qualidade: 'Médio', quantidade: 1 },
    ]);
  };

  const adicionarZonaComum = () => {
    const numZonasComuns = fracoes.filter(f => f.tipo === 'ZonaComum').length;
    setFracoes(prev => [
      ...prev,
      {
        id: v4(),
        tipo: 'ZonaComum' as const,
        nome: `Zona Comum ${numZonasComuns + 1}`,
        tipologia: 'T0',
        divisoes: [{ id: v4(), tipo: 'Sala' as TipoDivisao, area: 50, peDireito: 2.7 }],
        qualidade: 'Médio',
        quantidade: 1,
      },
    ]);
  };

  const removerFracao = (id: string) => {
    if (fracoes.length <= 1) return;
    setFracoes(prev => prev.filter(f => f.id !== id));
  };

  const atualizarFracao = (id: string, updates: Partial<Fracao>) => {
    setFracoes(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const adicionarDivisao = (fracaoId: string) => {
    setFracoes(prev => prev.map(f =>
      f.id === fracaoId ? { ...f, divisoes: [...f.divisoes, { id: v4(), tipo: 'Quarto' as TipoDivisao, area: 12, peDireito: 2.7 }] } : f
    ));
  };

  const removerDivisao = (fracaoId: string, divisaoId: string) => {
    setFracoes(prev => prev.map(f =>
      f.id === fracaoId ? { ...f, divisoes: f.divisoes.filter(d => d.id !== divisaoId) } : f
    ));
  };

  const atualizarDivisao = (fracaoId: string, divisaoId: string, updates: Partial<Divisao>) => {
    setFracoes(prev => prev.map(f =>
      f.id === fracaoId ? { ...f, divisoes: f.divisoes.map(d => d.id === divisaoId ? { ...d, ...updates } : d) } : f
    ));
  };

  const criarProjeto = () => {
    if (!nome.trim()) return;
    const todasTarefas = fracoes.flatMap(f => gerarTarefas(f));
    const projeto: Projeto = {
      id: v4(),
      nome: nome.trim(),
      criadoEm: new Date().toISOString(),
      fracoes,
      tarefas: todasTarefas,
      tipo: 'estimativa',
      parentId: parentId || null,
    };
    adicionarProjeto(projeto);
    navigate(`/projeto/${projeto.id}`);
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center gap-3 mb-8">
        <Link to="/">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="section-title">Nova Estimativa</h1>
          <p className="section-subtitle mt-0.5">Configure a estimativa e as suas frações</p>
        </div>
      </div>

      <div className="max-w-6xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informação da Estimativa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-md space-y-4">
              <div>
                <Label htmlFor="nome">Nome da Estimativa</Label>
                <Input id="nome" placeholder="Ex: Estimativa Base V1" value={nome} onChange={e => setNome(e.target.value)} className="mt-1.5" />
              </div>
              {projetosTopo.length > 0 && (
                <div>
                  <Label className="text-sm">Projeto <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                  <Select value={parentId || '__none__'} onValueChange={v => setParentId(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Associar a um projeto…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Sem projeto —</SelectItem>
                      {projetosTopo.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Frações ({fracoes.length})</h2>
          <Button variant="outline" size="sm" onClick={adicionarFracao}>
            <Plus className="h-4 w-4 mr-1.5" />
            Adicionar Fração
          </Button>
        </div>

        {fracoes.map((fracao, idx) => {
          const countByTipo: Record<string, number> = {};
          for (const d of fracao.divisoes) countByTipo[d.tipo] = (countByTipo[d.tipo] ?? 0) + 1;
          const indexByTipo: Record<string, number> = {};
          return (
          <Card key={fracao.id}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-sm">Fração {idx + 1}</h3>
                {fracoes.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removerFracao(fracao.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-4">
                <div>
                  <Label>Nome</Label>
                  <Input value={fracao.nome} onChange={e => atualizarFracao(fracao.id, { nome: e.target.value })} className="mt-1" />
                </div>
                <div>
                  <Label>Tipologia</Label>
                  <Select value={fracao.tipologia} onValueChange={v => atualizarFracao(fracao.id, { tipologia: v as any })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOLOGIAS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nível de Qualidade</Label>
                  <Select value={fracao.qualidade} onValueChange={v => atualizarFracao(fracao.id, { qualidade: v as any })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NIVEIS_QUALIDADE.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Nº de frações</Label>
                  <NumericInput
                    min={1}
                    step={1}
                    value={fracao.quantidade}
                    onChange={v => atualizarFracao(fracao.id, { quantidade: Math.round(v) })}
                    className="mt-1 mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Para o total do projeto</p>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium">Divisões</p>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => adicionarDivisao(fracao.id)}>
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar Divisão
                </Button>
              </div>
              {fracao.divisoes.length > 0 && (
                <div className="grid gap-1" style={{ gridTemplateColumns: '1fr 160px 160px 32px' }}>
                  <span className="text-xs text-muted-foreground px-1">Tipo</span>
                  <span className="text-xs text-muted-foreground px-1">Área (m²)</span>
                  <span className="text-xs text-muted-foreground px-1">Pé direito (m)</span>
                  <span />
                  {fracao.divisoes.map(divisao => {
                    indexByTipo[divisao.tipo] = (indexByTipo[divisao.tipo] ?? 0) + 1;
                    const displayName = countByTipo[divisao.tipo] > 1 ? `${divisao.tipo} ${indexByTipo[divisao.tipo]}` : divisao.tipo;
                    return (
                    <>
                      <Select key={divisao.id + '-tipo'} value={divisao.tipo} onValueChange={v => atualizarDivisao(fracao.id, divisao.id, { tipo: v as TipoDivisao })}>
                        <SelectTrigger className="h-9 text-sm"><span className="truncate">{displayName}</span></SelectTrigger>
                        <SelectContent>
                          {TIPOS_DIVISAO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <NumericInput
                        key={divisao.id + '-area'}
                        min={0}
                        value={divisao.area}
                        onChange={v => atualizarDivisao(fracao.id, divisao.id, { area: v })}
                        className="h-9 mono text-sm w-full"
                      />
                      <NumericInput
                        key={divisao.id + '-pd'}
                        min={1.5}
                        max={6}
                        step={0.1}
                        value={divisao.peDireito}
                        onChange={v => atualizarDivisao(fracao.id, divisao.id, { peDireito: v })}
                        className="h-9 mono text-sm w-full"
                      />
                      <Button
                        key={divisao.id + '-del'}
                        variant="ghost"
                        size="icon"
                        className="h-9 w-8 text-destructive"
                        onClick={() => removerDivisao(fracao.id, divisao.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ); })}
                </div>
              )}
              {fracao.divisoes.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2">Nenhuma divisão adicionada.</p>
              )}
            </CardContent>
          </Card>
          );
        })}

        <div className="flex justify-end gap-3 pt-2">
          <Link to="/">
            <Button variant="outline">Cancelar</Button>
          </Link>
          <Button onClick={criarProjeto} disabled={!nome.trim()}>
            Criar Projeto e Gerar Tarefas
          </Button>
        </div>
      </div>
    </div>
  );
}
