import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Copy, Trash2, ArrowRight, BarChart2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency, v4 } from '@/lib/utils';
import { calcularResumo } from '@/lib/wbs';
import { CATEGORIAS_MATERIAL, TIPOS_MATERIAL } from '@/types/project';
import CostDistributionChart from '@/components/CostDistributionChart';
import { resolverGama, GamaBadge } from '@/pages/MateriaisPage';
import MigracaoBanner from '@/components/MigracaoBanner';

export default function Dashboard() {
  const { projetos, adicionarProjeto, duplicarProjeto, eliminarProjeto, materiais } = useApp();
  const navigate = useNavigate();

  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroMaterial, setFiltroMaterial] = useState('todos');
  const [confirmarEliminar, setConfirmarEliminar] = useState<string | null>(null);
  const [showNovoProjeto, setShowNovoProjeto] = useState(false);
  const [nomeNovoProjeto, setNomeNovoProjeto] = useState('');

  const projetosTopo = useMemo(() => projetos.filter(p => p.tipo === 'projeto'), [projetos]);
  const estimativas   = useMemo(() => projetos.filter(p => p.tipo === 'estimativa' || !p.tipo), [projetos]);

  const criarProjeto = () => {
    const nome = nomeNovoProjeto.trim();
    if (!nome) return;
    const novo = { id: v4(), nome, criadoEm: new Date().toISOString(), fracoes: [], tarefas: [], tipo: 'projeto' as const, parentId: null };
    adicionarProjeto(novo);
    setNomeNovoProjeto(''); setShowNovoProjeto(false);
    navigate(`/projeto/${novo.id}`);
  };

  const propostasCount = useMemo(() => {
    try {
      const raw: any[] = JSON.parse(localStorage.getItem('orcamentos_v2') ?? '[]');
      const map: Record<string, number> = {};
      for (const o of raw) if (o.projetoId) map[o.projetoId] = (map[o.projetoId] ?? 0) + 1;
      return map;
    } catch { return {} as Record<string, number>; }
  }, [projetosTopo]);

  const tiposDisponiveis = filtroCategoria !== 'todas' ? (TIPOS_MATERIAL[filtroCategoria] ?? []) : [];

  const materiaisFiltrados = useMemo(() => materiais.filter(m => {
    const matchCat = filtroCategoria === 'todas' || m.categoria === filtroCategoria;
    const matchMat = filtroMaterial === 'todos' || m.material === filtroMaterial;
    return matchCat && matchMat;
  }), [materiais, filtroCategoria, filtroMaterial]);

  const handleCategoriaChange = (v: string) => {
    setFiltroCategoria(v);
    setFiltroMaterial('todos');
  };

  return (
    <div className="page-container animate-fade-in">
      <MigracaoBanner />
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle mt-1">Visão geral dos seus projetos de construção</p>
        </div>
        <Button onClick={() => setShowNovoProjeto(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Projeto
        </Button>
      </div>

      {projetosTopo.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">Sem projetos</h3>
            <p className="text-muted-foreground text-sm mb-4">Crie o seu primeiro projeto para agrupar estimativas e orçamentos.</p>
            <Button onClick={() => setShowNovoProjeto(true)}>Criar Projeto</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projetosTopo.map((projeto) => {
            const nEst = estimativas.filter(e => e.parentId === projeto.id).length;
            const m2Total = (projeto.m2AcimaSolo ?? 0) + (projeto.m2AbaixoSolo ?? 0);
            const infoItems = [
              m2Total > 0 && `${m2Total} m²`,
              (projeto.numApartamentos ?? 0) > 0 && `${projeto.numApartamentos} apt.`,
              (projeto.m2Retalho ?? 0) > 0 && `Retalho ${projeto.m2Retalho} m²`,
            ].filter(Boolean) as string[];
            return (
              <Card key={projeto.id} className="group hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-base truncate">{projeto.nome}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {infoItems.length > 0 ? infoItems.join(' · ') : 'Sem dados de área'}
                        {' · '}Criado em {new Date(projeto.criadoEm).toLocaleDateString('pt-PT')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-muted rounded-md px-2.5 py-2 flex items-center gap-2">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Estimativas</p>
                        <p className="text-sm font-semibold">{nEst}</p>
                      </div>
                    </div>
                    <div className="bg-muted rounded-md px-2.5 py-2 flex items-center gap-2">
                      <BarChart2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs text-muted-foreground">Propostas</p>
                        <p className="text-sm font-semibold">{propostasCount[projeto.id] ?? 0}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end border-t pt-3 gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setConfirmarEliminar(projeto.id)} title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Link to={`/projeto/${projeto.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmarEliminar} onOpenChange={open => { if (!open) setConfirmarEliminar(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar projeto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que quer apagar este projeto? Esta ação não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmarEliminar) eliminarProjeto(confirmarEliminar); setConfirmarEliminar(null); }}
            >
              Sim, apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {estimativas.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Distribuição de Custos (Todas as Estimativas)</h2>
          <Card>
            <CardContent className="p-6">
              <CostDistributionChart tarefas={estimativas.flatMap(p => p.tarefas)} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Diálogo: Novo Projeto */}
      <Dialog open={showNovoProjeto} onOpenChange={o => { setShowNovoProjeto(o); if (!o) setNomeNovoProjeto(''); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Novo Projeto</DialogTitle></DialogHeader>
          <div className="py-2">
            <Label htmlFor="proj-nome" className="text-sm">Nome do projeto</Label>
            <Input id="proj-nome" className="mt-1.5" placeholder="Ex: Edifício Rua das Flores"
              value={nomeNovoProjeto} onChange={e => setNomeNovoProjeto(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && criarProjeto()} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNovoProjeto(false)}>Cancelar</Button>
            <Button onClick={criarProjeto} disabled={!nomeNovoProjeto.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Materials section */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Materiais</h2>
          <Link to="/materiais">
            <Button variant="outline" size="sm">Ver todos</Button>
          </Link>
        </div>

        <div className="flex flex-wrap gap-3 mb-4">
          <Select value={filtroCategoria} onValueChange={handleCategoriaChange}>
            <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {CATEGORIAS_MATERIAL.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          {tiposDisponiveis.length > 0 && (
            <Select value={filtroMaterial} onValueChange={setFiltroMaterial}>
              <SelectTrigger className="w-44 h-9"><SelectValue placeholder="Material" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os materiais</SelectItem>
                {tiposDisponiveis.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Categoria</th>
                  <th>Material</th>
                  <th>Gama</th>
                  <th className="text-right">Preço (€)</th>
                  <th>Fornecedor</th>
                </tr>
              </thead>
              <tbody>
                {materiais.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                      Sem materiais. <Link to="/materiais" className="underline">Adicionar materiais.</Link>
                    </td>
                  </tr>
                ) : materiaisFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-muted-foreground text-sm">Nenhum material encontrado para os filtros selecionados.</td>
                  </tr>
                ) : (
                  materiaisFiltrados.slice(0, 50).map(m => (
                    <tr key={m.id}>
                      <td className="font-medium text-sm">{m.nome}</td>
                      <td className="text-sm">{m.categoria}</td>
                      <td className="text-sm">{m.material || <span className="text-muted-foreground">—</span>}</td>
                      <td><GamaBadge gama={resolverGama(m, materiais)} /></td>
                      <td className="text-right mono text-sm">{formatCurrency(m.precoUnitario)}</td>
                      <td className="text-sm text-muted-foreground">{m.fornecedor || '—'}</td>
                    </tr>
                  ))
                )}
                {materiaisFiltrados.length > 50 && (
                  <tr>
                    <td colSpan={6} className="text-center py-3 text-xs text-muted-foreground">
                      A mostrar 50 de {materiaisFiltrados.length}. <Link to="/materiais" className="underline">Ver todos.</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
