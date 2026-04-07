import { useState, useEffect, useCallback } from 'react';
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
  Zap, Cog, Upload, Tag
} from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { parseDcFile } from '@/lib/dcParser';
import { toast } from 'sonner';

const nodeTypes = { automation: AutomationNode };

const triggerOptions = [
  { value: 'manual', label: 'Disparo Manual' },
  { value: 'message_received', label: 'Ao Receber Mensagem' },
  { value: 'keyword', label: 'Palavra-chave' },
  { value: 'new_conversation', label: 'Nova Conversa' },
  { value: 'scheduled', label: 'Agendado' },
];

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
      { type: 'ai_reply', label: 'Resposta IA', icon: Bot, desc: 'Resposta gerada por IA' },
    ],
  },
  {
    label: 'Lógica',
    items: [
      { type: 'delay', label: 'Espera', icon: Clock, desc: 'Aguardar antes de continuar' },
      { type: 'condition', label: 'Condição', icon: GitFork, desc: 'Caminho condicional' },
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
    if (type === 'image' || type === 'video' || type === 'document') return (config?.caption as string) || '';
    if (type === 'audio') return config?.media_url ? 'Áudio anexado' : '';
    if (type === 'quick_reply') return (config?.content as string)?.slice(0, 40) || '';
    if (type === 'ai_reply') return (config?.ai_prompt as string)?.slice(0, 40) || '';
    if (type === 'condition') return `${config?.condition_field || ''} ${config?.condition_operator || ''} ${config?.condition_value || ''}`;
    if (type === 'action') {
      const at = config?.action_type as string;
      if (at === 'add_tag') return `+ ${(config?.tag_name as string) || 'etiqueta'}`;
      if (at === 'remove_tag') return `- ${(config?.tag_name as string) || 'etiqueta'}`;
      if (at === 'set_funnel_stage') return `🎯 ${(config?.funnel_stage_label as string) || (config?.funnel_stage as string) || 'etapa'}`;
      if (at === 'transfer_agent') return `→ ${(config?.agent_name as string) || 'agente'}`;
      if (at === 'webhook') return (config?.webhook_url as string)?.slice(0, 30) || 'webhook';
      return 'Ação';
    }
    return '';
  };

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge({ ...params, animated: true, style: { stroke: 'hsl(var(--primary))', strokeWidth: 2 } }, eds)
      );
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
    if (type === 'condition') { defaultConfig.condition_field = 'last_message'; defaultConfig.condition_operator = 'equals'; }
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
  };


  const toggleActive = async () => {
    if (!id) return;
    const next = !flowActive;
    await supabase.from('automation_flows').update({ is_active: next }).eq('id', id);
    setFlowActive(next);
    toast.success(next ? 'Fluxo ativado' : 'Fluxo desativado');
  };

  const saveFlow = async () => {
    if (!id) return;
    setSaving(true);

    await supabase
      .from('automation_flows')
      .update({ name: flowName, description: flowDescription, manual_only: manualOnly, niche_id: flowNicheId } as any)
      .eq('id', id);

    // Nodes are saved as-is (connection_ids are already in each trigger node's config)
    const updatedNodes = nodes;

    await supabase.from('automation_edges').delete().eq('flow_id', id);
    await supabase.from('automation_nodes').delete().eq('flow_id', id);

    if (updatedNodes.length > 0) {
      const nodeInserts = updatedNodes.map((n, i) => ({
        id: n.id,
        flow_id: id,
        node_type: n.data.nodeType as string,
        label: n.data.label as string,
        config: JSON.parse(JSON.stringify((n.data.config as Record<string, unknown>) || {})),
        position_x: n.position.x,
        position_y: n.position.y,
        sort_order: i,
      }));

      const { error: nodesError } = await supabase.from('automation_nodes').insert(nodeInserts);
      if (nodesError) {
        console.error('Error saving nodes:', nodesError);
        toast.error('Erro ao salvar nós');
        setSaving(false);
        return;
      }
    }

    if (edges.length > 0) {
      const edgeInserts = edges.map((e) => ({
        id: crypto.randomUUID(),
        flow_id: id,
        source_node_id: e.source,
        target_node_id: e.target,
      }));

      const { error: edgesError } = await supabase.from('automation_edges').insert(edgeInserts);
      if (edgesError) {
        console.error('Error saving edges:', edgesError);
        toast.error('Erro ao salvar conexões');
        setSaving(false);
        return;
      }
    }

    toast.success('Fluxo salvo com sucesso');
    setSaving(false);
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
            nodes={nodes}
            edges={edges}
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
            onSave={handleNodeSave}
            onDelete={handleNodeDelete}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}
