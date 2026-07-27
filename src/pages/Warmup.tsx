import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Flame,
  Plus,
  Pause,
  Play,
  Trash2,
  History,
  RefreshCw,
  Loader2,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  CalendarDays,
  Settings2,

} from 'lucide-react';
import { toast } from 'sonner';

interface WarmupRow {
  id: string;
  connection_config_id: string;
  connection_label: string | null;
  connection_status: string | null;
  is_active: boolean;
  status: string;
  started_at: string;
  days_in_warmup: number;
  base_daily_target: number;
  growth_rate: number;
  max_daily: number;
  daily_target: number;
  active_hours_start: number;
  active_hours_end: number;
  messages_sent: number;
  messages_received: number;
  sent_today: number;
  last_activity_at: string | null;
}

interface WarmupLog {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  direction: string;
  content: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

interface ConnectionOption {
  id: string;
  label: string;
  status: string;
}

const DEFAULT_PERSONA =
  'Você é uma pessoa comum respondendo no WhatsApp. Responda de forma curta, natural, informal e humana, como um brasileiro real digitando no celular. Nunca diga que é uma IA.';

const statusBadge = (row: WarmupRow) => {
  if (!row.is_active || row.status === 'paused')
    return <Badge variant="secondary">Pausado</Badge>;
  return (
    <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20">
      Aquecendo
    </Badge>
  );
};

export default function Warmup() {
  const { currentWorkspace } = useWorkspace();
  const [rows, setRows] = useState<WarmupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'days' | 'sent'>('recent');

  const [addOpen, setAddOpen] = useState(false);
  const [connections, setConnections] = useState<ConnectionOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const [form, setForm] = useState({
    connection_config_id: '',
    persona_prompt: DEFAULT_PERSONA,
    base_daily_target: 6,
    growth_rate: 0.3,
    max_daily: 60,
    active_hours_start: 8,
    active_hours_end: 21,
    min_delay_seconds: 45,
    max_delay_seconds: 240,
  });

  const [historyOf, setHistoryOf] = useState<WarmupRow | null>(null);
  const [editOf, setEditOf] = useState<WarmupRow | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    persona_prompt: DEFAULT_PERSONA,
    language: 'pt-BR',
    behavior_style: 'casual',
    reply_length: 'curto',
    emoji_usage: 'raro',
    extra_instructions: '',
    base_daily_target: 6,
    growth_rate: 0.3,
    max_daily: 60,
    active_hours_start: 8,
    active_hours_end: 21,
    min_delay_seconds: 45,
    max_delay_seconds: 240,
  });

  const [logs, setLogs] = useState<WarmupLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    const { data, error } = await (supabase.rpc as any)('get_warmup_overview', {
      p_workspace_id: currentWorkspace.id,
    });
    if (error) toast.error(`Erro ao carregar aquecimentos: ${error.message}`);
    else setRows((data as WarmupRow[]) ?? []);
    setLoading(false);
  }, [currentWorkspace?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = async () => {
    if (!currentWorkspace?.id) return;
    const { data } = await supabase
      .from('connection_configs')
      .select('id, label, status')
      .eq('workspace_id', currentWorkspace.id)
      .eq('connection_id', 'evolution')
      .order('label');
    const used = new Set(rows.map((r) => r.connection_config_id));
    setConnections(
      ((data as ConnectionOption[]) ?? []).filter((c) => !used.has(c.id))
    );
    setForm((f) => ({ ...f, connection_config_id: '' }));
    setAddOpen(true);
  };

  const createWarmup = async () => {
    if (!form.connection_config_id) {
      toast.error('Selecione uma conexão');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('warmup_profiles' as any).insert({
      ...form,
      workspace_id: currentWorkspace!.id,
      is_active: true,
      status: 'active',
      started_at: new Date().toISOString(),
    } as any);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Conexão adicionada ao aquecimento');
    setAddOpen(false);
    load();
  };

  const toggle = async (row: WarmupRow) => {
    const nextActive = !(row.is_active && row.status === 'active');
    const { error } = await supabase
      .from('warmup_profiles' as any)
      .update({
        is_active: nextActive,
        status: nextActive ? 'active' : 'paused',
        paused_at: nextActive ? null : new Date().toISOString(),
      } as any)
      .eq('id', row.id);
    if (error) toast.error(error.message);
    else {
      toast.success(nextActive ? 'Aquecimento retomado' : 'Aquecimento pausado');
      load();
    }
  };

  const remove = async (row: WarmupRow) => {
    if (!confirm(`Remover "${row.connection_label}" do aquecimento?`)) return;
    const { error } = await supabase.from('warmup_profiles' as any).delete().eq('id', row.id);
    if (error) toast.error(error.message);
    else {
      toast.success('Removido do aquecimento');
      load();
    }
  };

  const openEdit = async (row: WarmupRow) => {
    setEditOf(row);
    setEditLoading(true);
    const { data, error } = await supabase
      .from('warmup_profiles' as any)
      .select('*')
      .eq('id', row.id)
      .maybeSingle();
    setEditLoading(false);
    if (error || !data) {
      toast.error(error?.message || 'Não foi possível carregar a configuração');
      setEditOf(null);
      return;
    }
    const d = data as any;
    setEditForm({
      persona_prompt: d.persona_prompt || DEFAULT_PERSONA,
      language: d.language || 'pt-BR',
      behavior_style: d.behavior_style || 'casual',
      reply_length: d.reply_length || 'curto',
      emoji_usage: d.emoji_usage || 'raro',
      extra_instructions: d.extra_instructions || '',
      base_daily_target: d.base_daily_target ?? 6,
      growth_rate: Number(d.growth_rate ?? 0.3),
      max_daily: d.max_daily ?? 60,
      active_hours_start: d.active_hours_start ?? 8,
      active_hours_end: d.active_hours_end ?? 21,
      min_delay_seconds: d.min_delay_seconds ?? 45,
      max_delay_seconds: d.max_delay_seconds ?? 240,
    });
  };

  const saveEdit = async () => {
    if (!editOf) return;
    setSaving(true);
    const { error } = await supabase
      .from('warmup_profiles' as any)
      .update({ ...editForm, updated_at: new Date().toISOString() } as any)
      .eq('id', editOf.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Comportamento da IA atualizado');
    setEditOf(null);
    load();
  };



  const openHistory = async (row: WarmupRow) => {
    setHistoryOf(row);
    setLogsLoading(true);
    const { data } = await supabase
      .from('warmup_logs' as any)
      .select('*')
      .eq('warmup_id', row.id)
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs(((data as any) ?? []) as WarmupLog[]);
    setLogsLoading(false);
  };

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke('warmup-cron', { body: {} });
    setRunning(false);
    if (error) toast.error(`Falha ao executar: ${error.message}`);
    else {
      const total = (data?.results ?? []).reduce(
        (acc: number, r: any) => acc + (r.sent ?? 0),
        0
      );
      toast.success(`Ciclo executado — ${total} mensagem(ns) enviada(s)`);
      load();
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = rows.filter((r) => {
      const isActive = r.is_active && r.status === 'active';
      if (statusFilter === 'active' && !isActive) return false;
      if (statusFilter === 'paused' && isActive) return false;
      if (term && !(r.connection_label ?? '').toLowerCase().includes(term)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortBy === 'days') return b.days_in_warmup - a.days_in_warmup;
      if (sortBy === 'sent') return Number(b.messages_sent) - Number(a.messages_sent);
      return (
        new Date(b.last_activity_at ?? b.started_at).getTime() -
        new Date(a.last_activity_at ?? a.started_at).getTime()
      );
    });
    return list;
  }, [rows, search, statusFilter, sortBy]);

  const totals = useMemo(
    () => ({
      chips: rows.length,
      active: rows.filter((r) => r.is_active && r.status === 'active').length,
      sent: rows.reduce((a, r) => a + Number(r.messages_sent ?? 0), 0),
      received: rows.reduce((a, r) => a + Number(r.messages_received ?? 0), 0),
    }),
    [rows]
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
            <Flame className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Aquecedor de Chips</h1>
            <p className="text-sm text-muted-foreground">
              Respostas humanizadas por IA nos números em aquecimento
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={runNow} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Executar ciclo
          </Button>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar chip
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Chips em aquecimento', value: totals.chips, icon: Flame },
          { label: 'Ativos agora', value: totals.active, icon: Play },
          { label: 'Mensagens enviadas', value: totals.sent, icon: ArrowUpRight },
          { label: 'Mensagens recebidas', value: totals.received, icon: ArrowDownLeft },
        ].map((kpi) => (
          <Card key={kpi.label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="mt-2 text-2xl font-bold">{kpi.value}</p>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar conexão..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">Aquecendo</SelectItem>
              <SelectItem value="paused">Pausados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Atividade recente</SelectItem>
              <SelectItem value="days">Mais dias aquecendo</SelectItem>
              <SelectItem value="sent">Mais mensagens enviadas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Flame className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhum chip em aquecimento. Adicione uma conexão para começar.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((row) => {
            const progress = Math.min(
              100,
              Math.round((Number(row.sent_today) / Math.max(1, row.daily_target)) * 100)
            );
            return (
              <Card key={row.id} className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{row.connection_label}</h3>
                      {statusBadge(row)}
                      {row.connection_status !== 'active' && (
                        <Badge variant="destructive">Conexão {row.connection_status}</Badge>
                      )}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Dia {row.days_in_warmup} de aquecimento · desde{' '}
                      {new Date(row.started_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(row)} title="Configurar IA">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openHistory(row)} title="Histórico">

                      <History className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => toggle(row)} title="Pausar/Retomar">
                      {row.is_active && row.status === 'active' ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(row)} title="Remover">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-lg font-bold">{row.messages_sent}</p>
                    <p className="text-[11px] text-muted-foreground">Enviadas</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-lg font-bold">{row.messages_received}</p>
                    <p className="text-[11px] text-muted-foreground">Recebidas</p>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-lg font-bold">
                      {row.sent_today}/{row.daily_target}
                    </p>
                    <p className="text-[11px] text-muted-foreground">Meta de hoje</p>
                  </div>
                </div>

                <div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Janela ativa {String(row.active_hours_start).padStart(2, '0')}h–
                    {String(row.active_hours_end).padStart(2, '0')}h · teto {row.max_daily}/dia
                    {row.last_activity_at &&
                      ` · última atividade ${new Date(row.last_activity_at).toLocaleString('pt-BR')}`}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog adicionar */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar chip ao aquecimento</DialogTitle>
            <DialogDescription>
              A IA responde de forma humanizada aos contatos que chegam pelo anúncio, seguindo uma
              curva de volume crescente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Conexão (Evolution)</Label>
              <Select
                value={form.connection_config_id}
                onValueChange={(v) => setForm({ ...form, connection_config_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conexão" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label} ({c.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Persona da IA</Label>
              <Textarea
                rows={4}
                value={form.persona_prompt}
                onChange={(e) => setForm({ ...form, persona_prompt: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Meta dia 1</Label>
                <Input
                  type="number"
                  value={form.base_daily_target}
                  onChange={(e) =>
                    setForm({ ...form, base_daily_target: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Crescimento/dia</Label>
                <Input
                  type="number"
                  step="0.05"
                  value={form.growth_rate}
                  onChange={(e) => setForm({ ...form, growth_rate: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Teto diário</Label>
                <Input
                  type="number"
                  value={form.max_daily}
                  onChange={(e) => setForm({ ...form, max_daily: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Início</Label>
                <Input
                  type="number"
                  value={form.active_hours_start}
                  onChange={(e) =>
                    setForm({ ...form, active_hours_start: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fim</Label>
                <Input
                  type="number"
                  value={form.active_hours_end}
                  onChange={(e) =>
                    setForm({ ...form, active_hours_end: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Delay mín (s)</Label>
                <Input
                  type="number"
                  value={form.min_delay_seconds}
                  onChange={(e) =>
                    setForm({ ...form, min_delay_seconds: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Delay máx (s)</Label>
                <Input
                  type="number"
                  value={form.max_delay_seconds}
                  onChange={(e) =>
                    setForm({ ...form, max_delay_seconds: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <Button className="w-full" onClick={createWarmup} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Iniciar aquecimento
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog configurar IA */}
      <Dialog open={!!editOf} onOpenChange={(o) => !o && setEditOf(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar IA — {editOf?.connection_label}</DialogTitle>
            <DialogDescription>
              Cada conexão tem seu próprio comportamento: persona, idioma, volume e janela de envio.
            </DialogDescription>
          </DialogHeader>

          {editLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Persona / comportamento da IA</Label>
                <Textarea
                  rows={6}
                  value={editForm.persona_prompt}
                  onChange={(e) => setEditForm({ ...editForm, persona_prompt: e.target.value })}
                  placeholder="Descreva quem é essa pessoa, o tom, os assuntos que ela fala..."
                />
                <p className="text-[11px] text-muted-foreground">
                  {editForm.persona_prompt.length} caracteres
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Idioma das respostas</Label>
                <Select
                  value={editForm.language}
                  onValueChange={(v) => setEditForm({ ...editForm, language: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt-BR">Português (BR)</SelectItem>
                    <SelectItem value="es">Espanhol</SelectItem>
                    <SelectItem value="en">Inglês</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Comportamento</Label>
                  <Select
                    value={editForm.behavior_style}
                    onValueChange={(v) => setEditForm({ ...editForm, behavior_style: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="casual">Casual / amigável</SelectItem>
                      <SelectItem value="formal">Formal / educado</SelectItem>
                      <SelectItem value="curioso">Curioso / pergunta muito</SelectItem>
                      <SelectItem value="objetivo">Objetivo / direto</SelectItem>
                      <SelectItem value="brincalhao">Brincalhão / descontraído</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tamanho</Label>
                  <Select
                    value={editForm.reply_length}
                    onValueChange={(v) => setEditForm({ ...editForm, reply_length: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="muito_curto">Muito curto (1 frase)</SelectItem>
                      <SelectItem value="curto">Curto (até 2 frases)</SelectItem>
                      <SelectItem value="medio">Médio (até 4 frases)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Emojis</Label>
                  <Select
                    value={editForm.emoji_usage}
                    onValueChange={(v) => setEditForm({ ...editForm, emoji_usage: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Nunca</SelectItem>
                      <SelectItem value="raro">Raro (máx. 1)</SelectItem>
                      <SelectItem value="frequente">Frequente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Instruções adicionais da IA</Label>
                <Textarea
                  rows={4}
                  value={editForm.extra_instructions}
                  onChange={(e) => setEditForm({ ...editForm, extra_instructions: e.target.value })}
                  placeholder="Ex: nunca fale de política, sempre pergunte como foi o dia, cite que mora em São Paulo..."
                />
                <p className="text-[11px] text-muted-foreground">
                  Regras extras aplicadas somente a esta conexão.
                </p>
              </div>



              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Meta dia 1</Label>
                  <Input
                    type="number"
                    value={editForm.base_daily_target}
                    onChange={(e) =>
                      setEditForm({ ...editForm, base_daily_target: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Crescimento/dia</Label>
                  <Input
                    type="number"
                    step="0.05"
                    value={editForm.growth_rate}
                    onChange={(e) =>
                      setEditForm({ ...editForm, growth_rate: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Teto diário</Label>
                  <Input
                    type="number"
                    value={editForm.max_daily}
                    onChange={(e) =>
                      setEditForm({ ...editForm, max_daily: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label>Início</Label>
                  <Input
                    type="number"
                    value={editForm.active_hours_start}
                    onChange={(e) =>
                      setEditForm({ ...editForm, active_hours_start: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Fim</Label>
                  <Input
                    type="number"
                    value={editForm.active_hours_end}
                    onChange={(e) =>
                      setEditForm({ ...editForm, active_hours_end: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Delay mín (s)</Label>
                  <Input
                    type="number"
                    value={editForm.min_delay_seconds}
                    onChange={(e) =>
                      setEditForm({ ...editForm, min_delay_seconds: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Delay máx (s)</Label>
                  <Input
                    type="number"
                    value={editForm.max_delay_seconds}
                    onChange={(e) =>
                      setEditForm({ ...editForm, max_delay_seconds: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <Button className="w-full" onClick={saveEdit} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar configuração
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog histórico */}

      <Dialog open={!!historyOf} onOpenChange={(o) => !o && setHistoryOf(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico — {historyOf?.connection_label}</DialogTitle>
            <DialogDescription>Últimas 200 interações do aquecimento</DialogDescription>
          </DialogHeader>
          {logsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nenhuma interação registrada ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium">
                      {log.contact_name || log.contact_phone || 'Contato'}
                    </p>
                    <div className="flex items-center gap-2">
                      {log.status === 'failed' ? (
                        <Badge variant="destructive">Falhou</Badge>
                      ) : (
                        <Badge variant="secondary">Enviada</Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(log.created_at).toLocaleString('pt-BR')}
                      </span>
                    </div>
                  </div>
                  {log.content && <p className="mt-1.5 text-sm">{log.content}</p>}
                  {log.error && (
                    <p className="mt-1.5 text-xs text-destructive break-all">{log.error}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
