import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, RefreshCw, ShoppingBag, DollarSign, Users,
  Package, CalendarDays, TrendingUp, TrendingDown,
  Target, Facebook, Percent, Settings, X, Check,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSalesKPIs, pctChange } from '@/hooks/useSalesKPIs';

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

const RANK_STYLES = [
  { badge: '🥇', barColor: '#F59E0B', nameColor: '#FDE68A', border: 'rgba(245,158,11,0.3)', bg: 'rgba(245,158,11,0.07)', label: '1º' },
  { badge: '🥈', barColor: '#94A3B8', nameColor: '#E2E8F0', border: 'rgba(148,163,184,0.25)', bg: 'rgba(148,163,184,0.06)', label: '2º' },
  { badge: '🥉', barColor: '#CD7F32', nameColor: '#FED7AA', border: 'rgba(205,127,50,0.25)', bg: 'rgba(205,127,50,0.06)', label: '3º' },
];

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
}

function KpiCard({ title, value, pct, icon: Icon, accentColor, iconBg, delay = 0, loading = false }: KpiCardProps) {
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
    </motion.div>
  );
}

// ── Goals Config Modal ──────────────────────────────────────
interface GoalsModalProps {
  open: boolean;
  onClose: () => void;
  metaDia: number;
  metaMes: number;
  commissionRate: number;
  onSave: (metaDia: number, metaMes: number, commissionRate: number) => void;
}

