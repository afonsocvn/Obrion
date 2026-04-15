import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderPlus, Package, Building2, HardHat, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/components/ui/button';

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

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border shrink-0">
        <div className="px-5 py-5 flex items-center gap-2.5">
          <Building2 className="h-6 w-6 text-sidebar-primary" />
          <span className="text-lg font-semibold tracking-tight">Obrion</span>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {navItems.map((item) => {
            const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                  active
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
        <div className="px-4 py-4 border-t border-sidebar-border space-y-3">
          {user && (
            <p className="text-xs text-sidebar-muted truncate px-1" title={user.email}>
              {user.email}
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sidebar-muted hover:text-sidebar-accent-foreground hover:bg-sidebar-accent px-2"
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
    </div>
  );
}
