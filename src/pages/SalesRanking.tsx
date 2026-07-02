import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, RefreshCw, ShoppingBag, DollarSign, Users,
  Package, CalendarDays, TrendingUp, TrendingDown,
  Facebook, Percent, Settings, X, Check, Globe, MapPin, ClipboardCheck, CheckCircle2, BadgeCheck,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSalesKPIs, pctChange } from '@/hooks/useSalesKPIs';
import { usePendingTagCounts } from '@/hooks/usePendingTagCounts';


interface VendorStats {
  vendedor: string;
  totalValor: number;
  totalQuantidade: number;
  totalPedidos: number;
}

type PeriodKey = 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | 'custom';

interface Period {
  key: PeriodKey;
  label: string;
}

const PERIODS: Period[] = [
  { key: 'hoje', label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: 'mes', label: 'Este mês' },
  { key: 'custom', label: 'Personalizado' },
];

function getDateRange(period: PeriodKey, customFrom: string, customTo: string): { from: string | null; to: string | null } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === 'hoje') {
    return { from: today.toISOString(), to: null };
  }
  if (period === 'ontem') {
    const start = new Date(today); start.setDate(start.getDate() - 1);
    const end = new Date(today);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  if (period === '7d') {
    const from = new Date(today); from.setDate(from.getDate() - 7);
    return { from: from.toISOString(), to: null };
  }
  if (period === '30d') {
    const from = new Date(today); from.setDate(from.getDate() - 30);
    return { from: from.toISOString(), to: null };
  }
  if (period === 'mes') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: null };
  }
  if (period === 'custom') {
    return {
      from: customFrom ? new Date(customFrom).toISOString() : null,
      to: customTo ? new Date(customTo + 'T23:59:59').toISOString() : null,
    };
  }
  return { from: null, to: null };
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCompact(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
  return formatCurrency(v);
}


// ── KPI Card Component ──────────────────────────────────────
interface KpiCardProps {
  title: string;
  value: string;
  pct: number;
  icon: React.ElementType;
  accentColor: string;
  iconBg: string;
  delay?: number;
  loading?: boolean;
  hideDelta?: boolean;
  subtitle?: string;
}

function KpiCard({ title, value, pct, icon: Icon, accentColor, iconBg, delay = 0, loading = false, hideDelta = false, subtitle }: KpiCardProps) {
  const isPositive = pct >= 0;
  const isZero = pct === 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className="flex items-center justify-center h-9 w-9 rounded-xl shrink-0"
          style={{ background: iconBg }}
        >
          <Icon className="h-4 w-4" style={{ color: accentColor }} />
        </div>
      </div>
      <div className="space-y-0.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: accentColor }}>
          {title}
        </p>
        <p className="text-2xl font-bold text-card-foreground leading-none tabular-nums">
          {loading ? '—' : value}
        </p>
      </div>
      {hideDelta ? (
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex h-1.5 w-1.5 rounded-full"
            style={{ background: accentColor }}
          />
          <span className="text-[10px] text-muted-foreground">{subtitle || 'Em tempo real'}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {isZero ? (
            <TrendingUp className="h-3 w-3 text-emerald-400" />
          ) : isPositive ? (
            <TrendingUp className="h-3 w-3 text-emerald-400" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-400" />
          )}
          <span
            className="text-[11px] font-semibold tabular-nums"
            style={{ color: isZero ? '#34d399' : isPositive ? '#34d399' : '#f87171' }}
          >
            {isPositive && !isZero ? '+' : ''}{loading ? '0' : pct}%
          </span>
          <span className="text-[10px] text-muted-foreground">Vs dia anterior</span>
        </div>
      )}
    </motion.div>
  );
}


// ── Commission Config Modal ──────────────────────────────────
interface GoalsModalProps {
  open: boolean;
  onClose: () => void;
  commissionRate: number;
  onSave: (commissionRate: number) => void;
}

function GoalsModal({ open, onClose, commissionRate, onSave }: GoalsModalProps) {
  const [rate, setRate] = useState(String(Math.round(commissionRate * 100)));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="rounded-2xl p-6 w-full max-w-sm space-y-4"
        style={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-card-foreground">Configurar Comissão</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-card-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
            Taxa de Comissão (%)
          </label>
          <input
            type="number"
            value={rate}
            onChange={e => setRate(e.target.value)}
            min="0"
            max="100"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors"
            style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onSave((Number(rate) || 0) / 100);
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.9), rgba(124,58,237,0.7))', color: '#C4B5FD' }}
          >
            <Check className="h-3.5 w-3.5" />
            Salvar
          </button>
        </div>
      </motion.div>
    </div>
  );
}

