import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { supabase } from '@/integrations/supabase/client';
import AutomationNode from '@/components/automation/AutomationNode';
import NodeEditor from '@/components/automation/NodeEditor';
import {
  ArrowLeft, Save, MessageSquare, Clock, Image, Music, Video,
  Loader2, FileText, GitFork, Bot, ListOrdered, Play, Pause,
  Zap, Cog, Upload, Tag, CircleAlert, Wrench, ChevronRight, BarChart3,
  Search, X, Phone, Route
} from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { parseDcFile } from '@/lib/dcParser';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const nodeTypes = { automation: AutomationNode };

const triggerOptions = [
  { value: 'manual', label: 'Disparo Manual' },
  { value: 'message_received', label: 'Ao Receber Mensagem' },
  { value: 'keyword', label: 'Palavra-chave' },
  { value: 'new_conversation', label: 'Nova Conversa' },
  { value: 'scheduled', label: 'Agendado' },
];

const smartConditionLabels = ['X', 'Y', 'Z', 'W', 'V'] as const;

const getSmartConditionOptionCount = (config: Record<string, unknown>) => {
  const configuredCount = Number(config.smart_condition_option_count);
  if (Number.isInteger(configuredCount)) return Math.max(2, Math.min(5, configuredCount));
  const lastConfiguredIndex = smartConditionLabels.reduce(
    (last, label, index) => String(config[`option_${label.toLowerCase()}`] || '').trim() ? index : last,
    1,
  );
  return lastConfiguredIndex + 1;
};

const getRequiredSourceHandles = (node: Node) => {
  const nodeType = node.data.nodeType as string;
  if (nodeType === 'smart_condition') {
    const config = (node.data.config as Record<string, unknown>) || {};
    return smartConditionLabels
      .slice(0, getSmartConditionOptionCount(config))
      .map((label) => label.toLowerCase());
  }
  if (nodeType === 'wait_for_response') return ['response', 'timeout'];
  if (nodeType === 'smart_reply') return ['answered', 'no_answer', 'error'];
  if (nodeType === 'receipt_detector') return ['receipt', 'not_receipt', 'error'];
  return [];
};

