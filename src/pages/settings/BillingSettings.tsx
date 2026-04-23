import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { CreditCard, Check, Zap, Loader2, ArrowUpRight, AlertTriangle } from 'lucide-react';

type Plan = {
  id: string;
  name: string;
  slug: string;
  price_monthly: number;
  max_connections: number;
  max_flows: number;
  max_members: number;
  allow_ai_auto_reply: boolean;
  allow_ai_manager: boolean;
  allow_advanced_reports: boolean;
};

type Subscription = {
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  plan_id: string;
};

const PLAN_HIGHLIGHTS: Record<string, string[]> = {
  starter: [
    '1 conexão WhatsApp',
    '5 fluxos de automação',
    '3 membros da equipe',
    'Dashboard básico',
    'Suporte por email',
  ],
  pro: [
    '5 conexões WhatsApp',
    '30 fluxos de automação',
    '15 membros da equipe',
    'AI Auto-reply',
    'AI Manager',
    'Relatórios avançados',
    'Suporte prioritário',
  ],
  enterprise: [
    'Conexões ilimitadas',
    'Fluxos ilimitados',
    'Membros ilimitados',
    'Todas as funcionalidades',
    'SLA garantido',
    'Suporte dedicado',
    'Onboarding personalizado',
  ],
};

export default function BillingSettings() {
  const { currentWorkspace } = useWorkspace();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentWorkspace) return;
    loadData();
  }, [currentWorkspace?.id]);

  const loadData = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [plansRes, subRes] = await Promise.all([
        supabase.from('plans' as any).select('*').eq('is_active', true).order('price_monthly'),
        supabase
          .from('workspace_subscriptions' as any)
          .select('*')
          .eq('workspace_id', currentWorkspace.id)
          .maybeSingle(),
      ]);
      if (plansRes.data) setPlans(plansRes.data as unknown as Plan[]);
      if (subRes.data) setSubscription(subRes.data as unknown as Subscription);
    } finally {
      setLoading(false);
    }
  };

  const currentPlanSlug = (currentWorkspace as any)?.plan_slug || 'starter';
  const isTrialing = subscription?.status === 'trialing';
  const trialEnds = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  const trialDaysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86400000)) : 0;

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Plano e Cobrança</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie sua assinatura e limites</p>
      </div>

      {/* Trial banner */}
      {isTrialing && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              Trial gratuito — {trialDaysLeft} dias restantes
            </p>
            <p className="text-xs text-amber-600/70 dark:text-amber-400/70">
              Escolha um plano antes do trial expirar para não perder acesso
            </p>
          </div>
        </div>
      )}

      {/* Plano atual */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Plano atual</p>
              <p className="text-lg font-bold text-foreground capitalize">
                {(currentWorkspace as any)?.plan_name || 'Starter'}
              </p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            subscription?.status === 'active' ? 'bg-green-500/10 text-green-600' :
            isTrialing ? 'bg-amber-500/10 text-amber-600' :
            'bg-red-500/10 text-red-600'
          }`}>
            {isTrialing ? 'Trial' : subscription?.status === 'active' ? 'Ativo' : 'Inativo'}
          </span>
        </div>
      </div>

      {/* Planos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const isCurrent = plan.slug === currentPlanSlug;
          const highlights = PLAN_HIGHLIGHTS[plan.slug] || [];
          return (
            <div
              key={plan.id}
              className="rounded-xl border p-5 flex flex-col transition-all"
              style={{
                borderColor: isCurrent ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                background: isCurrent ? 'hsl(var(--primary) / 0.03)' : 'hsl(var(--card))',
              }}
            >
              {isCurrent && (
                <div className="text-[10px] font-bold uppercase tracking-wide text-primary mb-3">
                  Plano atual
                </div>
              )}
              <h3 className="text-base font-bold text-foreground">{plan.name}</h3>
              <div className="mt-1 mb-4">
                {plan.price_monthly === 0
                  ? <span className="text-2xl font-bold text-foreground">Grátis</span>
                  : <>
                    <span className="text-2xl font-bold text-foreground">
                      R$ {plan.price_monthly.toFixed(0)}
                    </span>
                    <span className="text-xs text-muted-foreground">/mês</span>
                  </>
                }
              </div>

              <ul className="space-y-2 flex-1 mb-5">
                {highlights.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span className="text-xs text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="text-center text-xs text-muted-foreground py-2 border border-border rounded-lg">
                  Plano ativo
                </div>
              ) : (
                <button
                  onClick={() => {
                    // Integração com gateway de pagamento
                    window.open('mailto:contato@chatys.app?subject=Upgrade para ' + plan.name, '_blank');
                  }}
                  className="w-full rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-1.5 transition-all"
                  style={{
                    background: plan.price_monthly > 0 ? 'linear-gradient(135deg, #7c3aed, #9333ea)' : 'hsl(var(--muted))',
                    color: plan.price_monthly > 0 ? 'white' : 'hsl(var(--muted-foreground))',
                  }}
                >
                  {plan.slug === 'enterprise' ? 'Falar com vendas' : 'Fazer upgrade'}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Uso atual */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Uso atual</h2>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Conexões',  resource: 'connections' },
            { label: 'Fluxos',    resource: 'flows' },
            { label: 'Membros',   resource: 'members' },
          ].map(({ label, resource }) => (
            <UsageCard
              key={resource}
              label={label}
              workspaceId={currentWorkspace?.id || ''}
              resource={resource}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function UsageCard({ label, workspaceId, resource }: { label: string; workspaceId: string; resource: string }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!workspaceId) return;
    (supabase.rpc as any)('check_workspace_limit', {
      p_workspace_id: workspaceId,
      p_resource: resource,
    }).then(({ data }: any) => setData(data));
  }, [workspaceId, resource]);

  if (!data) return <div className="rounded-lg bg-muted/30 p-3 animate-pulse h-16" />;

  const pct = data.max === -1 ? 0 : Math.round((data.current / data.max) * 100);
  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
      <p className="text-lg font-bold text-foreground">
        {data.current}
        <span className="text-xs font-normal text-muted-foreground ml-1">
          / {data.max === -1 ? '∞' : data.max}
        </span>
      </p>
      {data.max !== -1 && (
        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : 'hsl(var(--primary))',
            }}
          />
        </div>
      )}
    </div>
  );
}
