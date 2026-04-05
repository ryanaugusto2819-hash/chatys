import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, Shield, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  is_approved: boolean;
  created_at: string;
  status: string;
  role: string;
  email?: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const { currentWorkspace } = useWorkspace();

  const fetchUsers = async () => {
    setLoading(true);

    // If workspace is loaded, only show members of this workspace
    if (currentWorkspace) {
      const { data: members } = await supabase
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', currentWorkspace.id);

      const memberUserIds = (members ?? []).map((m) => m.user_id);
      const memberRoleMap: Record<string, string> = {};
      (members ?? []).forEach((m) => { memberRoleMap[m.user_id] = m.role; });

      const { data: profiles } = memberUserIds.length > 0
        ? await supabase.from('profiles').select('*').in('user_id', memberUserIds).order('created_at', { ascending: false })
        : { data: [] };

      setUsers((profiles ?? []).map((p) => ({
        ...p,
        role: memberRoleMap[p.user_id] ?? 'agent',
      })));
    } else {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: roles } = await supabase.from('user_roles').select('*');

      const merged = (profiles ?? []).map((p) => {
        const userRoles = (roles ?? []).filter((r) => r.user_id === p.user_id);
        const topRole = userRoles.find((r) => r.role === 'admin')
          ? 'admin'
          : userRoles.find((r) => r.role === 'supervisor')
            ? 'supervisor'
            : 'agent';
        return { ...p, role: topRole };
      });
      setUsers(merged);
    }

    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, [currentWorkspace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const approveUser = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: true })
      .eq('user_id', userId);
    if (error) return toast.error('Erro ao aprovar usuário');

    // Add user to current workspace if not already a member
    if (currentWorkspace) {
      await supabase
        .from('workspace_members')
        .upsert(
          { workspace_id: currentWorkspace.id, user_id: userId, role: 'agent' },
          { onConflict: 'workspace_id,user_id', ignoreDuplicates: true }
        );
    }

    toast.success('Usuário aprovado!');
    fetchUsers();
  };

  const rejectUser = async (userId: string) => {
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: false })
      .eq('user_id', userId);
    if (error) return toast.error('Erro ao rejeitar usuário');
    toast.success('Acesso do usuário revogado');
    fetchUsers();
  };

  const changeRole = async (userId: string, newRole: 'admin' | 'supervisor' | 'agent') => {
    // Update role in workspace_members for current workspace
    if (currentWorkspace) {
      const { error } = await supabase
        .from('workspace_members')
        .update({ role: newRole })
        .eq('workspace_id', currentWorkspace.id)
        .eq('user_id', userId);
      if (error) return toast.error('Erro ao alterar role');
    } else {
      // Fallback: global user_roles
      await supabase.from('user_roles').delete().eq('user_id', userId);
      const { error } = await supabase.from('user_roles').insert({ user_id: userId, role: newRole });
      if (error) return toast.error('Erro ao alterar role');
    }
    toast.success(`Role alterada para ${newRole}`);
    fetchUsers();
  };

  const filtered = users.filter((u) => {
    if (filter === 'pending') return !u.is_approved;
    if (filter === 'approved') return u.is_approved;
    return true;
  });

  const pendingCount = users.filter((u) => !u.is_approved).length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Gerenciar Usuários</h1>
        <p className="text-sm text-muted-foreground mt-1">Aprove contas e gerencie permissões</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-card-foreground">{users.length}</p>
              <p className="text-xs text-muted-foreground">Total de usuários</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
              <User className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-card-foreground">{pendingCount}</p>
              <p className="text-xs text-muted-foreground">Pendentes</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
              <Check className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold text-card-foreground">{users.length - pendingCount}</p>
              <p className="text-xs text-muted-foreground">Aprovados</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {(['all', 'pending', 'approved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filter === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'all' ? 'Todos' : f === 'pending' ? `Pendentes (${pendingCount})` : 'Aprovados'}
          </button>
        ))}
      </div>

      {/* User list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">Nenhum usuário encontrado</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Usuário</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Data</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-card-foreground">{u.full_name || 'Sem nome'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      u.is_approved
                        ? 'bg-success/10 text-success'
                        : 'bg-warning/10 text-warning'
                    }`}>
                      {u.is_approved ? 'Aprovado' : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.user_id, e.target.value as any)}
                      className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-foreground"
                    >
                      <option value="agent">Agente</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!u.is_approved ? (
                      <button
                        onClick={() => approveUser(u.user_id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-success/10 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/20 transition-colors"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Aprovar
                      </button>
                    ) : (
                      <button
                        onClick={() => rejectUser(u.user_id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Revogar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
