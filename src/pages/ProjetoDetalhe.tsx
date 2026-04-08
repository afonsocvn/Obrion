import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { TarefaCusto, Fracao, NIVEIS_QUALIDADE } from '@/types/project';
import { calcularCustoTarefa, calcularResumo, gerarTarefas } from '@/lib/wbs';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, ChevronDown, ChevronRight, Search } from 'lucide-react';
import CostDistributionChart from '@/components/CostDistributionChart';
import MaterialPicker from '@/components/MaterialPicker';

export default function ProjetoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { projetos, atualizarProjeto } = useApp();
  const navigate = useNavigate();
  const projeto = projetos.find(p => p.id === id);

  const [filtroFracao, setFiltroFracao] = useState<string>('todas');
  const [filtroCapitulo, setFiltroCapitulo] = useState<string>('todos');
  const [expandedCapitulos, setExpandedCapitulos] = useState<Set<string>>(new Set());
  const [materialPickerTarefa, setMaterialPickerTarefa] = useState<string | null>(null);

  const tarefasFiltradas = useMemo(() => {
    if (!projeto) return [];
    let t = projeto.tarefas;
    if (filtroFracao !== 'todas') t = t.filter(x => x.fracaoId === filtroFracao);
    if (filtroCapitulo !== 'todos') t = t.filter(x => x.capitulo === filtroCapitulo);
    return t;
  }, [projeto?.tarefas, filtroFracao, filtroCapitulo]);

  const capitulos = useMemo(() => {
    if (!projeto) return [];
    return [...new Set(projeto.tarefas.map(t => t.capitulo))];
  }, [projeto?.tarefas]);

  const tarefasAgrupadas = useMemo(() => {
    const groups: Record<string, Record<string, TarefaCusto[]>> = {};
    tarefasFiltradas.forEach(t => {
      if (!groups[t.capitulo]) groups[t.capitulo] = {};
      if (!groups[t.capitulo][t.subcapitulo]) groups[t.capitulo][t.subcapitulo] = [];
      groups[t.capitulo][t.subcapitulo].push(t);
    });
    return groups;
  }, [tarefasFiltradas]);

  const resumo = calcularResumo(tarefasFiltradas);

  if (!projeto) {
    return (
      <div className="page-container">
        <p className="text-muted-foreground">Projeto não encontrado.</p>
        <Link to="/"><Button variant="outline" className="mt-4">Voltar</Button></Link>
      </div>
    );
  }

  const tarefasFiltradas = useMemo(() => {
    let t = projeto.tarefas;
    if (filtroFracao !== 'todas') t = t.filter(x => x.fracaoId === filtroFracao);
    if (filtroCapitulo !== 'todos') t = t.filter(x => x.capitulo === filtroCapitulo);
    return t;
  }, [projeto.tarefas, filtroFracao, filtroCapitulo]);

  const capitulos = useMemo(() => {
    const caps = [...new Set(projeto.tarefas.map(t => t.capitulo))];
    return caps;
  }, [projeto.tarefas]);

  const tarefasAgrupadas = useMemo(() => {
    const groups: Record<string, Record<string, TarefaCusto[]>> = {};
    tarefasFiltradas.forEach(t => {
      if (!groups[t.capitulo]) groups[t.capitulo] = {};
      if (!groups[t.capitulo][t.subcapitulo]) groups[t.capitulo][t.subcapitulo] = [];
      groups[t.capitulo][t.subcapitulo].push(t);
    });
    return groups;
  }, [tarefasFiltradas]);

  const resumo = calcularResumo(tarefasFiltradas);

  const toggleCapitulo = (cap: string) => {
    setExpandedCapitulos(prev => {
      const n = new Set(prev);
      n.has(cap) ? n.delete(cap) : n.add(cap);
      return n;
    });
  };

  const atualizarTarefa = (tarefaId: string, updates: Partial<TarefaCusto>) => {
    const novasTarefas = projeto.tarefas.map(t => t.id === tarefaId ? { ...t, ...updates } : t);
    atualizarProjeto({ ...projeto, tarefas: novasTarefas });
  };

  const alterarQualidadeFracao = (fracaoId: string, qualidade: string) => {
    const novasFracoes = projeto.fracoes.map(f =>
      f.id === fracaoId ? { ...f, qualidade: qualidade as any } : f
    );
    const fracao = novasFracoes.find(f => f.id === fracaoId)!;
    const novasTarefasFracao = gerarTarefas(fracao);
    const outasTarefas = projeto.tarefas.filter(t => t.fracaoId !== fracaoId);
    atualizarProjeto({ ...projeto, fracoes: novasFracoes, tarefas: [...outasTarefas, ...novasTarefasFracao] });
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="section-title">{projeto.nome}</h1>
          <p className="section-subtitle mt-0.5">
            {projeto.fracoes.length} {projeto.fracoes.length === 1 ? 'fração' : 'frações'} · {projeto.tarefas.length} tarefas
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Material', value: resumo.totalMaterial, color: 'text-primary' },
          { label: 'Mão de Obra', value: resumo.totalMaoObra, color: 'text-success' },
          { label: 'Margem', value: resumo.totalMargem, color: 'text-warning' },
          { label: 'Total', value: resumo.total, color: 'text-foreground' },
        ].map(item => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`text-lg font-semibold mono ${item.color}`}>{formatCurrency(item.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Frações quality control */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-2">Qualidade por Fração</h2>
        <div className="flex flex-wrap gap-2">
          {projeto.fracoes.map(f => (
            <div key={f.id} className="flex items-center gap-2 bg-card border rounded-md px-3 py-1.5">
              <span className="text-sm">{f.nome}</span>
              <Select value={f.qualidade} onValueChange={v => alterarQualidadeFracao(f.id, v)}>
                <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NIVEIS_QUALIDADE.map(q => <SelectItem key={q} value={q}>{q}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={filtroFracao} onValueChange={setFiltroFracao}>
          <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Fração" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as frações</SelectItem>
            {projeto.fracoes.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroCapitulo} onValueChange={setFiltroCapitulo}>
          <SelectTrigger className="w-52 h-9"><SelectValue placeholder="Capítulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os capítulos</SelectItem>
            {capitulos.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* WBS Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th className="min-w-[250px]">Tarefa</th>
                <th className="w-16">Un.</th>
                <th className="w-20">Qtd.</th>
                <th className="w-28">Material (€)</th>
                <th className="w-28">M. Obra (€)</th>
                <th className="w-20">Margem %</th>
                <th className="w-28 text-right">Total (€)</th>
                <th className="w-36">Fornecedor</th>
                <th className="w-36">Notas</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(tarefasAgrupadas).map(([capitulo, subcaps]) => {
                const expanded = expandedCapitulos.has(capitulo) || expandedCapitulos.size === 0;
                return (
                  <CapituloGroup
                    key={capitulo}
                    capitulo={capitulo}
                    subcapitulos={subcaps}
                    expanded={expanded}
                    onToggle={() => toggleCapitulo(capitulo)}
                    onUpdate={atualizarTarefa}
                    onPickMaterial={setMaterialPickerTarefa}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-muted/50">
                <td colSpan={6} className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right mono">{formatCurrency(resumo.total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Chart */}
      <div className="mt-8">
        <Card>
          <CardContent className="p-6">
            <h3 className="text-sm font-semibold mb-4">Distribuição de Custos</h3>
            <CostDistributionChart projetos={[projeto]} />
          </CardContent>
        </Card>
      </div>

      {materialPickerTarefa && (
        <MaterialPicker
          onSelect={(material) => {
            atualizarTarefa(materialPickerTarefa, {
              custoMaterial: material.precoUnitario,
              materialId: material.id,
            });
            setMaterialPickerTarefa(null);
          }}
          onClose={() => setMaterialPickerTarefa(null)}
        />
      )}
    </div>
  );
}

function CapituloGroup({
  capitulo,
  subcapitulos,
  expanded,
  onToggle,
  onUpdate,
  onPickMaterial,
}: {
  capitulo: string;
  subcapitulos: Record<string, TarefaCusto[]>;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, updates: Partial<TarefaCusto>) => void;
  onPickMaterial: (id: string) => void;
}) {
  const allTarefas = Object.values(subcapitulos).flat();
  const totalCap = allTarefas.reduce((s, t) => s + calcularCustoTarefa(t), 0);

  return (
    <>
      <tr className="cursor-pointer hover:bg-muted/50" onClick={onToggle}>
        <td colSpan={6} className="px-3 py-2 font-semibold text-sm">
          <span className="flex items-center gap-1.5">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {capitulo}
          </span>
        </td>
        <td className="px-3 py-2 text-right font-semibold mono text-sm">{formatCurrency(totalCap)}</td>
        <td colSpan={2} />
      </tr>
      {expanded && Object.entries(subcapitulos).map(([subcap, tarefas]) => (
        <SubcapituloGroup key={subcap} subcapitulo={subcap} tarefas={tarefas} onUpdate={onUpdate} onPickMaterial={onPickMaterial} />
      ))}
    </>
  );
}

function SubcapituloGroup({
  subcapitulo,
  tarefas,
  onUpdate,
  onPickMaterial,
}: {
  subcapitulo: string;
  tarefas: TarefaCusto[];
  onUpdate: (id: string, updates: Partial<TarefaCusto>) => void;
  onPickMaterial: (id: string) => void;
}) {
  return (
    <>
      <tr className="bg-muted/20">
        <td colSpan={9} className="px-3 py-1.5 pl-10 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {subcapitulo}
        </td>
      </tr>
      {tarefas.map(t => (
        <TarefaRow key={t.id} tarefa={t} onUpdate={onUpdate} onPickMaterial={onPickMaterial} />
      ))}
    </>
  );
}

function TarefaRow({
  tarefa,
  onUpdate,
  onPickMaterial,
}: {
  tarefa: TarefaCusto;
  onUpdate: (id: string, updates: Partial<TarefaCusto>) => void;
  onPickMaterial: (id: string) => void;
}) {
  const total = calcularCustoTarefa(tarefa);

  return (
    <tr>
      <td className="px-3 py-1.5 pl-14 text-sm">{tarefa.tarefa}</td>
      <td className="px-3 py-1.5 text-xs text-muted-foreground">{tarefa.unidade}</td>
      <td className="px-1 py-1">
        <Input
          type="number"
          min={0}
          value={tarefa.quantidade}
          onChange={e => onUpdate(tarefa.id, { quantidade: Math.max(0, Number(e.target.value)) })}
          className="h-7 text-xs mono w-16"
        />
      </td>
      <td className="px-1 py-1">
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            step={0.01}
            value={tarefa.custoMaterial}
            onChange={e => onUpdate(tarefa.id, { custoMaterial: Math.max(0, Number(e.target.value)) })}
            className="h-7 text-xs mono w-20"
          />
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onPickMaterial(tarefa.id)} title="Pesquisar material">
            <Search className="h-3 w-3" />
          </Button>
        </div>
      </td>
      <td className="px-1 py-1">
        <Input
          type="number"
          min={0}
          step={0.01}
          value={tarefa.custoMaoObra}
          onChange={e => onUpdate(tarefa.id, { custoMaoObra: Math.max(0, Number(e.target.value)) })}
          className="h-7 text-xs mono w-20"
        />
      </td>
      <td className="px-1 py-1">
        <Input
          type="number"
          min={0}
          max={100}
          value={tarefa.margemEmpreiteiro}
          onChange={e => onUpdate(tarefa.id, { margemEmpreiteiro: Math.max(0, Number(e.target.value)) })}
          className="h-7 text-xs mono w-16"
        />
      </td>
      <td className="px-3 py-1.5 text-right mono text-sm font-medium">{formatCurrency(total)}</td>
      <td className="px-1 py-1">
        <Input
          value={tarefa.fornecedor}
          onChange={e => onUpdate(tarefa.id, { fornecedor: e.target.value })}
          className="h-7 text-xs w-32"
          placeholder="Fornecedor"
        />
      </td>
      <td className="px-1 py-1">
        <Input
          value={tarefa.notas}
          onChange={e => onUpdate(tarefa.id, { notas: e.target.value })}
          className="h-7 text-xs w-32"
          placeholder="Notas"
        />
      </td>
    </tr>
  );
}
