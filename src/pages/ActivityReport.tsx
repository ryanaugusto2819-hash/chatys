import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Monitor, Clock, RefreshCw, Users, AlertTriangle, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import TopBar from '@/components/layout/TopBar';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type SessionRow = {
  id: string;
  user_id: string;
  session_id: string;
  ip: string | null;
  user_agent: string | null;
  first_seen: string;
  last_seen: string;
  actions_count: number;
  route: string | null;
};

type ProfileRow = { user_id: string; full_name: string | null };

const PERIODS = [
  { key: 'hoje', label: 'Hoje', hours: 24 },
  { key: '7d', label: '7 dias', hours: 24 * 7 },
  { key: '30d', label: '30 dias', hours: 24 * 30 },
] as const;

type PeriodKey = typeof PERIODS[number]['key'];

const IDLE_MIN = 5; // minutes without heartbeat = considered offline

function parseDevice(ua: string | null): string {
  if (!ua) return 'Desconhecido';
  const u = ua.toLowerCase();
  let os = 'Desktop';
  if (u.includes('android')) os = 'Android';
  else if (u.includes('iphone') || u.includes('ipad')) os = 'iOS';
  else if (u.includes('windows')) os = 'Windows';
  else if (u.includes('mac os')) os = 'macOS';
  else if (u.includes('linux')) os = 'Linux';

  let browser = '';
  if (u.includes('edg/')) browser = 'Edge';
  else if (u.includes('chrome/')) browser = 'Chrome';
  else if (u.includes('firefox/')) browser = 'Firefox';
  else if (u.includes('safari/')) browser = 'Safari';

  return browser ? `${browser} · ${os}` : os;
}

