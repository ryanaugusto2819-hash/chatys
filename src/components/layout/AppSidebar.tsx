import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import WorkspaceSwitcher from '@/components/workspace/WorkspaceSwitcher';
import logoImg from '@/assets/logo-group-liberty.jpg';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Bot,
  GitBranch,
  Plug,
  BarChart3,
  Settings,
  LogOut,
  ShieldCheck,
  Webhook,
  ChevronRight,
  Trophy,
  Crown,
  Megaphone,
  Activity,
  UserSearch,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';





const menuItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/conversations', icon: MessageSquare, label: 'Conversas' },
  { to: '/ads-conversions', icon: Megaphone, label: 'Conversões Ads' },
  { to: '/ranking', icon: Trophy, label: 'DashVendas' },
];


const adminItems = [
  { to: '/automation', icon: GitBranch, label: 'Automação' },
  { to: '/webhook-mappings', icon: Webhook, label: 'Webhooks' },
  { to: '/ai', icon: Bot, label: 'Nichos & IA' },
  { to: '/reports', icon: BarChart3, label: 'Relatórios' },
  { to: '/leads', icon: UserSearch, label: 'Extração de Leads' },
  { to: '/activity', icon: Activity, label: 'Atividade (IP)' },
  { to: '/manager-ai', icon: ShieldCheck, label: 'IA Gerente' },
  { to: '/connections', icon: Plug, label: 'Conexões' },
  { to: '/users', icon: Users, label: 'Usuários' },
  { to: '/settings', icon: Settings, label: 'Configurações' },
];

