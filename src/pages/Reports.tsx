import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Zap, CheckCircle2, Activity,
  Wifi, UserCircle2, RefreshCw, TrendingUp, TrendingDown,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import TopBar from '@/components/layout/TopBar';
import { useLeadMonitor, LeadPeriod } from '@/hooks/useLeadMonitor';
import { useMessagesByConnection } from '@/hooks/useMessagesByConnection';
import { MessageSquare, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import FunnelReport from '@/components/reports/FunnelReport';

const PERIODS: { key: LeadPeriod; label: string }[] = [
  { key: 'hoje',  label: 'Hoje' },
  { key: 'ontem', label: 'Ontem' },
  { key: '7d',    label: '7 dias' },
  { key: '30d',   label: '30 dias' },
  { key: 'mes',   label: 'Este mês' },
];

const BAR_COLORS = [
  '#7C3AED', '#8B5CF6', '#A78BFA',
  '#6D28D9', '#5B21B6', '#4C1D95',
];

const CONN_COLORS = [
  '#059669', '#10B981', '#34D399',
  '#047857', '#065F46', '#064E3B',
];

function ProgressBar({
  value, max, color, delay = 0,
}: { value: number; max: number; color: string; delay?: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, delay, ease: 'easeOut' }}
      />
    </div>
  );
}

function RankList({
  items, colors, emptyMsg,
}: {
  items: { name: string; count: number }[];
  colors: string[];
  emptyMsg: string;
}) {
  const max = items[0]?.count ?? 1;
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
        <p className="text-sm text-muted-foreground">{emptyMsg}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const color = colors[i % colors.length];
        const pct = max > 0 ? Math.round((item.count / max) * 100) : 0;
        return (
          <motion.div
            key={item.name}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.28, delay: i * 0.04 }}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{ background: color }}
                >
                  {i + 1}
                </span>
                <span className="text-sm font-medium text-card-foreground truncate">{item.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <span className="text-xs text-muted-foreground">{pct}%</span>
                <span
                  className="text-sm font-bold tabular-nums px-2 py-0.5 rounded-lg"
                  style={{ background: `${color}18`, color }}
                >
                  {item.count}
                </span>
              </div>
            </div>
            <ProgressBar value={item.count} max={max} color={color} delay={i * 0.04 + 0.1} />
          </motion.div>
        );
      })}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-[11px] font-semibold text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-bold" style={{ color: '#A78BFA' }}>
        {payload[0].value} lead{payload[0].value !== 1 ? 's' : ''}
      </p>
    </div>
  );
};