const normalizeLegacyBranchEdges = (nodes: Node[], edges: Edge[]) => {
  const normalized = edges.map((edge) => ({ ...edge }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  nodes.forEach((node) => {
    const requiredHandles = getRequiredSourceHandles(node);
    if (requiredHandles.length === 0) return;

    const outgoing = normalized.filter((edge) => edge.source === node.id);
    outgoing.forEach((edge) => {
      const normalizedHandle = String(edge.sourceHandle || '').trim().toLowerCase();
      edge.sourceHandle = requiredHandles.includes(normalizedHandle) ? normalizedHandle : null;
    });

    const usedHandles = new Set(outgoing.map((edge) => edge.sourceHandle).filter(Boolean));
    const availableHandles = requiredHandles.filter((handle) => !usedHandles.has(handle));

    outgoing
      .filter((edge) => !edge.sourceHandle)
      .sort((first, second) => {
        const firstTarget = nodeById.get(first.target);
        const secondTarget = nodeById.get(second.target);
        return (firstTarget?.position.x ?? 0) - (secondTarget?.position.x ?? 0);
      })
      .forEach((edge, index) => {
        const inferredHandle = availableHandles[index];
        if (inferredHandle) edge.sourceHandle = inferredHandle;
      });
  });

  return normalized;
};

interface FlowIssue {
  id: string;
  nodeId?: string;
  block: string;
  problem: string;
  solution: string;
  autoFixable: boolean;
}

interface LeadExecution {
  execution_id: string;
  conversation_id: string;
  contact_name: string | null;
  contact_phone: string;
  status: string;
  failed_at_node_id: string | null;
  waiting_node_id: string | null;
  started_at: string;
  completed_at: string | null;
  waiting_since: string | null;
  wait_timeout_at: string | null;
  completed_nodes: number;
  total_nodes: number;
}

interface LeadStep {
  node_id: string;
  sort_order: number;
  status: string;
  error_message: string | null;
  executed_at: string;
}

const executionStatusLabels: Record<string, string> = {
  running: 'Em andamento', completed: 'Concluído', failed: 'Com problema',
  waiting_for_response: 'Aguardando resposta', superseded: 'Substituído', skipped: 'Ignorado',
};

const nodeTypeLabels: Record<string, string> = {
  trigger: 'Gatilho', message: 'Mensagem', delay: 'Espera', wait_for_response: 'Aguardando Resposta',
  image: 'Imagem', audio: 'Áudio', video: 'Vídeo', document: 'Documento', condition: 'Condição',
  smart_condition: 'Condição Inteligente', quick_reply: 'Resposta Rápida', call_button: 'Botão de Ligação',
  smart_reply: 'Resposta Inteligente', receipt_detector: 'Reconhecer Comprovante', action: 'Ação',
};

const getNodeName = (node: Node) => {
  const label = String(node.data.label || '').trim();
  return label || nodeTypeLabels[String(node.data.nodeType)] || 'Bloco sem nome';
};

const getFlowIssues = (nodes: Node[], edges: Edge[], flowName: string): FlowIssue[] => {
  const issues: FlowIssue[] = [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const addNodeIssue = (node: Node, key: string, problem: string, solution: string, autoFixable = false) => {
    issues.push({ id: `${node.id}-${key}`, nodeId: node.id, block: getNodeName(node), problem, solution, autoFixable });
  };

  if (!flowName.trim()) {
    issues.push({ id: 'flow-name', block: 'Dados do fluxo', problem: 'O fluxo está sem nome.', solution: 'Digite um nome no campo superior.', autoFixable: false });
  }
  if (!nodes.some((node) => node.data.nodeType === 'trigger')) {
    issues.push({ id: 'missing-trigger', block: 'Início do fluxo', problem: 'O fluxo não possui um gatilho.', solution: 'Adicione ao menos um gatilho para definir como o fluxo começa.', autoFixable: false });
  }

  const duplicatedNodeIds = nodes.filter((node, index) => nodes.findIndex((item) => item.id === node.id) !== index);
  duplicatedNodeIds.forEach((node) => addNodeIssue(node, 'duplicate-id', 'Este bloco possui uma identificação duplicada.', 'Remova o bloco duplicado e crie-o novamente.'));

  edges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      issues.push({
        id: `edge-dangling-${edge.id}`,
        block: 'Conexão inválida',
        problem: 'Uma linha aponta para um bloco que já foi removido.',
        solution: 'A linha inválida pode ser removida automaticamente.',
        autoFixable: true,
      });
    }
  });

  const adjacency = new Map<string, string[]>();
  edges.forEach((edge) => adjacency.set(edge.source, [...(adjacency.get(edge.source) || []), edge.target]));
  const visited = new Set<string>();
  const activePath = new Set<string>();
  const hasCycleFrom = (nodeId: string): boolean => {
    if (activePath.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    activePath.add(nodeId);
    const hasCycle = (adjacency.get(nodeId) || []).some(hasCycleFrom);
    activePath.delete(nodeId);
    return hasCycle;
  };
  if (nodes.some((node) => hasCycleFrom(node.id))) {
    issues.push({ id: 'flow-cycle', block: 'Caminho circular', problem: 'Uma sequência de linhas volta para um bloco anterior e pode repetir para sempre.', solution: 'Remova a linha que faz o caminho retornar a um bloco já percorrido.', autoFixable: false });
  }

  const seenEdges = new Set<string>();
  edges.forEach((edge) => {
    const key = `${edge.source}:${edge.sourceHandle || ''}:${edge.target}`;
    if (seenEdges.has(key)) {
      issues.push({
        id: `edge-duplicate-${edge.id}`,
        block: 'Conexão duplicada',
        problem: 'A mesma linha foi criada mais de uma vez.',
        solution: 'A cópia duplicada pode ser removida automaticamente.',
        autoFixable: true,
      });
    }
    seenEdges.add(key);
  });

  nodes.forEach((node) => {
    const type = String(node.data.nodeType || '');
    const config = (node.data.config as Record<string, unknown>) || {};
    const outgoing = edges.filter((edge) => edge.source === node.id);
    const requiredHandles = getRequiredSourceHandles(node);

    if (!type) addNodeIssue(node, 'type', 'O tipo deste bloco não foi identificado.', 'Remova este bloco e adicione-o novamente.');
    if (!String(node.data.label || '').trim()) addNodeIssue(node, 'label', 'O bloco está sem nome.', 'Abra o bloco e informe um nome.');

    requiredHandles.forEach((handle) => {
      if (!outgoing.some((edge) => edge.sourceHandle === handle)) {
        const handleLabel: Record<string, string> = {
          response: 'Respondeu', timeout: 'Tempo esgotado', answered: 'Respondeu', no_answer: 'Sem resposta',
          error: 'Erro', receipt: 'Comprovante', not_receipt: 'Não é comprovante',
        };
        addNodeIssue(node, `handle-${handle}`, `A saída “${handleLabel[handle] || handle.toUpperCase()}” não está conectada.`, 'Arraste essa saída até o próximo bloco.');
      }
    });

    if (type === 'smart_condition') {
      smartConditionLabels.slice(0, getSmartConditionOptionCount(config)).forEach((label) => {
        const handle = label.toLowerCase();
        if (!String(config[`option_${handle}`] || '').trim()) {
          addNodeIssue(node, `option-${handle}`, `O significado do caminho ${label} está vazio.`, `Abra o bloco e descreva quando a IA deve seguir pelo caminho ${label}.`);
        }
      });
    }
    if (type === 'wait_for_response' && !(Number(config.timeout_value ?? 24) > 0)) {
      addNodeIssue(node, 'timeout', 'O prazo de espera é inválido.', 'Definir automaticamente o prazo padrão de 24 horas.', true);
    }
    if (type === 'smart_reply' && config.knowledge_source_mode === 'selected'
      && (!Array.isArray(config.knowledge_base_item_ids) || config.knowledge_base_item_ids.length === 0)) {
      addNodeIssue(node, 'knowledge', 'Nenhum conteúdo específico foi escolhido.', 'Escolha um conteúdo ou altere para seleção automática.');
    }
    if (type === 'message' && !String(config.content || '').trim()) {
      addNodeIssue(node, 'content', 'A mensagem está vazia.', 'Abra o bloco e escreva a mensagem que será enviada.');
    }
    if (['image', 'audio', 'video', 'document'].includes(type) && !String(config.media_url || '').trim()) {
      addNodeIssue(node, 'media', 'Nenhum arquivo foi enviado neste bloco.', 'Abra o bloco e envie o arquivo.');
    }
    if (type === 'condition' && !String(config.condition_value || '').trim()) {
      addNodeIssue(node, 'condition-value', 'O valor da condição está vazio.', 'Abra o bloco e informe o valor que será comparado.');
    }
    if (type === 'quick_reply') {
      if (!String(config.content || '').trim()) addNodeIssue(node, 'quick-content', 'O texto da resposta rápida está vazio.', 'Escreva o texto que acompanhará os botões.');
      if (!Array.isArray(config.buttons) || config.buttons.length === 0) addNodeIssue(node, 'quick-buttons', 'A resposta rápida não possui botões.', 'Adicione ao menos um botão.');
    }
    if (type === 'call_button' && !String(config.call_phone || '').trim()) {
      addNodeIssue(node, 'phone', 'O telefone do botão de ligação está vazio.', 'Informe o número com código do país.');
    }
    if (type === 'action') {
      const actionType = String(config.action_type || 'add_tag');
      if (['add_tag', 'remove_tag'].includes(actionType) && !config.tag_id && !String(config.tag_name || '').trim()) {
        addNodeIssue(node, 'tag', 'Nenhuma etiqueta foi escolhida.', 'Abra o bloco e escolha ou crie uma etiqueta.');
      }
      if (actionType === 'set_funnel_stage' && !config.funnel_stage) addNodeIssue(node, 'funnel', 'Nenhuma etapa do funil foi escolhida.', 'Escolha uma etapa do funil.');
      if (actionType === 'set_billing_stage' && !String(config.billing_stage || '').trim()) addNodeIssue(node, 'billing', 'A etapa da cobrança está vazia.', 'Informe a etapa da cobrança.');
      if (actionType === 'send_flow' && !config.flow_id) addNodeIssue(node, 'flow', 'Nenhum outro fluxo foi escolhido.', 'Escolha o fluxo que deve ser iniciado.');
      if (actionType === 'transfer_agent' && !config.agent_id) addNodeIssue(node, 'agent', 'Nenhum atendente foi escolhido.', 'Escolha quem receberá a conversa.');
      if (actionType === 'webhook') {
        const webhookUrl = String(config.webhook_url || '').trim();
        if (!webhookUrl) addNodeIssue(node, 'webhook', 'O endereço do webhook está vazio.', 'Informe um endereço iniciado por https://.');
        else {
          try { new URL(webhookUrl); } catch { addNodeIssue(node, 'webhook-format', 'O endereço do webhook é inválido.', 'Use um endereço completo, como https://exemplo.com/webhook.'); }
        }
        ['webhook_headers', 'webhook_body'].forEach((field) => {
          const value = String(config[field] || '').trim();
          if (!value) return;
          try { JSON.parse(value); } catch { addNodeIssue(node, field, `O JSON de ${field === 'webhook_headers' ? 'cabeçalhos' : 'conteúdo'} é inválido.`, 'Corrija aspas, vírgulas e chaves do JSON.'); }
        });
      }
    }
  });

  return issues;
};

const safelyFixFlow = (nodes: Node[], edges: Edge[]) => {
  const fixedNodes: Node[] = nodes.map((node) => {
    const config = { ...((node.data.config as Record<string, unknown>) || {}) };
    if (node.data.nodeType === 'wait_for_response' && !(Number(config.timeout_value) > 0)) {
      config.timeout_value = 24;
      config.timeout_unit = 'hours';
    }
    if (node.data.nodeType === 'smart_reply' && !config.knowledge_source_mode) config.knowledge_source_mode = 'automatic';
    if (node.data.nodeType === 'receipt_detector' && !(Number(config.minimum_confidence) > 0)) config.minimum_confidence = 0.75;
    return { ...node, data: { ...node.data, config } };
  });
  const nodeIds = new Set(fixedNodes.map((node) => node.id));
  const normalized = normalizeLegacyBranchEdges(fixedNodes, edges).filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const seen = new Set<string>();
  const fixedEdges = normalized.filter((edge) => {
    const key = `${edge.source}:${edge.sourceHandle || ''}:${edge.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { nodes: fixedNodes, edges: fixedEdges };
};

const countSafeRepairs = (nodes: Node[], edges: Edge[]) => {
  const fixed = safelyFixFlow(nodes, edges);
  const nodeChanges = fixed.nodes.filter((node, index) =>
    JSON.stringify(node.data.config || {}) !== JSON.stringify(nodes[index]?.data.config || {}),
  ).length;
  const originalEdges = new Map(edges.map((edge) => [edge.id, edge]));
  const edgeChanges = Math.abs(edges.length - fixed.edges.length) + fixed.edges.filter((edge) => {
    const original = originalEdges.get(edge.id);
    return original && original.sourceHandle !== edge.sourceHandle;
  }).length;
  return nodeChanges + edgeChanges;
};

interface ToolCategory {
  label: string;
  items: { type: string; label: string; icon: React.ElementType; desc: string }[];
}

const toolCategories: ToolCategory[] = [
  {
    label: 'Gatilhos',
    items: [
      { type: 'trigger_manual', label: 'Disparo Manual', icon: Zap, desc: 'O agente inicia manualmente' },
      { type: 'trigger_message_received', label: 'Ao Receber Mensagem', icon: Zap, desc: 'Quando qualquer mensagem chega' },
      { type: 'trigger_keyword', label: 'Palavra-chave', icon: Zap, desc: 'Dispara com palavras específicas' },
      { type: 'trigger_new_conversation', label: 'Nova Conversa', icon: Zap, desc: 'Novo contato inicia conversa' },
      { type: 'trigger_scheduled', label: 'Agendado', icon: Zap, desc: 'Em horários programados' },
    ],
  },
  {
    label: 'Mensagens',
    items: [
      { type: 'message', label: 'Texto', icon: MessageSquare, desc: 'Mensagem de texto simples' },
      { type: 'image', label: 'Imagem', icon: Image, desc: 'Enviar uma imagem' },
      { type: 'audio', label: 'Áudio', icon: Music, desc: 'Enviar um áudio' },
      { type: 'video', label: 'Vídeo', icon: Video, desc: 'Enviar um vídeo' },
      { type: 'document', label: 'Documento', icon: FileText, desc: 'Enviar um arquivo' },
    ],
  },
  {
    label: 'Interação',
    items: [
      { type: 'quick_reply', label: 'Resposta Rápida', icon: ListOrdered, desc: 'Botões de resposta rápida' },
      { type: 'call_button', label: 'Botão de Ligação', icon: Zap, desc: 'Botão para o cliente ligar' },
      { type: 'smart_reply', label: 'Resposta Inteligente', icon: Bot, desc: 'Responde dúvidas usando a base oficial' },
      { type: 'receipt_detector', label: 'Reconhecer Comprovante', icon: Image, desc: 'Analisa a última imagem com IA' },
    ],
  },
  {
    label: 'Lógica',
    items: [
      { type: 'delay', label: 'Espera', icon: Clock, desc: 'Aguardar antes de continuar' },
      { type: 'wait_for_response', label: 'Aguardando Resposta', icon: MessageSquare, desc: 'Esperar o cliente ou seguir por prazo' },
      { type: 'condition', label: 'Condição', icon: GitFork, desc: 'Caminho condicional' },
      { type: 'smart_condition', label: 'Condição Inteligente', icon: Bot, desc: 'IA escolhe entre até cinco caminhos' },
    ],
  },
  {
    label: 'Ações',
    items: [
      { type: 'action', label: 'Ação', icon: Cog, desc: 'Etiqueta, transferir, webhook' },
    ],
  },
];

const allItems = toolCategories.flatMap((c) => c.items);

export default function FlowEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [flowName, setFlowName] = useState('');
  const [flowDescription, setFlowDescription] = useState('');
  const [flowActive, setFlowActive] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);
  const [flowNicheId, setFlowNicheId] = useState<string | null>(null);
  const [niches, setNiches] = useState<{ id: string; name: string }[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const { currentWorkspace } = useWorkspace();
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [toolbarOpen, setToolbarOpen] = useState(true);
  const [saveIssues, setSaveIssues] = useState<FlowIssue[]>([]);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [savedWithIssues, setSavedWithIssues] = useState(false);
  const [leadPhone, setLeadPhone] = useState('');
  const [leadSearching, setLeadSearching] = useState(false);
  const [leadExecutions, setLeadExecutions] = useState<LeadExecution[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState('');
  const [leadSteps, setLeadSteps] = useState<LeadStep[]>([]);

  const selectedExecution = leadExecutions.find((execution) => execution.execution_id === selectedExecutionId) || null;
  const leadTrace = useMemo(() => {
    if (!selectedExecution) return null;
    const orderedSteps = [...leadSteps].sort((a, b) => a.sort_order - b.sort_order || a.executed_at.localeCompare(b.executed_at));
    const nodeIds = new Set(orderedSteps.map((step) => step.node_id));
    const edgeIds = new Set<string>();
    orderedSteps.slice(0, -1).forEach((step, index) => {
      const next = orderedSteps[index + 1];
      edges.filter((edge) => edge.source === step.node_id && edge.target === next.node_id).forEach((edge) => edgeIds.add(edge.id));
    });
    const lastStep = orderedSteps.at(-1);
    const currentNodeId = selectedExecution.status === 'waiting_for_response'
      ? selectedExecution.waiting_node_id
      : selectedExecution.status === 'failed'
        ? selectedExecution.failed_at_node_id || lastStep?.node_id || null
        : selectedExecution.status === 'running'
          ? lastStep?.node_id || null
          : null;
    if (currentNodeId) nodeIds.add(currentNodeId);
    return { nodeIds, edgeIds, currentNodeId };
  }, [edges, leadSteps, selectedExecution]);

  const displayedNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      leadTraceState: leadTrace?.currentNodeId === node.id
        ? 'current'
        : leadTrace?.nodeIds.has(node.id) ? 'visited' : undefined,
    },
  })), [leadTrace, nodes]);

  const displayedEdges = useMemo(() => edges.map((edge) => leadTrace?.edgeIds.has(edge.id) ? {
    ...edge,
    animated: true,
    style: { stroke: 'hsl(var(--primary))', strokeWidth: 4 },
  } : leadTrace ? {
    ...edge,
    animated: false,
    style: { stroke: 'hsl(var(--muted-foreground) / 0.25)', strokeWidth: 1.5 },
  } : edge), [edges, leadTrace]);

  const handleNodeDelete = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (id) loadFlow();
  }, [id]);

  useEffect(() => {
    const wsId = currentWorkspace?.id;
    if (!wsId) return;
    supabase.from('niches').select('id, name').eq('workspace_id', wsId as any)
      .then(({ data }) => { if (data) setNiches(data); });
  }, [currentWorkspace?.id]);

  const loadFlow = async () => {
    if (!id) return;

    const [flowRes, nodesRes, edgesRes] = await Promise.all([
      supabase.from('automation_flows').select('*').eq('id', id).single(),
      supabase.from('automation_nodes').select('*').eq('flow_id', id).order('sort_order'),
      supabase.from('automation_edges').select('*').eq('flow_id', id),
    ]);

    if (flowRes.data) {
      setFlowName(flowRes.data.name);
      setFlowDescription(flowRes.data.description || '');
      setFlowActive(flowRes.data.is_active);
      setManualOnly((flowRes.data as any).manual_only ?? false);
      setFlowNicheId(flowRes.data.niche_id || null);
    }

    if (nodesRes.data && nodesRes.data.length > 0) {
      setNodes(
        nodesRes.data.map((n: any) => ({
          id: n.id,
          type: 'automation',
          position: { x: n.position_x, y: n.position_y },
          data: {
            nodeType: n.node_type,
            label: n.label,
            preview: getPreview(n.node_type, n.config as Record<string, unknown>),
            config: n.config,
            onDelete: handleNodeDelete,
          },
          deletable: true,
        }))
      );

      // Connection IDs are now stored per trigger node in their config
    } else {
      // Create a default trigger node
      const triggerNode: Node = {
        id: crypto.randomUUID(),
        type: 'automation',
        position: { x: 300, y: 50 },
        data: { nodeType: 'trigger', label: 'Disparo Manual', config: { trigger_type: 'manual' }, preview: '', onDelete: handleNodeDelete },
        deletable: true,
      };
      setNodes([triggerNode]);
    }

    if (edgesRes.data) {
      setEdges(
        edgesRes.data.map((e: any) => ({
          id: e.id,
           source: e.source_node_id,
          target: e.target_node_id,
           sourceHandle: e.source_handle || undefined,
          animated: true,
          style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
        }))
      );
    }

    setLoading(false);
  };

  const getPreview = (type: string, config: Record<string, unknown>): string => {
    if (type === 'message') return (config?.content as string)?.slice(0, 50) || '';
    if (type === 'delay') {
      const val = (config?.delay_value as number) || (config?.delay_seconds as number) || 5;
      const unit = (config?.delay_unit as string) || 'seconds';
      return `${val} ${unit === 'minutes' ? 'min' : unit === 'hours' ? 'h' : 's'}`;
    }
    if (type === 'wait_for_response') {
      const val = Number(config?.timeout_value) || 24;
      const unit = (config?.timeout_unit as string) || 'hours';
      return `Até ${val} ${unit === 'minutes' ? 'min' : unit === 'days' ? 'dias' : 'h'}`;
    }
    if (type === 'image' || type === 'video' || type === 'document') return (config?.caption as string) || '';
    if (type === 'audio') return config?.media_url ? 'Áudio anexado' : '';
    if (type === 'quick_reply') return (config?.content as string)?.slice(0, 40) || '';
    if (type === 'smart_reply') {
      const selectedCount = Array.isArray(config?.knowledge_base_item_ids) ? config.knowledge_base_item_ids.length : 0;
      return config?.knowledge_source_mode === 'selected' ? `${selectedCount} conteúdo(s) escolhido(s)` : 'Toda a base por nicho e país';
    }
    if (type === 'receipt_detector') return `Confiança mínima ${Math.round((Number(config?.minimum_confidence) || 0.75) * 100)}%`;
    if (type === 'condition') return `${config?.condition_field || ''} ${config?.condition_operator || ''} ${config?.condition_value || ''}`;
    if (type === 'action') {
      const at = config?.action_type as string;
      if (at === 'add_tag') return `+ ${(config?.tag_name as string) || 'etiqueta'}`;
      if (at === 'remove_tag') return `- ${(config?.tag_name as string) || 'etiqueta'}`;
      if (at === 'set_funnel_stage') return `🎯 ${(config?.funnel_stage_label as string) || (config?.funnel_stage as string) || 'etapa'}`;
      if (at === 'send_flow') return `→ ${(config?.flow_name as string) || 'outro fluxo'}`;
       if (at === 'transfer_human') return '→ Atendimento humano';
      if (at === 'transfer_agent') return `→ ${(config?.agent_name as string) || 'agente'}`;
      if (at === 'webhook') return (config?.webhook_url as string)?.slice(0, 30) || 'webhook';
      return 'Ação';
    }
    return '';
  };

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) => {
        const withoutExistingBranch = params.sourceHandle
          ? eds.filter((edge) => !(edge.source === params.source && edge.sourceHandle === params.sourceHandle))
          : eds;
        return addEdge({ ...params, animated: true, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } }, withoutExistingBranch);
      });
    },
    [setEdges]
  );

  const addNode = (type: string) => {
    // Determine actual nodeType and default config for trigger subtypes
    let actualType = type;
    const defaultConfig: Record<string, unknown> = {};
    let label = '';

    if (type.startsWith('trigger_')) {
      actualType = 'trigger';
      const triggerSubtype = type.replace('trigger_', '');
      defaultConfig.trigger_type = triggerSubtype;
      defaultConfig.connection_ids = [];
      label = triggerOptions.find(t => t.value === triggerSubtype)?.label || 'Gatilho';

      // Position triggers side by side at top
      const triggerNodes = nodes.filter(n => (n.data.nodeType as string) === 'trigger');
      const xPos = triggerNodes.length > 0
        ? Math.max(...triggerNodes.map(n => n.position.x)) + 300
        : 300;

      const newNode: Node = {
        id: crypto.randomUUID(),
        type: 'automation',
        position: { x: xPos, y: 50 },
        data: { nodeType: actualType, label, config: defaultConfig, preview: '', onDelete: handleNodeDelete },
        deletable: true,
      };
      setNodes((nds) => [...nds, newNode]);
      return;
    }

    const item = allItems.find((b) => b.type === type);
    if (type === 'delay') { defaultConfig.delay_value = 5; defaultConfig.delay_unit = 'seconds'; }
    if (type === 'wait_for_response') { defaultConfig.timeout_value = 24; defaultConfig.timeout_unit = 'hours'; }
    if (type === 'condition') { defaultConfig.condition_field = 'last_message'; defaultConfig.condition_operator = 'equals'; }
    if (type === 'smart_condition') {
      defaultConfig.option_x = '';
      defaultConfig.option_y = '';
      defaultConfig.smart_condition_option_count = 2;
      defaultConfig.context_message_limit = 20;
    }
    if (type === 'smart_reply') { defaultConfig.context_message_limit = 20; defaultConfig.minimum_confidence = 0.75; }
    if (type === 'receipt_detector') { defaultConfig.minimum_confidence = 0.75; }
    if (type === 'action') { defaultConfig.action_type = 'add_tag'; }

    const lastNode = nodes[nodes.length - 1];
    const yPos = lastNode ? lastNode.position.y + 160 : 200;
    const xPos = lastNode ? lastNode.position.x : 300;

    const newNode: Node = {
      id: crypto.randomUUID(),
      type: 'automation',
      position: { x: xPos, y: yPos },
      data: {
        nodeType: type,
        label: item?.label || type,
        config: defaultConfig,
        preview: getPreview(type, defaultConfig),
        onDelete: handleNodeDelete,
      },
    };

    setNodes((nds) => [...nds, newNode]);

    if (lastNode) {
      const newEdge: Edge = {
        id: `e-${lastNode.id}-${newNode.id}`,
        source: lastNode.id,
        target: newNode.id,
        animated: true,
        style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
      };
      setEdges((eds) => [...eds, newEdge]);
    }
  };

  const handleImportDc = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const { nodes: importedNodes, edges: importedEdges } = parseDcFile(content, handleNodeDelete, getPreview);
        setNodes(importedNodes);
        setEdges(importedEdges);
        toast.success(`Importado com sucesso: ${importedNodes.length} nós`);
      } catch (err) {
        console.error('Import error:', err);
        toast.error('Erro ao importar arquivo .dc');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [handleNodeDelete, setNodes, setEdges]);

  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  };

  const handleNodeSave = (nodeId: string, label: string, config: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                label,
                config,
                preview: getPreview(n.data.nodeType as string, config),
              },
            }
          : n
      )
    );
    const savedNodeType = nodes.find((node) => node.id === nodeId)?.data.nodeType;
    if (savedNodeType === 'smart_condition') {
      const activeHandles = new Set(smartConditionLabels.slice(0, getSmartConditionOptionCount(config)).map((item) => item.toLowerCase()));
      setEdges((currentEdges) => currentEdges.filter((edge) => edge.source !== nodeId || !edge.sourceHandle || activeHandles.has(edge.sourceHandle)));
    }
  };

  const loadLeadSteps = async (executionId: string) => {
    setSelectedExecutionId(executionId);
    const { data, error } = await supabase.from('flow_step_logs')
      .select('node_id, sort_order, status, error_message, executed_at')
      .eq('execution_id', executionId)
      .order('sort_order', { ascending: true })
      .order('executed_at', { ascending: true });
    if (error) {
      console.error('Error loading lead steps:', error);
      setLeadSteps([]);
      toast.error(`Não foi possível carregar o caminho: ${error.message}`);
      return;
    }
    setLeadSteps((data || []) as LeadStep[]);
  };

  const searchLead = async () => {
    const normalizedPhone = leadPhone.replace(/\D/g, '');
    if (normalizedPhone.length < 7 || !id) {
      toast.error('Digite um número completo, incluindo o código do país.');
      return;
    }
    setLeadSearching(true);
    try {
      const { data, error } = await supabase.rpc('find_flow_lead_executions_by_phone', {
        p_flow_id: id,
        p_phone: normalizedPhone,
        p_limit: 10,
      });
      if (error) throw error;
      const executions = (data || []) as LeadExecution[];
      setLeadExecutions(executions);
      if (executions.length === 0) {
        setSelectedExecutionId('');
        setLeadSteps([]);
        toast.info('Nenhuma passagem deste telefone foi encontrada neste fluxo.');
        return;
      }
      await loadLeadSteps(executions[0].execution_id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Falha ao procurar o telefone.';
      console.error('Error searching lead trace:', error);
      toast.error(`Não foi possível acompanhar o lead: ${detail}`);
    } finally {
      setLeadSearching(false);
    }
  };

  const clearLeadTrace = () => {
    setLeadPhone('');
    setLeadExecutions([]);
    setSelectedExecutionId('');
    setLeadSteps([]);
  };


  const toggleActive = async () => {
    if (!id) return;
    const next = !flowActive;
    await supabase.from('automation_flows').update({ is_active: next }).eq('id', id);
    setFlowActive(next);
    toast.success(next ? 'Fluxo ativado' : 'Fluxo desativado');
  };

  const saveFlow = async () => {
    // Flows created before named branch handles were introduced can still be
    // open in the editor with valid-looking connections whose handle is null.
    // Normalize those in memory so the user can save without reloading or
    // rebuilding work already present on the canvas.
    const safeRepairCount = countSafeRepairs(nodes, edges);
    const fixed = safelyFixFlow(nodes, edges);
    const normalizedEdges = fixed.edges;
    const issues = getFlowIssues(fixed.nodes, normalizedEdges, flowName);
    setNodes(fixed.nodes);
    setEdges(normalizedEdges);
    if (safeRepairCount > 0 || issues.length > 0) {
      const reportedIssues = safeRepairCount > 0
        ? [{
            id: 'safe-repairs',
            block: 'Correções automáticas aplicadas',
            problem: `${safeRepairCount} configuração(ões) ou conexão(ões) antiga(s) foi/foram normalizada(s) antes de salvar.`,
            solution: 'Nenhuma ação é necessária. Seus blocos e conteúdos foram preservados.',
            autoFixable: false,
          }, ...issues]
        : issues;
      setSaveIssues(reportedIssues);
      setSavedWithIssues(true);
    }
    if (!id) {
      toast.error('Não foi possível identificar este fluxo. Volte à lista e abra-o novamente.');
      return;
    }
    setSaving(true);
    try {
      const nodeInserts = fixed.nodes.map((n, i) => ({
        id: n.id,
        node_type: n.data.nodeType as string,
        label: n.data.label as string,
        config: JSON.parse(JSON.stringify((n.data.config as Record<string, unknown>) || {})),
        position_x: n.position.x,
        position_y: n.position.y,
        sort_order: i,
      }));
      const edgeInserts = normalizedEdges.map((e) => ({
        id: crypto.randomUUID(),
        source_node_id: e.source,
        target_node_id: e.target,
        source_handle: e.sourceHandle || null,
      }));

      const { error } = await supabase.rpc('save_automation_flow_atomic', {
        p_flow_id: id,
        p_name: flowName.trim() || 'Fluxo sem nome',
        p_description: flowDescription,
        p_manual_only: manualOnly,
        p_niche_id: flowNicheId as any,
        p_nodes: nodeInserts,
        p_edges: edgeInserts,
      });
      if (error) {
        console.error('Error saving flow atomically:', error);
        const detail = error.message || 'A gravação foi recusada.';
        setSaveIssues([{
          id: 'database-save',
          block: 'Gravação do fluxo',
          problem: detail,
          solution: 'Seu trabalho continua nesta tela. Confira sua conexão e tente salvar novamente; nada do fluxo anterior foi apagado.',
          autoFixable: false,
        }]);
        setSavedWithIssues(false);
        setIssuesOpen(true);
        toast.error(`Não foi possível salvar: ${detail}`);
        return;
      }
      if (issues.length > 0 || safeRepairCount > 0) {
        setIssuesOpen(true);
        toast.warning(`Fluxo salvo com ${issues.length + safeRepairCount} aviso(s). Veja como corrigir.`);
      } else {
        setSaveIssues([]);
        setIssuesOpen(false);
        setSavedWithIssues(false);
        toast.success('Fluxo salvo com segurança');
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Erro inesperado durante a gravação.';
      console.error('Unexpected flow save error:', error);
      setSaveIssues([{
        id: 'unexpected-save',
        block: 'Gravação do fluxo',
        problem: detail,
        solution: 'Seu trabalho permanece aberto. Tente salvar novamente; se persistir, copie esta mensagem para o suporte.',
        autoFixable: false,
      }]);
      setSavedWithIssues(false);
      setIssuesOpen(true);
      toast.error(`Não foi possível salvar: ${detail}`);
    } finally {
      setSaving(false);
    }
  };

  const fixAllSafeIssues = () => {
    const fixed = safelyFixFlow(nodes, edges);
    setNodes(fixed.nodes);
    setEdges(fixed.edges);
    const remaining = getFlowIssues(fixed.nodes, fixed.edges, flowName);
    setSaveIssues(remaining);
    if (remaining.length === 0) {
      setIssuesOpen(false);
      toast.success('Problemas automáticos corrigidos. Clique em Salvar novamente.');
      return;
    }
    const correctedCount = Math.max(1, saveIssues.length - remaining.length);
    toast.success(correctedCount > 0
      ? `${correctedCount} problema(s) corrigido(s). Restam ${remaining.length} ajuste(s) manual(is).`
      : 'As correções automáticas já foram aplicadas. Veja os ajustes manuais restantes.');
  };

  const openIssueNode = (issue: FlowIssue) => {
    if (!issue.nodeId) return;
    const node = nodes.find((item) => item.id === issue.nodeId);
    if (node) {
      setSelectedNode(node);
      setIssuesOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <div className="flex h-14 items-center justify-between border-b border-border bg-card px-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/automation')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-col">
            <input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="text-sm font-bold text-card-foreground bg-transparent border-none focus:outline-none w-48"
              placeholder="Nome do fluxo"
            />
            <input
              value={flowDescription}
              onChange={(e) => setFlowDescription(e.target.value)}
              className="text-[11px] text-muted-foreground bg-transparent border-none focus:outline-none w-64"
              placeholder="Descrição do fluxo..."
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={flowNicheId || ''}
            onChange={(e) => setFlowNicheId(e.target.value || null)}
            className="h-8 rounded-lg border border-border bg-secondary px-2 text-xs text-foreground focus:outline-none"
          >
            <option value="">Sem nicho</option>
            {niches.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
          <button
            onClick={() => setManualOnly(!manualOnly)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              manualOnly
                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                : 'bg-secondary text-muted-foreground border border-border'
            }`}
            title="Quando ativado, a IA não selecionará este fluxo automaticamente"
          >
            {manualOnly ? 'Somente Manual' : 'Automático'}
          </button>
          <button
            onClick={toggleActive}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              flowActive
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'bg-secondary text-muted-foreground border border-border'
            }`}
          >
            {flowActive ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {flowActive ? 'Ativo' : 'Inativo'}
          </button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate(`/automation/${id}/metrics`)}
          >
            <BarChart3 className="h-4 w-4" />
            Analisar
          </Button>
          <button
            onClick={saveFlow}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </button>
        </div>
      </div>

      <div className="flex flex-1 relative overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-border bg-card flex flex-col shrink-0 overflow-y-auto">
          {/* === COMPONENTS SECTION === */}
          <div className="p-3 border-b border-border">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">Componentes</p>
          </div>
          {toolCategories.map((cat) => (
            <div key={cat.label} className="border-b border-border">
              <p className="px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                {cat.label}
              </p>
              <div className="px-2 pb-2 space-y-0.5">
                {cat.items.map((item) => (
                  <button
                    key={item.type}
                    onClick={() => addNode(item.type)}
                    className="flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-left hover:bg-secondary transition-colors group"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary group-hover:bg-primary/10 transition-colors">
                      <item.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-card-foreground">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground leading-tight">{item.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Import .dc */}
          <div className="p-3 border-t border-border">
            <label className="flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 text-left hover:bg-secondary transition-colors cursor-pointer group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary group-hover:bg-primary/10 transition-colors">
                <Upload className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </div>
              <div>
                <p className="text-xs font-semibold text-card-foreground">Importar .dc</p>
                <p className="text-[10px] text-muted-foreground leading-tight">Importar fluxo externo</p>
              </div>
              <input type="file" accept=".dc,.json" onChange={handleImportDc} className="hidden" />
            </label>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1">
          <ReactFlow
            nodes={displayedNodes}
            edges={displayedEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={handleNodeClick}
            onPaneClick={() => setSelectedNode(null)}
            nodeTypes={nodeTypes}
            fitView
            className="bg-background"
            defaultEdgeOptions={{
              animated: true,
              style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 },
            }}
          >
            <Controls className="!bg-card !border-border !shadow-md !rounded-xl [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button]:!rounded-lg" />
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsl(var(--border))" />
            <MiniMap
              className="!bg-card !border-border !rounded-xl !shadow-md"
              maskColor="hsl(var(--background) / 0.7)"
              nodeColor="hsl(var(--primary))"
            />

            <Panel position="top-left" className="!m-3">
              <div className="w-[340px] rounded-md border border-border bg-card p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Route className="h-4 w-4 text-primary" />
                    <span className="text-xs font-bold text-foreground">Acompanhar lead</span>
                  </div>
                  {selectedExecution && (
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={clearLeadTrace} title="Limpar acompanhamento">
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Phone className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={leadPhone}
                      onChange={(event) => setLeadPhone(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') void searchLead(); }}
                      placeholder="Telefone com código do país"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <Button type="button" size="sm" className="h-8" onClick={() => void searchLead()} disabled={leadSearching}>
                    {leadSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Buscar
                  </Button>
                </div>
                {selectedExecution && (
                  <div className="mt-3 border-t border-border pt-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-foreground">{selectedExecution.contact_name || 'Sem nome'}</p>
                        <p className="text-[10px] text-muted-foreground">{selectedExecution.contact_phone}</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                        {executionStatusLabels[selectedExecution.status] || selectedExecution.status}
                      </span>
                    </div>
                    {leadExecutions.length > 1 && (
                      <select
                        value={selectedExecutionId}
                        onChange={(event) => void loadLeadSteps(event.target.value)}
                        className="mt-2 h-8 w-full rounded-md border border-border bg-secondary px-2 text-[11px] text-foreground focus:outline-none"
                      >
                        {leadExecutions.map((execution, index) => (
                          <option key={execution.execution_id} value={execution.execution_id}>
                            {index === 0 ? 'Mais recente' : `Execução ${index + 1}`} · {new Date(execution.started_at).toLocaleString('pt-BR')} · {executionStatusLabels[execution.status] || execution.status}
                          </option>
                        ))}
                      </select>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary/50" />Passou</span>
                      <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary ring-2 ring-primary/30" />Está aqui</span>
                      <span>{leadSteps.length} etapa(s) registrada(s)</span>
                    </div>
                    {selectedExecution.status === 'failed' && leadSteps.find((step) => step.status === 'failed')?.error_message && (
                      <p className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive">
                        {leadSteps.find((step) => step.status === 'failed')?.error_message}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Panel>

            {/* Node count panel */}
            <Panel position="top-right" className="!m-3">
              <div className="rounded-lg bg-card border border-border px-3 py-1.5 shadow-sm">
                <span className="text-[11px] text-muted-foreground">
                  {nodes.length} nós · {edges.length} conexões
                </span>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* Node editor panel */}
        {selectedNode && (
          <NodeEditor
            nodeId={selectedNode.id}
            nodeType={selectedNode.data.nodeType as string}
            label={selectedNode.data.label as string}
            config={(selectedNode.data.config as Record<string, unknown>) || {}}
            nicheId={flowNicheId}
            currentFlowId={id}
            onSave={handleNodeSave}
            onDelete={handleNodeDelete}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      <Dialog open={issuesOpen} onOpenChange={setIssuesOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="flex items-center gap-2">
              <CircleAlert className={`h-5 w-5 ${savedWithIssues ? 'text-primary' : 'text-destructive'}`} />
              {savedWithIssues ? 'Fluxo salvo com avisos' : 'Não foi possível salvar'}
            </DialogTitle>
            <DialogDescription>
              {savedWithIssues
                ? 'Seu trabalho foi salvo. Veja abaixo o que pode impedir a execução correta do fluxo.'
                : 'Nada foi apagado. Veja abaixo o problema e tente novamente.'}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[52vh] space-y-2 overflow-y-auto px-6 py-4">
            {saveIssues.map((issue, index) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => openIssueNode(issue)}
                disabled={!issue.nodeId}
                className="flex w-full items-start gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:bg-secondary/60 disabled:cursor-default disabled:hover:bg-card"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-xs font-bold text-destructive">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{issue.block}</span>
                  <span className="mt-0.5 block text-xs text-destructive">Problema: {issue.problem}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Como arrumar: {issue.solution}</span>
                </span>
                {issue.nodeId && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}
              </button>
            ))}
          </div>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setIssuesOpen(false)}>
              {savedWithIssues ? 'Fechar avisos' : 'Continuar editando'}
            </Button>
            {saveIssues.some((issue) => issue.autoFixable) && (
              <Button type="button" onClick={fixAllSafeIssues}>
                <Wrench className="h-4 w-4" />
                Corrigir automaticamente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
