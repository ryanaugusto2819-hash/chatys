import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen, Bot, BrainCircuit, CheckCircle2, CircleDashed, DollarSign, GitBranch, Headphones,
  Check, ChevronsUpDown, ChevronDown, ChevronUp, Clock3, History, Link2, Loader2, Megaphone, MessageCircle, MessageSquareText, PackageCheck, Play, Plus, Save, Search, ShieldCheck, ShoppingBag, Trash2,
} from 'lucide-react';
import TopBar from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { MediaImage } from '@/components/chat/MediaUrl';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';

type AgentKey = 'orchestrator' | 'flow_selector' | 'support' | 'payment' | 'trained_messages' | 'post_sale' | 'upsell' | 'remarketing' | 'supervisor';
type AgentConfig = {
  id?: string;
  agent_key: AgentKey;
  enabled: boolean;
  operation_mode: 'test' | 'live';
  priority: number;
  instructions: string;
  entry_criteria: Json;
  blocking_rules: Json;
};
type Conversation = { id: string; contact_name: string | null; contact_phone: string; funnel_stage: string | null; updated_at: string };
type Connection = { id: string; label: string; connection_id: string; status: string; is_connected: boolean };
type Flow = { id: string; name: string; description: string | null; is_active: boolean; manual_only: boolean };
type AgentFlow = { flow_id: string; send_when: string; do_not_send_when: string; trigger_examples: string; analyze_flow_content: boolean };
type SupportFaq = { question: string; answer: string };
type WorkspaceTag = { id: string; name: string; color: string };
type PaymentRules = { payment_information: string; receipt_flow_id: string; prices: Array<{ quantity: number; amount: number }> };
type TrainingQueueItem = {
  id: string; conversation_id: string; source_message_id: string; customer_message: string; message_type: string;
  status: string; confidence: number; match_reason: string; suggested_response: string | null;
  suggested_responses: Json;
  detected_country_code?: CountryCode | null;
  suggested_action?: string | null; suggested_action_type?: string | null; processed_at?: string | null;
  suggested_flow_id?: string | null;
  context_snapshot: Json; created_at: string;
  conversations?: { contact_name?: string | null; contact_phone?: string } | null;
  messages?: { media_url?: string | null } | null;
};
type TrainedRule = {
  id: string; example_message: string; context_notes: string; expected_action: string;
  action_observation: string;
  action_type: TrainingActionType; official_response: string;
  response_messages: Json;
  flow_id: string | null;
  required_tag_ids: string[]; excluded_tag_ids: string[];
  requires_no_tags: boolean;
  country_code: CountryFilter;
  active: boolean; updated_at: string;
};
type TrainingActionType = 'reply' | 'flow' | 'reply_then_flow' | 'no_response' | 'wait' | 'route' | 'other';
type TrainingView = 'waiting' | 'responses' | 'history';
type CountryCode = 'MX' | 'UY' | 'AR';
type CountryFilter = CountryCode | 'any';
type Decision = {
  id: string; selected_agent: string; action: string; reason: string; confidence: number;
  blockers: string[]; operation_mode: string; status: string; created_at: string;
  conversations?: { contact_name?: string | null; contact_phone?: string } | null;
};

const DEFAULT_ORCHESTRATOR = `Analise o contexto completo antes de escolher um Atendente de IA.
Priorize segurança e precisão. Quando houver dúvida, não acione ninguém.
Nunca permita duas IAs responderem à mesma mensagem.
Respeite a etapa atual do lead, as etiquetas e o histórico de ações.`;

function FlowSearchSelect({ flows, value, onChange, disabled = false }: { flows: Flow[]; value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const selected = flows.find((flow) => flow.id === value);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal"><span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected?.name || 'Selecione um fluxo'}</span><ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start"><Command><CommandInput placeholder="Digite o nome do fluxo..." /><CommandList><CommandEmpty>Nenhum fluxo encontrado.</CommandEmpty><CommandGroup><CommandItem value="limpar seleção nenhum fluxo" onSelect={() => { onChange(null); setOpen(false); }}><Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />Selecione um fluxo</CommandItem>{flows.map((flow) => { const unavailable = !flow.is_active || flow.manual_only; return <CommandItem key={flow.id} value={`${flow.name} ${!flow.is_active ? 'pausado' : flow.manual_only ? 'somente manual' : ''}`} disabled={unavailable} onSelect={() => { onChange(flow.id); setOpen(false); }}><Check className={cn('mr-2 h-4 w-4', value === flow.id ? 'opacity-100' : 'opacity-0')} /><span className="truncate">{flow.name}{!flow.is_active ? ' — pausado' : flow.manual_only ? ' — somente manual' : ''}</span></CommandItem>; })}</CommandGroup></CommandList></Command></PopoverContent></Popover>;
}

const AGENTS: Array<{ key: AgentKey; name: string; short: string; icon: typeof Bot }> = [
  { key: 'orchestrator', name: 'IA Orquestradora', short: 'Decide qual único Atendente pode agir. Nunca responde ao lead.', icon: BrainCircuit },
  { key: 'flow_selector', name: 'IA Seletora de Fluxo', short: 'Escolhe a etapa ou fluxo pronto correto para o momento.', icon: GitBranch },
  { key: 'support', name: 'IA de Atendimento', short: 'Responde dúvidas sobre produto, pagamento, envio e prazo.', icon: Headphones },
  { key: 'payment', name: 'IA de Pagamento', short: 'Orienta o pagamento, prepara OXXO e reconhece possíveis comprovantes.', icon: DollarSign },
  { key: 'trained_messages', name: 'IA de Mensagens Treinadas', short: 'Escolhe uma resposta pronta pelo significado e envia o texto sem alterações.', icon: MessageSquareText },
  { key: 'post_sale', name: 'IA Pós-venda', short: 'Acompanha uso, entrega, satisfação e suporte após a compra.', icon: PackageCheck },
  { key: 'upsell', name: 'IA Upsell', short: 'Oferece uma nova oferta a clientes elegíveis após o pagamento.', icon: ShoppingBag },
  { key: 'remarketing', name: 'IA Remarketing', short: 'Reengaja leads inativos ou que abandonaram o pagamento.', icon: Megaphone },
  { key: 'supervisor', name: 'IA Supervisora', short: 'Avalia qualidade e precisão sem conversar com o lead.', icon: ShieldCheck },
];

const AGENT_LABELS = Object.fromEntries(AGENTS.map((agent) => [agent.key, agent.name]));
const TRAINING_CONTEXTS = ['Sem etiqueta', 'Etapa 1', 'Etapa 2', 'Pago', 'Pós-venda'] as const;
const TRAINING_COUNTRIES: Array<{ code: CountryFilter; label: string; ddi: string }> = [
  { code: 'any', label: 'Qualquer país', ddi: '' },
  { code: 'MX', label: 'México', ddi: '+52' },
  { code: 'UY', label: 'Uruguai', ddi: '+598' },
  { code: 'AR', label: 'Argentina', ddi: '+54' },
];
type TrainingContext = typeof TRAINING_CONTEXTS[number];
type TaggedTrainingContext = Exclude<TrainingContext, 'Sem etiqueta'>;
const defaults = (): AgentConfig[] => AGENTS.map((agent, index) => ({
  agent_key: agent.key,
  enabled: agent.key === 'orchestrator',
  operation_mode: 'test',
  priority: index * 10 + 10,
  instructions: agent.key === 'orchestrator' ? DEFAULT_ORCHESTRATOR : '',
  entry_criteria: [],
  blocking_rules: [],
}));

const readPaymentRules = (value: Json): PaymentRules => {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, Json | undefined> : {};
  const prices = Array.isArray(raw.prices) ? raw.prices.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, Json | undefined>;
    const quantity = Number(row.quantity);
    const amount = Number(row.amount);
    return Number.isFinite(quantity) && Number.isFinite(amount) ? [{ quantity, amount }] : [];
  }) : [];
  return {
    payment_information: typeof raw.payment_information === 'string' ? raw.payment_information : '',
    receipt_flow_id: typeof raw.receipt_flow_id === 'string' ? raw.receipt_flow_id : '',
    prices,
  };
};