export default function ActivityReport() {
  const [period, setPeriod] = useState<PeriodKey>('hoje');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['activity-sessions', period],
    queryFn: async () => {
      const hours = PERIODS.find(p => p.key === period)!.hours;
      const since = new Date(Date.now() - hours * 3600_000).toISOString();

      const { data: sessions, error } = await supabase
        .from('activity_sessions' as any)
        .select('*')
        .gte('last_seen', since)
        .order('last_seen', { ascending: false })
        .limit(500);
      if (error) throw error;

      const userIds = Array.from(new Set((sessions ?? []).map((s: any) => s.user_id)));
      let profiles: ProfileRow[] = [];
      if (userIds.length) {
        const { data: profs } = await supabase
          .from('profiles' as any)
          .select('user_id, full_name')
          .in('user_id', userIds);
        profiles = (profs as any) ?? [];
      }
      const nameMap = new Map(profiles.map(p => [p.user_id, p.full_name || '']));

      return { sessions: (sessions as any) as SessionRow[], nameMap };
    },
    refetchInterval: 30_000,
  });

  const now = Date.now();

  const grouped = useMemo(() => {
    if (!data) return { byIp: [] as any[], activeNow: 0, totalIps: 0, totalDevices: 0 };
    const sessions = data.sessions;

    // group by ip
    const map = new Map<string, {
      ip: string;
      sessions: SessionRow[];
      lastSeen: number;
      firstSeen: number;
      totalActions: number;
      devices: Set<string>;
    }>();

    for (const s of sessions) {
      const key = s.ip || 'sem-ip';
      const g = map.get(key) ?? {
        ip: key,
        sessions: [],
        lastSeen: 0,
        firstSeen: Number.MAX_SAFE_INTEGER,
        totalActions: 0,
        devices: new Set<string>(),
      };
      g.sessions.push(s);
      g.lastSeen = Math.max(g.lastSeen, new Date(s.last_seen).getTime());
      g.firstSeen = Math.min(g.firstSeen, new Date(s.first_seen).getTime());
      g.totalActions += s.actions_count || 0;
      g.devices.add(parseDevice(s.user_agent));
      map.set(key, g);
    }

    const byIp = Array.from(map.values()).sort((a, b) => b.lastSeen - a.lastSeen);
    const activeNow = byIp.filter(g => now - g.lastSeen < IDLE_MIN * 60_000).length;
    const totalDevices = sessions.length;

    return { byIp, activeNow, totalIps: byIp.length, totalDevices };
  }, [data, now]);

  return (
    <div>
      <TopBar title="Relatório de Atividade" subtitle="Monitoramento por IP e Dispositivo" />

      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Warning banner */}
        <div
          className="flex items-start gap-3 rounded-xl p-4 border"
          style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)' }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: '#F59E0B' }} />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-semibold text-amber-300">Como funciona: </span>
            cada IP + dispositivo é rastreado a cada minuto enquanto o funcionário está ativo
            (mexendo mouse, digitando ou clicando). Se o navegador ficar 5 min sem sinal, é
            considerado <b>offline</b>. Funcionários na <b>mesma rede Wi-Fi</b> aparecem com o
            mesmo IP e ficam indistinguíveis — para separá-los, cada um precisa de uma conta
            individual ou usar internet própria.
          </div>
        </div>

        {/* Filters */}
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border"
            style={{ color: 'hsl(var(--muted-foreground))', borderColor: 'hsl(var(--border))' }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Ativos Agora', value: grouped.activeNow, icon: Activity, box: 'icon-box-green', accent: 'accent-green' },
            { label: 'IPs Únicos', value: grouped.totalIps, icon: MapPin, box: 'icon-box-purple', accent: 'accent-purple' },
            { label: 'Sessões', value: grouped.totalDevices, icon: Monitor, box: 'icon-box-blue', accent: 'accent-blue' },
            { label: 'Período', value: PERIODS.find(p => p.key === period)!.label, icon: Clock, box: 'icon-box-amber', accent: 'accent-amber' },
          ].map((c, i) => (
            <motion.div
              key={c.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
              className={`cfo-card ${c.accent} p-5`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{c.label}</p>
                  <p className="text-2xl font-bold text-card-foreground leading-none tabular-nums">
                    {isLoading ? '—' : c.value}
                  </p>
                </div>
                <div className={`icon-box ${c.box}`}>
                  <c.icon className="h-5 w-5" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Table by IP */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="cfo-card accent-purple p-5"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="icon-box icon-box-purple h-9 w-9 rounded-xl">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-card-foreground">Atividade por IP</h3>
              <p className="text-xs text-muted-foreground">Cada IP representa um ponto de acesso à internet</p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 rounded-full border-2 border-border border-t-primary animate-spin" />
            </div>
          ) : grouped.byIp.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              Sem atividade registrada neste período. O rastreamento começa depois que os funcionários
              acessarem o sistema.
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.byIp.map((g, i) => {
                const idleMs = now - g.lastSeen;
                const isOnline = idleMs < IDLE_MIN * 60_000;
                const totalMinutes = Math.round((g.lastSeen - g.firstSeen) / 60_000);
                return (
                  <motion.div
                    key={g.ip}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.03 }}
                    className="rounded-xl border p-4"
                    style={{
                      borderColor: 'hsl(var(--border))',
                      background: 'hsl(var(--card))',
                    }}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2 w-2 rounded-full ${isOnline ? 'animate-pulse' : ''}`}
                          style={{ background: isOnline ? '#10b981' : '#6b7280' }}
                        />
                        <div>
                          <p className="text-sm font-mono font-semibold text-card-foreground">{g.ip}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {Array.from(g.devices).join(' · ')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className="px-2 py-1 rounded-lg font-semibold"
                          style={
                            isOnline
                              ? { background: 'rgba(16,185,129,0.15)', color: '#6EE7B7' }
                              : { background: 'rgba(107,114,128,0.15)', color: '#9CA3AF' }
                          }
                        >
                          {isOnline
                            ? 'Online agora'
                            : `Inativo há ${formatDistanceToNow(g.lastSeen, { locale: ptBR })}`}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Última atividade</p>
                        <p className="font-semibold text-card-foreground">
                          {format(g.lastSeen, "dd/MM HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Primeiro acesso (período)</p>
                        <p className="font-semibold text-card-foreground">
                          {format(g.firstSeen, "dd/MM HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Interações</p>
                        <p className="font-semibold text-card-foreground tabular-nums">{g.totalActions}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Sessões</p>
                        <p className="font-semibold text-card-foreground tabular-nums">{g.sessions.length}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
