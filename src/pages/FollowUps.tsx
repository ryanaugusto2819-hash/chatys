import { useState, useEffect } from 'react';
import TopBar from '@/components/layout/TopBar';
import { supabase } from '@/integrations/supabase/client';
import {
  Clock, Plus, Trash2, Save, Loader2, Play, Pause, BarChart3,
  ArrowUpRight, MessageSquare, CheckCircle, XCircle, AlertTriangle,
  TrendingUp, Timer, Target, Zap, GitBranch,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface AutomationFlow {
  id: string;
  name: string;
  description: string;
}

interface FollowUpTemplate {
  id: string;
  name: string;
  objective: string;
  message_template: string;
  escalation_level: number;
  max_attempts: number;
  delay_hours: number;
  active_hours_start: number;
  active_hours_end: number;
  is_active: boolean;
  niche_id: string | null;
  sort_order: number;
  flow_id: string | null;
}

interface FollowUpExecution {
  id: string;
  conversation_id: string;
  template_id: string;
  attempt_number: number;
  status: string;
  scheduled_at: string;
  sent_at: string | null;
  responded_at: string | null;
  message_sent: string | null;
  created_at: string;
}

interface Niche {
  id: string;
  name: string;
}

export default function FollowUps() {
  const [templates, setTemplates] = useState<FollowUpTemplate[]>([]);
  const [executions, setExecutions] = useState<FollowUpExecution[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [tRes, eRes, nRes, fRes] = await Promise.all([
      supabase.from('follow_up_templates').select('*').order('escalation_level'),
      supabase.from('follow_up_executions').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('niches').select('id, name'),
      supabase.from('automation_flows').select('id, name, description').order('name'),
    ]);
    setTemplates((tRes.data || []) as FollowUpTemplate[]);
    setExecutions((eRes.data || []) as FollowUpExecution[]);
    setNiches((nRes.data || []) as Niche[]);
    setFlows((fRes.data || []) as AutomationFlow[]);
    setLoading(false);
  };

  const addTemplate = () => {
    const newLevel = templates.length + 1;
    setTemplates(prev => [...prev, {
      id: crypto.randomUUID(),
      name: `Follow-up Nível ${newLevel}`,
      objective: '',
      message_template: '',
      escalation_level: newLevel,
      max_attempts: 2,
      delay_hours: 24,
      active_hours_start: 8,
      active_hours_end: 20,
      is_active: true,
      niche_id: null,
      sort_order: newLevel,
      flow_id: null,
    }]);
  };

  const updateTemplate = (id: string, field: keyof FollowUpTemplate, value: unknown) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from('follow_up_templates').delete().eq('id', id);
    setTemplates(prev => prev.filter(t => t.id !== id));
    toast.success('Template removido');
  };

  const saveTemplates = async () => {
    setSaving(true);
    for (const t of templates) {
      const { id, ...data } = t;
      const { error } = await supabase.from('follow_up_templates').upsert({ id, ...data });
      if (error) {
        toast.error(`Erro ao salvar "${t.name}"`);
        console.error(error);
      }
    }
    toast.success('Templates salvos!');
    setSaving(false);
  };

  const runNow = async () => {
    setRunning(true);
    toast.info('Executando follow-ups... isso pode levar alguns minutos.');
    try {
      const { data, error } = await supabase.functions.invoke('ai-follow-up', {
        body: {},
      });
      if (error) throw error;
      toast.success(`Follow-ups processados: ${data?.processed || 0} enviados`);
      fetchAll();
    } catch (e: any) {
      if (e?.message?.includes('timeout') || e?.message?.includes('abort')) {
        toast.info('A execução está em andamento no servidor. Os resultados aparecerão no histórico em breve.');
        setTimeout(() => fetchAll(), 10000);
      } else {
        toast.error(`Erro ao executar follow-ups: ${e?.message || 'erro desconhecido'}`);
        console.error(e);
      }
    }
    setRunning(false);
  };

  // Dashboard metrics
  const totalSent = executions.filter(e => e.status === 'sent' || e.status === 'responded').length;
  const totalResponded = executions.filter(e => e.status === 'responded').length;
  const conversionRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;
  const pendingCount = executions.filter(e => e.status === 'pending').length;

  // Per-template metrics
  const templateMetrics = templates.map(t => {
    const tExecs = executions.filter(e => e.template_id === t.id);
    const sent = tExecs.filter(e => e.status === 'sent' || e.status === 'responded').length;
    const responded = tExecs.filter(e => e.status === 'responded').length;
    return { ...t, sent, responded, rate: sent > 0 ? Math.round((responded / sent) * 100) : 0 };
  });

  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        <TopBar title="Follow-ups Inteligentes" subtitle="Reengajamento automático com IA" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <TopBar title="Follow-ups Inteligentes" subtitle="Reengajamento automático com IA" />

      <div className="flex-1 overflow-auto p-6 space-y-6">
        <Tabs defaultValue="templates" className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="templates">
                <MessageSquare className="h-4 w-4 mr-2" />
                Templates
              </TabsTrigger>
              <TabsTrigger value="dashboard">
                <BarChart3 className="h-4 w-4 mr-2" />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="history">
                <Clock className="h-4 w-4 mr-2" />
                Histórico
              </TabsTrigger>
            </TabsList>
            <div className="flex gap-2">
              <button
                onClick={runNow}
                disabled={running}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity"
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Executar Agora
              </button>
            </div>
          </div>

          {/* Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Configure os níveis de escalonamento. O nível 1 é o mais suave, cada nível seguinte é mais direto/urgente.
              </p>
              <div className="flex gap-2">
                <button onClick={addTemplate} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm">
                  <Plus className="h-4 w-4" /> Novo Nível
                </button>
                <button onClick={saveTemplates} disabled={saving} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar Tudo
                </button>
              </div>
            </div>

            {templates.map((t, i) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className={`border ${t.is_active ? 'border-primary/30' : 'border-muted opacity-60'}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant={t.escalation_level === 1 ? 'secondary' : t.escalation_level === 2 ? 'default' : 'destructive'}>
                          Nível {t.escalation_level}
                        </Badge>
                        <Input
                          value={t.name}
                          onChange={e => updateTemplate(t.id, 'name', e.target.value)}
                          className="text-lg font-semibold border-none p-0 h-auto bg-transparent w-64"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">{t.is_active ? 'Ativo' : 'Inativo'}</span>
                          <Switch
                            checked={t.is_active}
                            onCheckedChange={v => updateTemplate(t.id, 'is_active', v)}
                          />
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button className="p-2 text-destructive hover:bg-destructive/10 rounded-lg">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir template?</AlertDialogTitle>
                              <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteTemplate(t.id)}>Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-1">
                        <Target className="h-4 w-4 text-primary" /> Objetivo do Follow-up
                      </label>
                      <Textarea
                        value={t.objective}
                        onChange={e => updateTemplate(t.id, 'objective', e.target.value)}
                        placeholder="Ex: Reengajar o cliente que demonstrou interesse no produto X mas não finalizou a compra"
                        rows={2}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-1">
                        <MessageSquare className="h-4 w-4 text-primary" /> Modelo de Mensagem (base para a IA)
                      </label>
                      <Textarea
                        value={t.message_template}
                        onChange={e => updateTemplate(t.id, 'message_template', e.target.value)}
                        placeholder="Ex: Oi {nome}, vi que você se interessou pelo {produto}. Tenho uma condição especial que expira hoje..."
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2 mb-1">
                          <Timer className="h-4 w-4 text-primary" /> Atraso (horas)
                        </label>
                        <Input
                          type="number"
                          min={1}
                          value={t.delay_hours}
                          onChange={e => updateTemplate(t.id, 'delay_hours', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2 mb-1">
                          <Zap className="h-4 w-4 text-primary" /> Máx. Tentativas
                        </label>
                        <Input
                          type="number"
                          min={1}
                          max={10}
                          value={t.max_attempts}
                          onChange={e => updateTemplate(t.id, 'max_attempts', parseInt(e.target.value) || 1)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Horário Início</label>
                        <Select value={String(t.active_hours_start)} onValueChange={v => updateTemplate(t.id, 'active_hours_start', parseInt(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => (
                              <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Horário Fim</label>
                        <Select value={String(t.active_hours_end)} onValueChange={v => updateTemplate(t.id, 'active_hours_end', parseInt(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 24 }, (_, i) => (
                              <SelectItem key={i} value={String(i)}>{String(i).padStart(2, '0')}:00</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium mb-1 block">Nicho (opcional)</label>
                        <Select value={t.niche_id || 'all'} onValueChange={v => updateTemplate(t.id, 'niche_id', v === 'all' ? null : v)}>
                          <SelectTrigger><SelectValue placeholder="Todos os nichos" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todos os nichos</SelectItem>
                            {niches.map(n => (
                              <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-1 block">Nível de Escalonamento</label>
                        <Input
                          type="number"
                          min={1}
                          value={t.escalation_level}
                          onChange={e => updateTemplate(t.id, 'escalation_level', parseInt(e.target.value) || 1)}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-1">
                        <GitBranch className="h-4 w-4 text-primary" /> Fluxo de Automação (contexto para IA)
                      </label>
                      <p className="text-xs text-muted-foreground mb-1.5">
                        Selecione um fluxo para que a IA entenda a jornada do cliente ao gerar o follow-up.
                      </p>
                      <Select value={t.flow_id || 'none'} onValueChange={v => updateTemplate(t.id, 'flow_id', v === 'none' ? null : v)}>
                        <SelectTrigger className="w-full md:w-80">
                          <SelectValue placeholder="Nenhum fluxo (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum fluxo</SelectItem>
                          {flows.map(f => (
                            <SelectItem key={f.id} value={f.id}>{f.name}{f.description ? ` — ${f.description.substring(0, 50)}` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            {templates.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum template de follow-up criado.</p>
                <button onClick={addTemplate} className="mt-3 text-primary underline">Criar primeiro template</button>
              </div>
            )}
          </TabsContent>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-primary/10 rounded-xl">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalSent}</p>
                      <p className="text-sm text-muted-foreground">Follow-ups Enviados</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-green-500/10 rounded-xl">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalResponded}</p>
                      <p className="text-sm text-muted-foreground">Respostas Obtidas</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-accent/20 rounded-xl">
                      <TrendingUp className="h-5 w-5 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{conversionRate}%</p>
                      <p className="text-sm text-muted-foreground">Taxa de Conversão</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-yellow-500/10 rounded-xl">
                      <AlertTriangle className="h-5 w-5 text-yellow-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{pendingCount}</p>
                      <p className="text-sm text-muted-foreground">Pendentes</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Performance por Template</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {templateMetrics.map(tm => (
                    <div key={tm.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Badge variant={tm.escalation_level === 1 ? 'secondary' : tm.escalation_level === 2 ? 'default' : 'destructive'}>
                          Nível {tm.escalation_level}
                        </Badge>
                        <span className="font-medium">{tm.name}</span>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="text-center">
                          <p className="font-bold">{tm.sent}</p>
                          <p className="text-muted-foreground">Enviados</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold text-green-500">{tm.responded}</p>
                          <p className="text-muted-foreground">Respostas</p>
                        </div>
                        <div className="text-center">
                          <p className="font-bold">{tm.rate}%</p>
                          <p className="text-muted-foreground">Conversão</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {templateMetrics.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">Crie templates para ver métricas.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  {executions.slice(0, 50).map(e => {
                    const tmpl = templates.find(t => t.id === e.template_id);
                    const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
                      pending: { icon: Clock, color: 'text-yellow-500', label: 'Pendente' },
                      sent: { icon: ArrowUpRight, color: 'text-blue-500', label: 'Enviado' },
                      responded: { icon: CheckCircle, color: 'text-green-500', label: 'Respondido' },
                      expired: { icon: XCircle, color: 'text-muted-foreground', label: 'Expirado' },
                    };
                    const sc = statusConfig[e.status] || statusConfig.pending;
                    const StatusIcon = sc.icon;

                    return (
                      <div key={e.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <StatusIcon className={`h-4 w-4 ${sc.color}`} />
                          <div>
                            <p className="text-sm font-medium">{tmpl?.name || 'Template removido'}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-md">{e.message_sent}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <Badge variant="outline">{sc.label}</Badge>
                          <span>Tentativa {e.attempt_number}</span>
                          <span>{new Date(e.created_at).toLocaleString('pt-BR')}</span>
                        </div>
                      </div>
                    );
                  })}
                  {executions.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">Nenhum follow-up executado ainda.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
