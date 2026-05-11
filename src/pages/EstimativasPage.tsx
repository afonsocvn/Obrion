import { useApp } from '@/contexts/AppContext';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ChevronRight, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { formatCurrency } from '@/lib/utils';
import { calcularResumo } from '@/lib/wbs';
import { useState } from 'react';

export default function EstimativasPage() {
  const { projetos, atualizarProjeto, eliminarProjeto } = useApp();
  const navigate = useNavigate();
  const [confirmarEliminar, setConfirmarEliminar] = useState<string | null>(null);

  const estimativas = projetos.filter(p => p.tipo === 'estimativa' || !p.tipo);
  const projetosTopo = projetos.filter(p => p.tipo === 'projeto');

  const associarProjeto = (estId: string, projetoId: string) => {
    const est = projetos.find(p => p.id === estId);
    if (!est) return;
    atualizarProjeto({ ...est, parentId: projetoId || null });
  };

  return (
    <div className="page-container animate-fade-in">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Estimativas</h1>
          <p className="section-subtitle mt-1">Modelos de custo por projeto de construção</p>
        </div>
        <Button onClick={() => navigate('/novo-projeto')}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Estimativa
        </Button>
      </div>

      {estimativas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">Sem estimativas</h3>
            <p className="text-muted-foreground text-sm mb-4">Crie uma estimativa para modelar os custos de construção.</p>
            <Button onClick={() => navigate('/novo-projeto')}>Criar Estimativa</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {estimativas.map(est => {
            const resumo = calcularResumo(est.tarefas);
            const projeto = projetosTopo.find(p => p.id === est.parentId);
            return (
              <Card key={est.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/projeto/${est.id}`)}>
                      <p className="text-sm font-medium truncate">{est.nome}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {est.fracoes.length} fração(ões) · {new Date(est.criadoEm).toLocaleDateString('pt-PT')}
                      </p>
                    </div>
                    {projetosTopo.length > 0 && (
                      <div onClick={e => e.stopPropagation()}>
                        <Select
                          value={est.parentId || '__none__'}
                          onValueChange={v => associarProjeto(est.id, v === '__none__' ? '' : v)}
                        >
                          <SelectTrigger className="h-7 text-xs w-36 border-dashed">
                            <Link2 className="h-3 w-3 mr-1.5 shrink-0 text-muted-foreground" />
                            <SelectValue placeholder="Projeto…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__" className="text-xs text-muted-foreground">— Sem projeto —</SelectItem>
                            {projetosTopo.map(p => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">{p.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {!projetosTopo.length && projeto && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border shrink-0">
                        {projeto.nome}
                      </span>
                    )}
                    <p className="text-sm font-bold shrink-0">{resumo.total > 0 ? formatCurrency(resumo.total) : '—'}</p>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive shrink-0"
                      onClick={e => { e.stopPropagation(); setConfirmarEliminar(est.id); }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 cursor-pointer"
                      onClick={() => navigate(`/projeto/${est.id}`)} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmarEliminar} onOpenChange={o => { if (!o) setConfirmarEliminar(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar estimativa</AlertDialogTitle>
            <AlertDialogDescription>Tem a certeza? Esta ação não pode ser revertida.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (confirmarEliminar) eliminarProjeto(confirmarEliminar); setConfirmarEliminar(null); }}>
              Sim, apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