function GoalsModal({ open, onClose, metaDia, metaMes, commissionRate, onSave }: GoalsModalProps) {
  const [dia, setDia] = useState(String(metaDia));
  const [mes, setMes] = useState(String(metaMes));
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
          <h3 className="text-base font-bold text-card-foreground">Configurar Metas</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-card-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Meta do Dia (R$)
            </label>
            <input
              type="number"
              value={dia}
              onChange={e => setDia(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Meta do Mês (R$)
            </label>
            <input
              type="number"
              value={mes}
              onChange={e => setMes(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-card-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
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
              onSave(Number(dia) || 0, Number(mes) || 0, (Number(rate) || 0) / 100);
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

// ── Main Component ──────────────────────────────────────────
export default function SalesRanking() {
  const [stats, setStats] = useState<VendorStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  // Goals & config (persisted in localStorage)
  const [metaDia, setMetaDia]           = useState(() => Number(localStorage.getItem('ranking_meta_dia')  ?? 30000));
  const [metaMes, setMetaMes]           = useState(() => Number(localStorage.getItem('ranking_meta_mes')  ?? 1000000));
  const [commissionRate, setCommissionRate] = useState(() => Number(localStorage.getItem('ranking_commission') ?? 0.1315));
  const [showGoals, setShowGoals] = useState(false);

  function handleSaveGoals(d: number, m: number, r: number) {
    setMetaDia(d); setMetaMes(m); setCommissionRate(r);
    localStorage.setItem('ranking_meta_dia',   String(d));
    localStorage.setItem('ranking_meta_mes',   String(m));
    localStorage.setItem('ranking_commission', String(r));
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = getDateRange(period, customFrom, customTo);
      let query = supabase.from('sales_orders' as any).select('vendedor, valor, quantidade');
      if (from) query = (query as any).gte('created_at', from);
      if (to)   query = (query as any).lte('created_at', to);

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
  }, [period, customFrom, customTo]);

  useEffect(() => {
    if (period === 'custom' && (!customFrom || !customTo)) return;
    fetchData();
  }, [fetchData, period, customFrom, customTo]);

  // KPIs hook
  const { from: kpiFrom, to: kpiTo } = getDateRange(period, customFrom, customTo);
  const { data: kpis, isLoading: kpiLoading } = useSalesKPIs(
    kpiFrom, kpiTo, metaDia, metaMes, commissionRate,
  );

  const totalValue  = stats.reduce((s, v) => s + v.totalValor, 0);
  const totalOrders = stats.reduce((s, v) => s + v.totalPedidos, 0);
  const totalQty    = stats.reduce((s, v) => s + v.totalQuantidade, 0);
  const maxValor    = stats[0]?.totalValor || 1;
  const top3        = stats.slice(0, 3);

  const activePeriodLabel = PERIODS.find(p => p.key === period)?.label ?? '';

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">

      {/* ── Goals Modal ── */}
      <AnimatePresence>
        {showGoals && (
          <GoalsModal
            open={showGoals}
            onClose={() => setShowGoals(false)}
            metaDia={metaDia}
            metaMes={metaMes}
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
            <button
              onClick={() => setShowGoals(true)}
              className="flex items-center justify-center h-8 w-8 rounded-lg border transition-colors"
              style={{ color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }}
              title="Configurar metas"
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
          title="Meta do Dia"
          value={formatCurrency(metaDia)}
          pct={kpis ? pctChange(kpis.receitaTotal, metaDia) : 0}
          icon={Target}
          accentColor="#F59E0B"
          iconBg="rgba(245,158,11,0.15)"
          delay={0.2}
          loading={kpiLoading}
        />
        <KpiCard
          title="Meta do Mês"
          value={formatCurrency(metaMes)}
          pct={kpis ? pctChange(kpis.receitaTotal, metaMes) : 0}
          icon={Target}
          accentColor="#F59E0B"
          iconBg="rgba(245,158,11,0.15)"
          delay={0.25}
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

      {/* ── Podium top 3 ── */}
      {!loading && top3.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 text-muted-foreground">
            Pódio — {activePeriodLabel}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {top3.map((vendor, i) => {
              const rs = RANK_STYLES[i];
              const barPct = Math.round((vendor.totalValor / maxValor) * 100);
              return (
                <motion.div
                  key={vendor.vendedor}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.42, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden"
                  style={{ background: rs.bg, border: `1px solid ${rs.border}` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{rs.badge}</span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={{ color: rs.nameColor, background: rs.border.replace('0.3)', '0.12)').replace('0.25)', '0.12)'), border: `1px solid ${rs.border}` }}
                    >
                      {rs.label}
                    </span>
                  </div>

                  <div>
                    <p className="text-base font-bold truncate" style={{ color: rs.nameColor }}>
                      {vendor.vendedor}
                    </p>
                    <p className="text-xl font-bold tabular-nums text-card-foreground mt-0.5">
                      {formatCurrency(vendor.totalValor)}
                    </p>
                  </div>

                  <div className="flex gap-3 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ShoppingBag className="h-3 w-3" style={{ color: rs.barColor }} />
                      {vendor.totalPedidos} pedidos
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Package className="h-3 w-3" style={{ color: rs.barColor }} />
                      {vendor.totalQuantidade} un.
                    </span>
                  </div>

                  <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${rs.barColor}, ${rs.barColor}88)` }}
                      initial={{ width: 0 }}
                      animate={{ width: `${barPct}%` }}
                      transition={{ duration: 0.8, delay: i * 0.12 + 0.3, ease: 'easeOut' }}
                    />
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Full ranking table ── */}
      {!loading && stats.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-3 text-muted-foreground">
            Classificação Geral
          </p>
          <div className="cfo-card accent-purple overflow-hidden">
            {/* Header */}
            <div
              className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
              style={{ borderColor: 'hsl(var(--border))' }}
            >
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-4">Vendedor</div>
              <div className="col-span-3 text-right">Valor Total</div>
              <div className="col-span-2 text-right">Pedidos</div>
              <div className="col-span-2 text-right">Unidades</div>
            </div>

            <AnimatePresence>
              {stats.map((vendor, i) => {
                const barPct = Math.round((vendor.totalValor / maxValor) * 100);
                const rs = i < 3 ? RANK_STYLES[i] : null;

                return (
                  <motion.div
                    key={vendor.vendedor}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.28, delay: i * 0.035 }}
                    className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b last:border-b-0 transition-colors duration-100 hover:bg-muted/40"
                    style={{ borderColor: 'hsl(var(--border) / 0.5)' }}
                  >
                    <div className="col-span-1 flex justify-center">
                      {rs ? (
                        <span className="text-base">{rs.badge}</span>
                      ) : (
                        <span className="text-xs font-bold tabular-nums text-muted-foreground">{i + 1}</span>
                      )}
                    </div>

                    <div className="col-span-4">
                      <p className="text-sm font-semibold truncate text-card-foreground"
                        style={rs ? { color: rs.nameColor } : {}}>
                        {vendor.vendedor}
                      </p>
                      <div className="mt-1.5 h-1 w-full rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: rs
                              ? `linear-gradient(90deg, ${rs.barColor}, ${rs.barColor}66)`
                              : 'linear-gradient(90deg, #7C3AED, #7C3AED55)',
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${barPct}%` }}
                          transition={{ duration: 0.65, delay: i * 0.035 + 0.15, ease: 'easeOut' }}
                        />
                      </div>
                    </div>

                    <div className="col-span-3 text-right">
                      <span className="text-sm font-bold tabular-nums text-card-foreground">
                        {formatCurrency(vendor.totalValor)}
                      </span>
                    </div>
                    <div className="col-span-2 text-right">
                      <span className="text-xs tabular-nums text-muted-foreground">{vendor.totalPedidos}</span>
                    </div>
                    <div className="col-span-2 text-right">
                      <span className="text-xs tabular-nums text-muted-foreground">{vendor.totalQuantidade}</span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Footer total */}
            <div
              className="grid grid-cols-12 gap-2 px-4 py-3 border-t"
              style={{ borderColor: 'hsl(var(--border))', background: 'hsl(var(--muted) / 0.4)' }}
            >
              <div className="col-span-1" />
              <div className="col-span-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total</span>
              </div>
              <div className="col-span-3 text-right">
                <span className="text-sm font-bold tabular-nums" style={{ color: '#A78BFA' }}>
                  {formatCurrency(totalValue)}
                </span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-xs font-bold tabular-nums" style={{ color: '#A78BFA' }}>{totalOrders}</span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-xs font-bold tabular-nums" style={{ color: '#A78BFA' }}>{totalQty}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
