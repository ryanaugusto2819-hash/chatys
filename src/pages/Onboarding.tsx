import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Globe, ArrowRight, ArrowLeft, Check,
  Zap, Bot, Wifi, Users, Loader2, Sparkles,
} from 'lucide-react';

const STEPS = [
  { id: 1, title: 'Seu Workspace',   icon: Building2 },
  { id: 2, title: 'Sobre o Negócio', icon: Globe },
  { id: 3, title: 'Pronto!',          icon: Sparkles },
];

const COUNTRIES = [
  { value: 'BR', label: '🇧🇷 Brasil' },
  { value: 'AR', label: '🇦🇷 Argentina' },
  { value: 'UY', label: '🇺🇾 Uruguai' },
  { value: 'CL', label: '🇨🇱 Chile' },
  { value: 'CO', label: '🇨🇴 Colômbia' },
  { value: 'MX', label: '🇲🇽 México' },
  { value: 'US', label: '🇺🇸 Estados Unidos' },
  { value: 'OTHER', label: '🌐 Outro' },
];

const NICHES = [
  'Vendas', 'Atendimento', 'Saúde', 'Educação',
  'Imóveis', 'Finanças', 'E-commerce', 'Tecnologia', 'Outro',
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refetchWorkspaces } = useWorkspace();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [country, setCountry] = useState('BR');
  const [niche, setNiche] = useState('');
  const [teamSize, setTeamSize] = useState('1-5');

  const handleCreate = async () => {
    if (!workspaceName.trim()) { toast.error('Informe o nome do workspace'); return; }
    if (!user) return;
    setLoading(true);
    try {
      const { error } = await (supabase.rpc as any)('create_workspace_for_user', {
        p_user_id: user.id,
        p_name: workspaceName.trim(),
        p_country: country,
      });
      if (error) throw error;
      await refetchWorkspaces();
      setStep(3);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #0F0A14 0%, #1A0D2E 50%, #0D0A12 100%)' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 h-96 w-96 rounded-full blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.6), transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full blur-3xl opacity-15"
          style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.5), transparent)' }} />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        {/* Progress steps */}
        <div className="mb-8 flex items-center justify-center gap-3">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300"
                style={{
                  borderColor: step >= s.id ? '#7C3AED' : 'rgba(255,255,255,0.15)',
                  background: step > s.id ? '#7C3AED' : step === s.id ? 'rgba(124,58,237,0.2)' : 'transparent',
                }}
              >
                {step > s.id
                  ? <Check className="h-4 w-4 text-white" />
                  : <s.icon className="h-4 w-4" style={{ color: step >= s.id ? '#A78BFA' : 'rgba(255,255,255,0.3)' }} />
                }
              </div>
              {i < STEPS.length - 1 && (
                <div className="h-px w-12 transition-all duration-500"
                  style={{ background: step > s.id ? '#7C3AED' : 'rgba(255,255,255,0.1)' }} />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="rounded-2xl p-8"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Step 1 */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Crie seu workspace</h2>
                  <p className="text-sm" style={{ color: 'rgba(167,139,250,0.7)' }}>
                    Seu ambiente isolado de trabalho na plataforma
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: '#C4B5FD' }}>
                      Nome do workspace
                    </label>
                    <input
                      type="text"
                      value={workspaceName}
                      onChange={(e) => setWorkspaceName(e.target.value)}
                      placeholder="Ex: Minha Empresa"
                      className="w-full rounded-xl border px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                      style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)' }}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1.5" style={{ color: '#C4B5FD' }}>
                      País
                    </label>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full rounded-xl border px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                      style={{ background: 'rgba(30,15,50,0.95)', borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="rounded-xl p-4 space-y-2"
                  style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#A78BFA' }}>
                    Trial gratuito de 14 dias
                  </p>
                  {[
                    { icon: Wifi,  text: '1 conexão WhatsApp' },
                    { icon: Zap,   text: '5 fluxos de automação' },
                    { icon: Bot,   text: 'IA auto-reply incluída' },
                    { icon: Users, text: 'Até 3 membros da equipe' },
                  ].map(({ icon: Icon, text }) => (
                    <div key={text} className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: '#A78BFA' }} />
                      <span className="text-xs" style={{ color: 'rgba(196,181,253,0.7)' }}>{text}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    if (!workspaceName.trim()) { toast.error('Informe o nome do workspace'); return; }
                    setStep(2);
                  }}
                  className="w-full rounded-xl py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)', boxShadow: '0 4px 24px rgba(124,58,237,0.4)' }}
                >
                  Continuar <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Sobre sua empresa</h2>
                  <p className="text-sm" style={{ color: 'rgba(167,139,250,0.7)' }}>
                    Isso nos ajuda a personalizar sua experiência
                  </p>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: '#C4B5FD' }}>
                      Segmento de atuação
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {NICHES.map((n) => (
                        <button key={n} onClick={() => setNiche(n)}
                          className="rounded-lg px-2 py-2 text-xs font-medium transition-all"
                          style={{
                            background: niche === n ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.04)',
                            border: niche === n ? '1px solid #7C3AED' : '1px solid rgba(255,255,255,0.08)',
                            color: niche === n ? '#E9D5FF' : 'rgba(196,181,253,0.6)',
                          }}
                        >{n}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2" style={{ color: '#C4B5FD' }}>
                      Tamanho da equipe
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {['1-5', '6-20', '21-100', '100+'].map((size) => (
                        <button key={size} onClick={() => setTeamSize(size)}
                          className="rounded-lg px-2 py-2 text-xs font-medium transition-all"
                          style={{
                            background: teamSize === size ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.04)',
                            border: teamSize === size ? '1px solid #7C3AED' : '1px solid rgba(255,255,255,0.08)',
                            color: teamSize === size ? '#E9D5FF' : 'rgba(196,181,253,0.6)',
                          }}
                        >{size}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setStep(1)}
                    className="flex-1 rounded-xl border py-2.5 text-sm font-semibold flex items-center justify-center gap-2"
                    style={{ borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(196,181,253,0.7)' }}
                  >
                    <ArrowLeft className="h-4 w-4" /> Voltar
                  </button>
                  <button onClick={handleCreate} disabled={loading}
                    className="flex-[2] rounded-xl py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)', boxShadow: '0 4px 24px rgba(124,58,237,0.4)' }}
                  >
                    {loading
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <><Sparkles className="h-4 w-4" /> Criar workspace</>
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <div className="text-center space-y-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                  className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl"
                  style={{ background: 'linear-gradient(135deg, #7C3AED, #9333EA)', boxShadow: '0 8px 40px rgba(124,58,237,0.5)' }}
                >
                  <Check className="h-10 w-10 text-white" />
                </motion.div>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Workspace criado!</h2>
                  <p className="text-sm" style={{ color: 'rgba(167,139,250,0.7)' }}>
                    <strong className="text-purple-300">{workspaceName}</strong> está pronto.<br />
                    Comece conectando seu WhatsApp ou configurando a IA.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-left">
                  {[
                    { icon: Wifi,  title: 'Conectar WhatsApp',  sub: 'Configure sua conexão',   path: '/connections' },
                    { icon: Bot,   title: 'Configurar IA',       sub: 'Defina prompts e modelo', path: '/settings/ai' },
                    { icon: Zap,   title: 'Criar Fluxo',         sub: 'Automatize atendimentos', path: '/automation' },
                    { icon: Users, title: 'Convidar Equipe',     sub: 'Adicione membros',        path: '/settings/team' },
                  ].map(({ icon: Icon, title, sub, path }) => (
                    <button key={title} onClick={() => navigate(path)}
                      className="rounded-xl p-3 text-left transition-all hover:scale-105"
                      style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}
                    >
                      <Icon className="h-5 w-5 mb-1.5" style={{ color: '#A78BFA' }} />
                      <p className="text-xs font-semibold text-white">{title}</p>
                      <p className="text-[10px]" style={{ color: 'rgba(167,139,250,0.6)' }}>{sub}</p>
                    </button>
                  ))}
                </div>
                <button onClick={() => navigate('/')}
                  className="w-full rounded-xl py-2.5 text-sm font-bold text-white flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)', boxShadow: '0 4px 24px rgba(124,58,237,0.4)' }}
                >
                  Ir para o Dashboard <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
