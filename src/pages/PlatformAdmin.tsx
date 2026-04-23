import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import {
  Building2, Users, Search, MoreVertical, CheckCircle,
  XCircle, Loader2, TrendingUp, Crown,
} from 'lucide-react';

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  country: string;
  status: string;
  plan_name: string;
  member_count: number;
  created_at: string;
  owner_email: string;
};

const STATUS_STYLES: Record<string, string> = {
  active:    'bg-green-500/10 text-green-600',
  suspended: 'bg-red-500/10 text-red-600',
  cancelled: 'bg-gray-500/10 text-gray-500',
  trialing:  'bg-amber-500/10 text-amber-600',
};

export default function PlatformAdmin() {
  const { user } = useAuth();
  const [isPlatformAdmin, setIsPlatformAdmin] = useState<boolean | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, trialing: 0 });

  useEffect(() => {
    if (!user) return;
    checkAdminStatus();
  }, [user]);

  const checkAdminStatus = async () => {
    const { data } = await supabase
      .from('profiles' as any)
      .select('is_platform_admin')
      .eq('user_id', user?.id)
      .maybeSingle();
    const isAdmin = (data as any)?.is_platform_admin === true;
    setIsPlatformAdmin(isAdmin);
    if (isAdmin) loadWorkspaces();
    else setLoading(false);
  };

  const loadWorkspaces = async (searchTerm = '') => {
    setLoading(true);
    try {
      const { data } = await (supabase.rpc as any)('admin_list_workspaces', {
        p_limit: 100,
        p_offset: 0,
        p_search: searchTerm,
      });
      const rows = (data || []) as WorkspaceRow[];
      setWorkspaces(rows);
      setStats({
        total: rows.length,
        active: rows.filter((w) => w.status === 'active').length,
        trialing: rows.filter((w) => w.status === 'trialing').length,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    loadWorkspaces(e.target.value);
  };

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    await supabase.from('workspaces' as any).update({ status: newStatus }).eq('id', id);
    setWorkspaces((prev) => prev.map((w) => w.id === id ? { ...w, status: newStatus } : w));
  };

  if (isPlatformAdmin === null || loading) return (
    <div className="flex items-center justify-center h-full py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!isPlatformAdmin) return <Navigate to="/" replace />;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Crown className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Painel da Plataforma</h1>
          <p className="text-sm text-muted-foreground">Gerenciamento de todos os workspaces</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total de Workspaces', value: stats.total,    icon: Building2,   color: 'text-blue-500'   },
          { label: 'Workspaces Ativos',   value: stats.active,   icon: CheckCircle, color: 'text-green-500'  },
          { label: 'Em Trial',            value: stats.trialing, icon: TrendingUp,  color: 'text-amber-500'  },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={handleSearch}
          placeholder="Buscar workspace por nome ou slug..."
          className="w-full rounded-xl border border-input bg-background pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Workspace</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dono</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Plano</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Membros</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Criado em</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {workspaces.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  Nenhum workspace encontrado
                </td>
              </tr>
            )}
            {workspaces.map((ws) => (
              <tr key={ws.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-foreground">{ws.name}</p>
                    <p className="text-xs text-muted-foreground">/{ws.slug}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm text-foreground">{ws.owner_email || '—'}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    {ws.plan_name}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm text-foreground">{ws.member_count}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[ws.status] || STATUS_STYLES.suspended}`}>
                    {ws.status === 'active' ? 'Ativo' : ws.status === 'suspended' ? 'Suspenso' :
                     ws.status === 'trialing' ? 'Trial' : ws.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(ws.created_at).toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleStatus(ws.id, ws.status)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors"
                    title={ws.status === 'active' ? 'Suspender' : 'Ativar'}
                  >
                    {ws.status === 'active'
                      ? <XCircle className="h-4 w-4 text-destructive" />
                      : <CheckCircle className="h-4 w-4 text-green-500" />
                    }
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
