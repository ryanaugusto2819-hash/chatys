import { useEffect, useMemo, useState } from 'react';
import {
  Bot, BrainCircuit, CheckCircle2, CircleDashed, GitBranch, Headphones,
  Loader2, Megaphone, PackageCheck, Play, Save, ShieldCheck, ShoppingBag,
} from 'lucide-react';
import TopBar from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type AgentKey = 'orchestrator' | 'flow_selector' | 'support' | 'post_sale' | 'upsell' | 'remarketing' | 'supervisor';
type AgentConfig = {
  id?: string;
  agent_key: AgentKey;
  enabled: boolean;
  operation_mode: 'test' | 'live';
  priority: number;
  instructions: string;
  entry_criteria: unknown[];
  blocking_rules: unknown[];
};
type Conversation = { id: string; contact_name: string | null; contact_phone: string; funnel_stage: string | null; updated_at: string };
type Decision = {
  id: string; selected_agent: string; action: string; reason: string; confidence: number;
  blockers: string[]; operation_mode: string; status: string; created_at: string;
  conversations?: { contact_name?: string | null; contact_phone?: string } | null;
};

const DEFAULT_ORCHESTRATOR = `Analise o contexto completo antes de escolher um Atendente de IA.
Priorize segurança e precisão. Quando houver dúvida, não acione ninguém.
Nunca permita duas IAs responderem à mesma mensagem.
Respeite a etapa atual do lead, as etiquetas e o histórico de ações.`;

const AGENTS: Array<{ key: AgentKey; name: string; short: string; icon: typeof Bot }> = [
  { key: 'orchestrator', name: 'IA Orquestradora', short: 'Decide qual único Atendente pode agir. Nunca responde ao lead.', icon: BrainCircuit },
  { key: 'flow_selector', name: 'IA Seletora de Fluxo', short: 'Escolhe a etapa ou fluxo pronto correto para o momento.', icon: GitBranch },
  { key: 'support', name: 'IA de Atendimento', short: 'Responde dúvidas sobre produto, pagamento, envio e prazo.', icon: Headphones },
  { key: 'post_sale', name: 'IA Pós-venda', short: 'Acompanha uso, entrega, satisfação e suporte após a compra.', icon: PackageCheck },
  { key: 'upsell', name: 'IA Upsell', short: 'Oferece uma nova oferta a clientes elegíveis após o pagamento.', icon: ShoppingBag },
  { key: 'remarketing', name: 'IA Remarketing', short: 'Reengaja leads inativos ou que abandonaram o pagamento.', icon: Megaphone },
  { key: 'supervisor', name: 'IA Supervisora', short: 'Avalia qualidade e precisão sem conversar com o lead.', icon: ShieldCheck },
];

const AGENT_LABELS = Object.fromEntries(AGENTS.map((agent) => [agent.key, agent.name]));
const defaults = (): AgentConfig[] => AGENTS.map((agent, index) => ({
  agent_key: agent.key,
  enabled: agent.key === 'orchestrator',
  operation_mode: 'test',
  priority: index * 10 + 10,
  instructions: agent.key === 'orchestrator' ? DEFAULT_ORCHESTRATOR : '',
  entry_criteria: [],
  blocking_rules: [],
}));