type CountryKey = 'all' | 'brasil' | 'uruguay';
const COUNTRIES: { key: CountryKey; label: string; flag: string }[] = [
  { key: 'all',     label: 'Todos',   flag: '🌎' },
  { key: 'brasil',  label: 'Brasil',  flag: '🇧🇷' },
  { key: 'uruguay', label: 'Uruguai', flag: '🇺🇾' },
];

// ── Main Component ──────────────────────────────────────────
export default function SalesRanking() {
  const [stats, setStats] = useState<VendorStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  // Commission config (persisted in localStorage)
  const [commissionRate, setCommissionRate] = useState(() => Number(localStorage.getItem('ranking_commission') ?? 0.1315));
  const [showGoals, setShowGoals] = useState(false);
  const [country, setCountry] = useState<CountryKey>(() => (localStorage.getItem('dashvendas_country') as CountryKey) || 'all');

  function handleSaveGoals(r: number) {
    setCommissionRate(r);
    localStorage.setItem('ranking_commission', String(r));
  }

  function handleCountryChange(c: CountryKey) {
    setCountry(c);
    localStorage.setItem('dashvendas_country', c);
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getDateRange(period, customFrom, customTo);
      let query = supabase.from('sales_orders' as any).select('vendedor, valor, quantidade, pais');
      if (from) query = (query as any).gte('created_at', from);
      if (to)   query = (query as any).lte('created_at', to);
      if (country !== 'all') query = (query as any).eq('pais', country);

      const { data, error } = await query;
      if (error) throw error;

      const map: Record<string, VendorStats> = {};
      for (const row of (data as any[]) || []) {
        const v: string = row.vendedor || 'Desconhecido';
        if (!map[v]) map[v] = { vendedor: v, totalValor: 0, totalQuantidade: 0, totalPedidos: 0 };
        map[v].totalValor     += Number(row.valor) || 0;
        map[v].totalQuantidade += Number(row.quantidade) || 0;
        map[v].totalPedidos   += 1;
      }

      setStats(Object.values(map).sort((a, b) => b.totalValor - a.totalValor));
    } catch (err) {
      console.error('Error fetching ranking:', err);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo, country]);

  useEffect(() => {
    if (period === 'custom' && (!customFrom || !customTo)) return;
    fetchData();
  }, [fetchData, period, customFrom, customTo]);

  // KPIs hook
  const { from: kpiFrom, to: kpiTo } = getDateRange(period, customFrom, customTo);
  const { data: kpis, isLoading: kpiLoading } = useSalesKPIs(
    kpiFrom, kpiTo, 0, 0, country === 'all' ? null : country,
  );

  // Real-time pending tag counts (endereço / confirmação, por país)
  const pending = usePendingTagCounts();
  const enderecoPendente =
    country === 'brasil'  ? pending.enderecoBrasil :
    country === 'uruguay' ? pending.enderecoUruguay :
    pending.enderecoBrasil + pending.enderecoUruguay;
  const confirmacaoPendente =
    country === 'brasil'  ? pending.confirmacaoBrasil :
    country === 'uruguay' ? pending.confirmacaoUruguay :
    pending.confirmacaoBrasil + pending.confirmacaoUruguay;

  // "Endereço confirmado" = contatos que já avançaram (fazer agendamento, pedido agendado, confirmação pendente)
  const fazerAgendamento =
    country === 'brasil'  ? pending.fazerAgendamentoBrasil :
    country === 'uruguay' ? pending.fazerAgendamentoUruguay :
    pending.fazerAgendamentoBrasil + pending.fazerAgendamentoUruguay;
  const pedidoAgendado =
    country === 'brasil'  ? pending.pedidoAgendadoBrasil :
    country === 'uruguay' ? pending.pedidoAgendadoUruguay :
    pending.pedidoAgendadoBrasil + pending.pedidoAgendadoUruguay;

  const enderecoConfirmado = fazerAgendamento + pedidoAgendado + confirmacaoPendente;
  const totalEnderecos = enderecoConfirmado + enderecoPendente;
  const pctEnderecoConfirmado = totalEnderecos > 0
    ? Math.round((enderecoConfirmado / totalEnderecos) * 100)
    : 0;

  // "Confirmação feita" = pedidos agendados + fazer agendamento (já confirmados)
  const confirmacaoFeita = pedidoAgendado + fazerAgendamento;
  const totalConfirmacoes = confirmacaoFeita + confirmacaoPendente;
  const pctConfirmacaoConfirmada = totalConfirmacoes > 0
    ? Math.round((confirmacaoFeita / totalConfirmacoes) * 100)
    : 0;


  const totalValue  = stats.reduce((s, v) => s + v.totalValor, 0);
  const totalOrders = stats.reduce((s, v) => s + v.totalPedidos, 0);
  const totalQty    = stats.reduce((s, v) => s + v.totalQuantidade, 0);
  

  const activePeriodLabel = PERIODS.find(p => p.key === period)?.label ?? '';
  const currencySymbol = country === 'uruguay' ? '$U ' : 'R$ ';

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* ── Commission Modal ── */}
      <AnimatePresence>
        {showGoals && (
          <GoalsModal
            open={showGoals}
            onClose={() => setShowGoals(false)}
            commissionRate={commissionRate}
            onSave={handleSaveGoals}
          />
        )}
      </AnimatePresence>

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="icon-box icon-box-purple">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-card-foreground">
              DashVendas
            </h1>
            <p className="text-xs mt-0.5 text-muted-foreground">
              Vendas, receita, ticket médio e conversão em tempo real
            </p>
          </div>
        </div>

        {/* Period filters */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setPeriod(p.key);
                  setShowCustom(p.key === 'custom');
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 border"
                style={
                  period === p.key
                    ? { background: 'linear-gradient(135deg, rgba(124,58,237,0.28), rgba(124,58,237,0.12))', color: '#C4B5FD', borderColor: 'rgba(124,58,237,0.45)' }
                    : { color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }
                }
              >
                {p.key === 'custom' ? (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {p.label}
                  </span>
                ) : p.label}
              </button>
            ))}
            <div className="flex items-center gap-1 ml-1 pl-2 border-l" style={{ borderColor: 'hsl(var(--border))' }}>
              {COUNTRIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => handleCountryChange(c.key)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 border flex items-center gap-1"
                  style={
                    country === c.key
                      ? { background: 'linear-gradient(135deg, rgba(124,58,237,0.28), rgba(124,58,237,0.12))', color: '#C4B5FD', borderColor: 'rgba(124,58,237,0.45)' }
                      : { color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }
                  }
                  title={`Filtrar por ${c.label}`}
                >
                  <span>{c.flag}</span>
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowGoals(true)}
              className="flex items-center justify-center h-8 w-8 rounded-lg border transition-colors"
              style={{ color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }}
              title="Configurar comissão"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={fetchData}
              className="flex items-center justify-center h-8 w-8 rounded-lg border transition-colors"
              style={{ color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }}
              title="Atualizar"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Custom date inputs */}
          <AnimatePresence>
            {showCustom && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2"
              >
                <span className="text-xs text-muted-foreground">De</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-card-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  className="rounded-lg border border-input bg-background px-2 py-1 text-xs text-card-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Dashboard KPI Cards (8) ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          title="Receita Total"
          value={kpis ? formatCurrency(kpis.receitaTotal) : '—'}
          pct={kpis ? pctChange(kpis.receitaTotal, kpis.receitaTotalPrev) : 0}
          icon={DollarSign}
          accentColor="#F59E0B"
          iconBg="rgba(245,158,11,0.15)"
          delay={0}
          loading={kpiLoading}
        />
        <KpiCard
          title="Vendas Agendadas"
          value={kpis ? String(kpis.vendasAgendadas) : '—'}
          pct={kpis ? pctChange(kpis.vendasAgendadas, kpis.vendasAgendadasPrev) : 0}
          icon={Users}
          accentColor="#F59E0B"
          iconBg="rgba(245,158,11,0.15)"
          delay={0.05}
          loading={kpiLoading}
        />
        <KpiCard
          title="Comissão"
          value={kpis ? formatCurrency(kpis.comissao) : '—'}
          pct={kpis ? pctChange(kpis.comissao, kpis.comissaoPrev) : 0}
          icon={TrendingUp}
          accentColor="#F59E0B"
          iconBg="rgba(245,158,11,0.15)"
          delay={0.1}
          loading={kpiLoading}
        />
        <KpiCard
          title="Ticket Médio"
          value={kpis ? formatCurrency(kpis.ticketMedio) : '—'}
          pct={kpis ? pctChange(kpis.ticketMedio, kpis.ticketMedioPrev) : 0}
          icon={DollarSign}
          accentColor="#F59E0B"
          iconBg="rgba(245,158,11,0.15)"
          delay={0.15}
          loading={kpiLoading}
        />
        <KpiCard
          title="Taxa de Conversão"
          value={kpis ? `${kpis.taxaConversao}%` : '—'}
          pct={kpis ? pctChange(kpis.taxaConversao, kpis.taxaConversaoPrev) : 0}
          icon={Percent}
          accentColor="#F59E0B"
          iconBg="rgba(245,158,11,0.15)"
          delay={0.3}
          loading={kpiLoading}
        />
        <KpiCard
          title="Leads Facebook"
          value={kpis ? String(kpis.leadsFacebook) : '—'}
          pct={kpis ? pctChange(kpis.leadsFacebook, kpis.leadsFacebookPrev) : 0}
          icon={Facebook}
          accentColor="#F59E0B"
          iconBg="rgba(245,158,11,0.15)"
          delay={0.35}
          loading={kpiLoading}
        />
        <KpiCard
          title={`Endereço Pendente${country === 'all' ? '' : country === 'brasil' ? ' • BR' : ' • UY'}`}
          value={pending.loading ? '—' : String(enderecoPendente)}
          pct={0}
          icon={MapPin}
          accentColor="#EF4444"
          iconBg="rgba(239,68,68,0.15)"
          delay={0.4}
          loading={pending.loading}
          hideDelta
          subtitle={
            country === 'all'
              ? `BR ${pending.enderecoBrasil} • UY ${pending.enderecoUruguay}`
              : 'Contatos aguardando endereço'
          }
        />
        <KpiCard
          title={`Confirmação Pendente${country === 'all' ? '' : country === 'brasil' ? ' • BR' : ' • UY'}`}
          value={pending.loading ? '—' : String(confirmacaoPendente)}
          pct={0}
          icon={ClipboardCheck}
          accentColor="#3B82F6"
          iconBg="rgba(59,130,246,0.15)"
          delay={0.45}
          loading={pending.loading}
          hideDelta
          subtitle={
            country === 'all'
              ? `BR ${pending.confirmacaoBrasil} • UY ${pending.confirmacaoUruguay}`
              : 'Contatos aguardando confirmação'
          }
        />
        <KpiCard
          title="% Endereços Confirmados"
          value={pending.loading ? '—' : `${pctEnderecoConfirmado}%`}
          pct={0}
          icon={CheckCircle2}
          accentColor="#10B981"
          iconBg="rgba(16,185,129,0.15)"
          delay={0.5}
          loading={pending.loading}
          hideDelta
          subtitle={`${enderecoConfirmado} de ${totalEnderecos} enviaram endereço`}
        />
        <KpiCard
          title="% Confirmações Confirmadas"
          value={pending.loading ? '—' : `${pctConfirmacaoConfirmada}%`}
          pct={0}
          icon={BadgeCheck}
          accentColor="#8B5CF6"
          iconBg="rgba(139,92,246,0.15)"
          delay={0.55}
          loading={pending.loading}
          hideDelta
          subtitle={`${confirmacaoFeita} confirmados de ${totalConfirmacoes}`}
        />

      </div>



      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { title: 'Total em Vendas', value: loading ? '—' : formatCompact(totalValue), icon: DollarSign, accent: 'accent-purple' as const, iconBox: 'icon-box-purple' as const },
          { title: 'Total de Pedidos', value: loading ? '—' : String(totalOrders), icon: ShoppingBag, accent: 'accent-green' as const, iconBox: 'icon-box-green' as const },
          { title: 'Vendedores Ativos', value: loading ? '—' : String(stats.length), icon: Users, accent: 'accent-blue' as const, iconBox: 'icon-box-blue' as const },
        ].map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: i * 0.07, ease: [0.25, 0.46, 0.45, 0.94] }}
            className={`cfo-card ${card.accent} p-5`}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0 space-y-1.5 pt-0.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate">
                  {card.title}
                </p>
                <motion.p
                  className="text-2xl font-bold text-card-foreground leading-none tabular-nums"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.42, delay: i * 0.07 + 0.12 }}
                >
                  {card.value}
                </motion.p>
              </div>
              <div className={`icon-box ${card.iconBox}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
            <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: card.accent === 'accent-purple' ? 'linear-gradient(90deg,#7c3aed,#a78bfa88)'
                    : card.accent === 'accent-green' ? 'linear-gradient(90deg,#059669,#34d39988)'
                    : 'linear-gradient(90deg,#2563eb,#60a5fa88)',
                }}
                initial={{ width: 0 }}
                animate={{ width: loading ? '0%' : '70%' }}
                transition={{ duration: 0.7, delay: i * 0.07 + 0.2, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-2 border-border border-t-primary animate-spin" />
            <p className="text-xs text-muted-foreground">Carregando ranking...</p>
          </div>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && stats.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="cfo-card accent-purple p-12 flex flex-col items-center gap-4 text-center"
        >
          <div className="icon-box icon-box-purple h-14 w-14 rounded-2xl">
            <Trophy className="h-7 w-7" />
          </div>
          <div>
            <p className="font-semibold text-card-foreground">Nenhuma venda em "{activePeriodLabel}"</p>
            <p className="text-sm mt-1 text-muted-foreground">
              As vendas adicionadas aparecerão aqui no ranking
            </p>
          </div>
        </motion.div>
      )}


    </div>
  );
}
