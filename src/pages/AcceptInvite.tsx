import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Building2, CheckCircle, XCircle, Loader2,
  ArrowRight, Mail, Lock, Eye, EyeOff, User, ShieldCheck,
} from 'lucide-react';

type InviteInfo = {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  expires_at: string;
  workspace_name?: string;
};

type PageState = 'loading' | 'valid' | 'invalid' | 'expired' | 'accepted' | 'need_signup';

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { refetchWorkspaces } = useWorkspace();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Signup form state
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [signingUp, setSigningUp] = useState(false);

  useEffect(() => {
    if (token) loadInvite();
  }, [token]);

  const loadInvite = async () => {
    if (!token) { setPageState('invalid'); return; }

    try {
      const { data, error } = await supabase
        .from('workspace_invites' as any)
        .select('id, workspace_id, email, role, expires_at')
        .eq('token', token)
        .is('accepted_at', null)
        .maybeSingle();

      if (error || !data) { setPageState('invalid'); return; }

      const inv = data as InviteInfo;

      if (new Date(inv.expires_at) < new Date()) { setPageState('expired'); return; }

      // Buscar nome do workspace
      const { data: ws } = await supabase
        .from('workspaces' as any)
        .select('name')
        .eq('id', inv.workspace_id)
        .maybeSingle();

      setInvite({ ...inv, workspace_name: (ws as any)?.name });

      // Se já está logado com o email correto → mostrar botão de aceitar
      // Se está logado com email diferente → mostrar aviso
      // Se não está logado → mostrar form de signup/login
      if (session && user) {
        if (user.email === inv.email) {
          setPageState('valid');
        } else {
          setPageState('valid'); // deixa aceitar mesmo com email diferente
        }
      } else {
        setPageState('need_signup');
      }
    } catch {
      setPageState('invalid');
    }
  };

  const handleAccept = async () => {
    if (!token || !user) return;
    setAccepting(true);
    try {
      const { data, error } = await (supabase.rpc as any)('accept_workspace_invite', {
        p_token: token,
        p_user_id: user.id,
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.reason || 'Erro ao aceitar convite');

      await refetchWorkspaces();
      setPageState('accepted');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao aceitar convite');
    } finally {
      setAccepting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    setSigningUp(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;
      // Após signup, aceitar o convite automaticamente
      // O usuário precisa confirmar email primeiro em alguns casos
      toast.success('Conta criada! Aceitando convite...');
      // Aguarda sessão ser estabelecida
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar conta');
    } finally {
      setSigningUp(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    setSigningUp(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password,
      });
      if (error) throw error;
      setPageState('valid');
    } catch (err: any) {
      toast.error(err.message || 'Email ou senha incorretos');
    } finally {
      setSigningUp(false);
    }
  };

  const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrador',
    supervisor: 'Supervisor',
    agent: 'Agente',
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0F0A14 0%, #1A0D2E 50%, #0D0A12 100%)' }}
    >
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.6), transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full blur-3xl opacity-15"
          style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.5), transparent)' }} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-8"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
          }}
        >
          {/* Loading */}
          {pageState === 'loading' && (
            <div className="text-center py-8">
              <Loader2 className="h-10 w-10 animate-spin text-purple-400 mx-auto mb-4" />
              <p className="text-white/70 text-sm">Verificando convite...</p>
            </div>
          )}

          {/* Invalid */}
          {pageState === 'invalid' && (
            <div className="text-center space-y-4">
              <XCircle className="h-16 w-16 text-red-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">Convite inválido</h2>
              <p className="text-sm" style={{ color: 'rgba(167,139,250,0.7)' }}>
                Este link de convite não existe ou já foi utilizado.
              </p>
              <Link to="/login"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}
              >
                Ir para o login
              </Link>
            </div>
          )}

          {/* Expired */}
          {pageState === 'expired' && (
            <div className="text-center space-y-4">
              <XCircle className="h-16 w-16 text-amber-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">Convite expirado</h2>
              <p className="text-sm" style={{ color: 'rgba(167,139,250,0.7)' }}>
                Este convite expirou em {invite ? new Date(invite.expires_at).toLocaleDateString('pt-BR') : ''}.<br />
                Peça ao administrador do workspace para enviar um novo convite.
              </p>
              <Link to="/login"
                className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}
              >
                Ir para o login
              </Link>
            </div>
          )}

          {/* Valid — aceitar convite */}
          {pageState === 'valid' && invite && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-4"
                  style={{ border: '1px solid rgba(124,58,237,0.3)' }}>
                  <Building2 className="h-7 w-7 text-purple-400" />
                </div>
                <h2 className="text-xl font-bold text-white mb-1">Você foi convidado!</h2>
                <p className="text-sm" style={{ color: 'rgba(167,139,250,0.7)' }}>
                  Para entrar no workspace
                </p>
              </div>

              {/* Info do convite */}
              <div className="rounded-xl p-4 space-y-3"
                style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-purple-300/60">Workspace</span>
                  <span className="text-sm font-semibold text-white">{invite.workspace_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-purple-300/60">Email</span>
                  <span className="text-sm text-white">{invite.email}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-purple-300/60">Função</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/20 text-purple-300">
                    {ROLE_LABELS[invite.role] || invite.role}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-purple-300/60">Expira em</span>
                  <span className="text-xs text-white/60">
                    {new Date(invite.expires_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>

              {user && user.email !== invite.email && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                  <p className="text-xs text-amber-400">
                    Você está logado como <strong>{user.email}</strong>.<br />
                    Este convite é para <strong>{invite.email}</strong>.
                  </p>
                </div>
              )}

              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)', boxShadow: '0 4px 24px rgba(124,58,237,0.4)' }}
              >
                {accepting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><CheckCircle className="h-4 w-4" /> Aceitar convite</>
                }
              </button>
            </div>
          )}

          {/* Need signup/login */}
          {pageState === 'need_signup' && invite && (
            <NeedAuthForm
              invite={invite}
              fullName={fullName}
              setFullName={setFullName}
              password={password}
              setPassword={setPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              signingUp={signingUp}
              onSignUp={handleSignUp}
              onLogin={handleLogin}
              roleLabel={ROLE_LABELS[invite.role] || invite.role}
            />
          )}

          {/* Accepted */}
          {pageState === 'accepted' && invite && (
            <div className="text-center space-y-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200 }}
                className="mx-auto h-20 w-20 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)', boxShadow: '0 8px 40px rgba(16,185,129,0.4)' }}
              >
                <CheckCircle className="h-10 w-10 text-white" />
              </motion.div>

              <div>
                <h2 className="text-2xl font-bold text-white mb-2">Bem-vindo!</h2>
                <p className="text-sm" style={{ color: 'rgba(167,139,250,0.7)' }}>
                  Você agora faz parte do workspace<br />
                  <strong className="text-purple-300">{invite.workspace_name}</strong> como{' '}
                  <strong className="text-purple-300">{ROLE_LABELS[invite.role] || invite.role}</strong>.
                </p>
              </div>

              <button
                onClick={() => navigate('/')}
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)', boxShadow: '0 4px 24px rgba(124,58,237,0.4)' }}
              >
                Acessar o workspace <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </motion.div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs" style={{ color: 'rgba(167,139,250,0.4)' }}>
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Convite seguro · Chatys Platform</span>
        </div>
      </div>
    </div>
  );
}