function SidebarNavItem({
  to,
  icon: Icon,
  label,
  badge,
  collapsed = false,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  collapsed?: boolean;
}) {
  const location = useLocation();
  const isActive =
    location.pathname === to ||
    (to !== '/' && location.pathname.startsWith(to));

  return (
    <NavLink
      to={to}
      className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group ${
        collapsed ? 'lg:justify-center lg:px-0' : ''
      }`}
      title={collapsed ? `${label}${badge ? ` (${badge})` : ''}` : undefined}
      style={
        isActive
          ? {
              background: 'linear-gradient(135deg, rgba(124,58,237,0.2) 0%, rgba(124,58,237,0.08) 100%)',
              color: '#C4B5FD',
            }
          : { color: 'hsl(260 15% 52%)' }
      }
      onMouseEnter={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.08)';
          (e.currentTarget as HTMLElement).style.color = 'hsl(260 15% 78%)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          (e.currentTarget as HTMLElement).style.background = '';
          (e.currentTarget as HTMLElement).style.color = 'hsl(260 15% 52%)';
        }
      }}
    >
      {isActive && <span className="sidebar-active-indicator" />}
      <Icon
        className="h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-105"
        style={{ color: isActive ? '#A78BFA' : undefined }}
      />
      <span className={`truncate flex-1 ${collapsed ? 'lg:hidden' : ''}`}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white ${
            collapsed ? 'lg:absolute lg:right-1 lg:top-1 lg:h-2 lg:min-w-2 lg:p-0 lg:text-[0px]' : ''
          }`}
          style={{ background: 'linear-gradient(135deg, #7C3AED, #A78BFA)' }}
        >
          {badge}
        </span>
      )}
      {isActive && !collapsed && (
        <ChevronRight className="h-3 w-3 shrink-0 opacity-50" style={{ color: '#A78BFA' }} />
      )}
    </NavLink>
  );
}

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export default function AppSidebar({
  mobileOpen = false,
  onMobileClose,
  collapsed = false,
  onCollapsedChange,
}: AppSidebarProps = {}) {
  const { user, signOut, isAdmin, isPlatformAdmin } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const displayName =
    user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    if (!currentWorkspace?.id) {
      setTotalUnread(0);
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchUnread = async () => {
      const { data, error } = await (supabase.rpc as any)('get_unread_conversations_count', {
        p_workspace_id: currentWorkspace.id,
      });

      if (!error && typeof data === 'number') {
        setTotalUnread(data);
      }
    };

    const scheduleFetchUnread = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchUnread, 1200);
    };

    fetchUnread();

    const channel = supabase
      .channel('sidebar-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () =>
        scheduleFetchUnread()
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () =>
        scheduleFetchUnread()
      )
      .subscribe();

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [currentWorkspace?.id]);

  return (
    <aside
      className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r transition-[width,transform] duration-300 lg:translate-x-0 ${
        collapsed ? 'lg:w-16' : 'lg:w-64'
      } ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
      style={{
        background: 'linear-gradient(180deg, #0F0A14 0%, #130D1A 60%, #0D0A12 100%)',
        borderColor: 'rgba(124,58,237,0.15)',
      }}
    >
      {/* ── Logo area ── */}
      <div
        className={`relative flex h-16 items-center gap-3 border-b shrink-0 ${collapsed ? 'lg:justify-center lg:px-2' : 'px-5'}`}
        style={{ borderColor: 'rgba(124,58,237,0.12)' }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden shrink-0"
          style={{
            background: 'linear-gradient(135deg, #7C3AED 0%, #9F5FE8 100%)',
            boxShadow: '0 4px 16px rgba(124,58,237,0.45)',
          }}
        >
          <img src={logoImg} alt="Group Liberty" className="h-9 w-9 object-cover" />
        </div>
        <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
          <h1
            className="text-sm font-bold tracking-tight truncate"
            style={{ color: '#F0EAFF' }}
          >
            Group Liberty
          </h1>
          <p
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: '#A78BFA' }}
          >
            Atendimento
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onCollapsedChange?.(!collapsed)}
          className="absolute -right-3 top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 rounded-full border-border bg-card text-muted-foreground shadow-md hover:bg-secondary hover:text-foreground lg:flex"
          aria-label={collapsed ? 'Expandir menu' : 'Minimizar menu'}
          title={collapsed ? 'Expandir menu' : 'Minimizar menu'}
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* ── Workspace Switcher ── */}
      <div className={`pt-3 pb-1 ${collapsed ? 'lg:hidden' : ''}`}>
        <WorkspaceSwitcher />
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-2 px-3 scrollbar-thin space-y-0.5">
        {/* Menu section */}
        <p className={`nav-section-label ${collapsed ? 'lg:hidden' : ''}`}>Menu</p>
        {menuItems.map((item) => (
          <SidebarNavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            badge={item.to === '/conversations' ? totalUnread : undefined}
            collapsed={collapsed}
          />
        ))}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div
              className="my-2.5 mx-2 h-px"
              style={{ background: 'rgba(124,58,237,0.12)' }}
            />
            <p className={`nav-section-label ${collapsed ? 'lg:hidden' : ''}`}>Administração</p>
            {adminItems.map((item) => (
              <SidebarNavItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
                collapsed={collapsed}
              />
            ))}
          </>
        )}

        {/* Platform admin */}
        {isPlatformAdmin && (
          <>
            <div
              className="my-2.5 mx-2 h-px"
              style={{ background: 'rgba(124,58,237,0.12)' }}
            />
            <p className={`nav-section-label ${collapsed ? 'lg:hidden' : ''}`}>Plataforma</p>
            <SidebarNavItem to="/platform-admin" icon={Crown} label="Admin da Plataforma" collapsed={collapsed} />
          </>
        )}
      </nav>

      {/* ── User section ── */}
      <div
        className={`border-t p-4 shrink-0 ${collapsed ? 'lg:px-2' : ''}`}
        style={{ borderColor: 'rgba(124,58,237,0.12)' }}
      >
        {/* Online status bar */}
        <div
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mb-3 ${collapsed ? 'lg:hidden' : ''}`}
          style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)' }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full animate-pulse-dot shrink-0"
            style={{ background: '#10b981' }}
          />
          <span className="text-[11px] font-semibold" style={{ color: '#10b981' }}>
            Sistema online
          </span>
        </div>

        <div className={`flex items-center gap-3 ${collapsed ? 'lg:justify-center' : ''}`}>
          <div className="relative shrink-0">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{
                background: 'linear-gradient(135deg, #7C3AED 0%, #9F5FE8 100%)',
                boxShadow: '0 2px 10px rgba(124,58,237,0.45)',
              }}
            >
              {initials}
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2"
              style={{ background: '#10b981', borderColor: '#0F0A14' }}
            />
          </div>

          <div className={`flex-1 min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <p
              className="text-sm font-semibold truncate"
              style={{ color: '#E9E0FF' }}
            >
              {displayName}
            </p>
            <p className="text-[11px] truncate" style={{ color: 'hsl(260 15% 42%)' }}>
              {user?.email}
            </p>
          </div>

          <button
            onClick={signOut}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 shrink-0 ${collapsed ? 'lg:hidden' : ''}`}
            style={{ color: 'hsl(260 15% 42%)' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)';
              (e.currentTarget as HTMLElement).style.color = '#f87171';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = '';
              (e.currentTarget as HTMLElement).style.color = 'hsl(260 15% 42%)';
            }}
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