export default function AiOrchestration({
  initialAgentKey = 'orchestrator',
  standalone = false,
}: {
  initialAgentKey?: AgentKey;
  standalone?: boolean;
}) {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<AgentConfig[]>(defaults);
  const [selectedKey, setSelectedKey] = useState<AgentKey>(initialAgentKey);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [connectionSelections, setConnectionSelections] = useState<Record<AgentKey, string[]>>({} as Record<AgentKey, string[]>);
  const [flowSelections, setFlowSelections] = useState<AgentFlow[]>([]);
  const [supportFaqs, setSupportFaqs] = useState<SupportFaq[]>([]);
  const [trainingQueue, setTrainingQueue] = useState<TrainingQueueItem[]>([]);
  const [trainedRules, setTrainedRules] = useState<TrainedRule[]>([]);
  const [workspaceTags, setWorkspaceTags] = useState<WorkspaceTag[]>([]);
  const [trainingAnswers, setTrainingAnswers] = useState<Record<string, string[]>>({});
  const [trainingActions, setTrainingActions] = useState<Record<string, string>>({});
  const [trainingObservations, setTrainingObservations] = useState<Record<string, string>>({});
  const [trainingActionTypes, setTrainingActionTypes] = useState<Record<string, TrainingActionType>>({});
  const [trainingFlowIds, setTrainingFlowIds] = useState<Record<string, string>>({});
  const [trainingCountrySelections, setTrainingCountrySelections] = useState<Record<string, CountryFilter>>({});
  const [trainingRequiredTags, setTrainingRequiredTags] = useState<Record<string, string[]>>({});
  const [trainingExcludedTags, setTrainingExcludedTags] = useState<Record<string, string[]>>({});
  const [trainingBusyId, setTrainingBusyId] = useState('');
  const [trainingView, setTrainingView] = useState<TrainingView>('waiting');
  const [trainingCountryFilter, setTrainingCountryFilter] = useState<CountryFilter>('any');
  const [flowSearch, setFlowSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const selected = configs.find((config) => config.agent_key === selectedKey) ?? configs[0];

  const loadData = async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    const [configsResult, conversationsResult, decisionsResult, connectionsResult, flowsResult, agentConnectionsResult, agentFlowsResult, supportFaqsResult, trainingQueueResult, trainedRulesResult, tagsResult] = await Promise.all([
      supabase.from('ai_agent_configs').select('*').eq('workspace_id', currentWorkspace.id).is('niche_id', null),
      supabase.from('conversations').select('id, contact_name, contact_phone, funnel_stage, updated_at').eq('workspace_id', currentWorkspace.id).order('updated_at', { ascending: false }).limit(50),
      supabase.from('ai_orchestration_decisions').select('id, selected_agent, action, reason, confidence, blockers, operation_mode, status, created_at, conversations(contact_name, contact_phone)').eq('workspace_id', currentWorkspace.id).order('created_at', { ascending: false }).limit(30),
      supabase.from('connection_configs').select('id, label, connection_id, status, is_connected').eq('workspace_id', currentWorkspace.id).in('connection_id', ['whatsapp', 'zapi', 'evolution', 'uazapigo']).order('created_at'),
      supabase.from('automation_flows').select('id, name, description, is_active, manual_only').eq('workspace_id', currentWorkspace.id).order('name'),
      supabase.from('ai_agent_connections').select('agent_config_id, connection_config_id'),
      supabase.from('ai_agent_flows').select('agent_config_id, flow_id, send_when, do_not_send_when, trigger_examples, analyze_flow_content'),
      supabase.from('ai_agent_faqs').select('agent_config_id, question, answer, sort_order').order('sort_order'),
      supabase.from('ai_training_queue').select('id, conversation_id, source_message_id, customer_message, message_type, status, confidence, match_reason, suggested_response, suggested_responses, suggested_action, suggested_action_type, suggested_flow_id, detected_country_code, processed_at, context_snapshot, created_at, conversations(contact_name, contact_phone), messages(media_url)').eq('workspace_id', currentWorkspace.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('ai_trained_message_rules').select('id, example_message, context_notes, expected_action, action_observation, action_type, official_response, response_messages, flow_id, required_tag_ids, excluded_tag_ids, requires_no_tags, country_code, active, updated_at').eq('workspace_id', currentWorkspace.id).order('updated_at', { ascending: false }).limit(100),
      supabase.from('tags').select('id, name, color').eq('workspace_id', currentWorkspace.id).order('name'),
    ]);

    if (configsResult.error) toast.error('Não foi possível carregar os Atendentes de IA');
    const stored = (configsResult.data || []) as unknown as AgentConfig[];
    setConfigs(defaults().map((fallback) => stored.find((item) => item.agent_key === fallback.agent_key) ?? fallback));
    const selections = {} as Record<AgentKey, string[]>;
    AGENTS.forEach((agent) => {
      const configId = stored.find((item) => item.agent_key === agent.key)?.id;
      selections[agent.key] = (agentConnectionsResult.data || []).filter((link) => link.agent_config_id === configId).map((link) => link.connection_config_id);
    });
    const selectorId = stored.find((item) => item.agent_key === 'flow_selector')?.id;
    const supportId = stored.find((item) => item.agent_key === 'support')?.id;
    setConnectionSelections(selections);
    setFlowSelections((agentFlowsResult.data || []).filter((link) => link.agent_config_id === selectorId).map((link) => ({
      flow_id: link.flow_id,
      send_when: link.send_when,
      do_not_send_when: link.do_not_send_when,
      trigger_examples: link.trigger_examples,
      analyze_flow_content: link.analyze_flow_content,
    })));
    setSupportFaqs((supportFaqsResult.data || []).filter((item) => item.agent_config_id === supportId).map((item) => ({ question: item.question, answer: item.answer })));
    setTrainingQueue((trainingQueueResult.data || []) as unknown as TrainingQueueItem[]);
    setTrainedRules((trainedRulesResult.data || []) as TrainedRule[]);
    setWorkspaceTags((tagsResult.data || []) as WorkspaceTag[]);
    setConnections((connectionsResult.data || []) as Connection[]);
    setFlows((flowsResult.data || []) as Flow[]);
    setConversations((conversationsResult.data || []) as Conversation[]);
    setDecisions((decisionsResult.data || []) as unknown as Decision[]);
    if (conversationsResult.data?.[0]) setConversationId(conversationsResult.data[0].id);
    setLoading(false);
  };

  useEffect(() => { void loadData(); }, [currentWorkspace?.id]);

  const updateSelected = (patch: Partial<AgentConfig>) => {
    setConfigs((current) => current.map((config) => config.agent_key === selectedKey ? { ...config, ...patch } : config));
  };

  const updatePaymentRules = (patch: Partial<PaymentRules>) => {
    const current = readPaymentRules(selected?.entry_criteria ?? {});
    updateSelected({ entry_criteria: { ...current, ...patch } as unknown as Json });
  };

  const toggleConnection = (connectionId: string) => {
    setConnectionSelections((current) => {
      const selectedIds = current[selectedKey] || [];
      return { ...current, [selectedKey]: selectedIds.includes(connectionId) ? selectedIds.filter((id) => id !== connectionId) : [...selectedIds, connectionId] };
    });
  };

  const toggleFlow = (flowId: string) => {
    setFlowSelections((current) => current.some((item) => item.flow_id === flowId)
      ? current.filter((item) => item.flow_id !== flowId)
      : [...current, { flow_id: flowId, send_when: '', do_not_send_when: '', trigger_examples: '', analyze_flow_content: false }]);
  };

  const updateFlowRule = (flowId: string, patch: Partial<AgentFlow>) => {
    setFlowSelections((current) => current.map((item) => item.flow_id === flowId ? { ...item, ...patch } : item));
  };

  const saveConfig = async () => {
    if (!currentWorkspace?.id || !selected) return;
    if (selected.enabled && (connectionSelections[selectedKey] || []).length === 0) {
      toast.error('Selecione ao menos uma conexão antes de ativar esta IA');
      return;
    }
    if (selectedKey === 'flow_selector') {
      const incompleteFlow = flowSelections.some((flow) => !flow.send_when.trim() || !flow.do_not_send_when.trim() || !flow.trigger_examples.trim());
      if (incompleteFlow) {
        toast.error('Preencha quando enviar, quando não enviar e os exemplos de cada fluxo');
        return;
      }
    }
    if (selectedKey === 'payment') {
      const rules = readPaymentRules(selected.entry_criteria);
      const invalidPrice = rules.prices.some((row) => !Number.isInteger(row.quantity) || row.quantity <= 0 || row.amount < 10 || row.amount > 10000);
      if (!rules.payment_information.trim() || rules.prices.length === 0 || invalidPrice) {
        toast.error('Preencha as informações de pagamento e uma tabela válida entre 10 e 10.000 MXN');
        return;
      }
    }
    if (selectedKey === 'support' && supportFaqs.some((item) => !item.question.trim() || !item.answer.trim())) {
      toast.error('Preencha a pergunta e a resposta de cada item da base de conhecimento');
      return;
    }
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
    if (result.error) { setSaving(false); toast.error(result.error.message); return; }
    const savedConfig = result.data as unknown as AgentConfig;
    if (!savedConfig.id) { setSaving(false); toast.error('Não foi possível identificar a configuração salva'); return; }

    const selectedConnections = connectionSelections[selectedKey] || [];
    const { error: clearConnectionsError } = await supabase.from('ai_agent_connections').delete().eq('agent_config_id', savedConfig.id);
    if (clearConnectionsError) { setSaving(false); toast.error('A IA foi salva, mas as conexões não foram atualizadas'); return; }
    if (selectedConnections.length) {
      const { error: connectionError } = await supabase.from('ai_agent_connections').insert(selectedConnections.map((connectionId) => ({ agent_config_id: savedConfig.id, connection_config_id: connectionId })));
      if (connectionError) { setSaving(false); toast.error('A IA foi salva, mas não foi possível anexar as conexões'); return; }
    }

    if (selectedKey === 'flow_selector') {
      const { error: clearFlowsError } = await supabase.from('ai_agent_flows').delete().eq('agent_config_id', savedConfig.id);
      if (clearFlowsError) { setSaving(false); toast.error('A IA foi salva, mas os fluxos não foram atualizados'); return; }
      if (flowSelections.length) {
        const { error: flowError } = await supabase.from('ai_agent_flows').insert(flowSelections.map((flow) => ({
          agent_config_id: savedConfig.id,
          flow_id: flow.flow_id,
          send_when: flow.send_when.trim(),
          do_not_send_when: flow.do_not_send_when.trim(),
          trigger_examples: flow.trigger_examples.trim(),
          analyze_flow_content: flow.analyze_flow_content,
        })));
        if (flowError) { setSaving(false); toast.error('A IA foi salva, mas não foi possível anexar os fluxos'); return; }
      }
    }
    if (selectedKey === 'support') {
      const { error: clearFaqsError } = await supabase.from('ai_agent_faqs').delete().eq('agent_config_id', savedConfig.id);
      if (clearFaqsError) { setSaving(false); toast.error('A IA foi salva, mas a base de conhecimento não foi atualizada'); return; }
      if (supportFaqs.length) {
        const { error: faqError } = await supabase.from('ai_agent_faqs').insert(supportFaqs.map((item, index) => ({
          agent_config_id: savedConfig.id,
          question: item.question.trim(),
          answer: item.answer.trim(),
          sort_order: index,
        })));
        if (faqError) { setSaving(false); toast.error('A IA foi salva, mas não foi possível salvar as perguntas e respostas'); return; }
      }
    }
    setSaving(false);
    setConfigs((current) => current.map((config) => config.agent_key === selectedKey ? savedConfig : config));
    toast.success(`${AGENT_LABELS[selectedKey]} salva`);
  };

  const updateTrainingStatus = async (itemId: string, status: 'no_response' | 'ignored') => {
    setTrainingBusyId(itemId);
    const { error } = await supabase.from('ai_training_queue').update({ status, processed_at: new Date().toISOString() }).eq('id', itemId);
    setTrainingBusyId('');
    if (error) { toast.error(error.message); return; }
    setTrainingQueue((current) => current.map((item) => item.id === itemId ? { ...item, status } : item));
    toast.success(status === 'no_response' ? 'Mensagem marcada para não responder' : 'Mensagem ignorada');
  };

  const snapshotTagIds = (item: TrainingQueueItem) => {
    const snapshot = item.context_snapshot && typeof item.context_snapshot === 'object' && !Array.isArray(item.context_snapshot)
      ? item.context_snapshot as Record<string, Json | undefined>
      : {};
    return Array.isArray(snapshot.tag_ids) ? snapshot.tag_ids.filter((value): value is string => typeof value === 'string') : [];
  };
  const snapshotTagNames = (item: TrainingQueueItem) => {
    const snapshot = item.context_snapshot && typeof item.context_snapshot === 'object' && !Array.isArray(item.context_snapshot)
      ? item.context_snapshot as Record<string, Json | undefined>
      : {};
    const names = Array.isArray(snapshot.tags) ? snapshot.tags.filter((value): value is string => typeof value === 'string' && value.trim().length > 0) : [];
    if (names.length) return names;
    return snapshotTagIds(item).flatMap((id) => {
      const tag = workspaceTags.find((candidate) => candidate.id === id);
      return tag ? [tag.name] : [];
    });
  };
  const imageAnalysis = (item: TrainingQueueItem) => {
    const snapshot = item.context_snapshot && typeof item.context_snapshot === 'object' && !Array.isArray(item.context_snapshot)
      ? item.context_snapshot as Record<string, Json | undefined>
      : {};
    return {
      isReceipt: snapshot.is_possible_receipt === true,
      confidence: typeof snapshot.receipt_confidence === 'number' ? snapshot.receipt_confidence : 0,
      reason: typeof snapshot.receipt_reason === 'string' ? snapshot.receipt_reason : '',
    };
  };

  const toggleTagCondition = (itemId: string, tagId: string, kind: 'required' | 'excluded') => {
    const setter = kind === 'required' ? setTrainingRequiredTags : setTrainingExcludedTags;
    const oppositeSetter = kind === 'required' ? setTrainingExcludedTags : setTrainingRequiredTags;
    setter((current) => {
      const fallback = kind === 'required' ? snapshotTagIds(trainingQueue.find((item) => item.id === itemId) as TrainingQueueItem) : [];
      const selectedIds = current[itemId] ?? fallback;
      return { ...current, [itemId]: selectedIds.includes(tagId) ? selectedIds.filter((id) => id !== tagId) : [...selectedIds, tagId] };
    });
    oppositeSetter((current) => ({ ...current, [itemId]: (current[itemId] || []).filter((id) => id !== tagId) }));
  };

  const normalizeTagName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[\s_-]+/g, ' ').trim();

  const findContextTag = (label: TaggedTrainingContext) => {
    const aliases: Record<TaggedTrainingContext, string[]> = {
      'Etapa 1': ['etapa 1'],
      'Etapa 2': ['etapa 2'],
      'Pago': ['pago'],
      'Pós-venda': ['pos venda', 'pos-venda'],
    };
    return workspaceTags.find((tag) => aliases[label].includes(normalizeTagName(tag.name)));
  };

  const readMessages = (value: Json, fallback = '') => {
    const messages = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    return messages.length ? messages : fallback ? [fallback] : [''];
  };

  const updateTrainingMessage = (key: string, index: number, value: string) => {
    setTrainingAnswers((current) => {
      const messages = current[key] || [''];
      return { ...current, [key]: messages.map((message, messageIndex) => messageIndex === index ? value : message) };
    });
  };

  const moveTrainingMessage = (key: string, index: number, direction: -1 | 1) => {
    setTrainingAnswers((current) => {
      const messages = [...(current[key] || [''])];
      const target = index + direction;
      if (target < 0 || target >= messages.length) return current;
      [messages[index], messages[target]] = [messages[target], messages[index]];
      return { ...current, [key]: messages };
    });
  };

  const updateRuleMessages = (ruleId: string, updater: (messages: string[]) => string[]) => {
    setTrainedRules((current) => current.map((rule) => {
      if (rule.id !== ruleId) return rule;
      const messages = updater(readMessages(rule.response_messages, rule.official_response));
      return { ...rule, response_messages: messages, official_response: messages[0] || '' };
    }));
  };

  const historyStatus = (item: TrainingQueueItem) => {
    if (item.status === 'matched') return { label: 'Teste — não enviado', variant: 'default' as const };
    if (item.status === 'unmatched') return { label: 'Sem resposta segura', variant: 'secondary' as const };
    if (item.status === 'ignored') return { label: 'Ignorado', variant: 'outline' as const };
    if (item.status === 'no_response') return { label: 'Não responder', variant: 'outline' as const };
    if (item.status === 'failed') return { label: 'Falha', variant: 'destructive' as const };
    if (item.status === 'sent') return { label: 'Enviado', variant: 'default' as const };
    return { label: 'Treinamento concluído', variant: 'secondary' as const };
  };

  const countryLabel = (code?: string | null) => TRAINING_COUNTRIES.find((country) => country.code === code)?.label || 'País não identificado';
  const countryFromPhone = (phone?: string | null): CountryCode | null => {
    const digits = (phone || '').replace(/\D/g, '').replace(/^00/, '');
    if (digits.startsWith('598')) return 'UY';
    if (digits.startsWith('54')) return 'AR';
    if (digits.startsWith('52')) return 'MX';
    return null;
  };
  const itemCountry = (item: TrainingQueueItem) => item.detected_country_code || countryFromPhone(item.conversations?.contact_phone);
  const visibleTrainingQueue = trainingQueue.filter((item) => trainingCountryFilter === 'any' || itemCountry(item) === trainingCountryFilter);
  const visibleTrainedRules = trainedRules.filter((rule) => trainingCountryFilter === 'any' || rule.country_code === trainingCountryFilter);

  const trainFromMessage = async (item: TrainingQueueItem) => {
    if (!currentWorkspace?.id) return;
    const trainedConfig = configs.find((config) => config.agent_key === 'trained_messages');
    if (!trainedConfig?.id) { toast.error('Salve a configuração desta IA antes de treiná-la'); return; }
    const variants = TRAINING_COUNTRIES.flatMap((country) => TRAINING_CONTEXTS.flatMap((label) => {
      const requiresNoTags = label === 'Sem etiqueta';
      const tag = requiresNoTags ? null : findContextTag(label);
      if (!requiresNoTags && !tag) return [];
      const key = `${item.id}:${country.code}:${requiresNoTags ? 'no-tags' : tag.id}`;
      const actionType = trainingActionTypes[key] || 'reply';
      const responseMessages = (trainingAnswers[key] || ['']).map((message) => message.trim()).filter(Boolean);
      const officialResponse = responseMessages[0] || '';
      const flowId = trainingFlowIds[key] || null;
      const actionObservation = (trainingObservations[key] || '').trim();
      const selectedFlow = flows.find((flow) => flow.id === flowId);
      const expectedAction = actionType === 'reply'
        ? 'Responder com a mensagem oficial.'
        : actionType === 'flow'
          ? `Enviar o fluxo ${selectedFlow?.name || ''}.`
          : actionType === 'reply_then_flow'
            ? `Responder com a mensagem oficial e depois enviar o fluxo ${selectedFlow?.name || ''}.`
            : 'Não fazer nada e aguardar a próxima mensagem do cliente.';
      return responseMessages.length || flowId || trainingActionTypes[key] || actionObservation ? [{ label, tag, key, expectedAction, actionObservation, officialResponse, responseMessages, actionType, flowId, requiresNoTags, countryCode: country.code }] : [];
    }));
    if (!variants.length) { toast.error('Configure a ação de pelo menos uma etiqueta'); return; }
    if (variants.some((variant) => ['reply', 'reply_then_flow'].includes(variant.actionType) && !variant.officialResponse)) { toast.error('Preencha a mensagem nas ações que respondem ao cliente'); return; }
    if (variants.some((variant) => ['flow', 'reply_then_flow'].includes(variant.actionType) && !variant.flowId)) { toast.error('Selecione o fluxo nas ações que executam um fluxo'); return; }
    setTrainingBusyId(item.id);
    const snapshot = item.context_snapshot && typeof item.context_snapshot === 'object' && !Array.isArray(item.context_snapshot)
      ? item.context_snapshot as Record<string, Json | undefined>
      : {};
    const tags = Array.isArray(snapshot.tags) ? snapshot.tags.filter((tag) => typeof tag === 'string').join(', ') : '';
    const contextNotes = [`Etapa: ${typeof snapshot.funnel_stage === 'string' ? snapshot.funnel_stage : 'não definida'}`, `Etiquetas: ${tags || 'nenhuma'}`].join('\n');
    const { data: rules, error: ruleError } = await supabase.from('ai_trained_message_rules').insert(variants.map((variant) => ({
      workspace_id: currentWorkspace.id,
      agent_config_id: trainedConfig.id,
      source_message_id: item.source_message_id,
      example_message: item.customer_message,
      context_notes: `${contextNotes}\nContexto obrigatório: ${variant.requiresNoTags ? 'cliente sem nenhuma etiqueta' : `cliente com etiqueta ${variant.tag?.name}`}.`,
      expected_action: variant.expectedAction,
      action_observation: variant.actionObservation,
      action_type: variant.actionType,
      official_response: variant.officialResponse,
      response_messages: variant.responseMessages,
      flow_id: variant.flowId,
      required_tag_ids: variant.tag ? [variant.tag.id] : [],
      excluded_tag_ids: [],
      requires_no_tags: variant.requiresNoTags,
      country_code: variant.countryCode,
    }))).select();
    const firstRule = rules?.[0];
    if (ruleError || !firstRule) { setTrainingBusyId(''); toast.error(ruleError?.message || 'Não foi possível salvar o treinamento'); return; }
    const { error: queueError } = await supabase.from('ai_training_queue').update({
      status: 'trained', matched_rule_id: firstRule.id, suggested_action: firstRule.expected_action, suggested_action_type: firstRule.action_type,
      suggested_response: ['reply', 'reply_then_flow'].includes(firstRule.action_type) ? firstRule.official_response : null,
      suggested_responses: ['reply', 'reply_then_flow'].includes(firstRule.action_type) ? firstRule.response_messages : [],
      suggested_flow_id: firstRule.flow_id, processed_at: new Date().toISOString(),
    }).eq('id', item.id);
    setTrainingBusyId('');
    if (queueError) { toast.error(queueError.message); return; }
    setTrainedRules((current) => [...(rules as TrainedRule[]), ...current]);
    setTrainingQueue((current) => current.map((currentItem) => currentItem.id === item.id ? { ...currentItem, status: 'trained', suggested_response: firstRule.official_response, suggested_responses: firstRule.response_messages } : currentItem));
    setTrainingAnswers((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${item.id}:`))));
    setTrainingActions((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${item.id}:`))));
    setTrainingObservations((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${item.id}:`))));
    setTrainingActionTypes((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${item.id}:`))));
    setTrainingFlowIds((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${item.id}:`))));
    setTrainingCountrySelections((current) => { const next = { ...current }; delete next[item.id]; return next; });
    toast.success(`${rules.length} resposta${rules.length > 1 ? 's' : ''} por etiqueta aprendida${rules.length > 1 ? 's' : ''}`);
  };

  const saveTrainedRule = async (rule: TrainedRule) => {
    const responseMessages = readMessages(rule.response_messages, rule.official_response).map((message) => message.trim()).filter(Boolean);
    if (!rule.example_message.trim() || !rule.expected_action.trim() || (['reply', 'reply_then_flow'].includes(rule.action_type) && !responseMessages.length) || (['flow', 'reply_then_flow'].includes(rule.action_type) && !rule.flow_id)) { toast.error('Preencha as mensagens e o fluxo exigidos pela ação selecionada'); return; }
    setTrainingBusyId(rule.id);
    const { error } = await supabase.from('ai_trained_message_rules').update({
      example_message: rule.example_message.trim(), context_notes: rule.context_notes.trim(), expected_action: rule.expected_action.trim(), action_observation: rule.action_observation.trim(),
      action_type: rule.action_type, official_response: ['reply', 'reply_then_flow'].includes(rule.action_type) ? responseMessages[0] : '',
      response_messages: ['reply', 'reply_then_flow'].includes(rule.action_type) ? responseMessages : [],
      flow_id: ['flow', 'reply_then_flow'].includes(rule.action_type) ? rule.flow_id : null,
      required_tag_ids: rule.requires_no_tags ? [] : rule.required_tag_ids,
      excluded_tag_ids: rule.requires_no_tags ? [] : rule.excluded_tag_ids,
      requires_no_tags: rule.requires_no_tags, active: rule.active,
      country_code: rule.country_code,
    }).eq('id', rule.id);
    setTrainingBusyId('');
    if (error) { toast.error(error.message); return; }
    toast.success('Regra de treinamento atualizada');
  };

  const deleteTrainedRule = async (ruleId: string) => {
    if (!window.confirm('Excluir esta regra aprendida? A mensagem original da conversa será preservada.')) return;
    setTrainingBusyId(ruleId);
    const { error } = await supabase.from('ai_trained_message_rules').delete().eq('id', ruleId);
    setTrainingBusyId('');
    if (error) { toast.error(error.message); return; }
    setTrainedRules((current) => current.filter((rule) => rule.id !== ruleId));
    toast.success('Regra excluída');
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
  const visibleFlows = useMemo(() => {
    const query = flowSearch.trim().toLocaleLowerCase('pt-BR');
    if (!query) return flows;
    return flows.filter((flow) => `${flow.name} ${flow.description || ''}`.toLocaleLowerCase('pt-BR').includes(query));
  }, [flows, flowSearch]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div>
      <TopBar
        title={standalone ? 'Automação Inteligente' : 'Central Inteligente de IAs'}
        subtitle={standalone ? 'Treine ações e mensagens prontas para cada cenário' : 'Uma decisão central, um único Atendente por vez'}
      />
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        {!standalone && <section className="border-b border-border pb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2"><Badge>Modo seguro</Badge><span className="text-xs text-muted-foreground">{activeCount} de {AGENTS.length} ativos</span></div>
              <h2 className="text-2xl font-semibold text-foreground">Comando central do atendimento</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">A Orquestradora analisa o contexto e escolhe uma única função. No modo de teste, nenhuma mensagem ou fluxo é enviado.</p>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
              <div className="h-2.5 w-2.5 rounded-full bg-success" />
              <div><p className="text-sm font-medium text-foreground">Proteção contra conflitos</p><p className="text-xs text-muted-foreground">Uma decisão por mensagem</p></div>
            </div>
          </div>
        </section>}

        {standalone && (
          <section className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2"><Badge>Modo de teste</Badge><span className="text-xs text-muted-foreground">Nenhuma mensagem é enviada automaticamente</span></div>
              <h2 className="text-2xl font-semibold text-foreground">Treinamento de cenários</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Ensine o que fazer, quais etiquetas considerar e qual mensagem exata usar em cada situação.</p>
            </div>
            <div className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
              <MessageSquareText className="h-5 w-5 text-primary" />
              <div><p className="text-sm font-medium text-foreground">Resposta controlada</p><p className="text-xs text-muted-foreground">Somente textos ensinados</p></div>
            </div>
          </section>
        )}

        <div className={standalone ? 'grid gap-6' : 'grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]'}>
          {!standalone && <aside className="space-y-2">
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
          </aside>}

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

              <div className="mt-6 space-y-3 border-t border-border pt-5">
                <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" /><div><p className="text-sm font-medium text-foreground">Conexões em que esta IA funciona</p><p className="text-xs text-muted-foreground">Ela só poderá atuar nas conexões marcadas. Se estiver ativa, selecione ao menos uma.</p></div></div>
                {connections.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma conexão disponível.</div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {connections.map((connection) => {
                      const checked = (connectionSelections[selectedKey] || []).includes(connection.id);
                      return <label key={connection.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-muted/20 p-3">
                        <Checkbox checked={checked} onCheckedChange={() => toggleConnection(connection.id)} />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{connection.label}</span><span className="block text-xs text-muted-foreground">{connection.connection_id} · {connection.is_connected ? 'Conectada' : 'Desconectada'}</span></span>
                        <span className={`h-2 w-2 rounded-full ${connection.is_connected ? 'bg-success' : 'bg-muted-foreground'}`} />
                      </label>;
                    })}
                  </div>
                )}
              </div>

              {selectedKey === 'flow_selector' && (
                <div className="mt-6 space-y-3 border-t border-border pt-5">
                  <div><p className="text-sm font-medium text-foreground">Fluxos que a Seletora pode enviar</p><p className="text-xs text-muted-foreground">Escreva regras e exemplos em português. A IA compara o significado com mensagens e fluxos em espanhol do México.</p></div>
                  <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={flowSearch} onChange={(event) => setFlowSearch(event.target.value)} className="pl-9" placeholder="Buscar fluxo por nome ou descrição" /></div>
                  {flows.length === 0 ? <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum fluxo disponível.</div> : visibleFlows.length === 0 ? <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum fluxo encontrado.</div> : visibleFlows.map((flow) => {
                    const linked = flowSelections.find((item) => item.flow_id === flow.id);
                    return <div key={flow.id} className={`rounded-md border p-4 ${linked ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'}`}>
                      <label className="flex cursor-pointer items-start gap-3">
                        <Checkbox className="mt-0.5" checked={Boolean(linked)} onCheckedChange={() => toggleFlow(flow.id)} />
                        <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">{flow.name}{!flow.is_active && <Badge variant="secondary">Pausado</Badge>}{flow.manual_only && <Badge variant="outline">Somente manual</Badge>}</span>{flow.description && <span className="mt-1 block text-xs text-muted-foreground">{flow.description}</span>}</span>
                      </label>
                      {linked && <div className="ml-7 mt-4 space-y-4 border-t border-border pt-4">
                        <div><label className="mb-1.5 block text-xs font-medium text-foreground">Quando este fluxo deve ser enviado?</label><Textarea value={linked.send_when} onChange={(event) => updateFlowRule(flow.id, { send_when: event.target.value })} rows={3} placeholder="Ex.: Quando o lead perguntar o preço pela primeira vez e ainda não tiver recebido a oferta." /></div>
                        <div><label className="mb-1.5 block text-xs font-medium text-foreground">Quando este fluxo não deve ser enviado?</label><Textarea value={linked.do_not_send_when} onChange={(event) => updateFlowRule(flow.id, { do_not_send_when: event.target.value })} rows={3} placeholder="Ex.: Não enviar se o lead já recebeu esta oferta, já comprou ou estiver pedindo suporte." /></div>
                        <div><label className="mb-1.5 block text-xs font-medium text-foreground">Exemplos de mensagens que devem acionar este fluxo</label><Textarea value={linked.trigger_examples} onChange={(event) => updateFlowRule(flow.id, { trigger_examples: event.target.value })} rows={4} placeholder={'Pode escrever em português — a IA reconhecerá o equivalente em espanhol:\nQuanto custa?\nQuais são as formas de pagamento?\nPode me explicar a oferta?'} /></div>
                        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-background p-3">
                          <Switch checked={linked.analyze_flow_content} onCheckedChange={(checked) => updateFlowRule(flow.id, { analyze_flow_content: checked })} />
                          <span><span className="block text-sm font-medium text-foreground">Analisar o conteúdo deste fluxo</span><span className="mt-0.5 block text-xs text-muted-foreground">A IA poderá ler as mensagens e condições dos blocos para entender melhor quando usar este fluxo.</span></span>
                        </label>
                      </div>}
                    </div>;
                  })}
                </div>
              )}

              {selectedKey === 'support' && (
                <div className="mt-6 space-y-4 border-t border-border pt-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2"><BookOpen className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-sm font-medium text-foreground">Base de conhecimento</p><p className="text-xs text-muted-foreground">Cadastre perguntas frequentes e respostas oficiais. Você pode escrever em português; a IA entende perguntas equivalentes em espanhol mexicano.</p></div></div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setSupportFaqs((current) => [...current, { question: '', answer: '' }])}><Plus className="mr-2 h-4 w-4" />Adicionar pergunta</Button>
                  </div>
                  {supportFaqs.length === 0 ? <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhuma pergunta cadastrada.</div> : supportFaqs.map((item, index) => <div key={index} className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium text-foreground">Pergunta {index + 1}</p><Button type="button" variant="ghost" size="icon" title="Excluir pergunta" onClick={() => setSupportFaqs((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></div>
                    <div><label className="mb-1.5 block text-xs font-medium text-foreground">Pergunta frequente</label><Textarea value={item.question} onChange={(event) => setSupportFaqs((current) => current.map((faq, itemIndex) => itemIndex === index ? { ...faq, question: event.target.value } : faq))} rows={2} placeholder="Ex.: Quanto tempo demora a entrega?" /></div>
                    <div><label className="mb-1.5 block text-xs font-medium text-foreground">Resposta oficial</label><Textarea value={item.answer} onChange={(event) => setSupportFaqs((current) => current.map((faq, itemIndex) => itemIndex === index ? { ...faq, answer: event.target.value } : faq))} rows={4} placeholder="Escreva a resposta correta e completa que a IA deverá usar como referência." /></div>
                  </div>)}
                  <p className="text-xs text-muted-foreground">A base responde dúvidas específicas; ela não confirma pagamentos, altera etiquetas ou executa fluxos.</p>
                </div>
              )}

              {selectedKey === 'payment' && (() => {
                const rules = readPaymentRules(selected.entry_criteria);
                return <div className="mt-6 space-y-5 border-t border-border pt-5">
                  <div><p className="text-sm font-medium text-foreground">Configuração de pagamento</p><p className="text-xs text-muted-foreground">A Orquestradora consulta estas regras. No modo seguro, nenhum voucher ou mensagem é enviado.</p></div>
                  <div><label className="mb-1.5 block text-sm font-medium text-foreground">Informações que a IA pode enviar</label><Textarea value={rules.payment_information} onChange={(event) => updatePaymentRules({ payment_information: event.target.value })} rows={6} placeholder={'Informe somente os dados oficiais: formas de pagamento, instruções, prazos e restrições.\nPode escrever em português; a resposta futura será adaptada ao espanhol do México.'} /></div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium text-foreground">Valor OXXO por quantidade de amostras</p><p className="text-xs text-muted-foreground">O valor exato será usado somente quando a quantidade estiver clara.</p></div><Button type="button" variant="outline" size="sm" onClick={() => updatePaymentRules({ prices: [...rules.prices, { quantity: 1, amount: 10 }] })}><Plus className="mr-2 h-4 w-4" />Adicionar</Button></div>
                    {rules.prices.length === 0 ? <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">Adicione ao menos uma quantidade e seu valor final em MXN.</div> : rules.prices.map((row, index) => <div key={`${index}-${row.quantity}`} className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-md border border-border bg-muted/20 p-3">
                      <div><label className="mb-1 block text-xs font-medium text-foreground">Quantidade</label><Input type="number" min={1} step={1} value={row.quantity} onChange={(event) => updatePaymentRules({ prices: rules.prices.map((item, rowIndex) => rowIndex === index ? { ...item, quantity: Number(event.target.value) } : item) })} /></div>
                      <div><label className="mb-1 block text-xs font-medium text-foreground">Valor final (MXN)</label><Input type="number" min={10} max={10000} step="0.01" value={row.amount} onChange={(event) => updatePaymentRules({ prices: rules.prices.map((item, rowIndex) => rowIndex === index ? { ...item, amount: Number(event.target.value) } : item) })} /></div>
                      <Button type="button" variant="ghost" size="icon" title="Remover valor" onClick={() => updatePaymentRules({ prices: rules.prices.filter((_, rowIndex) => rowIndex !== index) })}><Trash2 className="h-4 w-4" /></Button>
                    </div>)}
                  </div>
                  <div><label className="mb-1.5 block text-sm font-medium text-foreground">Fluxo após identificar um possível comprovante</label><Select value={rules.receipt_flow_id || 'none'} onValueChange={(value) => updatePaymentRules({ receipt_flow_id: value === 'none' ? '' : value })}><SelectTrigger><SelectValue placeholder="Selecione um fluxo" /></SelectTrigger><SelectContent><SelectItem value="none">Não executar fluxo</SelectItem>{flows.map((flow) => <SelectItem key={flow.id} value={flow.id} disabled={!flow.is_active || flow.manual_only}>{flow.name}{!flow.is_active ? ' — pausado' : flow.manual_only ? ' — somente manual' : ''}</SelectItem>)}</SelectContent></Select><p className="mt-1.5 text-xs text-muted-foreground">A imagem será tratada apenas como possível comprovante. A etiqueta PAGO continua dependendo da confirmação oficial.</p></div>
                </div>;
              })()}

              {selectedKey === 'trained_messages' && (
                <div className="mt-6 space-y-6 border-t border-border pt-5">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Button type="button" variant={trainingView === 'waiting' ? 'default' : 'outline'} className="h-auto justify-start gap-3 p-3" onClick={() => setTrainingView('waiting')}><Clock3 className="h-4 w-4" /><span className="text-left"><span className="block text-sm font-semibold">Aguardando treinamento</span><span className="block text-xs opacity-75">{trainingQueue.filter((item) => item.status === 'pending' || item.status === 'unmatched').length} pendentes</span></span></Button>
                    <Button type="button" variant={trainingView === 'responses' ? 'default' : 'outline'} className="h-auto justify-start gap-3 p-3" onClick={() => setTrainingView('responses')}><MessageSquareText className="h-4 w-4" /><span className="text-left"><span className="block text-sm font-semibold">Respostas ativas</span><span className="block text-xs opacity-75">{trainedRules.filter((rule) => rule.active).length} editáveis</span></span></Button>
                    <Button type="button" variant={trainingView === 'history' ? 'default' : 'outline'} className="h-auto justify-start gap-3 p-3" onClick={() => setTrainingView('history')}><History className="h-4 w-4" /><span className="text-left"><span className="block text-sm font-semibold">Histórico</span><span className="block text-xs opacity-75">{trainingQueue.filter((item) => item.status !== 'pending').length} decisões</span></span></Button>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-border bg-muted/20 p-3"><div><p className="text-sm font-medium text-foreground">Filtrar treinamento por país</p><p className="text-xs text-muted-foreground">Cada país mantém suas próprias ações, mensagens e fluxos.</p></div><div className="w-full sm:w-56"><Select value={trainingCountryFilter} onValueChange={(value: CountryFilter) => setTrainingCountryFilter(value)}><SelectTrigger aria-label="Filtrar treinamento por país"><SelectValue /></SelectTrigger><SelectContent>{TRAINING_COUNTRIES.map((country) => <SelectItem key={`filter-${country.code}`} value={country.code}>{country.label}{country.ddi ? ` (${country.ddi})` : ''}</SelectItem>)}</SelectContent></Select></div></div>

                  {trainingView === 'waiting' && <div className="space-y-3">
                    <div><p className="text-sm font-medium text-foreground">Novos cenários para ensinar</p><p className="text-xs text-muted-foreground">A IA analisa a mensagem e o contexto, depois pergunta qual ação tomar e qual mensagem usar.</p></div>
                    {visibleTrainingQueue.filter((item) => ['pending', 'unmatched'].includes(item.status)).length === 0 ? <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhuma mensagem nova aguardando treinamento neste país.</div> : visibleTrainingQueue.filter((item) => ['pending', 'unmatched'].includes(item.status)).map((item) => <div key={item.id} className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-foreground">{item.conversations?.contact_name || 'Cliente sem nome'}</p><Badge variant="secondary">{countryLabel(itemCountry(item))}</Badge>{snapshotTagNames(item).length ? snapshotTagNames(item).map((tag) => <Badge key={`${item.id}-${tag}`} variant="outline">{tag}</Badge>) : <Badge variant="outline">Sem tag</Badge>}</div><p className="text-xs text-muted-foreground">{item.conversations?.contact_phone || 'Telefone não informado'} · {new Date(item.created_at).toLocaleString('pt-BR')} · {item.message_type}</p></div><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => navigate(`/conversations/${item.conversation_id}`)}><MessageCircle className="mr-2 h-4 w-4" />Abrir conversa</Button><Badge variant={item.status === 'matched' ? 'default' : 'secondary'}>{item.status === 'matched' ? `${Math.round(Number(item.confidence) * 100)}% compatível` : item.status === 'unmatched' ? 'Sem resposta segura' : 'Nova'}</Badge></div></div>
                      <div className="rounded-md border border-border bg-background p-3 text-sm text-foreground">{item.customer_message}</div>
                      {item.message_type === 'image' && item.messages?.media_url && <div className="space-y-2"><MediaImage src={item.messages.media_url} alt="Imagem enviada pelo cliente" loading="eager" className="max-h-80 w-auto max-w-full rounded-md border border-border object-contain" />{(() => { const analysis = imageAnalysis(item); return analysis.reason ? <div className="flex flex-wrap items-center gap-2"><Badge variant={analysis.isReceipt ? 'default' : 'secondary'}>{analysis.isReceipt ? 'Possível comprovante' : 'Não parece comprovante'}</Badge>{analysis.confidence > 0 && <span className="text-xs text-muted-foreground">{Math.round(analysis.confidence * 100)}% de confiança</span>}<span className="w-full text-xs text-muted-foreground">{analysis.reason}</span></div> : <Badge variant="outline">Aguardando análise visual</Badge>; })()}</div>}
                       {(() => { const snapshot = item.context_snapshot && typeof item.context_snapshot === 'object' && !Array.isArray(item.context_snapshot) ? item.context_snapshot as Record<string, Json | undefined> : {}; const transcript = typeof snapshot.recent_transcript === 'string' ? snapshot.recent_transcript : ''; return transcript ? <details className="rounded-md border border-border bg-background p-3"><summary className="cursor-pointer text-xs font-medium text-foreground">Ver contexto da conversa</summary><pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-xs text-muted-foreground">{transcript}</pre></details> : null; })()}
                      {item.match_reason && <p className="text-xs text-muted-foreground">Análise: {item.match_reason}</p>}
                       {(item as TrainingQueueItem & { suggested_action?: string | null }).suggested_action && <div><p className="mb-1 text-xs font-medium text-foreground">Ação que seria escolhida no teste</p><div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm text-foreground">{(item as TrainingQueueItem & { suggested_action?: string | null }).suggested_action}</div></div>}
                      {readMessages(item.suggested_responses, item.suggested_response || '').filter(Boolean).length > 0 && <div><p className="mb-1 text-xs font-medium text-foreground">Mensagens que seriam selecionadas no teste</p><div className="space-y-2">{readMessages(item.suggested_responses, item.suggested_response || '').filter(Boolean).map((message, index) => <div key={`${item.id}-suggested-${index}`} className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm text-foreground whitespace-pre-wrap"><span className="mb-1 block text-xs font-semibold text-primary">Mensagem {index + 1}</span>{message}</div>)}</div></div>}
                        <div className="space-y-3"><div><p className="text-xs font-medium text-foreground">O que eu deveria fazer neste cenário?</p><p className="text-xs text-muted-foreground">Escolha o país e configure mensagens ou fluxo para cada contexto.</p></div>{(() => { const selectedCountry = trainingCountrySelections[item.id] || item.detected_country_code || 'any'; return <><div className="max-w-sm"><label className="mb-1 block text-xs font-medium text-foreground">País desta ação</label><Select value={selectedCountry} onValueChange={(value: CountryFilter) => setTrainingCountrySelections((current) => ({ ...current, [item.id]: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRAINING_COUNTRIES.map((country) => <SelectItem key={country.code} value={country.code}>{country.label}{country.ddi ? ` (${country.ddi})` : ''}</SelectItem>)}</SelectContent></Select><p className="mt-1 text-xs text-muted-foreground">País detectado pelo telefone: {countryLabel(item.detected_country_code)}</p></div><div className="grid gap-3 md:grid-cols-2">{TRAINING_CONTEXTS.map((label) => { const withoutTags = label === 'Sem etiqueta'; const tag = withoutTags ? null : findContextTag(label); const available = withoutTags || Boolean(tag); const key = `${item.id}:${selectedCountry}:${withoutTags ? 'no-tags' : tag?.id || label}`; const actionType = trainingActionTypes[key] || 'reply'; const messages = trainingAnswers[key] || ['']; return <div key={key} className="space-y-3 rounded-md border border-border bg-background p-3"><div className="flex items-center justify-between"><div className="flex gap-2"><Badge variant="outline">{label}</Badge><Badge variant="secondary">{countryLabel(selectedCountry)}</Badge></div>{!available && <span className="text-xs text-destructive">Etiqueta não cadastrada</span>}{withoutTags && <span className="text-xs text-muted-foreground">Nenhuma etiqueta</span>}</div><div><label className="mb-1 block text-xs font-medium text-foreground">Ação neste contexto</label><Select disabled={!available} value={actionType} onValueChange={(value: TrainingActionType) => setTrainingActionTypes((current) => ({ ...current, [key]: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reply">Responder com mensagem</SelectItem><SelectItem value="flow">Enviar um fluxo</SelectItem><SelectItem value="reply_then_flow">Responder e depois enviar fluxo</SelectItem><SelectItem value="wait">Não fazer nada e aguardar a próxima mensagem</SelectItem></SelectContent></Select></div><div><label className="mb-1 block text-xs font-medium text-foreground">Observação da ação</label><Textarea disabled={!available} value={trainingObservations[key] || ''} onChange={(event) => setTrainingObservations((current) => ({ ...current, [key]: event.target.value }))} rows={3} placeholder="Explique por que esta ação é a correta neste cenário. Esta observação não será enviada ao cliente." /></div>{['reply', 'reply_then_flow'].includes(actionType) && <div className="space-y-2"><div className="flex items-center justify-between"><label className="text-xs font-medium text-foreground">Mensagens exatas, na ordem</label><Button type="button" variant="outline" size="sm" disabled={!available} onClick={() => setTrainingAnswers((current) => ({ ...current, [key]: [...messages, ''] }))}><Plus className="mr-1 h-3.5 w-3.5" />Mensagem</Button></div>{messages.map((message, index) => <div key={`${key}-message-${index}`} className="space-y-1 rounded-md border border-border p-2"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Mensagem {index + 1}</span><div className="flex"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Mover para cima" disabled={index === 0} onClick={() => moveTrainingMessage(key, index, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Mover para baixo" disabled={index === messages.length - 1} onClick={() => moveTrainingMessage(key, index, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Remover mensagem" disabled={messages.length === 1} onClick={() => setTrainingAnswers((current) => ({ ...current, [key]: messages.filter((_, messageIndex) => messageIndex !== index) }))}><Trash2 className="h-3.5 w-3.5" /></Button></div></div><Textarea disabled={!available} value={message} onChange={(event) => updateTrainingMessage(key, index, event.target.value)} rows={3} placeholder="Mensagem pronta que será enviada sem alterações." /></div>)}</div>}{['flow', 'reply_then_flow'].includes(actionType) && <div><label className="mb-1 block text-xs font-medium text-foreground">Fluxo</label><FlowSearchSelect flows={flows} disabled={!available} value={trainingFlowIds[key] || null} onChange={(value) => setTrainingFlowIds((current) => ({ ...current, [key]: value || '' }))} /></div>}{actionType === 'wait' && <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">A IA não enviará mensagem nem fluxo. Ela aguardará uma nova mensagem do cliente.</p>}</div>; })}</div></>; })()}</div>
                        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" size="sm" disabled={trainingBusyId === item.id} onClick={() => void updateTrainingStatus(item.id, 'ignored')}>Ignorar</Button><Button type="button" size="sm" disabled={trainingBusyId === item.id} onClick={() => void trainFromMessage(item)}>{trainingBusyId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Ensinar cenário</Button></div>
                    </div>)}
                  </div>}

                  {trainingView === 'responses' && <div className="space-y-3">
                    <div><p className="text-sm font-medium text-foreground">Cenários aprendidos</p><p className="text-xs text-muted-foreground">Revise o cenário, a ação e a mensagem literal. Desative uma regra para parar de usá-la sem excluí-la.</p></div>
                    {visibleTrainedRules.length === 0 ? <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhuma resposta aprendida neste país.</div> : visibleTrainedRules.map((rule) => <div key={rule.id} className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
                      <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Switch checked={rule.active} onCheckedChange={(active) => setTrainedRules((current) => current.map((item) => item.id === rule.id ? { ...item, active } : item))} /><span className="text-sm font-medium text-foreground">{rule.active ? 'Ativa' : 'Desativada'}</span></div><Button type="button" variant="ghost" size="icon" title="Excluir regra" onClick={() => void deleteTrainedRule(rule.id)}><Trash2 className="h-4 w-4" /></Button></div>
                      <div><label className="mb-1.5 block text-xs font-medium text-foreground">Mensagem de exemplo</label><Textarea value={rule.example_message} onChange={(event) => setTrainedRules((current) => current.map((item) => item.id === rule.id ? { ...item, example_message: event.target.value } : item))} rows={2} /></div>
                      <div><label className="mb-1.5 block text-xs font-medium text-foreground">Contexto</label><Textarea value={rule.context_notes} onChange={(event) => setTrainedRules((current) => current.map((item) => item.id === rule.id ? { ...item, context_notes: event.target.value } : item))} rows={2} /></div>
                      <div><label className="mb-1.5 block text-xs font-medium text-foreground">País</label><Select value={rule.country_code} onValueChange={(value: CountryFilter) => setTrainedRules((current) => current.map((item) => item.id === rule.id ? { ...item, country_code: value } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRAINING_COUNTRIES.map((country) => <SelectItem key={country.code} value={country.code}>{country.label}{country.ddi ? ` (${country.ddi})` : ''}</SelectItem>)}</SelectContent></Select></div>
                       <div className="space-y-3 rounded-md border border-border bg-background p-3">
                          <div><p className="text-xs font-medium text-foreground">Condições por etiquetas</p><p className="text-xs text-muted-foreground">A opção sem etiqueta exige que o cliente não possua nenhuma etiqueta.</p></div>
                          <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground"><Checkbox checked={rule.requires_no_tags} onCheckedChange={(checked) => setTrainedRules((current) => current.map((item) => item.id === rule.id ? { ...item, requires_no_tags: checked === true, required_tag_ids: checked ? [] : item.required_tag_ids, excluded_tag_ids: checked ? [] : item.excluded_tag_ids } : item))} />Cliente sem nenhuma etiqueta</label>
                          {!rule.requires_no_tags && <><div><p className="mb-2 text-xs font-medium text-foreground">Deve ter todas</p><div className="flex flex-wrap gap-2">{workspaceTags.map((tag) => <Button key={`rule-required-${rule.id}-${tag.id}`} type="button" size="sm" variant={rule.required_tag_ids.includes(tag.id) ? 'default' : 'outline'} onClick={() => setTrainedRules((current) => current.map((item) => item.id === rule.id ? { ...item, required_tag_ids: item.required_tag_ids.includes(tag.id) ? item.required_tag_ids.filter((id) => id !== tag.id) : [...item.required_tag_ids, tag.id], excluded_tag_ids: item.excluded_tag_ids.filter((id) => id !== tag.id) } : item))}><Checkbox checked={rule.required_tag_ids.includes(tag.id)} className="mr-2" />{tag.name}</Button>)}</div></div><div><p className="mb-2 text-xs font-medium text-foreground">Não pode ter nenhuma</p><div className="flex flex-wrap gap-2">{workspaceTags.map((tag) => <Button key={`rule-excluded-${rule.id}-${tag.id}`} type="button" size="sm" variant={rule.excluded_tag_ids.includes(tag.id) ? 'destructive' : 'outline'} onClick={() => setTrainedRules((current) => current.map((item) => item.id === rule.id ? { ...item, excluded_tag_ids: item.excluded_tag_ids.includes(tag.id) ? item.excluded_tag_ids.filter((id) => id !== tag.id) : [...item.excluded_tag_ids, tag.id], required_tag_ids: item.required_tag_ids.filter((id) => id !== tag.id) } : item))}><Checkbox checked={rule.excluded_tag_ids.includes(tag.id)} className="mr-2" />{tag.name}</Button>)}</div></div></>}
                       </div>
                       <div><label className="mb-1.5 block text-xs font-medium text-foreground">Ação correta neste cenário</label><Textarea value={rule.expected_action} onChange={(event) => setTrainedRules((current) => current.map((item) => item.id === rule.id ? { ...item, expected_action: event.target.value } : item))} rows={3} /></div>
                       <div><label className="mb-1.5 block text-xs font-medium text-foreground">Observação da ação</label><Textarea value={rule.action_observation} onChange={(event) => setTrainedRules((current) => current.map((item) => item.id === rule.id ? { ...item, action_observation: event.target.value } : item))} rows={3} placeholder="Motivo interno para a IA entender quando esta ação é adequada." /><p className="mt-1 text-xs text-muted-foreground">Uso interno: nunca será enviada ao cliente.</p></div>
                        <div><label className="mb-1.5 block text-xs font-medium text-foreground">Tipo de ação</label><Select value={rule.action_type} onValueChange={(value: TrainingActionType) => setTrainedRules((current) => current.map((item) => item.id === rule.id ? { ...item, action_type: value } : item))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reply">Responder com mensagem</SelectItem><SelectItem value="flow">Enviar um fluxo</SelectItem><SelectItem value="reply_then_flow">Responder e depois enviar fluxo</SelectItem><SelectItem value="wait">Não fazer nada e aguardar a próxima mensagem</SelectItem><SelectItem value="no_response">Não responder</SelectItem><SelectItem value="route">Encaminhar</SelectItem><SelectItem value="other">Outra ação</SelectItem></SelectContent></Select></div>
                         {['reply', 'reply_then_flow'].includes(rule.action_type) && <div className="space-y-2"><div className="flex items-center justify-between"><label className="text-xs font-medium text-foreground">Mensagens oficiais, na ordem</label><Button type="button" variant="outline" size="sm" onClick={() => updateRuleMessages(rule.id, (messages) => [...messages, ''])}><Plus className="mr-1 h-3.5 w-3.5" />Mensagem</Button></div>{readMessages(rule.response_messages, rule.official_response).map((message, index, messages) => <div key={`${rule.id}-response-${index}`} className="space-y-1 rounded-md border border-border bg-background p-2"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Mensagem {index + 1}</span><div className="flex"><Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Mover para cima" disabled={index === 0} onClick={() => updateRuleMessages(rule.id, (current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}><ChevronUp className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Mover para baixo" disabled={index === messages.length - 1} onClick={() => updateRuleMessages(rule.id, (current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })}><ChevronDown className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Remover mensagem" disabled={messages.length === 1} onClick={() => updateRuleMessages(rule.id, (current) => current.filter((_, messageIndex) => messageIndex !== index))}><Trash2 className="h-3.5 w-3.5" /></Button></div></div><Textarea value={message} onChange={(event) => updateRuleMessages(rule.id, (current) => current.map((item, messageIndex) => messageIndex === index ? event.target.value : item))} rows={3} /></div>)}</div>}
                        {['flow', 'reply_then_flow'].includes(rule.action_type) && <div><label className="mb-1.5 block text-xs font-medium text-foreground">Fluxo selecionado</label><FlowSearchSelect flows={flows} value={rule.flow_id} onChange={(value) => setTrainedRules((current) => current.map((item) => item.id === rule.id ? { ...item, flow_id: value } : item))} /></div>}
                      <div className="flex justify-end"><Button type="button" variant="outline" size="sm" disabled={trainingBusyId === rule.id} onClick={() => void saveTrainedRule(rule)}>{trainingBusyId === rule.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar regra</Button></div>
                    </div>)}
                  </div>}

                  {trainingView === 'history' && <div className="space-y-3">
                    <div><p className="text-sm font-medium text-foreground">Histórico de decisões e envios</p><p className="text-xs text-muted-foreground">Cada análise mostra o que a IA decidiu e se a mensagem foi realmente enviada.</p></div>
                    {visibleTrainingQueue.filter((item) => item.status !== 'pending').length === 0 ? <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhuma decisão registrada neste país.</div> : visibleTrainingQueue.filter((item) => item.status !== 'pending').map((item) => { const result = historyStatus(item); return <div key={`history-${item.id}`} className="space-y-3 rounded-md border border-border bg-muted/20 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-foreground">{item.conversations?.contact_name || 'Cliente sem nome'}</p><Badge variant="secondary">{countryLabel(itemCountry(item))}</Badge>{snapshotTagNames(item).length ? snapshotTagNames(item).map((tag) => <Badge key={`history-${item.id}-${tag}`} variant="outline">{tag}</Badge>) : <Badge variant="outline">Sem tag</Badge>}</div><p className="text-xs text-muted-foreground">{item.conversations?.contact_phone || 'Telefone não informado'} · {new Date(item.processed_at || item.created_at).toLocaleString('pt-BR')} · {item.message_type}</p></div><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => navigate(`/conversations/${item.conversation_id}`)}><MessageCircle className="mr-2 h-4 w-4" />Abrir conversa</Button>{Number(item.confidence) > 0 && <Badge variant="outline">{Math.round(Number(item.confidence) * 100)}% confiança</Badge>}<Badge variant={result.variant}>{result.label}</Badge></div></div>
                      <div><p className="mb-1 text-xs font-medium text-muted-foreground">Mensagem do cliente</p><div className="rounded-md border border-border bg-background p-3 text-sm text-foreground">{item.customer_message}</div></div>
                      {item.message_type === 'image' && item.messages?.media_url && <div className="space-y-2"><MediaImage src={item.messages.media_url} alt="Imagem analisada pela IA" loading="eager" className="max-h-80 w-auto max-w-full rounded-md border border-border object-contain" />{(() => { const analysis = imageAnalysis(item); return analysis.reason ? <div className="flex flex-wrap items-center gap-2"><Badge variant={analysis.isReceipt ? 'default' : 'secondary'}>{analysis.isReceipt ? 'Possível comprovante' : 'Não parece comprovante'}</Badge>{analysis.confidence > 0 && <span className="text-xs text-muted-foreground">{Math.round(analysis.confidence * 100)}% de confiança</span>}<span className="w-full text-xs text-muted-foreground">{analysis.reason}</span></div> : <Badge variant="outline">Sem análise visual registrada</Badge>; })()}</div>}
                      {item.suggested_action && <div><p className="mb-1 text-xs font-medium text-muted-foreground">Decisão da IA</p><p className="text-sm text-foreground">{item.suggested_action}</p></div>}
                      {readMessages(item.suggested_responses, item.suggested_response || '').filter(Boolean).length > 0 && <div><p className="mb-1 text-xs font-medium text-muted-foreground">Mensagens selecionadas, na ordem</p><div className="space-y-2">{readMessages(item.suggested_responses, item.suggested_response || '').filter(Boolean).map((message, index) => <div key={`${item.id}-history-${index}`} className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-foreground whitespace-pre-wrap"><span className="mb-1 block text-xs font-semibold text-primary">Mensagem {index + 1}</span>{message}</div>)}</div></div>}
                       {item.suggested_flow_id && <div><p className="mb-1 text-xs font-medium text-muted-foreground">Fluxo selecionado</p><p className="text-sm text-foreground">{flows.find((flow) => flow.id === item.suggested_flow_id)?.name || 'Fluxo removido ou indisponível'}</p></div>}
                      {item.match_reason && <div><p className="mb-1 text-xs font-medium text-muted-foreground">Motivo</p><p className="text-sm text-muted-foreground">{item.match_reason}</p></div>}
                    </div>; })}
                  </div>}
                </div>
              )}

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

        {!standalone && <section className="border-t border-border pt-6">
          <div className="mb-4"><h3 className="font-semibold text-foreground">Histórico de decisões</h3><p className="text-sm text-muted-foreground">Motivo, confiança e bloqueios usados pela Orquestradora.</p></div>
          {decisions.length === 0 ? <div className="rounded-md border border-dashed border-border py-10 text-center text-sm text-muted-foreground">Nenhuma decisão registrada ainda.</div> : <div className="overflow-hidden rounded-md border border-border bg-card">{decisions.map((decision) => <div key={decision.id} className="grid gap-3 border-b border-border p-4 last:border-0 md:grid-cols-[180px_160px_1fr_90px] md:items-center"><div><p className="text-sm font-medium text-foreground">{decision.conversations?.contact_name || decision.conversations?.contact_phone || 'Conversa'}</p><p className="text-xs text-muted-foreground">{new Date(decision.created_at).toLocaleString('pt-BR')}</p></div><div><Badge variant={decision.selected_agent === 'none' ? 'secondary' : 'default'}>{AGENT_LABELS[decision.selected_agent] || 'Nenhuma ação'}</Badge><p className="mt-1 text-xs text-muted-foreground">{decision.action === 'recommend_only' ? 'Somente recomendação' : decision.action}</p></div><div><p className="text-sm text-foreground">{decision.reason}</p>{decision.blockers?.length > 0 && <p className="mt-1 text-xs text-destructive">{decision.blockers.join(' · ')}</p>}</div><div className="text-right"><p className="text-sm font-semibold text-foreground">{Math.round(Number(decision.confidence) * 100)}%</p><p className="text-xs text-muted-foreground">confiança</p></div></div>)}</div>}
        </section>}
      </div>
    </div>
  );
}