// ── Componente interno: form de signup/login ──────────────────────
function NeedAuthForm({
  invite, fullName, setFullName, password, setPassword,
  showPassword, setShowPassword, signingUp, onSignUp, onLogin, roleLabel,
}: {
  invite: InviteInfo;
  fullName: string; setFullName: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  showPassword: boolean; setShowPassword: (v: boolean) => void;
  signingUp: boolean;
  onSignUp: (e: React.FormEvent) => void;
  onLogin: (e: React.FormEvent) => void;
  roleLabel: string;
}) {
  const [mode, setMode] = useState<'signup' | 'login'>('signup');

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-primary/20 flex items-center justify-center mb-4"
          style={{ border: '1px solid rgba(124,58,237,0.3)' }}>
          <Building2 className="h-7 w-7 text-purple-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Você foi convidado!</h2>
        <p className="text-sm" style={{ color: 'rgba(167,139,250,0.7)' }}>
          Para entrar em <strong className="text-purple-300">{invite.workspace_name}</strong> como{' '}
          <strong className="text-purple-300">{roleLabel}</strong>
        </p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
        {(['signup', 'login'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className="flex-1 rounded-lg py-2 text-xs font-semibold transition-all"
            style={{
              background: mode === m ? 'rgba(124,58,237,0.4)' : 'transparent',
              color: mode === m ? '#E9D5FF' : 'rgba(167,139,250,0.5)',
            }}
          >
            {m === 'signup' ? 'Criar conta' : 'Já tenho conta'}
          </button>
        ))}
      </div>

      <form onSubmit={mode === 'signup' ? onSignUp : onLogin} className="space-y-3">
        {/* Email (readonly) */}
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#C4B5FD' }}>Email (do convite)</label>
          <div className="flex items-center rounded-xl border px-3 py-2.5 gap-2"
            style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
            <Mail className="h-4 w-4 shrink-0" style={{ color: 'rgba(167,139,250,0.5)' }} />
            <span className="text-sm text-white/50">{invite.email}</span>
          </div>
        </div>

        {/* Nome completo (só signup) */}
        {mode === 'signup' && (
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: '#C4B5FD' }}>Nome completo</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(167,139,250,0.5)' }} />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
                required
                className="w-full rounded-xl border pl-10 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
                style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)' }}
              />
            </div>
          </div>
        )}

        {/* Senha */}
        <div>
          <label className="block text-xs font-semibold mb-1" style={{ color: '#C4B5FD' }}>
            {mode === 'signup' ? 'Criar senha' : 'Senha'}
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgba(167,139,250,0.5)' }} />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="w-full rounded-xl border pl-10 pr-10 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500"
              style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)' }}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(167,139,250,0.5)' }}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={signingUp}
          className="w-full rounded-xl py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)', boxShadow: '0 4px 24px rgba(124,58,237,0.4)' }}
        >
          {signingUp
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : mode === 'signup'
              ? <><CheckCircle className="h-4 w-4" /> Criar conta e entrar</>
              : <><ArrowRight className="h-4 w-4" /> Entrar e aceitar convite</>
          }
        </button>
      </form>
    </div>
  );
}