export default function AiOrchestration() {
  const { currentWorkspace } = useWorkspace();
  const [configs, setConfigs] = useState<AgentConfig[]>(defaults);
  const [selectedKey, setSelectedKey] = useState<AgentKey>('orchestrator');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const selected = configs.find((config) => config.agent_key === selectedKey) ?? configs[0];

  const loadData = async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    const [configsResult, conversationsResult, decisionsResult] = await Promise.all([
      supabase.from('ai_agent_configs').select('*').eq('workspace_id', currentWorkspace.id).is('niche_id', null),
      supabase.from('conversations').select('id, contact_name, contact_phone, funnel_stage, updated_at').eq('workspace_id', currentWorkspace.id).order('updated_at', { ascending: false }).limit(50),
      supabase.from('ai_orchestration_decisions').select('id, selected_agent, action, reason, confidence, blockers, operation_mode, status, created_at, conversations(contact_name, contact_phone)').eq('workspace_id', currentWorkspace.id).order('created_at', { ascending: false }).limit(30),
    ]);

    if (configsResult.error) toast.error('Não foi possível carregar os Atendentes de IA');
    const stored = (configsResult.data || []) as unknown as AgentConfig[];
    setConfigs(defaults().map((fallback) => stored.find((item) => item.agent_key === fallback.agent_key) ?? fallback));
    setConversations((conversationsResult.data || []) as Conversation[]);
    setDecisions((decisionsResult.data || []) as unknown as Decision[]);
    if (conversationsResult.data?.[0]) setConversationId(conversationsResult.data[0].id);
    setLoading(false);
  };

  useEffect(() => { void loadData(); }, [currentWorkspace?.id]);

  const updateSelected = (patch: Partial<AgentConfig>) => {
    setConfigs((current) => current.map((config) => config.agent_key === selectedKey ? { ...config, ...patch } : config));
  };

  const saveConfig = async () => {
    if (!currentWorkspace?.id || !selected) return;
    setSaving(true);
    const payload = {
      workspace_id: currentWorkspace.id,
      niche_id: null,
      agent_key: selected.agent_key,
      enabled: selected.enabled,
      operation_mode: selected.agent_key === 'orchestrator' ? selected.operation_mode : 'test',
      priority: selected.priority,
      instructions: selected.instructions,
      entry_criteria: selected.entry_criteria,
      blocking_rules: selected.blocking_rules,
    };
    const result = selected.id
      ? await supabase.from('ai_agent_configs').update(payload).eq('id', selected.id).select().single()
      : await supabase.from('ai_agent_configs').insert(payload).select().single();
    setSaving(false);
    if (result.error) { toast.error(result.error.message); return; }
    setConfigs((current) => current.map((config) => config.agent_key === selectedKey ? result.data as unknown as AgentConfig : config));
    toast.success(`${AGENT_LABELS[selectedKey]} salva`);
  };

  const testOrchestrator = async () => {
    if (!currentWorkspace?.id || !conversationId) return;
    const orchestrator = configs.find((config) => config.agent_key === 'orchestrator');
    if (!orchestrator?.id) {
      toast.error('Salve a Orquestradora antes de testar');
      return;
    }
    if (!orchestrator.enabled) {
      toast.error('Ative a Orquestradora antes de testar');
      return;
    }
    setTesting(true);
    const { data, error } = await supabase.functions.invoke('ai-orchestrator', { body: { workspaceId: currentWorkspace.id, conversationId } });
    setTesting(false);
    if (error || data?.error) { toast.error(data?.error || error?.message || 'Falha no teste'); return; }
    if (data?.skipped) { toast.info(data.reason); return; }
    toast.success('Decisão registrada sem enviar mensagem ao lead');
    await loadData();
  };

  const activeCount = useMemo(() => configs.filter((config) => config.enabled).length, [configs]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <TopBar title="Central Inteligente de IAs" subtitle="Uma decisão central, um único Atendente por vez" />
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <section className="border-b border-border pb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2"><Badge>Modo seguro</Badge><span className="text-xs text-muted-foreground">{activeCount} de 7 ativos</span></div>
              <h2 className="text-2xl font-semibold text-foreground">Comando central do atendimento</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">A Orquestradora analisa o contexto e escolhe uma única função. No modo de teste, nenhuma mensagem ou fluxo é enviado.</p>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-success" />
              <div><p className="text-sm font-medium text-foreground">Proteção contra conflitos</p><p className="text-xs text-muted-foreground">Uma decisão por mensagem</p></div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-2">
            {AGENTS.map((agent) => {
              const config = configs.find((item) => item.agent_key === agent.key);
              const Icon = agent.icon;
              const active = selectedKey === agent.key;
              return (
                <Button key={agent.key} type="button" variant="ghost" onClick={() => setSelectedKey(agent.key)} className={`h-auto w-full justify-start gap-3 border p-3 text-left ${active ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border hover:bg-card'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{agent.name}</span><span className="block truncate text-xs font-normal text-muted-foreground">{config?.enabled ? (config.operation_mode === 'test' ? 'Ativa em teste' : 'Ativa') : 'Aguardando configuração'}</span></span>
                  {config?.enabled ? <CheckCircle2 className="h-4 w-4 text-success" /> : <CircleDashed className="h-4 w-4 text-muted-foreground" />}
                </Button>
              );
            })}
          </aside>

          <main className="min-w-0 space-y-6">
            <section className="rounded-md border border-border bg-card p-5 md:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">{(() => { const Icon = AGENTS.find((agent) => agent.key === selectedKey)?.icon ?? Bot; return <Icon className="h-5 w-5" />; })()}</span>
                  <div><h3 className="text-lg font-semibold text-foreground">{AGENT_LABELS[selectedKey]}</h3><p className="text-sm text-muted-foreground">{AGENTS.find((agent) => agent.key === selectedKey)?.short}</p></div>
                </div>
                <div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">{selected?.enabled ? 'Ativa' : 'Desativada'}</span><Switch checked={selected?.enabled ?? false} onCheckedChange={(enabled) => updateSelected({ enabled })} /></div>
              </div>

              {selectedKey !== 'orchestrator' && (
                <div className="mt-5 rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">Esta função está pronta para receber suas regras. Deixe desativada até configurarmos juntos.</div>
              )}

              <div className="mt-6 space-y-2">
                <label className="text-sm font-medium text-foreground">Comportamento e instruções</label>
                <Textarea value={selected?.instructions ?? ''} onChange={(event) => updateSelected({ instructions: event.target.value })} rows={selectedKey === 'orchestrator' ? 9 : 7} placeholder="Escreva como esta IA deve decidir, quando pode agir e quando deve parar..." />
                <p className="text-xs text-muted-foreground">Estas regras ficam separadas das regras das outras IAs.</p>
              </div>

              {selectedKey === 'orchestrator' && (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div><label className="mb-2 block text-sm font-medium text-foreground">Modo de operação</label><Select value={selected.operation_mode} onValueChange={(value: 'test' | 'live') => updateSelected({ operation_mode: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="test">Teste — não envia nada</SelectItem><SelectItem value="live" disabled>Ao vivo — liberar depois</SelectItem></SelectContent></Select></div>
                  <div className="rounded-md border border-border bg-muted/30 p-3"><p className="text-sm font-medium text-foreground">Prioridade máxima</p><p className="mt-1 text-xs text-muted-foreground">As regras fixas de pagamento, duplicidade e exclusão mútua são aplicadas antes da decisão da IA.</p></div>
                </div>
              )}

              <div className="mt-6 flex justify-end"><Button onClick={saveConfig} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salvar configuração</Button></div>
            </section>

            {selectedKey === 'orchestrator' && (
              <section className="rounded-md border border-border bg-card p-5 md:p-6">
                <div className="mb-4"><h3 className="font-semibold text-foreground">Testar decisão</h3><p className="text-sm text-muted-foreground">Escolha uma conversa recente. O teste apenas registra qual IA seria escolhida.</p></div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Select value={conversationId} onValueChange={setConversationId}><SelectTrigger className="flex-1"><SelectValue placeholder="Escolha uma conversa" /></SelectTrigger><SelectContent>{conversations.map((conversation) => <SelectItem key={conversation.id} value={conversation.id}>{conversation.contact_name || conversation.contact_phone} · {conversation.funnel_stage || 'Sem etapa'}</SelectItem>)}</SelectContent></Select>
                  <Button onClick={testOrchestrator} disabled={!conversationId || testing}>{testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}Testar sem enviar</Button>
                </div>
              </section>
            )}
          </main>
        </div>

        <section className="border-t border-border pt-6">
          <div className="mb-4"><h3 className="font-semibold text-foreground">Histórico de decisões</h3><p className="text-sm text-muted-foreground">Motivo, confiança e bloqueios usados pela Orquestradora.</p></div>
          {decisions.length === 0 ? <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">Nenhuma decisão registrada ainda.</div> : <div className="overflow-hidden rounded-md border border-border bg-card">{decisions.map((decision) => <div key={decision.id} className="grid gap-3 border-b border-border p-4 last:border-0 md:grid-cols-[180px_160px_1fr_90px] md:items-center"><div><p className="text-sm font-medium text-foreground">{decision.conversations?.contact_name || decision.conversations?.contact_phone || 'Conversa'}</p><p className="text-xs text-muted-foreground">{new Date(decision.created_at).toLocaleString('pt-BR')}</p></div><div><Badge variant={decision.selected_agent === 'none' ? 'secondary' : 'default'}>{AGENT_LABELS[decision.selected_agent] || 'Nenhuma ação'}</Badge><p className="mt-1 text-xs text-muted-foreground">{decision.action === 'recommend_only' ? 'Somente recomendação' : decision.action}</p></div><div><p className="text-sm text-foreground">{decision.reason}</p>{decision.blockers?.length > 0 && <p className="mt-1 text-xs text-destructive">{decision.blockers.join(' · ')}</p>}</div><div className="text-right"><p className="text-sm font-semibold text-foreground">{Math.round(Number(decision.confidence) * 100)}%</p><p className="text-xs text-muted-foreground">confiança</p></div></div>)}</div>}
        </section>
      </div>
    </div>
  );
}
