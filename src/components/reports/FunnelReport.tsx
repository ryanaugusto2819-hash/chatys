import { motion } from 'framer-motion';
import { Filter, TrendingDown, Layers, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFunnelReport, FunnelGroup } from '@/hooks/useFunnelReport';

const COUNTRY_LABEL: Record<string, string> = { BR: '🇧🇷 Brasil', UY: '🇺🇾 Uruguay' };
const STAGE_COLORS = ['#7C3AED', '#8B5CF6', '#A78BFA', '#C4B5FD', '#DDD6FE', '#EDE9FE'];

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function FunnelCard({ group }: { group: FunnelGroup }) {
  const first = group.stages[0]?.uniqueContacts ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="cfo-card accent-purple p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="icon-box icon-box-purple h-9 w-9 rounded-xl">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-card-foreground">
              {COUNTRY_LABEL[group.country] ?? group.country} · {group.niche}
            </h3>
            <p className="text-xs text-muted-foreground">
              {first} lead{first !== 1 ? 's' : ''} na etapa inicial
            </p>
          </div>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-1 rounded-md tracking-wider"
          style={{ background: 'rgba(124,58,237,0.15)', color: '#C4B5FD' }}
        >
          {group.key}
        </span>
      </div>

      <div className="space-y-3">
        {group.stages.map((s, i) => {
          const color = STAGE_COLORS[i % STAGE_COLORS.length];
          const widthPct = pct(s.uniqueContacts, first || 1);
          const prev = i > 0 ? group.stages[i - 1] : null;
          const conv = prev ? pct(s.uniqueContacts, prev.uniqueContacts) : 100;
          const drop = prev ? prev.uniqueContacts - s.uniqueContacts : 0;

          return (
            <div key={s.tagName}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: color }}
                  >
                    {s.stage}
                  </span>
                  <span className="text-sm font-medium text-card-foreground truncate">
                    Etapa {s.stage}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {prev && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{
                        background: conv >= 50 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                        color: conv >= 50 ? '#34D399' : '#F87171',
                      }}
                    >
                      {conv}%
                    </span>
                  )}
                  <span
                    className="text-sm font-bold tabular-nums px-2 py-0.5 rounded-lg"
                    style={{ background: `${color}22`, color }}
                  >
                    {s.uniqueContacts}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted))' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${widthPct}%` }}
                  transition={{ duration: 0.6, delay: i * 0.05 }}
                />
              </div>
              {prev && drop > 0 && (
                <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                  <TrendingDown className="h-3 w-3 text-red-400" />
                  {drop} lead{drop !== 1 ? 's' : ''} perdido{drop !== 1 ? 's' : ''} vs Etapa {prev.stage}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {group.stages.length > 1 && (
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Conversão total (Etapa 1 → {group.stages.at(-1)!.stage})</span>
          <span
            className="font-bold px-2 py-0.5 rounded-lg"
            style={{ background: 'rgba(124,58,237,0.15)', color: '#C4B5FD' }}
          >
            {pct(group.stages.at(-1)!.uniqueContacts, first || 1)}%
          </span>
        </div>
      )}
    </motion.div>
  );
}

export default function FunnelReport() {
  const { data, isLoading, refetch, isFetching } = useFunnelReport();
  const [country, setCountry] = useState<string>('all');
  const [niche, setNiche] = useState<string>('all');

  const countries = useMemo(
    () => Array.from(new Set((data ?? []).map(g => g.country))),
    [data]
  );
  const niches = useMemo(
    () => Array.from(new Set((data ?? []).map(g => g.niche))),
    [data]
  );

  const filtered = (data ?? []).filter(g =>
    (country === 'all' || g.country === country) &&
    (niche === 'all' || g.niche === niche)
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mr-1">
            <Filter className="h-3.5 w-3.5" />
            Filtros:
          </div>
          <select
            value={country}
            onChange={e => setCountry(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-card text-card-foreground"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <option value="all">Todos os países</option>
            {countries.map(c => (
              <option key={c} value={c}>{COUNTRY_LABEL[c] ?? c}</option>
            ))}
          </select>
          <select
            value={niche}
            onChange={e => setNiche(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-card text-card-foreground"
            style={{ borderColor: 'hsl(var(--border))' }}
          >
            <option value="all">Todos os nichos</option>
            {niches.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
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

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 rounded-full border-2 border-border border-t-primary animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="cfo-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma etapa de funil encontrada. Crie etiquetas no formato <code>ETAPA N (BR-NICHO)</code>.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filtered.map(g => <FunnelCard key={g.key} group={g} />)}
        </div>
      )}
    </div>
  );
}
