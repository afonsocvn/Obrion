import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { Fracao, Projeto, TIPOLOGIAS, NIVEIS_QUALIDADE, AreasFracao } from '@/types/project';
import { v4 } from '@/lib/utils';
import { gerarTarefas } from '@/lib/wbs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const defaultAreas: AreasFracao = { sala: 25, quartos: 14, numQuartos: 2, casasBanho: 6, numCasasBanho: 1, cozinha: 10, varandas: 5, circulacao: 8, zonaExterior: 0 };

export default function NovoProjeto() {
  const { adicionarProjeto } = useApp();
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [fracoes, setFracoes] = useState<Fracao[]>([
    { id: v4(), nome: 'Fração A', tipologia: 'T2', areas: { ...defaultAreas }, qualidade: 'Médio' },
  ]);

  const adicionarFracao = () => {
    setFracoes(prev => [
      ...prev,
      { id: v4(), nome: `Fração ${String.fromCharCode(65 + prev.length)}`, tipologia: 'T2', areas: { ...defaultAreas }, qualidade: 'Médio' },
    ]);
  };

  const removerFracao = (id: string) => {
    if (fracoes.length <= 1) return;
    setFracoes(prev => prev.filter(f => f.id !== id));
  };

  const atualizarFracao = (id: string, updates: Partial<Fracao>) => {
    setFracoes(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const atualizarArea = (id: string, key: keyof AreasFracao, value: number) => {
    setFracoes(prev => prev.map(f => f.id === id ? { ...f, areas: { ...f.areas, [key]: value } } : f));
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
          <h1 className="section-title">Novo Projeto</h1>
          <p className="section-subtitle mt-0.5">Configure o projeto e as suas frações</p>
        </div>
      </div>

      <div className="max-w-4xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informação do Projeto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-md">
              <Label htmlFor="nome">Nome do Projeto</Label>
              <Input id="nome" placeholder="Ex: Edifício Residencial Alfa" value={nome} onChange={e => setNome(e.target.value)} className="mt-1.5" />
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

        {fracoes.map((fracao, idx) => (
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
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
              </div>

              <p className="text-xs text-muted-foreground mb-2 font-medium">Quantidade</p>
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 mb-4">
                {([
                  ['numQuartos', 'Nº de Quartos'],
                  ['numCasasBanho', 'Nº de Casas de Banho'],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={fracao.areas[key]}
                      onChange={e => atualizarArea(fracao.id, key, Math.max(0, Number(e.target.value)))}
                      className="mt-1 mono text-sm"
                    />
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground mb-2 font-medium">Áreas (m²)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                {([
                  ['sala', 'Sala'],
                  ['quartos', 'Quartos (total)'],
                  ['casasBanho', 'Casas de Banho (total)'],
                  ['cozinha', 'Cozinha'],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={fracao.areas[key]}
                      onChange={e => atualizarArea(fracao.id, key, Math.max(0, Number(e.target.value)))}
                      className="mt-1 mono text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {([
                  ['varandas', 'Varandas'],
                  ['circulacao', 'Circulação'],
                  ['zonaExterior', 'Zona Exterior'],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-xs">{label}</Label>
                    <Input
                      type="number"
                      min={0}
                      value={fracao.areas[key]}
                      onChange={e => atualizarArea(fracao.id, key, Math.max(0, Number(e.target.value)))}
                      className="mt-1 mono text-sm"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

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