function MessagesByConnectionCard({ period }: { period: LeadPeriod }) {
  const { data, isLoading } = useMessagesByConnection(period);
  const items = data ?? [];
  const maxIncoming = Math.max(1, ...items.map(i => i.incoming));
  const totalIn = items.reduce((s, i) => s + i.incoming, 0);
  const totalOut = items.reduce((s, i) => s + i.outgoing, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
      className="cfo-card accent-blue p-5"
    >
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="icon-box icon-box-blue h-9 w-9 rounded-xl">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">Mensagens por Conexão</h3>
            <p className="text-xs text-muted-foreground">Volume de mensagens recebidas e enviadas por canal</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(59,130,246,0.15)', color: '#93C5FD' }}>
            <ArrowDownLeft className="h-3 w-3" /> {totalIn} recebidas
          </span>
          <span className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(124,58,237,0.15)', color: '#C4B5FD' }}>
            <ArrowUpRight className="h-3 w-3" /> {totalOut} enviadas
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 rounded-full border-2 border-border border-t-primary animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          Nenhuma mensagem no período
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it, i) => {
            const pct = Math.round((it.incoming / maxIncoming) * 100);
            return (
              <motion.div
                key={it.connectionId}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.28, delay: i * 0.04 }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                      style={{ background: '#3B82F6' }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-card-foreground truncate">{it.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-blue-300 tabular-nums">
                      <ArrowDownLeft className="h-3 w-3" /> {it.incoming}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-purple-300 tabular-nums">
                      <ArrowUpRight className="h-3 w-3" /> {it.outgoing}
                    </span>
                    <span
                      className="text-sm font-bold tabular-nums px-2 py-0.5 rounded-lg"
                      style={{ background: 'rgba(59,130,246,0.18)', color: '#93C5FD' }}
                    >
                      {it.total}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg, #3B82F6, #3B82F688)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.05 }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

export default function Reports() {
  const [period, setPeriod] = useState<LeadPeriod>('hoje');
  const [tab, setTab] = useState<'leads' | 'funil'>('leads');

  const { data, isLoading, refetch, isFetching } = useLeadMonitor(period);

  const activePeriodLabel = PERIODS.find(p => p.key === period)?.label ?? '';
  const peakHour = data?.chart.reduce((best, p) => p.leads > best.leads ? p : best, { label: '—', leads: 0 });
  const chartHasData = data?.chart.some(p => p.leads > 0);

  return (
    <div>
      <TopBar title="Relatórios" subtitle="Monitoramento de Leads" />

      <div className="p-6 space-y-6 max-w-6xl mx-auto">

        {/* ── Tabs ── */}
        <div className="flex items-center gap-1.5 border-b border-border">
          {([
            { key: 'leads', label: 'Leads' },
            { key: 'funil', label: 'Funil de Etapas' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="px-4 py-2 text-sm font-semibold border-b-2 transition-colors -mb-px"
              style={
                tab === t.key
                  ? { color: '#C4B5FD', borderColor: '#7C3AED' }
                  : { color: 'hsl(var(--muted-foreground))', borderColor: 'transparent' }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'funil' ? <FunnelReport /> : <>


        {/* ── Filter bar ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 border"
                style={
                  period === p.key
                    ? { background: 'linear-gradient(135deg,rgba(124,58,237,0.28),rgba(124,58,237,0.12))', color: '#C4B5FD', borderColor: 'rgba(124,58,237,0.45)' }
                    : { color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }
                }
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors"
            style={{ color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {/* ── Metric cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              title: 'Total no Período', value: isLoading ? '—' : String(data?.total ?? 0),
              icon: Users, accent: 'accent-purple', iconBox: 'icon-box-purple',
              sub: activePeriodLabel,
            },
            {
              title: 'Leads Hoje', value: isLoading ? '—' : String(data?.hoje ?? 0),
              icon: Activity, accent: 'accent-blue', iconBox: 'icon-box-blue',
              sub: 'Recebidos hoje',
            },
            {
              title: 'Em Atendimento', value: isLoading ? '—' : String(data?.ativos ?? 0),
              icon: Zap, accent: 'accent-amber', iconBox: 'icon-box-amber',
              sub: 'Status ativo',
            },
            {
              title: 'Resolvidos', value: isLoading ? '—' : String(data?.resolvidos ?? 0),
              icon: CheckCircle2, accent: 'accent-green', iconBox: 'icon-box-green',
              sub: 'No período',
            },
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
                  <p className="text-[11px] text-muted-foreground">{card.sub}</p>
                </div>
                <div className={`icon-box ${card.iconBox}`}>
                  <card.icon className="h-5 w-5" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* ── Area chart ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
          className="cfo-card accent-purple p-5"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-card-foreground">
                Volume de Leads — {activePeriodLabel}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {period === 'hoje' || period === 'ontem' ? 'Agrupado a cada 2 horas' : 'Agrupado por dia'}
              </p>
            </div>
            {peakHour && peakHour.leads > 0 && (
              <div
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#C4B5FD' }}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                Pico: {peakHour.label} ({peakHour.leads})
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-52">
              <div className="h-8 w-8 rounded-full border-2 border-border border-t-primary animate-spin" />
            </div>
          ) : !chartHasData ? (
            <div className="flex items-center justify-center h-52 text-sm text-muted-foreground">
              Nenhum lead no período selecionado
            </div>
          ) : (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.chart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="leadGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false} tickLine={false}
                    interval={data && data.chart.length > 12 ? Math.floor(data.chart.length / 8) : 0}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false} tickLine={false} allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(124,58,237,0.3)', strokeWidth: 1 }} />
                  <Area
                    type="monotone" dataKey="leads" stroke="#7C3AED" strokeWidth={2}
                    fill="url(#leadGradient)" dot={false} activeDot={{ r: 5, fill: '#A78BFA' }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        {/* ── By agent + By connection ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* By agent */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="cfo-card accent-purple p-5"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="icon-box icon-box-purple h-9 w-9 rounded-xl">
                <UserCircle2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-card-foreground">Leads por Vendedor</h3>
                <p className="text-xs text-muted-foreground">Atendimentos no período</p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 rounded-full border-2 border-border border-t-primary animate-spin" />
              </div>
            ) : (
              <RankList
                items={data?.byAgent ?? []}
                colors={BAR_COLORS}
                emptyMsg="Nenhum lead atribuído no período"
              />
            )}
          </motion.div>

          {/* By connection */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.42 }}
            className="cfo-card accent-green p-5"
          >
            <div className="flex items-center gap-3 mb-5">
              <div className="icon-box icon-box-green h-9 w-9 rounded-xl">
                <Wifi className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-card-foreground">Leads por Conexão</h3>
                <p className="text-xs text-muted-foreground">Qual canal recebe mais leads</p>
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 rounded-full border-2 border-border border-t-primary animate-spin" />
              </div>
            ) : (
              <>
                <RankList
                  items={data?.byConnection ?? []}
                  colors={CONN_COLORS}
                  emptyMsg="Nenhuma conexão identificada no período"
                />
                {(data?.byConnection ?? []).length > 1 && (
                  <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-green-400">
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span className="font-semibold">Maior: {data!.byConnection[0].name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <TrendingDown className="h-3.5 w-3.5" />
                      <span>Menor: {data!.byConnection[data!.byConnection.length - 1].name}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>

        {/* ── Messages by connection ── */}
        <MessagesByConnectionCard period={period} />
        </>}


      </div>
    </div>

  );
}
