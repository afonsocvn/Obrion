import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderPlus, Package, Building2, HardHat,
  LogOut, Users, Plus, ArrowLeft, ChevronRight, UserPlus, Crown, User, AlertTriangle, Bug, Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/lib/supabase';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/novo-projeto', label: 'Novo Projeto', icon: FolderPlus },
  { to: '/materiais', label: 'Materiais', icon: Package },
  { to: '/mao-de-obra', label: 'Mão de Obra', icon: HardHat },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const { carregando } = useApp();
  const {
    workspaces, activeWorkspace, isTeamMode, isOwner, members, pendingInvites,
    createWorkspace, switchToPersonal, switchToWorkspace, inviteByEmail, acceptInvite, rejectInvite,
  } = useWorkspace();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showTeamDialog, setShowTeamDialog] = useState(false);
  const [nomeEquipa, setNomeEquipa] = useState('');
  const [emailConvite, setEmailConvite] = useState('');
  const [criando, setCriando] = useState(false);
  const [erroCreate, setErroCreate] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [conviteEnviado, setConviteEnviado] = useState(false);

  // Feedback
  const [feedbackStep, setFeedbackStep] = useState<'closed' | 'tipo' | 'texto'>('closed');
  const [feedbackTipo, setFeedbackTipo] = useState<'erro' | 'melhoria' | null>(null);
  const [feedbackTexto, setFeedbackTexto] = useState('');
  const [feedbackEnviando, setFeedbackEnviando] = useState(false);
  const [feedbackEnviado, setFeedbackEnviado] = useState(false);

  const handleFeedbackEnviar = async () => {
    if (!feedbackTexto.trim() || !feedbackTipo) return;
    setFeedbackEnviando(true);
    await supabase.from('feedback').insert({
      tipo: feedbackTipo,
      mensagem: feedbackTexto.trim(),
      user_email: user?.email ?? null,
    });
    setFeedbackEnviando(false);
    setFeedbackEnviado(true);
    setTimeout(() => {
      setFeedbackStep('closed');
      setFeedbackTipo(null);
      setFeedbackTexto('');
      setFeedbackEnviado(false);
    }, 2000);
  };

  const handleCreateWorkspace = async () => {
    if (!nomeEquipa.trim()) return;
    setCriando(true);
    setErroCreate('');
    const ws = await createWorkspace(nomeEquipa.trim());
    setCriando(false);
    if (ws) {
      setNomeEquipa('');
      setShowCreateDialog(false);
      switchToWorkspace(ws);
    } else {
      setErroCreate('Não foi possível criar a equipa. Verifica a consola (F12) para mais detalhes.');
    }
  };

  const handleInvite = async () => {
    if (!emailConvite.trim()) return;
    setEnviando(true);
    const ok = await inviteByEmail(emailConvite.trim());
    setEnviando(false);
    if (ok) {
      setConviteEnviado(true);
      setEmailConvite('');
      setTimeout(() => setConviteEnviado(false), 3000);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'w-60 flex flex-col border-r shrink-0 transition-colors duration-300',
          isTeamMode
            ? 'bg-green-900 border-green-800 text-white'
            : 'bg-sidebar text-sidebar-foreground border-sidebar-border'
        )}
      >
        {/* Logo + team name */}
        <div className="px-5 py-5 flex items-center gap-2.5">
          <Building2 className={cn('h-6 w-6 shrink-0', isTeamMode ? 'text-green-300' : 'text-sidebar-primary')} />
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-lg font-semibold tracking-tight">Obrion</span>
            {isTeamMode && activeWorkspace && (
              <span className="text-xs text-green-300 font-medium truncate">{activeWorkspace.nome}</span>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {navItems.map((item) => {
            const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                  isTeamMode
                    ? active
                      ? 'bg-green-700 text-white font-medium'
                      : 'text-green-200 hover:bg-green-800 hover:text-white'
                    : active
                      ? 'bg-sidebar-accent text-sidebar-primary-foreground font-medium'
                      : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Feedback button */}
        <div className={cn('px-3 pb-1', isTeamMode ? '' : '')}>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'w-full justify-start gap-2 px-2 text-xs',
              isTeamMode
                ? 'text-green-300 hover:text-white hover:bg-green-800'
                : 'text-sidebar-muted hover:text-sidebar-accent-foreground hover:bg-sidebar-accent'
            )}
            onClick={() => setFeedbackStep('tipo')}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Reportar erro ou melhoria
          </Button>
        </div>

        {/* Team section */}
        <div className={cn('px-3 py-3 border-t', isTeamMode ? 'border-green-800' : 'border-sidebar-border')}>
          {isTeamMode ? (
            <div className="space-y-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-green-200 hover:text-white hover:bg-green-800 px-2 text-xs"
                onClick={() => setShowTeamDialog(true)}
              >
                <Users className="h-3.5 w-3.5" />
                Gerir equipa
                <Badge className="ml-auto bg-green-700 text-green-100 text-[10px] px-1.5 py-0 h-4">
                  {members.length}
                </Badge>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-green-300 hover:text-white hover:bg-green-800 px-2 text-xs"
                onClick={switchToPersonal}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Perfil pessoal
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {workspaces.map((ws) => (
                <Button
                  key={ws.id}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between gap-2 text-sidebar-muted hover:text-sidebar-accent-foreground hover:bg-sidebar-accent px-2 text-xs"
                  onClick={() => switchToWorkspace(ws)}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{ws.nome}</span>
                  </span>
                  <ChevronRight className="h-3 w-3 opacity-50 shrink-0" />
                </Button>
              ))}
              {/* Notificações de convite */}
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 mb-1">
                  <p className="text-xs text-blue-800 mb-1.5 leading-snug">
                    Convite para <span className="font-semibold">{invite.workspace_nome}</span>
                  </p>
                  <div className="flex gap-1">
                    <button
                      className="flex-1 text-[11px] font-medium bg-blue-600 text-white rounded px-2 py-1 hover:bg-blue-700 transition-colors"
                      onClick={() => acceptInvite(invite)}
                    >
                      Aceitar
                    </button>
                    <button
                      className="flex-1 text-[11px] font-medium border border-blue-300 text-blue-700 rounded px-2 py-1 hover:bg-blue-100 transition-colors"
                      onClick={() => rejectInvite(invite.id)}
                    >
                      Rejeitar
                    </button>
                  </div>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-sidebar-muted hover:text-sidebar-accent-foreground hover:bg-sidebar-accent px-2 text-xs"
                onClick={() => setShowCreateDialog(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Criar equipa
              </Button>
            </div>
          )}
        </div>

        {/* User / sign out */}
        <div className={cn('px-4 py-4 border-t space-y-3', isTeamMode ? 'border-green-800' : 'border-sidebar-border')}>
          {user && (
            <p className={cn('text-xs truncate px-1', isTeamMode ? 'text-green-300' : 'text-sidebar-muted')} title={user.email}>
              {user.email}
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'w-full justify-start gap-2 px-2',
              isTeamMode
                ? 'text-green-300 hover:text-white hover:bg-green-800'
                : 'text-sidebar-muted hover:text-sidebar-accent-foreground hover:bg-sidebar-accent'
            )}
            onClick={signOut}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {carregando ? (
          <div className="flex items-center justify-center h-full min-h-screen">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
              <p className="text-sm text-muted-foreground">A carregar...</p>
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      {/* Dialog: criar equipa */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Criar nova equipa</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="nome-equipa">Nome da equipa</Label>
            <Input
              id="nome-equipa"
              className="mt-1.5"
              placeholder="Ex: Construpan Lda"
              value={nomeEquipa}
              onChange={(e) => setNomeEquipa(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateWorkspace()}
              autoFocus
            />
          </div>
          {erroCreate && (
            <p className="text-xs text-red-600 -mt-1">{erroCreate}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateWorkspace} disabled={!nomeEquipa.trim() || criando}>
              {criando ? 'A criar...' : 'Criar equipa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: feedback */}
      <Dialog open={feedbackStep !== 'closed'} onOpenChange={(open) => !open && setFeedbackStep('closed')}>
        <DialogContent className="bg-white max-w-sm">
          {feedbackStep === 'tipo' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  O que pretende reportar?
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 py-2">
                <button
                  onClick={() => { setFeedbackTipo('erro'); setFeedbackStep('texto'); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-red-100 hover:border-red-400 hover:bg-red-50 transition-colors"
                >
                  <Bug className="h-7 w-7 text-red-500" />
                  <span className="text-sm font-medium text-red-700">Reportar erro</span>
                </button>
                <button
                  onClick={() => { setFeedbackTipo('melhoria'); setFeedbackStep('texto'); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-blue-100 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                >
                  <Lightbulb className="h-7 w-7 text-blue-500" />
                  <span className="text-sm font-medium text-blue-700">Sugerir melhoria</span>
                </button>
              </div>
            </>
          )}

          {feedbackStep === 'texto' && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {feedbackTipo === 'erro'
                    ? <><Bug className="h-5 w-5 text-red-500" /> Descreva o erro</>
                    : <><Lightbulb className="h-5 w-5 text-blue-500" /> Descreva a melhoria</>
                  }
                </DialogTitle>
              </DialogHeader>
              <div className="py-1">
                <Textarea
                  placeholder={feedbackTipo === 'erro'
                    ? 'O que aconteceu? Em que página? O que esperava que acontecesse?'
                    : 'Que funcionalidade gostaria de ver? Como funcionaria?'
                  }
                  className="min-h-[120px] resize-none"
                  value={feedbackTexto}
                  onChange={(e) => setFeedbackTexto(e.target.value)}
                  autoFocus
                />
              </div>
              {feedbackEnviado && (
                <p className="text-sm text-green-600 font-medium text-center">Obrigado pelo feedback!</p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setFeedbackStep('tipo')} disabled={feedbackEnviando}>
                  Voltar
                </Button>
                <Button
                  onClick={handleFeedbackEnviar}
                  disabled={!feedbackTexto.trim() || feedbackEnviando || feedbackEnviado}
                  className={feedbackTipo === 'erro' ? 'bg-red-600 hover:bg-red-700' : ''}
                >
                  {feedbackEnviando ? 'A enviar...' : 'Enviar'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: gerir equipa */}
      <Dialog open={showTeamDialog} onOpenChange={setShowTeamDialog}>
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-green-700" />
              {activeWorkspace?.nome}
            </DialogTitle>
          </DialogHeader>

          {/* Members list */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Membros ({members.length})
            </p>
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-50">
                <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  {m.role === 'owner'
                    ? <Crown className="h-3.5 w-3.5 text-amber-600" />
                    : <User className="h-3.5 w-3.5 text-gray-500" />
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-sm truncate">{m.email || 'Membro'}</p>
                  <p className="text-xs text-muted-foreground capitalize">{m.role === 'owner' ? 'Administrador' : 'Membro'}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Invite form (owner only) */}
          {isOwner && (
            <div className="border-t pt-4 mt-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Convidar por email
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="email@exemplo.com"
                  type="email"
                  value={emailConvite}
                  onChange={(e) => setEmailConvite(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleInvite}
                  disabled={!emailConvite.trim() || enviando}
                  className="gap-1.5"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {enviando ? '...' : 'Convidar'}
                </Button>
              </div>
              {conviteEnviado && (
                <p className="text-xs text-green-600 mt-1.5">
                  Convite registado. O utilizador verá a equipa quando iniciar sessão.
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
