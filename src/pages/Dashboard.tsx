import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Link } from 'react-router-dom';
import { Plus, Copy, Trash2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/utils';
import { calcularResumo } from '@/lib/wbs';
import { CATEGORIAS_MATERIAL, TIPOS_MATERIAL } from '@/types/project';
import CostDistributionChart from '@/components/CostDistributionChart';
import { resolverGama, GamaBadge } from '@/pages/MateriaisPage';

export default function Dashboard() {
  const { projetos, duplicarProjeto, eliminarProjeto, materiais } = useApp();

  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroMaterial, setFiltroMaterial] = useState('todos');
  const [confirmarEliminar, setConfirmarEliminar] = useState<string | null>(null);

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <p className="section-subtitle mt-1">Visão geral dos seus projetos de construção</p>
        </div>
        <Link to="/novo-projeto">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Novo Projeto
          </Button>
        </Link>
      </div>

      {projetos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">Sem projetos</h3>
            <p className="text-muted-foreground text-sm mb-4">Crie o seu primeiro projeto para começar a planear.</p>
            <Link to="/novo-projeto">
              <Button>Criar Projeto</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projetos.map((projeto) => {
            const resumo = calcularResumo(projeto.tarefas);
            return (
              <Card key={projeto.id} className="group hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-base truncate">{projeto.nome}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {projeto.fracoes.length} {projeto.fracoes.length === 1 ? 'fração' : 'frações'} · Criado em{' '}
                        {new Date(projeto.criadoEm).toLocaleDateString('pt-PT')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-muted rounded-md px-2.5 py-2">
                      <p className="text-xs text-muted-foreground">Material</p>
                      <p className="text-sm font-medium mono">{formatCurrency(resumo.totalMaterial)}</p>
                    </div>
                    <div className="bg-muted rounded-md px-2.5 py-2">
                      <p className="text-xs text-muted-foreground">Mão de Obra</p>
                      <p className="text-sm font-medium mono">{formatCurrency(resumo.totalMaoObra)}</p>
                    </div>
                    <div className="bg-muted rounded-md px-2.5 py-2">
                      <p className="text-xs text-muted-foreground">Margem</p>
                      <p className="text-sm font-medium mono">{formatCurrency(resumo.totalMargem)}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t pt-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Custo Total</p>
                      <p className="text-lg font-semibold text-primary mono">{formatCurrency(resumo.total)}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicarProjeto(projeto.id)} title="Duplicar">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setConfirmarEliminar(projeto.id)} title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Link to={`/projeto/${projeto.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </div>
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

      {projetos.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Distribuição de Custos (Todos os Projetos)</h2>
          <Card>
            <CardContent className="p-6">
              <CostDistributionChart tarefas={projetos.flatMap(p => p.tarefas)} />
            </CardContent>
          </Card>
        </div>
      )}

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
