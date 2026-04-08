import { useApp } from '@/contexts/AppContext';
import { Link } from 'react-router-dom';
import { Plus, Copy, Trash2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { calcularResumo } from '@/lib/wbs';
import CostDistributionChart from '@/components/CostDistributionChart';

export default function Dashboard() {
  const { projetos, duplicarProjeto, eliminarProjeto } = useApp();

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
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => eliminarProjeto(projeto.id)} title="Eliminar">
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

      {projetos.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">Distribuição de Custos (Todos os Projetos)</h2>
          <Card>
            <CardContent className="p-6">
              <CostDistributionChart projetos={projetos} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
