import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Mail, Lock, User, Eye, EyeOff, MessageSquare, Bot, Zap, ShieldCheck, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import logoImg from '@/assets/logo-group-liberty.jpg';
import { motion } from 'framer-motion';

const features = [
  { icon: MessageSquare, label: 'Atendimento WhatsApp', color: '#25D366', delay: 0.4 },
  { icon: Bot,           label: 'IA Integrada',         color: '#A78BFA', delay: 0.5 },
  { icon: Zap,           label: 'Automação de Fluxos',  color: '#FCD34D', delay: 0.6 },
];

const stats = [
  { value: '10k+', label: 'Conversas' },
  { value: '99.9%', label: 'Uptime' },
  { value: '< 1s', label: 'IA Resposta' },
];

function clearLocalAuthTokens() {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('sb-') && key.includes('-auth-token')) {
      localStorage.removeItem(key);
    }
  });
}

async function resetStaleAuthSession() {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    clearLocalAuthTokens();
  }
}

async function withAuthTimeout<T>(promise: Promise<T>, timeoutMs = 12000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    ),
  ]);
}

export default function Login() {
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (isSignUp) {
        const { error } = await withAuthTimeout(
          supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
              data: { full_name: fullName.trim() },
              emailRedirectTo: window.location.origin,
            },
          })
        );
        if (error) throw error;
        toast.success('Conta criada! Configure seu workspace.');
        navigate('/onboarding');
      } else {
        await resetStaleAuthSession();
        const { error } = await withAuthTimeout(
          supabase.auth.signInWithPassword({ email: normalizedEmail, password })
        );
        if (error) {
          if (error.message?.toLowerCase().includes('email not confirmed')) {
            toast.error('Seu email ainda não foi confirmado. Clique em "Criar conta" e use o mesmo email para reenviar a confirmação, ou use "Esqueceu a senha?" se precisar redefinir a senha.');
            return;
          }
          throw error;
        }
        navigate('/', { replace: true });
      }
    } catch (error: any) {
      if (error.message === 'TIMEOUT' || error.message === 'Failed to fetch') {
        toast.error('Não foi possível conectar ao login agora. Recarregue a página e tente novamente.');
      } else {
        toast.error(error.message || 'Erro ao autenticar');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* ── Left panel — brand ── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0F0A14 0%, #1A0D2E 50%, #0D0A12 100%)' }}
      >
        {/* Dot grid overlay */}
        <div className="absolute inset-0 dot-grid opacity-[0.18] pointer-events-none" />

        {/* Animated orbs */}
        <div
          className="absolute top-[18%] left-[18%] h-80 w-80 rounded-full blur-3xl animate-float pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.35), transparent)', opacity: 0.6 }}
        />
        <div
          className="absolute bottom-[15%] right-[12%] h-56 w-56 rounded-full blur-3xl pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(167,139,250,0.3), transparent)',
            opacity: 0.5,
            animation: 'float-reverse 6s ease-in-out infinite',
          }}
        />
        <div
          className="absolute top-[60%] left-[8%] h-36 w-36 rounded-full blur-2xl pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(236,72,153,0.25), transparent)',
            opacity: 0.4,
            animation: 'float 7s ease-in-out infinite 1.5s',
          }}
        />
        <div
          className="absolute top-[10%] right-[20%] h-24 w-24 rounded-full blur-xl pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(59,130,246,0.3), transparent)',
            opacity: 0.35,
            animation: 'float-reverse 8s ease-in-out infinite 0.5s',
          }}
        />

        {/* Content */}
        <div className="relative z-10 text-center max-w-sm w-full">
          {/* Logo */}
          <motion.div
            className="flex justify-center mb-6"
            initial={{ scale: 0.75, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.55, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <div className="relative">
              <div
                className="absolute inset-0 rounded-2xl blur-xl animate-glow-pulse pointer-events-none"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #9F5FE8)', opacity: 0.7 }}
              />
              <div
                className="relative flex h-20 w-20 items-center justify-center rounded-2xl overflow-hidden"
                style={{
                  background: 'linear-gradient(135deg, #7C3AED 0%, #9F5FE8 100%)',
                  boxShadow: '0 8px 40px rgba(124,58,237,0.55)',
                }}
              >
                <img src={logoImg} alt="Group Liberty" className="h-20 w-20 object-cover" />
              </div>
            </div>
          </motion.div>

          <motion.h1
            className="text-3xl font-bold mb-1.5 tracking-tight"
            style={{ color: '#F0EAFF' }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Group Liberty
          </motion.h1>
          <motion.p
            className="text-sm font-medium mb-10"
            style={{ color: '#A78BFA' }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            Plataforma de Atendimento Inteligente
          </motion.p>

          {/* Feature pills with stagger */}
          <div className="space-y-2.5">
            {features.map(({ icon: FeatureIcon, label, color, delay }) => (
              <motion.div
                key={label}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-left"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  backdropFilter: 'blur(8px)',
                }}
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                  style={{ background: `${color}18`, border: `1px solid ${color}28` }}
                >
                  <FeatureIcon className="h-4 w-4" style={{ color }} />
                </div>
                <span className="text-sm font-medium" style={{ color: '#C4B5FD' }}>{label}</span>
                <div
                  className="ml-auto h-1.5 w-1.5 rounded-full animate-pulse-dot shrink-0"
                  style={{ background: color }}
                />
              </motion.div>
            ))}
          </div>

          {/* Stats row */}
          <motion.div
            className="mt-8 grid grid-cols-3 gap-3"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.78 }}
          >
            {stats.map((stat, i) => (
              <div key={stat.label} className="text-center py-3 rounded-xl" style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.12)' }}>
                <p className="text-lg font-bold" style={{ color: '#E9E0FF' }}>{stat.value}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: 'rgba(167,139,250,0.55)' }}>{stat.label}</p>
              </div>
            ))}
          </motion.div>

          {/* Footer */}
          <motion.div
            className="mt-8 pt-6 stat-divider"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
          >
            <div className="flex items-center justify-center gap-1.5 mb-2">
              <ShieldCheck className="h-3 w-3" style={{ color: '#A78BFA' }} />
              <span className="text-[11px] font-medium" style={{ color: 'rgba(167,139,250,0.6)' }}>
                Conexão segura · SSL/TLS 256-bit
              </span>
            </div>
            <p className="text-[11px]" style={{ color: 'rgba(167,139,250,0.3)' }}>
              © 2025 Group Liberty · Todos os direitos reservados
            </p>
          </motion.div>
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <motion.div
          className="w-full max-w-md space-y-6"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          {/* Mobile logo */}
          <div className="flex flex-col items-center gap-3 lg:hidden">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #7C3AED, #9F5FE8)',
                boxShadow: '0 6px 24px rgba(124,58,237,0.4)',
              }}
            >
              <img src={logoImg} alt="Group Liberty" className="h-16 w-16 object-cover" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Group Liberty</h1>
          </div>

          {/* Heading */}
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">
              {isSignUp ? 'Criar sua conta' : 'Bem-vindo de volta 👋'}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {isSignUp
                ? 'Preencha os dados para criar sua conta'
                : 'Entre com suas credenciais para continuar'}
            </p>
          </div>

          {/* Form card */}
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-border bg-card p-6"
            style={{ boxShadow: 'var(--shadow-lg)' }}
          >
            {isSignUp && (
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-card-foreground">Nome completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome"
                    required
                    className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-card-foreground">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-card-foreground">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full rounded-xl border border-input bg-background py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {!isSignUp && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="remember"
                    className="h-3.5 w-3.5 rounded border-input accent-purple-600"
                  />
                  <label htmlFor="remember" className="text-xs text-muted-foreground cursor-pointer">
                    Lembrar-me
                  </label>
                </div>
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold hover:underline transition-colors"
                  style={{ color: '#7c3aed' }}
                >
                  Esqueceu a senha?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="login-btn w-full rounded-xl py-2.5 text-sm font-bold text-white transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: loading
                  ? 'hsl(var(--primary) / 0.7)'
                  : 'linear-gradient(135deg, #7c3aed 0%, #9333ea 100%)',
                boxShadow: loading ? 'none' : '0 4px 24px rgba(124,58,237,0.4)',
              }}
            >
              <span className="flex items-center justify-center gap-2">
                {loading
                  ? 'Autenticando...'
                  : isSignUp
                    ? 'Criar conta'
                    : <><span>Entrar na plataforma</span><ArrowRight className="h-4 w-4" /></>
                }
              </span>
            </button>

            <p className="text-center text-sm text-muted-foreground">
              {isSignUp ? 'Já tem uma conta?' : 'Não tem uma conta?'}{' '}
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="font-bold hover:underline transition-colors"
                style={{ color: '#7c3aed' }}
              >
                {isSignUp ? 'Fazer login' : 'Criar conta'}
              </button>
            </p>
          </form>

          {/* Trust badge */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" style={{ color: '#059669' }} />
            <span>Seus dados estão protegidos com criptografia SSL</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
