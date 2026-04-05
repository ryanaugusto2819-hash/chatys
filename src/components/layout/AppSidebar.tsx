import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
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
} from 'lucide-react';

const menuItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/conversations', icon: MessageSquare, label: 'Conversas' },
];

const adminItems = [
  { to: '/agents', icon: Users, label: 'Atendentes' },
  { to: '/automation', icon: GitBranch, label: 'Automação' },
  { to: '/webhook-mappings', icon: Webhook, label: 'Webhooks' },
  { to: '/ai', icon: Bot, label: 'Nichos & IA' },
  { to: '/reports', icon: BarChart3, label: 'Relatórios' },
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
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
}) {
  const location = useLocation();
  const isActive =
    location.pathname === to ||
    (to !== '/' && location.pathname.startsWith(to));

  return (
    <NavLink
      to={to}
      className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group"
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
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #A78BFA)' }}
        >
          {badge}
        </span>
      )}
      {isActive && (
        <ChevronRight className="h-3 w-3 shrink-0 opacity-50" style={{ color: '#A78BFA' }} />
      )}
    </NavLink>
  );
}

export default function AppSidebar() {
  const { user, signOut, isAdmin } = useAuth();
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
    const fetchUnread = async () => {
      const { data } = await supabase.rpc('get_conversations_with_last_message');
      if (data) {
        const total = (data as any[]).filter((c) => (c.unread_count || 0) > 0).length;
        setTotalUnread(total);
      }
    };
    fetchUnread();

    const channel = supabase
      .channel('sidebar-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () =>
        fetchUnread()
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, () =>
        fetchUnread()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r"
      style={{
        background: 'linear-gradient(180deg, #0F0A14 0%, #130D1A 60%, #0D0A12 100%)',
        borderColor: 'rgba(124,58,237,0.15)',
      }}
    >
      {/* ── Logo area ── */}
      <div
        className="flex h-16 items-center gap-3 px-5 border-b shrink-0"
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
        <div className="min-w-0">
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
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 scrollbar-thin space-y-0.5">
        {/* Menu section */}
        <p className="nav-section-label">Menu</p>
        {menuItems.map((item) => (
          <SidebarNavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            badge={item.to === '/conversations' ? totalUnread : undefined}
          />
        ))}

        {/* Admin section */}
        {isAdmin && (
          <>
            <div
              className="my-2.5 mx-2 h-px"
              style={{ background: 'rgba(124,58,237,0.12)' }}
            />
            <p className="nav-section-label">Administração</p>
            {adminItems.map((item) => (
              <SidebarNavItem
                key={item.to}
                to={item.to}
                icon={item.icon}
                label={item.label}
              />
            ))}
          </>
        )}
      </nav>

      {/* ── User section ── */}
      <div
        className="border-t p-4 shrink-0"
        style={{ borderColor: 'rgba(124,58,237,0.12)' }}
      >
        {/* Online status bar */}
        <div
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 mb-3"
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

        <div className="flex items-center gap-3">
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

          <div className="flex-1 min-w-0">
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
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 shrink-0"
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
