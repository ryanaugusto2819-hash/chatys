import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Users, UserPlus, Mail, Trash2, Loader2, Crown, Shield, User, Copy, Check } from 'lucide-react';

type Member = {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  email?: string;
  full_name?: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
  token: string;
};

const ROLE_LABELS: Record<string, { label: string; icon: typeof Crown; color: string }> = {
  admin:      { label: 'Admin',      icon: Crown,  color: 'text-yellow-500' },
  supervisor: { label: 'Supervisor', icon: Shield, color: 'text-blue-500'   },
  agent:      { label: 'Agente',     icon: User,   color: 'text-green-500'  },
};

export default function TeamSettings() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('agent');
  const [inviting, setInviting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!currentWorkspace) return;
    loadData();
  }, [currentWorkspace?.id]);

  const loadData = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        supabase
          .from('workspace_members' as any)
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .order('created_at'),
        supabase
          .from('workspace_invites' as any)
          .select('id, email, role, expires_at, created_at, token')
          .eq('workspace_id', currentWorkspace.id)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false }),
      ]);

      if (membersRes.data) {
        // Buscar emails dos usuários
        const memberData = membersRes.data as any[];
        const enriched = await Promise.all(
          memberData.map(async (m) => {
            const { data: profile } = await supabase
              .from('profiles' as any)
              .select('full_name')
              .eq('user_id', m.user_id)
              .maybeSingle();
            return {
              ...m,
              full_name: (profile as any)?.full_name || 'Usuário',
            };
          })
        );
        setMembers(enriched);
      }

      if (invitesRes.data) setInvites(invitesRes.data as Invite[]);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !currentWorkspace || !user) return;
    setInviting(true);
    try {
      // Verificar limite do plano
      const { data: limitData } = await (supabase.rpc as any)('check_workspace_limit', {
        p_workspace_id: currentWorkspace.id,
        p_resource: 'members',
      });
      if (limitData && !limitData.allowed) {
        toast.error(limitData.reason || 'Limite de membros atingido');
        return;
      }

      const { error } = await supabase
        .from('workspace_invites' as any)
        .insert({
          workspace_id: currentWorkspace.id,
          invited_by: user.id,
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
        });
      if (error) throw error;

      toast.success(`Convite enviado para ${inviteEmail}`);
      setInviteEmail('');
      loadData();
    } catch (err: any) {
      if (err.code === '23505') {
        toast.error('Já existe um convite pendente para este email');
      } else {
        toast.error(err.message || 'Erro ao enviar convite');
      }
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('workspace_members' as any)
        .update({ role: newRole })
        .eq('id', memberId);
      if (error) throw error;
      setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, role: newRole } : m));
      toast.success('Função atualizada');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar função');
    }
  };

  const handleRemoveMember = async (memberId: string, memberUserId: string) => {
    if (memberUserId === user?.id) { toast.error('Você não pode se remover'); return; }
    try {
      const { error } = await supabase
        .from('workspace_members' as any)
        .delete()
        .eq('id', memberId);
      if (error) throw error;
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success('Membro removido');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover membro');
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from('workspace_invites' as any)
        .delete()
        .eq('id', inviteId);
      if (error) throw error;
      setInvites((prev) => prev.filter((i) => i.id !== inviteId));
      toast.success('Convite cancelado');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cancelar convite');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Equipe</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie os membros do seu workspace</p>
      </div>

      {/* Convidar */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Convidar membro</h2>
        </div>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
              placeholder="email@empresa.com"
              className="w-full rounded-lg border border-input bg-background pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="agent">Agente</option>
            <option value="supervisor">Supervisor</option>
            <option value="admin">Admin</option>
          </select>
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteEmail.trim()}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}
          >
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Convidar
          </button>
        </div>
      </div>

      {/* Membros */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Membros ({members.length})</h2>
        </div>
        {members.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum membro encontrado</p>
        )}
        {members.map((member) => {
          const roleInfo = ROLE_LABELS[member.role] || ROLE_LABELS.agent;
          const RoleIcon = roleInfo.icon;
          const isMe = member.user_id === user?.id;
          return (
            <div key={member.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-sm font-bold text-primary">
                    {(member.full_name || 'U')[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {member.full_name} {isMe && <span className="text-xs text-muted-foreground">(você)</span>}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <RoleIcon className={`h-3 w-3 ${roleInfo.color}`} />
                    <span className={`text-xs font-medium ${roleInfo.color}`}>{roleInfo.label}</span>
                  </div>
                </div>
              </div>
              {!isMe && (
                <div className="flex items-center gap-2">
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    className="rounded-lg border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="agent">Agente</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={() => handleRemoveMember(member.id, member.user_id)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Convites pendentes */}
      {invites.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Convites pendentes ({invites.length})</h2>
          {invites.map((invite) => {
            const inviteLink = `${window.location.origin}/invite/${invite.token}`;
            const isCopied = copiedToken === invite.id;
            const handleCopy = () => {
              navigator.clipboard.writeText(inviteLink);
              setCopiedToken(invite.id);
              toast.success('Link copiado!');
              setTimeout(() => setCopiedToken(null), 2000);
            };
            return (
              <div key={invite.id} className="py-2 border-b border-border/50 last:border-0 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABELS[invite.role]?.label} · Expira {new Date(invite.expires_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleCopy}
                      title="Copiar link do convite"
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                    >
                      {isCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-mono"
                  style={{ background: 'hsl(var(--muted)/0.5)', color: 'hsl(var(--muted-foreground))' }}>
                  <span className="truncate">{inviteLink}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
