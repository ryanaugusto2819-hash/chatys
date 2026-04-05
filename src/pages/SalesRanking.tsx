import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, RefreshCw, ShoppingBag, DollarSign, Users,
  TrendingUp, Package, Hash,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface VendorStats {
  vendedor: string;
  totalValor: number;
  totalQuantidade: number;
  totalPedidos: number;
}

const PERIODS = [
  { label: '7 dias', days: 7 },
  { label: '30 dias', days: 30 },
  { label: 'Todos', days: 0 },
];

const RANK_STYLES = [
  {
    badge: '🥇',
    bg: 'linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(217,119,6,0.08) 100%)',
    border: 'rgba(245,158,11,0.35)',
    barColor: '#F59E0B',
    nameColor: '#FDE68A',
    label: '1º lugar',
    glow: '0 0 24px rgba(245,158,11,0.25)',
  },
  {
    badge: '🥈',
    bg: 'linear-gradient(135deg, rgba(148,163,184,0.15) 0%, rgba(100,116,139,0.06) 100%)',
    border: 'rgba(148,163,184,0.3)',
    barColor: '#94A3B8',
    nameColor: '#E2E8F0',
    label: '2º lugar',
    glow: '0 0 16px rgba(148,163,184,0.15)',
  },
  {
    badge: '🥉',
    bg: 'linear-gradient(135deg, rgba(205,127,50,0.15) 0%, rgba(146,64,14,0.06) 100%)',
    border: 'rgba(205,127,50,0.3)',
    barColor: '#CD7F32',
    nameColor: '#FED7AA',
    label: '3º lugar',
    glow: '0 0 16px rgba(205,127,50,0.15)',
  },
];

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCompact(v: number) {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(1)}K`;
  return formatCurrency(v);
}

export default function SalesRanking() {
  const [stats, setStats] = useState<VendorStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('sales_orders' as any)
        .select('vendedor, valor, quantidade');

      if (period > 0) {
        const since = new Date();
        since.setDate(since.getDate() - period);
        query = (query as any).gte('created_at', since.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      const map: Record<string, VendorStats> = {};
      for (const row of (data as any[]) || []) {
        const v: string = row.vendedor || 'Desconhecido';
        if (!map[v]) map[v] = { vendedor: v, totalValor: 0, totalQuantidade: 0, totalPedidos: 0 };
        map[v].totalValor += Number(row.valor) || 0;
        map[v].totalQuantidade += Number(row.quantidade) || 0;
        map[v].totalPedidos += 1;
      }

      const sorted = Object.values(map).sort((a, b) => b.totalValor - a.totalValor);
      setStats(sorted);
    } catch (err) {
      console.error('Error fetching ranking:', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalValue = stats.reduce((s, v) => s + v.totalValor, 0);
  const totalOrders = stats.reduce((s, v) => s + v.totalPedidos, 0);
  const totalQty = stats.reduce((s, v) => s + v.totalQuantidade, 0);
  const maxValor = stats[0]?.totalValor || 1;

  const top3 = stats.slice(0, 3);
  const rest = stats.slice(3);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(124,58,237,0.3) 0%, rgba(124,58,237,0.12) 100%)',
              border: '1px solid rgba(124,58,237,0.35)',
            }}
          >
            <Trophy className="h-5 w-5" style={{ color: '#A78BFA' }} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: '#F0EAFF' }}>
              Ranking de Vendas
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'hsl(260 15% 48%)' }}>
              Desempenho gamificado dos vendedores
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              onClick={() => setPeriod(p.days)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
              style={
                period === p.days
                  ? {
                      background: 'linear-gradient(135deg, rgba(124,58,237,0.28), rgba(124,58,237,0.12))',
                      color: '#C4B5FD',
                      border: '1px solid rgba(124,58,237,0.4)',
                    }
                  : {
                      color: 'hsl(260 15% 52%)',
                      border: '1px solid rgba(124,58,237,0.15)',
                    }
              }
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={fetchData}
            className="flex items-center justify-center h-8 w-8 rounded-lg transition-all duration-150"
            style={{ color: 'hsl(260 15% 52%)', border: '1px solid rgba(124,58,237,0.15)' }}
            title="Atualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            title: 'Total em Vendas',
            value: formatCompact(totalValue),
            icon: DollarSign,
            color: '#7C3AED',
            colorBg: 'rgba(124,58,237,0.12)',
            colorBorder: 'rgba(124,58,237,0.25)',
          },
          {
            title: 'Total de Pedidos',
            value: totalOrders.toString(),
            icon: ShoppingBag,
            color: '#059669',
            colorBg: 'rgba(5,150,105,0.1)',
            colorBorder: 'rgba(5,150,105,0.2)',
          },
          {
            title: 'Vendedores Ativos',
            value: stats.length.toString(),
            icon: Users,
            color: '#2563EB',
            colorBg: 'rgba(37,99,235,0.1)',
            colorBorder: 'rgba(37,99,235,0.2)',
          },
        ].map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, delay: i * 0.07, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="cfo-card p-5"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {card.title}
                </p>
                <p className="text-2xl font-bold mt-1 tabular-nums" style={{ color: '#F0EAFF' }}>
                  {loading ? '—' : card.value}
                </p>
              </div>
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
                style={{ background: card.colorBg, border: `1px solid ${card.colorBorder}` }}
              >
                <card.icon className="h-5 w-5" style={{ color: card.color }} />
              </div>
            </div>
            <div
              className="h-1 w-full rounded-full overflow-hidden"
              style={{ background: 'hsl(var(--muted))' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${card.color}, ${card.color}66)` }}
                initial={{ width: 0 }}
                animate={{ width: loading ? 0 : '70%' }}
                transition={{ duration: 0.7, delay: i * 0.07 + 0.2, ease: 'easeOut' }}
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* ── Loading state ── */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div
              className="h-10 w-10 rounded-full border-2 animate-spin"
              style={{ borderColor: 'rgba(124,58,237,0.2)', borderTopColor: '#7C3AED' }}
            />
            <p className="text-xs" style={{ color: 'hsl(260 15% 48%)' }}>Carregando ranking...</p>
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && stats.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="cfo-card p-12 flex flex-col items-center gap-4 text-center"
        >
          <div
            className="flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}
          >
            <Trophy className="h-8 w-8" style={{ color: '#7C3AED' }} />
          </div>
          <div>
            <p className="font-semibold" style={{ color: '#E9E0FF' }}>Nenhuma venda registrada</p>
            <p className="text-sm mt-1" style={{ color: 'hsl(260 15% 48%)' }}>
              As vendas adicionadas aparecerão aqui no ranking
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Top 3 podium ── */}
      {!loading && top3.length > 0 && (
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'hsl(260 15% 48%)' }}
          >
            Pódio
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {top3.map((vendor, i) => {
              const style = RANK_STYLES[i];
              const barPct = Math.round((vendor.totalValor / maxValor) * 100);
              return (
                <motion.div
                  key={vendor.vendedor}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.42, delay: i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
                  className="rounded-2xl p-5 flex flex-col gap-3 relative overflow-hidden"
                  style={{
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    boxShadow: style.glow,
                  }}
                >
                  {/* Rank badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{style.badge}</span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
                      style={{
                        color: style.nameColor,
                        background: `${style.border.replace(')', ', 0.15)').replace('rgba', 'rgba')}`,
                        border: `1px solid ${style.border}`,
                      }}
                    >
                      {style.label}
                    </span>
                  </div>

                  {/* Vendor name */}
                  <div>
                    <p className="text-base font-bold truncate" style={{ color: style.nameColor }}>
                      {vendor.vendedor}
                    </p>
                    <p className="text-xl font-bold tabular-nums mt-0.5" style={{ color: '#F0EAFF' }}>
                      {formatCurrency(vendor.totalValor)}
                    </p>
                  </div>

                  {/* Stats row */}
                  <div className="flex gap-3">
                    <div className="flex items-center gap-1">
                      <ShoppingBag className="h-3 w-3" style={{ color: style.barColor }} />
                      <span className="text-xs tabular-nums" style={{ color: 'hsl(260 15% 65%)' }}>
                        {vendor.totalPedidos} pedidos
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Package className="h-3 w-3" style={{ color: style.barColor }} />
                      <span className="text-xs tabular-nums" style={{ color: 'hsl(260 15% 65%)' }}>
                        {vendor.totalQuantidade} un.
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div
                    className="h-1.5 w-full rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.07)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${style.barColor}, ${style.barColor}88)` }}
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

      {/* ── Full ranking list ── */}
      {!loading && stats.length > 0 && (
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-wider mb-3"
            style={{ color: 'hsl(260 15% 48%)' }}
          >
            Classificação Geral
          </p>
          <div className="cfo-card overflow-hidden">
            {/* Table header */}
            <div
              className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b text-[10px] font-bold uppercase tracking-wider"
              style={{ borderColor: 'rgba(124,58,237,0.12)', color: 'hsl(260 15% 42%)' }}
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
                const isTop3 = i < 3;
                const rankStyle = isTop3 ? RANK_STYLES[i] : null;

                return (
                  <motion.div
                    key={vendor.vendedor}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.04 }}
                    className="grid grid-cols-12 gap-2 px-4 py-3 items-center border-b last:border-b-0 group transition-colors duration-100"
                    style={{
                      borderColor: 'rgba(124,58,237,0.08)',
                      background: isTop3
                        ? rankStyle!.bg.replace('0.18)', '0.06)').replace('0.08)', '0.03)')
                        : undefined,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(124,58,237,0.06)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = isTop3
                        ? rankStyle!.bg.replace('0.18)', '0.06)').replace('0.08)', '0.03)')
                        : '';
                    }}
                  >
                    {/* Position */}
                    <div className="col-span-1 flex items-center justify-center">
                      {isTop3 ? (
                        <span className="text-base">{rankStyle!.badge}</span>
                      ) : (
                        <span
                          className="text-xs font-bold tabular-nums"
                          style={{ color: 'hsl(260 15% 45%)' }}
                        >
                          {i + 1}
                        </span>
                      )}
                    </div>

                    {/* Vendor name + bar */}
                    <div className="col-span-4">
                      <p
                        className="text-sm font-semibold truncate"
                        style={{ color: isTop3 ? rankStyle!.nameColor : '#D4C8F5' }}
                      >
                        {vendor.vendedor}
                      </p>
                      <div
                        className="mt-1.5 h-1 w-full rounded-full overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.06)' }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background: isTop3
                              ? `linear-gradient(90deg, ${rankStyle!.barColor}, ${rankStyle!.barColor}66)`
                              : 'linear-gradient(90deg, #7C3AED, #7C3AED55)',
                          }}
                          initial={{ width: 0 }}
                          animate={{ width: `${barPct}%` }}
                          transition={{ duration: 0.7, delay: i * 0.04 + 0.15, ease: 'easeOut' }}
                        />
                      </div>
                    </div>

                    {/* Total value */}
                    <div className="col-span-3 text-right">
                      <span
                        className="text-sm font-bold tabular-nums"
                        style={{ color: '#F0EAFF' }}
                      >
                        {formatCurrency(vendor.totalValor)}
                      </span>
                    </div>

                    {/* Orders count */}
                    <div className="col-span-2 text-right">
                      <span className="text-xs tabular-nums" style={{ color: 'hsl(260 15% 60%)' }}>
                        {vendor.totalPedidos}
                      </span>
                    </div>

                    {/* Quantity */}
                    <div className="col-span-2 text-right">
                      <span className="text-xs tabular-nums" style={{ color: 'hsl(260 15% 60%)' }}>
                        {vendor.totalQuantidade}
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Footer summary */}
            <div
              className="grid grid-cols-12 gap-2 px-4 py-3 border-t"
              style={{ borderColor: 'rgba(124,58,237,0.15)', background: 'rgba(124,58,237,0.05)' }}
            >
              <div className="col-span-1" />
              <div className="col-span-4">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'hsl(260 15% 48%)' }}>
                  Total
                </span>
              </div>
              <div className="col-span-3 text-right">
                <span className="text-sm font-bold tabular-nums" style={{ color: '#A78BFA' }}>
                  {formatCurrency(totalValue)}
                </span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-xs font-bold tabular-nums" style={{ color: '#A78BFA' }}>
                  {totalOrders}
                </span>
              </div>
              <div className="col-span-2 text-right">
                <span className="text-xs font-bold tabular-nums" style={{ color: '#A78BFA' }}>
                  {totalQty}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
