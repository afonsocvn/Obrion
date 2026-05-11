import { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '@/contexts/AppContext';
import { supabase } from '@/lib/supabase';
import { TarefaCusto, Fracao, Material, MaoDeObra, TemplateDivisao, TemplateTarefa, TIPOS_MATERIAL, TIPOS_DIVISAO, Divisao } from '@/types/project';
import { calcularCustoTarefa, calcularResumo, gerarTarefas, getTemplatesSubcapitulo, normalizarSubcapitulo, MULTIPLICADORES_QUALIDADE, TemplateTask } from '@/lib/wbs';
import { formatCurrency, v4 } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, ChevronDown, ChevronRight, ChevronLeft, Search, ImagePlus, X, Plus, Trash2, Pencil, Check, ZoomIn, Bookmark, BookmarkCheck, FileDown, FolderOpen, BarChart2, Layers } from 'lucide-react';
import { Label } from '@/components/ui/label';
import CostDistributionChart from '@/components/CostDistributionChart';
import MaterialPicker from '@/components/MaterialPicker';
import MaoDeObraPicker from '@/components/MaoDeObraPicker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function ProjetoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { projetos, atualizarProjeto, materiais, maoDeObra, templates, adicionarTemplate } = useApp();
  const navigate = useNavigate();
  const projeto = projetos.find(p => p.id === id);

  const [activeTab, setActiveTab] = useState<'estimativas' | 'orcamentos'>('estimativas');

  type OrcResumo = { id: string; nome: string; criadoEm: string; nPropostas: number; total: number };
  const [orcamentosProj, setOrcamentosProj] = useState<OrcResumo[]>(() => {
    // Conta propostas do cache local imediatamente (para o header mostrar o nº correto)
    try {
      const raw: any[] = JSON.parse(localStorage.getItem('orcamentos_v2') ?? '[]');
      return raw
        .filter(o => o.projetoId === id)
        .map(o => ({
          id: o.id, nome: o.nome, criadoEm: o.criadoEm,
          nPropostas: (o.projetos ?? []).length,
          total: (o.projetos ?? []).reduce((s: number, p: any) =>
            s + (p.ficheiros ?? []).reduce((sf: number, f: any) => sf + (f.total ?? 0), 0), 0),
        }));
    } catch { return []; }
  });
  const [loadingOrc, setLoadingOrc] = useState(false);

  // Recarrega propostas sempre que o tab fica ativo ou o id muda
  // Lê do cache local (localStorage) + Supabase para garantir dados mesmo sem sync
  useEffect(() => {
    if (!id || activeTab !== 'orcamentos') return;
    setLoadingOrc(true);

    // Lê do cache local imediatamente
    const fromLocal = (): OrcResumo[] => {
      try {
        const raw: any[] = JSON.parse(localStorage.getItem('orcamentos_v2') ?? '[]');
        return raw
          .filter(o => o.projetoId === id)
          .map(o => ({
            id: o.id,
            nome: o.nome,
            criadoEm: o.criadoEm,
            nPropostas: (o.projetos ?? []).length,
            total: (o.projetos ?? []).reduce((s: number, p: any) =>
              s + (p.ficheiros ?? []).reduce((sf: number, f: any) => sf + (f.total ?? 0), 0), 0),
          }));
      } catch { return []; }
    };

    const local = fromLocal();
    if (local.length > 0) {
      setOrcamentosProj(local);
      setLoadingOrc(false);
    }

    // Também tenta buscar do Supabase (para ter dados de outros dispositivos)
    supabase.from('orcamentos')
      .select(`id, nome, criado_em, projeto_default, orcamento_projetos(id, versao, orcamento_ficheiros(total))`)
      .eq('projeto_id', id)
      .then(({ data }) => {
        const db: OrcResumo[] = (data ?? []).map((row: any) => {
          const projs: any[] = row.orcamento_projetos ?? [];
          const defProj = row.projeto_default ? projs.find((p: any) => p.id === row.projeto_default) : null;
          const totalProj = (p: any) => (p.orcamento_ficheiros ?? []).reduce((s: number, f: any) => s + (f.total ?? 0), 0);
          const total = defProj ? totalProj(defProj) : (projs.length > 0 ? Math.max(...projs.map(totalProj), 0) : 0);
          return { id: row.id, nome: row.nome, criadoEm: row.criado_em, nPropostas: projs.length, total };
        });
        // Junta: prioridade ao Supabase, complementa com locais ainda não sincronizados
        const merged = [...db];
        for (const lo of local) {
          if (!merged.find(o => o.id === lo.id)) merged.push(lo);
        }
        setOrcamentosProj(merged);
        setLoadingOrc(false);
      });
  }, [id, activeTab]);

  const [filtroFracoes, setFiltroFracoes] = useState<Set<string>>(new Set());
  const [filtroCapitulo, setFiltroCapitulo] = useState<string>('todos');
  const [expandedCapitulos, setExpandedCapitulos] = useState<Set<string>>(new Set());
  const [materialPickerTarefa, setMaterialPickerTarefa] = useState<{ tarefaId: string; categoriaFiltro?: string } | null>(null);
  const [maoDeObraPickerTarefa, setMaoDeObraPickerTarefa] = useState<{ tarefaId: string; categoriaFiltro?: string } | null>(null);
  const [guardarTemplateInfo, setGuardarTemplateInfo] = useState<{ subcapitulo: string; tarefas: TarefaCusto[] } | null>(null);
  const [aplicarTemplateInfo, setAplicarTemplateInfo] = useState<{ subcapitulo: string; capitulo: string; fracaoId: string } | null>(null);

  const tableWrapRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const ro = new ResizeObserver(() => setTableScrollWidth(table.scrollWidth));
    ro.observe(table);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const wrap = tableWrapRef.current;
    const top = topScrollRef.current;
    if (!wrap || !top) return;
    let busy = false;
    const fromWrap = () => { if (!busy) { busy = true; top.scrollLeft = wrap.scrollLeft; busy = false; } };
    const fromTop  = () => { if (!busy) { busy = true; wrap.scrollLeft = top.scrollLeft;  busy = false; } };
    wrap.addEventListener('scroll', fromWrap);
    top.addEventListener('scroll', fromTop);
    return () => { wrap.removeEventListener('scroll', fromWrap); top.removeEventListener('scroll', fromTop); };
  }, []);

  const tarefasFiltradas = useMemo(() => {
    if (!projeto) return [];
    let t = projeto.tarefas;
    if (filtroFracoes.size > 0) t = t.filter(x => filtroFracoes.has(x.fracaoId));
    if (filtroCapitulo !== 'todos') t = t.filter(x => x.capitulo === filtroCapitulo);
    return t;
  }, [projeto?.tarefas, filtroFracoes, filtroCapitulo]);

  const capitulos = useMemo(() => {
    if (!projeto) return [];
    return [...new Set(projeto.tarefas.map(t => t.capitulo))];
  }, [projeto?.tarefas]);

  const tarefasAgrupadas = useMemo(() => {
    const groups: Record<string, Record<string, TarefaCusto[]>> = {};
    // Mostrar divisões separadas apenas quando se vê uma única fração
    const mostrarSeparado = filtroFracoes.size === 1 || projeto.fracoes.length === 1;
    tarefasFiltradas.forEach(t => {
      const subcap = mostrarSeparado ? t.subcapitulo : normalizarSubcapitulo(t.subcapitulo);
      if (!groups[t.capitulo]) groups[t.capitulo] = {};
      if (!groups[t.capitulo][subcap]) groups[t.capitulo][subcap] = [];
      groups[t.capitulo][subcap].push(t);
    });
    return groups;
  }, [tarefasFiltradas, filtroFracoes, projeto.fracoes.length]);

  const resumo = useMemo(() => {
    if (!projeto) return calcularResumo([]);
    // When no specific fractions selected (= all), apply quantity multipliers
    const qtdPorFracao = Object.fromEntries(projeto.fracoes.map(f => [f.id, f.quantidade ?? 1]));
    const tarefasComQtd = tarefasFiltradas.map(t => ({
      ...t,
      quantidade: t.quantidade * (filtroFracoes.size === 0 ? (qtdPorFracao[t.fracaoId] ?? 1) : 1),
    }));
    return calcularResumo(tarefasComQtd);
  }, [tarefasFiltradas, filtroFracoes, projeto?.fracoes]);

  if (!projeto) {
    return (
      <div className="page-container">
        <p className="text-muted-foreground">Projeto não encontrado.</p>
        <Link to="/"><Button variant="outline" className="mt-4">Voltar</Button></Link>
      </div>
    );
  }

  // ── Projeto container (tipo='projeto') ──────────────────────────────────────
  if (projeto.tipo === 'projeto') {
    const estimativasProj = projetos.filter(p => (p.tipo === 'estimativa' || !p.tipo) && p.parentId === projeto.id);

    const setCaract = (field: keyof typeof projeto, val: number) =>
      atualizarProjeto({ ...projeto, [field]: val });

    const m2Total = (projeto.m2AcimaSolo ?? 0) + (projeto.m2AbaixoSolo ?? 0);

    return (
      <div className="animate-fade-in px-3 py-3">
        <div className="flex items-center gap-3 mb-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="flex-1">
            <h1 className="section-title">{projeto.nome}</h1>
            <p className="section-subtitle mt-0.5">
              {estimativasProj.length} estimativa(s) · {orcamentosProj.length} orçamento(s)
              {m2Total > 0 && ` · ${m2Total} m²`}
              {(projeto.numApartamentos ?? 0) > 0 && ` · ${projeto.numApartamentos} apt.`}
            </p>
          </div>
        </div>

        {/* Características do Projeto */}
        <Card className="mb-4 bg-slate-50/60">
          <CardContent className="py-3 px-4">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Características do Projeto</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              {([
                ['m2AcimaSolo',    'm² acima do solo'],
                ['m2AbaixoSolo',   'm² abaixo do solo'],
                ['m2Retalho',      'm² retalho'],
                ['numApartamentos','Nº apartamentos'],
              ] as const).map(([field, label]) => (
                <div key={field}>
                  <label className="text-xs text-muted-foreground">{label}</label>
                  <input type="number" min={0}
                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                    value={(projeto[field] as number) || ''}
                    placeholder="0"
                    onChange={e => setCaract(field, field === 'numApartamentos' ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                ['m2AreasComuns',   'Áreas comuns (m²)'],
                ['m2Circulacao',    'Circulação (m²)'],
                ['m2AreasTecnicas', 'Áreas técnicas (m²)'],
                ['m2Terracos',      'Terraços (m²)'],
              ] as const).map(([field, label]) => (
                <div key={field}>
                  <label className="text-xs text-muted-foreground">{label}</label>
                  <input type="number" min={0}
                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                    value={(projeto[field] as number) || ''}
                    placeholder="0"
                    onChange={e => setCaract(field, parseFloat(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex border-b mb-4">
          {(['estimativas', 'orcamentos'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {tab === 'estimativas'
                ? `Estimativas${estimativasProj.length > 0 ? ` (${estimativasProj.length})` : ''}`
                : `Propostas${orcamentosProj.length > 0 ? ` (${orcamentosProj.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* Tab: Estimativas */}
        {activeTab !== 'orcamentos' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">Modelos de custo para este projeto.</p>
              <Button size="sm" className="gap-1.5" onClick={() => {
                sessionStorage.setItem('novaEstimativaParentId', projeto.id);
                navigate('/novo-projeto');
              }}>
                <Plus className="h-3.5 w-3.5" /> Nova Estimativa
              </Button>
            </div>
            {estimativasProj.length === 0 ? (
              <div className="text-center py-14 border-2 border-dashed rounded-xl text-muted-foreground">
                <Layers className="h-9 w-9 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Sem estimativas para este projeto.</p>
                <p className="text-xs mt-1 mb-4">Crie uma estimativa para modelar os custos de construção.</p>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  sessionStorage.setItem('novaEstimativaParentId', projeto.id);
                  navigate('/novo-projeto');
                }}>
                  <Plus className="h-3.5 w-3.5" /> Criar primeira estimativa
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {estimativasProj.map(est => {
                  const resumo = calcularResumo(est.tarefas);
                  return (
                    <Card key={est.id} className="hover:shadow-sm transition-shadow cursor-pointer"
                      onClick={() => navigate(`/projeto/${est.id}`)}>
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{est.nome}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {est.fracoes.length} fração(ões) · {new Date(est.criadoEm).toLocaleDateString('pt-PT')}
                          </p>
                        </div>
                        <p className="text-sm font-bold shrink-0">{resumo.total > 0 ? formatCurrency(resumo.total) : '—'}</p>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab: Orçamentos */}
        {activeTab === 'orcamentos' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">Propostas de empreiteiros e fornecedores.</p>
              <Button size="sm" className="gap-1.5" onClick={() => {
                sessionStorage.setItem('newOrcProjetoId', projeto.id);
                navigate('/orcamentos');
              }}>
                <Plus className="h-3.5 w-3.5" /> Nova Proposta
              </Button>
            </div>
            {loadingOrc ? (
              <p className="text-sm text-muted-foreground py-6 text-center">A carregar…</p>
            ) : orcamentosProj.length === 0 ? (
              <div className="text-center py-14 border-2 border-dashed rounded-xl text-muted-foreground">
                <BarChart2 className="h-9 w-9 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Sem propostas para este projeto.</p>
                <p className="text-xs mt-1 mb-4">Importe propostas de empreiteiros para comparar orçamentos.</p>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
                  sessionStorage.setItem('newOrcProjetoId', projeto.id);
                  navigate('/orcamentos');
                }}>
                  <Plus className="h-3.5 w-3.5" /> Criar primeira proposta
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {orcamentosProj.map(orc => (
                  <Card key={orc.id} className="hover:shadow-sm transition-shadow cursor-pointer"
                    onClick={() => { sessionStorage.setItem('targetOrcId', orc.id); navigate('/orcamentos'); }}>
                    <CardContent className="py-3 px-4 flex items-center gap-3">
                      <FolderOpen className="h-5 w-5 text-blue-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{orc.nome}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {orc.nPropostas} orçamento(s) · {new Date(orc.criadoEm).toLocaleDateString('pt-PT')}
                        </p>
                      </div>
                      <p className="text-sm font-bold shrink-0">{formatCurrency(orc.total)}</p>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

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

  const eliminarTarefa = (tarefaId: string) => {
    atualizarProjeto({ ...projeto, tarefas: projeto.tarefas.filter(t => t.id !== tarefaId) });
  };

  const renomearSubcapitulo = (oldName: string, newName: string, fracaoId: string) => {
    const novasTarefas = projeto.tarefas.map(t =>
      t.subcapitulo === oldName && t.fracaoId === fracaoId ? { ...t, subcapitulo: newName } : t
    );
    atualizarProjeto({ ...projeto, tarefas: novasTarefas });
  };

  const adicionarTarefaManual = (capitulo: string, subcapitulo: string, fracaoId: string, template?: TemplateTask) => {
    const fracao = projeto.fracoes.find(f => f.id === fracaoId);
    const mult = fracao ? MULTIPLICADORES_QUALIDADE[fracao.qualidade] : 1;
    const nova: TarefaCusto = {
      id: v4(), capitulo, subcapitulo,
      tarefa: template?.tarefa ?? 'Nova tarefa',
      unidade: template?.unidade ?? 'vg.',
      quantidade: 1,
      custoMaterial: template ? Math.round(template.custoMaterialBase * mult * 100) / 100 : 0,
      custoMaoObra:  template ? Math.round(template.custoMaoObraBase  * mult * 100) / 100 : 0,
      margemEmpreiteiro: template?.margemBase ?? 15,
      categoriaFiltro: template?.categoriaFiltro,
      tipoMaterial: '', fornecedor: '', notas: '', fracaoId,
    };
    atualizarProjeto({ ...projeto, tarefas: [...projeto.tarefas, nova] });
  };


  return (
    <div className="animate-fade-in px-3 py-3">
      <div className="flex items-center gap-3 mb-3 print:hidden">
        <Link to="/">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="section-title">{projeto.nome}</h1>
          <p className="section-subtitle mt-0.5">
            {projeto.fracoes.length} {projeto.fracoes.length === 1 ? 'fração' : 'frações'} · {projeto.tarefas.length} tarefas
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
          <FileDown className="h-4 w-4" />
          PDF
        </Button>
      </div>

      {/* Fraction cards */}
      <div className="flex gap-4 overflow-x-auto pb-2 mb-3 items-start print:flex-wrap print:overflow-visible">
        {projeto.fracoes.map(f => (
          <FracaoImagem
            key={f.id}
            fracao={f}
            selected={filtroFracoes.has(f.id)}
            onToggle={() => setFiltroFracoes(prev => {
              const next = new Set(prev);
              next.has(f.id) ? next.delete(f.id) : next.add(f.id);
              return next;
            })}
            onQuantidade={(qty) => {
              const novasFracoes = projeto.fracoes.map(x => x.id === f.id ? { ...x, quantidade: qty } : x);
              atualizarProjeto({ ...projeto, fracoes: novasFracoes });
            }}
            onImagem={(url) => {
              const novasFracoes = projeto.fracoes.map(x => x.id === f.id ? { ...x, imagemUrl: url } : x);
              atualizarProjeto({ ...projeto, fracoes: novasFracoes });
            }}
            onDivisoes={(divisoes) => {
              const novasFracoes = projeto.fracoes.map(x => x.id === f.id ? { ...x, divisoes } : x);
              atualizarProjeto({ ...projeto, fracoes: novasFracoes });
            }}
          />
        ))}
      </div>

      {/* Charts + Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">Distribuição de Custos</h3>
            <CostDistributionChart tarefas={tarefasFiltradas} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">Total por Fração</h3>
            <CustoPorFracao fracoes={projeto.fracoes} tarefas={projeto.tarefas} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-1.5 text-muted-foreground uppercase tracking-wide">Custo por Divisão</h3>
            <CustoPorDivisao tarefas={tarefasFiltradas} />
          </CardContent>
        </Card>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Material', value: resumo.totalMaterial, color: 'text-primary' },
          { label: 'Mão de Obra', value: resumo.totalMaoObra, color: 'text-success' },
          { label: 'Margem', value: resumo.totalMargem, color: 'text-warning' },
          { label: 'Total', value: resumo.total, color: 'text-foreground' },
        ].map(item => (
          <Card key={item.label}>
            <CardContent className="p-2.5">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className={`text-base font-semibold mono ${item.color}`}>{formatCurrency(item.value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-2 print:hidden">
        <Select value={filtroCapitulo} onValueChange={setFiltroCapitulo}>
          <SelectTrigger className="w-52 h-8 text-sm"><SelectValue placeholder="Capítulo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os capítulos</SelectItem>
            {capitulos.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* WBS Table */}
      <Card className="print:hidden">
        {/* Top scrollbar mirror */}
        <div ref={topScrollRef} className="overflow-x-auto border-b" style={{ height: 16 }}>
          <div style={{ width: tableScrollWidth || '100%', height: 1 }} />
        </div>
        <div ref={tableWrapRef} className="overflow-x-auto">
          <table ref={tableRef} className="data-table">
            <thead>
              <tr>
                <th className="min-w-[250px]">Tarefa</th>
                <th className="w-16">Un.</th>
                <th className="w-28">Qtd.</th>
                <th className="w-40">Material</th>
                <th className="w-36">Material (€)</th>
                <th className="w-28">M. Obra (€)</th>
                <th className="w-20">Margem %</th>
                <th className="w-28 text-right">Total (€)</th>
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
                    onDelete={eliminarTarefa}
                    onAddTarefa={adicionarTarefaManual}
                    onPickMaterial={(tarefaId, cat) => setMaterialPickerTarefa({ tarefaId, categoriaFiltro: cat })}
                    onPickMaoDeObra={(tarefaId, cat) => setMaoDeObraPickerTarefa({ tarefaId, categoriaFiltro: cat })}
                    materiais={materiais}
                    maoDeObra={maoDeObra}
                    templates={templates}
                    onGuardar={(subcap, tarefas) => setGuardarTemplateInfo({ subcapitulo: subcap, tarefas })}
                    onAplicar={(subcap, cap, fracaoId) => setAplicarTemplateInfo({ subcapitulo: subcap, capitulo: cap, fracaoId })}
                    onRenameSubcap={renomearSubcapitulo}
                    fracaoIdAtivo={filtroFracoes.size === 1 ? [...filtroFracoes][0] : (projeto.fracoes[0]?.id ?? '')}
                    fracaoIdDefault={projeto.fracoes[0]?.id ?? ''}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-muted/50">
                <td colSpan={7} className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right mono">{formatCurrency(resumo.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>


      {/* ── PRINT VIEW: task breakdown, page-break before ── */}
      <div className="hidden print:block" style={{ pageBreakBefore: 'always' }}>
        {projeto.fracoes.map((fracao, fi) => {
          const tarefasFracao = projeto.tarefas.filter(t => t.fracaoId === fracao.id);
          const resumoF = calcularResumo(tarefasFracao);
          // group by capitulo → subcapitulo
          const grupos: Record<string, Record<string, TarefaCusto[]>> = {};
          tarefasFracao.forEach(t => {
            if (!grupos[t.capitulo]) grupos[t.capitulo] = {};
            if (!grupos[t.capitulo][t.subcapitulo]) grupos[t.capitulo][t.subcapitulo] = [];
            grupos[t.capitulo][t.subcapitulo].push(t);
          });
          return (
            <div key={fracao.id} style={{ pageBreakAfter: fi < projeto.fracoes.length - 1 ? 'always' : 'auto' }}>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, borderBottom: '2px solid #d1d5db', paddingBottom: 4 }}>
                {fracao.nome} — {fracao.tipologia} · {fracao.qualidade}
                {fracao.quantidade > 1 && ` · ${fracao.quantidade}×`}
              </h2>
              {Object.entries(grupos).map(([cap, subcaps]) => (
                <div key={cap} style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#374151', marginBottom: 2 }}>{cap}</p>
                  {Object.entries(subcaps).map(([subcap, tarefas]) => {
                    const subtotal = tarefas.reduce((s, t) => s + calcularCustoTarefa(t), 0);
                    return (
                      <div key={subcap} style={{ marginBottom: 6 }}>
                        <p style={{ fontSize: 10, fontWeight: 600, background: '#f3f4f6', padding: '2px 4px', marginBottom: 2 }}>{subcap}</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9 }}>
                          <thead>
                            <tr style={{ background: '#f9fafb' }}>
                              <th style={{ textAlign: 'left', padding: '2px 4px', borderBottom: '1px solid #e5e7eb', width: '35%' }}>Tarefa</th>
                              <th style={{ textAlign: 'center', padding: '2px 4px', borderBottom: '1px solid #e5e7eb', width: '6%' }}>Un.</th>
                              <th style={{ textAlign: 'right', padding: '2px 4px', borderBottom: '1px solid #e5e7eb', width: '9%' }}>Qtd.</th>
                              <th style={{ textAlign: 'right', padding: '2px 4px', borderBottom: '1px solid #e5e7eb', width: '12%' }}>Material (€)</th>
                              <th style={{ textAlign: 'right', padding: '2px 4px', borderBottom: '1px solid #e5e7eb', width: '12%' }}>M. Obra (€)</th>
                              <th style={{ textAlign: 'right', padding: '2px 4px', borderBottom: '1px solid #e5e7eb', width: '8%' }}>Margem %</th>
                              <th style={{ textAlign: 'right', padding: '2px 4px', borderBottom: '1px solid #e5e7eb', width: '12%' }}>Total (€)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tarefas.map(t => (
                              <tr key={t.id}>
                                <td style={{ padding: '2px 4px', borderBottom: '1px solid #f3f4f6' }}>{t.tarefa}</td>
                                <td style={{ textAlign: 'center', padding: '2px 4px', borderBottom: '1px solid #f3f4f6' }}>{t.unidade}</td>
                                <td style={{ textAlign: 'right', padding: '2px 4px', borderBottom: '1px solid #f3f4f6' }}>{t.quantidade}</td>
                                <td style={{ textAlign: 'right', padding: '2px 4px', borderBottom: '1px solid #f3f4f6' }}>{formatCurrency(t.custoMaterial)}</td>
                                <td style={{ textAlign: 'right', padding: '2px 4px', borderBottom: '1px solid #f3f4f6' }}>{formatCurrency(t.custoMaoObra)}</td>
                                <td style={{ textAlign: 'right', padding: '2px 4px', borderBottom: '1px solid #f3f4f6' }}>{t.margemEmpreiteiro}%</td>
                                <td style={{ textAlign: 'right', padding: '2px 4px', borderBottom: '1px solid #f3f4f6', fontWeight: 600 }}>{formatCurrency(calcularCustoTarefa(t))}</td>
                              </tr>
                            ))}
                            <tr>
                              <td colSpan={6} style={{ textAlign: 'right', padding: '2px 4px', fontSize: 9, color: '#6b7280' }}>Subtotal {subcap}</td>
                              <td style={{ textAlign: 'right', padding: '2px 4px', fontWeight: 700 }}>{formatCurrency(subtotal)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              ))}
              {/* Fraction total */}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, marginTop: 8, borderTop: '2px solid #374151' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '4px', fontWeight: 700 }}>Total {fracao.nome}</td>
                    <td style={{ textAlign: 'right', padding: '4px' }}>Material: {formatCurrency(resumoF.totalMaterial)}</td>
                    <td style={{ textAlign: 'right', padding: '4px' }}>M. Obra: {formatCurrency(resumoF.totalMaoObra)}</td>
                    <td style={{ textAlign: 'right', padding: '4px' }}>Margem: {formatCurrency(resumoF.totalMargem)}</td>
                    <td style={{ textAlign: 'right', padding: '4px', fontWeight: 700, fontSize: 12 }}>{formatCurrency(resumoF.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {materialPickerTarefa && (
        <MaterialPicker
          categoriaFiltro={materialPickerTarefa.categoriaFiltro}
          onSelect={(material) => {
            atualizarTarefa(materialPickerTarefa.tarefaId, {
              custoMaterial: material.precoUnitario,
              materialId: material.id,
              fornecedor: material.fornecedor,
            });
            setMaterialPickerTarefa(null);
          }}
          onClose={() => setMaterialPickerTarefa(null)}
        />
      )}
      {guardarTemplateInfo && (
        <GuardarTemplateDialog
          subcapitulo={guardarTemplateInfo.subcapitulo}
          tarefas={guardarTemplateInfo.tarefas}
          onSave={(t) => { adicionarTemplate(t); setGuardarTemplateInfo(null); }}
          onClose={() => setGuardarTemplateInfo(null)}
        />
      )}
      {aplicarTemplateInfo && (
        <AplicarTemplateDialog
          subcapitulo={aplicarTemplateInfo.subcapitulo}
          templates={templates}
          onAplicar={(tmpl) => {
            const { subcapitulo, capitulo, fracaoId } = aplicarTemplateInfo;
            const novas: TarefaCusto[] = tmpl.tarefas.map(t => ({ ...t, id: v4(), fracaoId, capitulo, subcapitulo }));
            const semAnteriores = projeto.tarefas.filter(t => !(t.subcapitulo === subcapitulo && t.fracaoId === fracaoId));
            atualizarProjeto({ ...projeto, tarefas: [...semAnteriores, ...novas] });
            setAplicarTemplateInfo(null);
          }}
          onClose={() => setAplicarTemplateInfo(null)}
        />
      )}
      {maoDeObraPickerTarefa && (
        <MaoDeObraPicker
          categoriaFiltro={maoDeObraPickerTarefa.categoriaFiltro}
          onSelect={(item) => {
            atualizarTarefa(maoDeObraPickerTarefa.tarefaId, {
              custoMaoObra: item.precoUnitario,
              maoDeObraId: item.id,
            });
            setMaoDeObraPickerTarefa(null);
          }}
          onClose={() => setMaoDeObraPickerTarefa(null)}
        />
      )}
    </div>
  );
}

function FracaoImagem({ fracao, selected, onToggle, onQuantidade, onImagem, onDivisoes }: {
  fracao: Fracao;
  selected: boolean;
  onToggle: () => void;
  onQuantidade: (qty: number) => void;
  onImagem: (url: string | undefined) => void;
  onDivisoes: (divisoes: Divisao[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [divisoes, setDivisoes] = useState<Divisao[]>(fracao.divisoes);
  const [zoomImagem, setZoomImagem] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onImagem(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const saveEdits = () => {
    onDivisoes(divisoes);
    setEditing(false);
  };

  const cancelEdits = () => {
    setDivisoes(fracao.divisoes);
    setEditing(false);
  };

  const updateDivisao = (id: string, field: 'tipo' | 'area' | 'peDireito', value: string | number) => {
    setDivisoes(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d));
  };

  const addDivisao = () => {
    setDivisoes(prev => [...prev, { id: v4(), tipo: 'Quarto', area: 0, peDireito: 2.7 }]);
  };

  const removeDivisao = (id: string) => {
    setDivisoes(prev => prev.filter(d => d.id !== id));
  };

  const total = (editing ? divisoes : fracao.divisoes).reduce((s, d) => s + d.area, 0);

  return (
    <div className={`shrink-0 flex flex-col gap-3 bg-card border rounded-lg p-3 transition-all ${selected ? 'ring-2 ring-primary border-primary' : ''}`}>
      <div className="flex gap-4">
      {/* Image */}
      <div className="shrink-0">
        <p className="text-xs font-medium mb-1.5 truncate max-w-[17rem]">{fracao.nome}</p>
        {fracao.imagemUrl ? (
          <div className="relative group">
            <img
              src={fracao.imagemUrl}
              alt={fracao.nome}
              className="w-64 h-48 object-contain rounded-md border bg-muted cursor-pointer"
              onClick={() => inputRef.current?.click()}
            />
            <button
              onClick={() => onImagem(undefined)}
              className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setZoomImagem(true)}
              className="absolute bottom-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="Ver imagem ampliada"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            className="w-64 h-48 rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-muted-foreground/60 hover:bg-muted/30 transition-colors"
          >
            <ImagePlus className="h-6 w-6" />
            <span className="text-xs">Adicionar imagem</span>
          </button>
        )}
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>

      {zoomImagem && fracao.imagemUrl && (
        <Dialog open onOpenChange={() => setZoomImagem(false)}>
          <DialogContent className="max-w-4xl p-2 bg-background">
            <img
              src={fracao.imagemUrl}
              alt={fracao.nome}
              className="w-full max-h-[80vh] object-contain rounded-md"
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Divisões */}
      <div className="flex flex-col justify-center min-w-[180px]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Áreas</p>
          {editing ? (
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-5 w-5 text-green-600" onClick={saveEdits}><Check className="h-3 w-3" /></Button>
              <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground" onClick={cancelEdits}><X className="h-3 w-3" /></Button>
            </div>
          ) : (
            <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground" onClick={() => setEditing(true)}><Pencil className="h-3 w-3" /></Button>
          )}
        </div>

        <div className="space-y-1">
          {(editing ? divisoes : fracao.divisoes).map(d => (
            <div key={d.id} className="flex items-center gap-1.5">
              {editing ? (
                <>
                  <select
                    value={d.tipo}
                    onChange={e => updateDivisao(d.id, 'tipo', e.target.value)}
                    className="h-6 text-xs rounded border border-input bg-background px-1 flex-1"
                  >
                    {TIPOS_DIVISAO.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <Input
                    type="number" min={0} step={0.5}
                    value={d.area}
                    onChange={e => updateDivisao(d.id, 'area', Number(e.target.value))}
                    className="h-6 text-xs mono w-14"
                  />
                  <span className="text-xs text-muted-foreground">m²</span>
                  <Input
                    type="number" min={1.5} max={6} step={0.1}
                    value={d.peDireito ?? 2.7}
                    onChange={e => updateDivisao(d.id, 'peDireito', Number(e.target.value))}
                    className="h-6 text-xs mono w-12"
                    title="Pé direito (m)"
                  />
                  <span className="text-xs text-muted-foreground">pd</span>
                  <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground hover:text-destructive shrink-0" onClick={() => removeDivisao(d.id)}>
                    <X className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground flex-1">{d.tipo}</span>
                  <span className="text-sm font-medium mono">{d.area} m²</span>
                  <span className="text-xs text-muted-foreground mono">{(d.peDireito ?? 2.7).toFixed(1)}m</span>
                </>
              )}
            </div>
          ))}

          {editing && (
            <button onClick={addDivisao} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-1 transition-colors">
              <Plus className="h-3 w-3" /> Adicionar divisão
            </button>
          )}

          <div className="flex justify-between gap-4 text-sm border-t pt-1 mt-1">
            <span className="text-muted-foreground font-medium">Total</span>
            <span className="font-semibold mono">{total} m²</span>
          </div>
        </div>
      </div>
      </div>

      {/* Footer: selection + quantity */}
      <div className="flex items-center justify-between gap-4 border-t pt-2">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 rounded accent-primary cursor-pointer"
          />
          <span className="text-xs text-muted-foreground">Selecionar fração</span>
        </label>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Nº frações:</span>
          <Input
            type="number" min={1} step={1}
            value={fracao.quantidade ?? 1}
            onChange={e => onQuantidade(Math.max(1, Math.round(Number(e.target.value))))}
            className="h-6 w-14 text-xs mono"
          />
        </div>
      </div>
    </div>
  );
}

function CapituloGroup({
  capitulo, subcapitulos, expanded, onToggle, onUpdate, onDelete, onAddTarefa, onPickMaterial, onPickMaoDeObra, materiais, maoDeObra, templates, onGuardar, onAplicar, onRenameSubcap, fracaoIdAtivo, fracaoIdDefault,
}: {
  capitulo: string;
  subcapitulos: Record<string, TarefaCusto[]>;
  expanded: boolean;
  onToggle: () => void;
  onUpdate: (id: string, updates: Partial<TarefaCusto>) => void;
  onDelete: (id: string) => void;
  onAddTarefa: (capitulo: string, subcapitulo: string, fracaoId: string, template?: TemplateTask) => void;
  onPickMaterial: (id: string, categoriaFiltro?: string) => void;
  onPickMaoDeObra: (id: string, categoriaFiltro?: string) => void;
  materiais: Material[];
  maoDeObra: MaoDeObra[];
  templates: TemplateDivisao[];
  onGuardar: (subcap: string, tarefas: TarefaCusto[]) => void;
  onAplicar: (subcap: string, capitulo: string, fracaoId: string) => void;
  onRenameSubcap: (oldName: string, newName: string, fracaoId: string) => void;
  fracaoIdAtivo: string;
  fracaoIdDefault: string;
}) {
  const [novaDivisao, setNovaDivisao] = useState('');
  const [showNovaDivisao, setShowNovaDivisao] = useState(false);

  const allTarefas = Object.values(subcapitulos).flat();
  const totalCap = allTarefas.reduce((s, t) => s + calcularCustoTarefa(t), 0);

  const getFracaoId = (tarefas: TarefaCusto[]) =>
    tarefas[0]?.fracaoId ?? fracaoIdAtivo ?? fracaoIdDefault;

  const confirmarNovaDivisao = () => {
    const nome = novaDivisao.trim();
    if (!nome) return;
    const fracaoId = fracaoIdAtivo ?? fracaoIdDefault;
    onAddTarefa(capitulo, nome, fracaoId);
    setNovaDivisao('');
    setShowNovaDivisao(false);
  };

  return (
    <>
      <tr className="cursor-pointer hover:bg-muted/50" onClick={onToggle}>
        <td colSpan={7} className="px-3 py-2 font-semibold text-sm">
          <span className="flex items-center gap-1.5">
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {capitulo}
          </span>
        </td>
        <td className="px-3 py-2 text-right font-semibold mono text-sm">{formatCurrency(totalCap)}</td>
        <td />
      </tr>
      {expanded && Object.entries(subcapitulos).map(([subcap, tarefas]) => (
        <SubcapituloGroup
          key={subcap}
          capitulo={capitulo}
          subcapitulo={subcap}
          tarefas={tarefas}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddTarefa={(template) => onAddTarefa(capitulo, subcap, getFracaoId(tarefas), template)}
          onPickMaterial={onPickMaterial}
          onPickMaoDeObra={onPickMaoDeObra}
          materiais={materiais}
          maoDeObra={maoDeObra}
          templates={templates}
          onGuardar={() => onGuardar(subcap, tarefas)}
          onAplicar={() => onAplicar(subcap, capitulo, getFracaoId(tarefas))}
          onRename={(newName) => onRenameSubcap(subcap, newName, getFracaoId(tarefas))}
        />
      ))}
      {expanded && (
        <tr>
          <td colSpan={9} className="px-3 pb-2 pt-1 pl-10">
            {showNovaDivisao ? (
              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                <Input
                  autoFocus
                  placeholder="Nome da divisão..."
                  value={novaDivisao}
                  onChange={e => setNovaDivisao(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmarNovaDivisao(); if (e.key === 'Escape') setShowNovaDivisao(false); }}
                  className="h-7 text-xs w-48"
                />
                <Button size="sm" className="h-7 text-xs" onClick={confirmarNovaDivisao} disabled={!novaDivisao.trim()}>Adicionar</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNovaDivisao(false)}>Cancelar</Button>
              </div>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); setShowNovaDivisao(true); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3 w-3" /> Nova divisão em {capitulo}
              </button>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function SubcapituloGroup({
  capitulo, subcapitulo, tarefas, onUpdate, onDelete, onAddTarefa, onPickMaterial, onPickMaoDeObra, materiais, maoDeObra, templates, onGuardar, onAplicar, onRename,
}: {
  capitulo: string;
  subcapitulo: string;
  tarefas: TarefaCusto[];
  onUpdate: (id: string, updates: Partial<TarefaCusto>) => void;
  onDelete: (id: string) => void;
  onAddTarefa: (template?: TemplateTask) => void;
  onPickMaterial: (id: string, categoriaFiltro?: string) => void;
  onPickMaoDeObra: (id: string, categoriaFiltro?: string) => void;
  materiais: Material[];
  maoDeObra: MaoDeObra[];
  templates: TemplateDivisao[];
  onGuardar: () => void;
  onAplicar: () => void;
  onRename: (newName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nomeEditando, setNomeEditando] = useState(subcapitulo);

  const confirmarRename = () => {
    const novo = nomeEditando.trim();
    if (novo && novo !== subcapitulo) onRename(novo);
    setEditingName(false);
  };

  const subtotal = tarefas.reduce((s, t) => s + calcularCustoTarefa(t), 0);
  const templateOptions = useMemo(() => getTemplatesSubcapitulo(subcapitulo), [subcapitulo]);
  const tarefasExistentes = new Set(tarefas.map(t => t.tarefa));
  const hasTemplates = templates.some(t => t.subcapitulo === normalizarSubcapitulo(subcapitulo));

  const handleSelect = (template: TemplateTask) => {
    onAddTarefa(template);
    setOpen(false);
    setCustomMode(false);
  };

  const handleCustom = () => {
    if (!customName.trim()) return;
    onAddTarefa({ tarefa: customName.trim(), unidade: 'vg.', categoriaFiltro: '', custoMaterialBase: 0, custoMaoObraBase: 0, margemBase: 15 });
    setCustomName('');
    setCustomMode(false);
    setOpen(false);
  };

  return (
    <>
      <tr className="bg-blue-100 dark:bg-blue-900/30">
        <td colSpan={8} className="px-3 py-1.5 pl-10 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <div className="flex items-center gap-2">
            {editingName ? (
              <>
                <Input
                  autoFocus
                  value={nomeEditando}
                  onChange={e => setNomeEditando(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmarRename(); if (e.key === 'Escape') { setNomeEditando(subcapitulo); setEditingName(false); } }}
                  onBlur={confirmarRename}
                  className="h-6 text-xs w-48 uppercase"
                />
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" onClick={confirmarRename}>
                  <Check className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                {subcapitulo}
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" title="Editar nome" onClick={() => { setNomeEditando(subcapitulo); setEditingName(true); }}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </>
            )}
            {!editingName && (
              <>
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" title="Guardar como template" onClick={onGuardar}>
                  <Bookmark className="h-3 w-3" />
                </Button>
                {hasTemplates && (
                  <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" title="Aplicar template" onClick={onAplicar}>
                    <BookmarkCheck className="h-3 w-3" />
                  </Button>
                )}
              </>
            )}
          </div>
        </td>
        <td className="px-2 py-1 text-right">
          <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCustomMode(false); setCustomName(''); } }}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-5 w-5" title={`Adicionar tarefa em ${subcapitulo}`}>
                <Plus className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="end">
              {customMode ? (
                <div className="p-3 space-y-2">
                  <p className="text-xs font-medium">Nome da tarefa</p>
                  <Input
                    autoFocus
                    placeholder="Ex: Impermeabilização..."
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleCustom(); if (e.key === 'Escape') setCustomMode(false); }}
                    className="h-7 text-xs"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCustom} disabled={!customName.trim()}>Adicionar</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCustomMode(false)}>Voltar</Button>
                  </div>
                </div>
              ) : (
                <Command>
                  <CommandInput placeholder="Pesquisar tarefa..." className="h-8 text-xs" />
                  <CommandList className="max-h-64">
                    <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">Sem sugestões</CommandEmpty>
                    {templateOptions.map(t => (
                      <CommandItem
                        key={t.tarefa}
                        value={t.tarefa}
                        onSelect={() => handleSelect(t)}
                        className="text-xs flex items-center justify-between"
                      >
                        <span>{t.tarefa}</span>
                        {tarefasExistentes.has(t.tarefa) && <span className="text-muted-foreground text-[10px]">já existe</span>}
                      </CommandItem>
                    ))}
                    <CommandItem
                      value="__custom"
                      onSelect={() => setCustomMode(true)}
                      className="text-xs text-muted-foreground border-t mt-1 pt-1"
                    >
                      ✏️ Tarefa personalizada...
                    </CommandItem>
                  </CommandList>
                </Command>
              )}
            </PopoverContent>
          </Popover>
        </td>
      </tr>
      {tarefas.map(t => (
        <TarefaRow key={t.id} tarefa={t} onUpdate={onUpdate} onDelete={onDelete} onPickMaterial={onPickMaterial} onPickMaoDeObra={onPickMaoDeObra} materiais={materiais} maoDeObra={maoDeObra} />
      ))}
      <tr className="border-t border-muted">
        <td colSpan={7} className="px-3 py-1 pl-14 text-xs text-muted-foreground text-right">Subtotal {subcapitulo}</td>
        <td className="px-3 py-1 text-right mono text-xs font-semibold">{formatCurrency(subtotal)}</td>
        <td />
      </tr>

    </>
  );
}

function GuardarTemplateDialog({ subcapitulo, tarefas, onSave, onClose }: {
  subcapitulo: string;
  tarefas: TarefaCusto[];
  onSave: (t: TemplateDivisao) => void;
  onClose: () => void;
}) {
  const [nome, setNome] = useState(subcapitulo);
  const handleSave = () => {
    if (!nome.trim()) return;
    const templateTarefas: TemplateTarefa[] = tarefas.map(({ id, fracaoId, ...rest }) => rest);
    onSave({ id: v4(), nome: nome.trim(), subcapitulo: normalizarSubcapitulo(subcapitulo), criadoEm: new Date().toISOString(), tarefas: templateTarefas });
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Guardar template — {subcapitulo}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{tarefas.length} tarefas serão guardadas com todos os valores, materiais e custos.</p>
        <div className="space-y-3 pt-1">
          <div>
            <Label>Nome do template</Label>
            <Input autoFocus value={nome} onChange={e => setNome(e.target.value)} className="mt-1" placeholder="Ex: Casa de Banho Premium T3" onKeyDown={e => e.key === 'Enter' && handleSave()} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!nome.trim()}>
              <Bookmark className="h-3.5 w-3.5 mr-1.5" />
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AplicarTemplateDialog({ subcapitulo, templates, onAplicar, onClose }: {
  subcapitulo: string;
  templates: TemplateDivisao[];
  onAplicar: (t: TemplateDivisao) => void;
  onClose: () => void;
}) {
  const { eliminarTemplate } = useApp();
  const [pesquisa, setPesquisa] = useState('');
  const todos = templates.filter(t =>
    t.nome.toLowerCase().includes(pesquisa.toLowerCase()) ||
    t.subcapitulo.toLowerCase().includes(pesquisa.toLowerCase())
  );
  const subcapBase = normalizarSubcapitulo(subcapitulo);
  const doSubcap = todos.filter(t => t.subcapitulo === subcapBase);
  const outros = todos.filter(t => t.subcapitulo !== subcapBase);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Aplicar template — {subcapitulo}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">As tarefas actuais serão substituídas pelas do template.</p>
        <div className="relative mb-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Pesquisar..." value={pesquisa} onChange={e => setPesquisa(e.target.value)} className="pl-9 h-9" autoFocus />
        </div>
        {todos.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum template encontrado.</p>
        ) : (
          <div className="max-h-72 overflow-auto space-y-1">
            {doSubcap.length > 0 && (
              <p className="text-xs font-medium text-muted-foreground px-1 pt-1">Esta divisão</p>
            )}
            {doSubcap.map(t => <TemplateItem key={t.id} template={t} onAplicar={onAplicar} onDelete={eliminarTemplate} />)}
            {outros.length > 0 && (
              <p className="text-xs font-medium text-muted-foreground px-1 pt-2">Outros</p>
            )}
            {outros.map(t => <TemplateItem key={t.id} template={t} onAplicar={onAplicar} onDelete={eliminarTemplate} />)}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplateItem({ template, onAplicar, onDelete }: { template: TemplateDivisao; onAplicar: (t: TemplateDivisao) => void; onDelete: (id: string) => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted group">
      <button className="flex-1 text-left" onClick={() => onAplicar(template)}>
        <p className="text-sm font-medium">{template.nome}</p>
        <p className="text-xs text-muted-foreground">{template.subcapitulo} · {template.tarefas.length} tarefas · {new Date(template.criadoEm).toLocaleDateString('pt-PT')}</p>
      </button>
      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 shrink-0" onClick={() => onDelete(template.id)} title="Apagar template">
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function TarefaRow({
  tarefa,
  onUpdate,
  onDelete,
  onPickMaterial,
  onPickMaoDeObra,
  materiais,
  maoDeObra,
}: {
  tarefa: TarefaCusto;
  onUpdate: (id: string, updates: Partial<TarefaCusto>) => void;
  onDelete: (id: string) => void;
  onPickMaterial: (id: string, categoriaFiltro?: string) => void;
  onPickMaoDeObra: (id: string, categoriaFiltro?: string) => void;
  materiais: Material[];
  maoDeObra: MaoDeObra[];
}) {
  const total = calcularCustoTarefa(tarefa);

  const gama = useMemo(() => {
    if (!tarefa.materialId) return null;
    const mat = materiais.find(m => m.id === tarefa.materialId);
    if (!mat) return null;
    const sameCat = materiais.filter(m => m.categoria === mat.categoria && m.precoUnitario > 0);
    if (sameCat.length === 0) return null;
    const avg = sameCat.reduce((s, m) => s + m.precoUnitario, 0) / sameCat.length;
    const ratio = mat.precoUnitario / avg;
    if (ratio > 1.4) return 'Alta';
    if (ratio < 0.7) return 'Baixa';
    return 'Média';
  }, [tarefa.materialId, materiais]);

  return (
    <tr>
      <td className="px-1 py-1 pl-14">
        <Input
          value={tarefa.tarefa}
          onChange={e => onUpdate(tarefa.id, { tarefa: e.target.value })}
          className="h-7 text-sm w-full min-w-[160px]"
        />
      </td>
      <td className="px-1 py-1">
        <select
          value={tarefa.unidade}
          onChange={e => onUpdate(tarefa.id, { unidade: e.target.value })}
          className="h-7 w-16 text-xs rounded-md border border-input bg-background px-1.5 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {['m²', 'm', 'ml', 'un.', 'vg.', 'kg', 'l', 'hr'].map(u => (
            <option key={u} value={u}>{u}</option>
          ))}
          {!['m²', 'm', 'ml', 'un.', 'vg.', 'kg', 'l', 'hr'].includes(tarefa.unidade) && (
            <option value={tarefa.unidade}>{tarefa.unidade}</option>
          )}
        </select>
      </td>
      <td className="px-1 py-1">
        <Input
          type="number"
          min={0}
          value={tarefa.quantidade}
          onChange={e => onUpdate(tarefa.id, { quantidade: Math.max(0, Number(e.target.value)) })}
          className="h-7 text-xs mono w-24"
        />
      </td>
      <td className="px-3 py-1">
        {tarefa.materialId ? (
          <div className="flex items-center gap-1 max-w-[160px]">
            <button
              className="text-xs text-left hover:underline truncate flex-1"
              title="Clique para alterar material"
              onClick={() => onPickMaterial(tarefa.id, tarefa.categoriaFiltro)}
            >
              {materiais.find(m => m.id === tarefa.materialId)?.nome ?? <span className="text-muted-foreground italic">Material removido</span>}
            </button>
            <button
              className="text-muted-foreground hover:text-foreground shrink-0"
              title="Voltar a standard"
              onClick={() => onUpdate(tarefa.id, { materialId: undefined, fornecedor: '' })}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors italic"
            onClick={() => onPickMaterial(tarefa.id, tarefa.categoriaFiltro)}
          >
            Standard
          </button>
        )}
      </td>
      <td className="px-1 py-1">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={tarefa.custoMaterial}
              onChange={e => onUpdate(tarefa.id, { custoMaterial: Math.max(0, Number(e.target.value)) })}
              className="h-7 text-xs mono w-20"
            />
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onPickMaterial(tarefa.id, tarefa.categoriaFiltro)} title="Pesquisar material">
              <Search className="h-3 w-3" />
            </Button>
          </div>
          {gama && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium w-fit ${
              gama === 'Alta'  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400' :
              gama === 'Baixa' ? 'bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-400'  :
                                 'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-400'
            }`}>
              Gama {gama}
            </span>
          )}
        </div>
      </td>
      <td className="px-1 py-1">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={tarefa.custoMaoObra}
              onChange={e => onUpdate(tarefa.id, { custoMaoObra: Math.max(0, Number(e.target.value)) })}
              className="h-7 text-xs mono w-20"
            />
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onPickMaoDeObra(tarefa.id, tarefa.categoriaFiltro)} title="Pesquisar mão de obra">
              <Search className="h-3 w-3" />
            </Button>
          </div>
          {tarefa.maoDeObraId && (() => {
            const mo = maoDeObra.find(m => m.id === tarefa.maoDeObraId);
            return mo ? (
              <div className="flex items-center gap-1 max-w-[90px]">
                <span className="text-[10px] text-muted-foreground truncate flex-1" title={mo.nome}>{mo.nome}</span>
                <button
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  title="Voltar a standard"
                  onClick={() => onUpdate(tarefa.id, { maoDeObraId: undefined })}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : null;
          })()}
        </div>
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
        <div className="flex items-center gap-1">
          <Input
            value={tarefa.notas}
            onChange={e => onUpdate(tarefa.id, { notas: e.target.value })}
            className="h-7 text-xs w-28"
            placeholder="Notas"
          />
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(tarefa.id)} title="Remover tarefa">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

const BAR_COLORS = [
  'hsl(217,71%,45%)', 'hsl(142,71%,45%)', 'hsl(38,92%,50%)',
  'hsl(280,65%,55%)', 'hsl(0,72%,55%)',   'hsl(190,75%,40%)',
  'hsl(55,90%,45%)',  'hsl(320,65%,50%)', 'hsl(160,60%,45%)',
  'hsl(25,85%,50%)',
];

function CustoPorFracao({ fracoes, tarefas }: { fracoes: Fracao[]; tarefas: TarefaCusto[] }) {
  const data = useMemo(() => {
    return fracoes.map(f => {
      const tf = tarefas.filter(t => t.fracaoId === f.id);
      const custo1 = tf.reduce((s, t) => s + calcularCustoTarefa(t), 0);
      const qty = f.quantidade ?? 1;
      return { nome: f.nome, custo1, custoTotal: custo1 * qty, quantidade: qty };
    });
  }, [fracoes, tarefas]);

  const totalGeral = data.reduce((s, d) => s + d.custoTotal, 0);

  if (data.length === 0 || totalGeral === 0) {
    return <p className="text-muted-foreground text-sm text-center py-4">Sem dados.</p>;
  }

  return (
    <div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
            <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={64} />
            <Tooltip formatter={(v: number) => formatCurrency(v)} />
            <Bar dataKey="custoTotal" name="Total" fill="hsl(217,71%,45%)" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 pt-2 border-t space-y-1">
        {data.map(d => (
          <div key={d.nome} className="flex justify-between text-xs">
            <span className="text-muted-foreground">{d.nome}{d.quantidade > 1 ? ` ×${d.quantidade}` : ''}</span>
            <span className="mono font-medium">{formatCurrency(d.custoTotal)}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs font-semibold border-t pt-1 mt-1">
          <span>Total projeto</span>
          <span className="mono">{formatCurrency(totalGeral)}</span>
        </div>
      </div>
    </div>
  );
}

function CustoPorDivisao({ tarefas }: { tarefas: TarefaCusto[] }) {
  const data = useMemo(() => {
    const map: Record<string, number> = {};
    tarefas.forEach(t => {
      map[t.subcapitulo] = (map[t.subcapitulo] ?? 0) + calcularCustoTarefa(t);
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [tarefas]);

  if (data.length === 0) return <p className="text-muted-foreground text-sm text-center py-8">Sem dados.</p>;

  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 36, 180)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 60, top: 4, bottom: 4 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: number) => formatCurrency(v)} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', formatter: (v: number) => formatCurrency(v), fontSize: 11 }}>
          {data.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TipoMaterialCell({ value, onChange, categoriaFiltro }: {
  value: string;
  onChange: (v: string) => void;
  categoriaFiltro?: string;
}) {
  const [open, setOpen] = useState(false);
  const tipos = categoriaFiltro ? (TIPOS_MATERIAL[categoriaFiltro] ?? []) : [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-7 w-28 justify-between text-xs font-normal px-2">
          <span className="truncate">{value || <span className="text-muted-foreground">Tipo...</span>}</span>
          <ChevronDown className="h-3 w-3 shrink-0 ml-1 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-0" align="start">
        <Command>
          <CommandInput placeholder="Pesquisar..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">Não encontrado</CommandEmpty>
            {value && (
              <CommandItem value="__limpar" onSelect={() => { onChange(''); setOpen(false); }} className="text-xs text-muted-foreground italic">
                Limpar
              </CommandItem>
            )}
            {tipos.map(t => (
              <CommandItem key={t} value={t} onSelect={() => { onChange(t); setOpen(false); }} className="text-xs">
                {t}
              </CommandItem>
            ))}
            {tipos.length === 0 && (
              <p className="text-xs text-muted-foreground px-3 py-2">Sem tipos predefinidos</p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
