import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Clock, Plus, Trash2, Save, Loader2, Play,
  MessageSquare, CheckCircle, XCircle, AlertTriangle,
  TrendingUp, Timer, Target, Zap, ArrowUpRight, BarChart3, Filter, ExternalLink, ImagePlus, X, GitBranch,
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

const STAGE_COLORS = [
  'bg-blue-500/10 text-blue-500',
  'bg-yellow-500/10 text-yellow-500',
  'bg-orange-500/10 text-orange-500',
  'bg-green-500/10 text-green-500',
  'bg-purple-500/10 text-purple-500',
  'bg-pink-500/10 text-pink-500',
];

interface FunnelStage {
  id: string;
  stage_key: string;
  label: string;
  description: string;
  strategy: string;
  sort_order: number;
  niche_id: string;
}

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
  funnel_stage: string;
  trigger_condition: string;
  image_url: string | null;
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

interface NicheFollowUpsProps {
  nicheId: string;
}

export default function NicheFollowUps({ nicheId }: NicheFollowUpsProps) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<FollowUpTemplate[]>([]);
  const [executions, setExecutions] = useState<FollowUpExecution[]>([]);
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageDesc, setNewStageDesc] = useState('');
  const [newStageStrategy, setNewStageStrategy] = useState('');

  useEffect(() => {
    fetchAll();
  }, [nicheId]);

  const fetchAll = async () => {
    setLoading(true);
    const [tRes, eRes, sRes, fRes] = await Promise.all([
      supabase.from('follow_up_templates').select('*').eq('niche_id', nicheId).order('escalation_level'),
      supabase.from('follow_up_executions').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('niche_funnel_stages').select('*').eq('niche_id', nicheId).order('sort_order'),
      supabase.from('automation_flows').select('id, name, description').order('name'),
    ]);
    const tplList = (tRes.data || []) as unknown as FollowUpTemplate[];
    setTemplates(tplList);
    setStages((sRes.data || []) as FunnelStage[]);
    setFlows((fRes.data || []) as AutomationFlow[]);
    const tplIds = new Set(tplList.map(t => t.id));
    setExecutions(((eRes.data || []) as FollowUpExecution[]).filter(e => tplIds.has(e.template_id)));
    setLoading(false);
  };

  const addStage = async () => {
    if (!newStageName.trim()) return;
    const stageKey = `stage_${Date.now()}`;
    const { data, error } = await supabase.from('niche_funnel_stages').insert({
      niche_id: nicheId,
      stage_key: stageKey,
      label: newStageName.trim(),
      description: newStageDesc.trim(),
      strategy: newStageStrategy.trim(),
      sort_order: stages.length + 1,
    }).select().single();
    if (error) { toast.error('Erro ao criar etapa'); return; }
    setStages(prev => [...prev, data as FunnelStage]);
    setNewStageName('');
    setNewStageDesc('');
    setNewStageStrategy('');
    toast.success('Etapa criada!');
  };

  const deleteStage = async (id: string) => {
    await supabase.from('niche_funnel_stages').delete().eq('id', id);
    setStages(prev => prev.filter(s => s.id !== id));
    toast.success('Etapa removida');
  };

  const addTemplate = async (stage: string = 'all') => {
    const newLevel = templates.length + 1;
    const stageInfo = stages.find(s => s.stage_key === stage);
    const newTemplate: FollowUpTemplate = {
      id: crypto.randomUUID(),
      name: `Follow-up ${stageInfo?.label || 'Nível ' + newLevel}`,
      objective: '',
      message_template: '',
      escalation_level: newLevel,
      max_attempts: 2,
      delay_hours: 24,
      active_hours_start: 8,
      active_hours_end: 20,
      is_active: true,
      niche_id: nicheId,
      sort_order: newLevel,
      funnel_stage: stage,
      trigger_condition: '',
      image_url: null,
      flow_id: null,
    };
    setTemplates(prev => [...prev, newTemplate]);
    const { id, ...data } = newTemplate;
    await supabase.from('follow_up_templates').upsert({ id, ...data, niche_id: nicheId });
  };

  const saveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const autoSaveTemplate = useCallback(async (template: FollowUpTemplate) => {
    const { id, ...data } = template;
    const { error } = await supabase.from('follow_up_templates').upsert({ id, ...data, niche_id: nicheId });
    if (error) {
      console.error('Auto-save error:', error);
    }
  }, [nicheId]);

  const updateTemplate = (id: string, field: keyof FollowUpTemplate, value: unknown) => {
    setTemplates(prev => {
      const updated = prev.map(t => t.id === id ? { ...t, [field]: value } : t);
      const template = updated.find(t => t.id === id);
      if (template) {
        if (saveTimerRef.current[id]) clearTimeout(saveTimerRef.current[id]);
        saveTimerRef.current[id] = setTimeout(() => {
          autoSaveTemplate(template);
        }, 1000);
      }
      return updated;
    });
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
      const { error } = await supabase.from('follow_up_templates').upsert({ id, ...data, niche_id: nicheId });
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const { data, error } = await supabase.functions.invoke('ai-follow-up', {
        body: {},
      });
      clearTimeout(timeoutId);
      if (error) throw error;
      toast.success(`Follow-ups processados: ${data?.processed || 0} enviados`);
      fetchAll();
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.message?.includes('timeout')) {
        toast.info('A execução está em andamento no servidor. Os resultados aparecerão no histórico em breve.');
        setTimeout(() => fetchAll(), 10000);
      } else {
        toast.error(`Erro ao executar follow-ups: ${e?.message || 'erro desconhecido'}`);
        console.error(e);
      }
    }
    setRunning(false);
  };

  const totalSent = executions.filter(e => e.status === 'sent' || e.status === 'responded').length;
  const totalResponded = executions.filter(e => e.status === 'responded').length;
  const conversionRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;
  const pendingCount = executions.filter(e => e.status === 'pending').length;

  const templateMetrics = templates.map(t => {
    const tExecs = executions.filter(e => e.template_id === t.id);
    const sent = tExecs.filter(e => e.status === 'sent' || e.status === 'responded').length;
    const responded = tExecs.filter(e => e.status === 'responded').length;
    return { ...t, sent, responded, rate: sent > 0 ? Math.round((responded / sent) * 100) : 0 };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <Tabs defaultValue="templates" className="w-full">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="templates">
              <MessageSquare className="h-4 w-4 mr-2" /> Templates
            </TabsTrigger>
            <TabsTrigger value="dashboard">
              <BarChart3 className="h-4 w-4 mr-2" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="history">
              <Clock className="h-4 w-4 mr-2" /> Histórico
            </TabsTrigger>
          </TabsList>
          <button
            onClick={runNow}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:opacity-90 transition-opacity text-sm"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Executar Agora
          </button>
        </div>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Configure follow-ups específicos para cada etapa do funil.
            </p>
            <div className="flex gap-2">
              <button onClick={() => addTemplate()} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm">
                <Plus className="h-4 w-4" /> Novo Follow-up
              </button>
              <button onClick={saveTemplates} disabled={saving} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </div>

          {/* Funnel stages management */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> Etapas do Funil deste Nicho
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stages.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {stages.map((stage, idx) => {
                    const count = templates.filter(t => t.funnel_stage === stage.stage_key).length;
                    const color = STAGE_COLORS[idx % STAGE_COLORS.length];
                    return (
                      <div key={stage.id} className="p-3 rounded-lg border border-border/50 text-left group relative">
                        <button
                          onClick={() => deleteStage(stage.id)}
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 text-destructive hover:bg-destructive/10 rounded transition-all"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                        <div className="flex items-center justify-between mb-1">
                          <Badge className={color} variant="outline">{stage.label}</Badge>
                          <span className="text-xs text-muted-foreground">{count} template{count !== 1 ? 's' : ''}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{stage.description}</p>
                        <button
                          onClick={() => addTemplate(stage.stage_key)}
                          className="mt-2 text-[10px] text-primary hover:underline"
                        >
                          + Criar follow-up para esta etapa
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Nova Etapa</label>
                  <Input
                    value={newStageName}
                    onChange={e => setNewStageName(e.target.value)}
                    placeholder="Ex: Recebeu Preços"
                    className="h-9"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Descrição</label>
                  <Input
                    value={newStageDesc}
                    onChange={e => setNewStageDesc(e.target.value)}
                    placeholder="Ex: Lead recebeu tabela de preços"
                    className="h-9"
                  />
                </div>
                <button onClick={addStage} className="h-9 px-3 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {stages.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Nenhuma etapa criada. Adicione etapas para segmentar os follow-ups.
                </p>
              )}
            </CardContent>
          </Card>

          {templates.map((t, i) => {
            const stageIdx = stages.findIndex(s => s.stage_key === t.funnel_stage);
            const stageInfo = stages.find(s => s.stage_key === t.funnel_stage);
            const stageColor = stageIdx >= 0 ? STAGE_COLORS[stageIdx % STAGE_COLORS.length] : 'bg-primary/10 text-primary';
            const stageLabel = stageInfo?.label || (t.funnel_stage === 'all' ? 'Todas' : t.funnel_stage);
            return (
            <motion.div key={t.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className={`border ${t.is_active ? 'border-primary/30' : 'border-muted opacity-60'}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge className={stageColor} variant="outline">
                        <Filter className="h-3 w-3 mr-1" />
                        {stageLabel}
                      </Badge>
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
                        <Switch checked={t.is_active} onCheckedChange={v => updateTemplate(t.id, 'is_active', v)} />
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-1">
                        <Filter className="h-4 w-4 text-primary" /> Etapa do Funil
                      </label>
                      <Select value={t.funnel_stage} onValueChange={v => updateTemplate(t.id, 'funnel_stage', v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as etapas</SelectItem>
                          {stages.map(s => (
                            <SelectItem key={s.stage_key} value={s.stage_key}>{s.label} — {s.description}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-1">
                        <GitBranch className="h-4 w-4 text-primary" /> Fluxo de Automação (contexto para IA)
                      </label>
                      <p className="text-[11px] text-muted-foreground mb-1.5">
                        A IA receberá o fluxo como contexto para entender a jornada do cliente.
                      </p>
                      <Select value={t.flow_id || 'none'} onValueChange={v => updateTemplate(t.id, 'flow_id', v === 'none' ? null : v)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Nenhum fluxo (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum fluxo</SelectItem>
                          {flows.map(f => (
                            <SelectItem key={f.id} value={f.id}>{f.name}{f.description ? ` — ${f.description.substring(0, 40)}` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-primary" /> Objetivo & Instruções para a IA
                    </label>
                    <p className="text-[11px] text-muted-foreground mb-1.5">
                      Descreva o objetivo do follow-up e dê contexto e instruções para a IA gerar a mensagem. Quanto mais detalhes, melhor a mensagem gerada.
                    </p>
                    <Textarea
                      value={t.objective}
                      onChange={e => updateTemplate(t.id, 'objective', e.target.value)}
                      placeholder="Ex: Cobrar o pagamento da receita que eu enviei para ele. O Valor da Receita é de R$19.90. Eu já enviei todas as informações de pagamento para ele. Seja direto mas educado, mencione o valor e pergunte se precisa de ajuda."
                      rows={4}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium flex items-center gap-2 mb-1">
                      <MessageSquare className="h-4 w-4 text-primary" /> Modelo de Mensagem
                    </label>
                    <Textarea
                      value={t.message_template}
                      onChange={e => updateTemplate(t.id, 'message_template', e.target.value)}
                      placeholder="Ex: Oi {nome}, vi que você se interessou pelo {produto}..."
                      rows={3}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium flex items-center gap-2 mb-1">
                      <ImagePlus className="h-4 w-4 text-primary" /> Imagem do Follow-up (opcional)
                    </label>
                    <p className="text-[11px] text-muted-foreground mb-1.5">
                      Anexe uma imagem que será enviada junto com a mensagem de follow-up. A mensagem da IA será usada como legenda.
                    </p>
                    {t.image_url ? (
                      <div className="relative inline-block">
                        <img src={t.image_url} alt="Follow-up" className="max-h-32 rounded-lg border border-border" />
                        <button
                          onClick={() => updateTemplate(t.id, 'image_url', null)}
                          className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:opacity-90"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary/50 transition-colors">
                        <ImagePlus className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Clique para anexar uma imagem</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const ext = file.name.split('.').pop() || 'jpg';
                            const path = `${nicheId}/${t.id}_${Date.now()}.${ext}`;
                            const { data: uploadData, error: uploadError } = await supabase.storage
                              .from('follow-up-images')
                              .upload(path, file, { upsert: true });
                            if (uploadError) {
                              toast.error('Erro ao enviar imagem');
                              console.error(uploadError);
                              return;
                            }
                            const { data: urlData } = supabase.storage
                              .from('follow-up-images')
                              .getPublicUrl(uploadData.path);
                            updateTemplate(t.id, 'image_url', urlData.publicUrl);
                            toast.success('Imagem anexada!');
                            toast.success('Imagem anexada!');
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-1">
                        <Timer className="h-4 w-4 text-primary" /> Atraso entre Follow-ups
                      </label>
                      <div className="flex items-center gap-2">
                        <Input type="number" min={1} value={t.delay_hours} onChange={e => updateTemplate(t.id, 'delay_hours', parseInt(e.target.value) || 1)} />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">horas</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-1">
                        <ArrowUpRight className="h-4 w-4 text-primary" /> Quantos Follow-ups
                      </label>
                      <Input type="number" min={1} max={10} value={t.max_attempts} onChange={e => updateTemplate(t.id, 'max_attempts', parseInt(e.target.value) || 1)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-primary" /> Horário Início
                      </label>
                      <div className="flex items-center gap-2">
                        <Input type="number" min={0} max={23} value={t.active_hours_start} onChange={e => updateTemplate(t.id, 'active_hours_start', parseInt(e.target.value) || 0)} />
                        <span className="text-xs text-muted-foreground">h</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-primary" /> Horário Fim
                      </label>
                      <div className="flex items-center gap-2">
                        <Input type="number" min={0} max={23} value={t.active_hours_end} onChange={e => updateTemplate(t.id, 'active_hours_end', parseInt(e.target.value) || 23)} />
                        <span className="text-xs text-muted-foreground">h</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )})}

          {templates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum template de follow-up para este nicho.</p>
              <p className="text-sm mt-1">Clique em uma etapa do funil acima para criar um template específico.</p>
              <button onClick={() => addTemplate()} className="mt-3 text-primary underline">Ou crie um template genérico</button>
            </div>
          )}
        </TabsContent>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-primary/10 rounded-xl"><MessageSquare className="h-5 w-5 text-primary" /></div>
                  <div><p className="text-2xl font-bold">{totalSent}</p><p className="text-sm text-muted-foreground">Enviados</p></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-500/10 rounded-xl"><CheckCircle className="h-5 w-5 text-green-500" /></div>
                  <div><p className="text-2xl font-bold">{totalResponded}</p><p className="text-sm text-muted-foreground">Respostas</p></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-accent/20 rounded-xl"><TrendingUp className="h-5 w-5 text-accent-foreground" /></div>
                  <div><p className="text-2xl font-bold">{conversionRate}%</p><p className="text-sm text-muted-foreground">Conversão</p></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-yellow-500/10 rounded-xl"><AlertTriangle className="h-5 w-5 text-yellow-500" /></div>
                  <div><p className="text-2xl font-bold">{pendingCount}</p><p className="text-sm text-muted-foreground">Pendentes</p></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-lg">Performance por Template</CardTitle></CardHeader>
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
                      <div className="text-center"><p className="font-bold">{tm.sent}</p><p className="text-muted-foreground">Enviados</p></div>
                      <div className="text-center"><p className="font-bold text-green-500">{tm.responded}</p><p className="text-muted-foreground">Respostas</p></div>
                      <div className="text-center"><p className="font-bold">{tm.rate}%</p><p className="text-muted-foreground">Conversão</p></div>
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
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <Badge variant="outline">{sc.label}</Badge>
                        <span>Tentativa {e.attempt_number}</span>
                        <span>{new Date(e.created_at).toLocaleString('pt-BR')}</span>
                        <button
                          onClick={() => navigate(`/conversations/${e.conversation_id}`)}
                          className="p-1 rounded hover:bg-accent transition-colors"
                          title="Abrir conversa"
                        >
                          <ExternalLink className="h-4 w-4 text-primary" />
                        </button>
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
    </motion.div>
  );
}
