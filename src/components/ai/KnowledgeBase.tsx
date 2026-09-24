import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, Plus, Trash2, Upload, FileText, MessageSquare, Loader2, Workflow, Check } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { useWorkspace } from '@/contexts/WorkspaceContext';

interface KBItem {
  id: string;
  type: string;
  title: string;
  content: string;
  file_url: string | null;
  niche_id: string | null;
  country_code: string;
  created_at: string;
}

interface FlowWithNodes {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  nodes: { node_type: string; label: string; config: any; sort_order: number }[];
}

type TabType = 'text' | 'qa' | 'file' | 'flows';

interface Props {
  nicheId?: string;
  textOnly?: boolean;
}

export default function KnowledgeBase({ nicheId, textOnly = false }: Props) {
  const { currentWorkspace } = useWorkspace();
  const [items, setItems] = useState<KBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('text');
  const [uploading, setUploading] = useState(false);

  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [qaQuestion, setQaQuestion] = useState('');
  const [qaAnswer, setQaAnswer] = useState('');
  const [countryCode, setCountryCode] = useState('any');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchItems();
  }, [nicheId, currentWorkspace?.id]);

  const fetchItems = async () => {
    setLoading(true);
    let query = supabase
      .from('knowledge_base_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (currentWorkspace?.id) {
      query = query.eq('workspace_id', currentWorkspace.id);
    }

    if (nicheId) {
      query = query.eq('niche_id', nicheId);
    } else {
      query = query.is('niche_id', null);
    }

    const { data } = await query;
    setItems((data || []) as unknown as KBItem[]);
    setLoading(false);
  };

  const addTextItem = async () => {
    if (!currentWorkspace?.id) {
      toast.error('Selecione um workspace');
      return;
    }
    if (!textTitle.trim() || !textContent.trim()) {
      toast.error('Preencha título e conteúdo');
      return;
    }
    const { error } = await supabase.from('knowledge_base_items').insert({
      type: 'text',
      title: textTitle.trim(),
      content: textContent.trim(),
      niche_id: nicheId || null,
      workspace_id: currentWorkspace?.id,
      country_code: countryCode,
    });
    if (error) {
      toast.error('Erro ao adicionar');
    } else {
      toast.success('Conhecimento adicionado');
      setTextTitle('');
      setTextContent('');
      fetchItems();
    }
  };

  const addQAItem = async () => {
    if (!currentWorkspace?.id) {
      toast.error('Selecione um workspace');
      return;
    }
    if (!qaQuestion.trim() || !qaAnswer.trim()) {
      toast.error('Preencha pergunta e resposta');
      return;
    }
    const { error } = await supabase.from('knowledge_base_items').insert({
      type: 'qa',
      title: qaQuestion.trim(),
      content: qaAnswer.trim(),
      niche_id: nicheId || null,
      workspace_id: currentWorkspace?.id,
      country_code: countryCode,
    });
    if (error) {
      toast.error('Erro ao adicionar');
    } else {
      toast.success('Pergunta e resposta adicionadas');
      setQaQuestion('');
      setQaAnswer('');
      fetchItems();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!currentWorkspace?.id) {
      toast.error('Selecione um workspace');
      return;
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error('Arquivo muito grande (máx 10MB)');
      return;
    }

    setUploading(true);
    const fileName = `${Date.now()}-${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('knowledge-base')
      .upload(fileName, file);

    if (uploadError) {
      toast.error('Erro ao enviar arquivo');
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('knowledge-base')
      .getPublicUrl(fileName);

    let content = '';
    const textTypes = ['text/plain', 'text/markdown', 'text/csv', 'application/json'];
    if (textTypes.includes(file.type) || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      content = await file.text();
    } else {
      content = `[Arquivo: ${file.name}]`;
    }

    const { error } = await supabase.from('knowledge_base_items').insert({
      type: 'file',
      title: file.name,
      content: content.substring(0, 50000),
      file_url: urlData.publicUrl,
      niche_id: nicheId || null,
      workspace_id: currentWorkspace?.id,
      country_code: countryCode,
    });

    if (error) {
      toast.error('Erro ao salvar referência do arquivo');
    } else {
      toast.success('Arquivo enviado com sucesso');
      fetchItems();
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const deleteItem = async (item: KBItem) => {
    if (item.file_url) {
      const fileName = item.file_url.split('/').pop();
      if (fileName) {
        await supabase.storage.from('knowledge-base').remove([fileName]);
      }
    }

    const { error } = await supabase
      .from('knowledge_base_items')
      .delete()
      .eq('id', item.id);

    if (error) {
      toast.error('Erro ao excluir');
    } else {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success('Item excluído');
    }
  };

  const [flows, setFlows] = useState<FlowWithNodes[]>([]);
  const [loadingFlows, setLoadingFlows] = useState(false);
  const [importingFlowId, setImportingFlowId] = useState<string | null>(null);

  const fetchFlows = async () => {
    if (!nicheId) return;
    setLoadingFlows(true);
    const { data: flowData } = await supabase
      .from('automation_flows')
      .select('id, name, description, is_active')
      .eq('niche_id', nicheId)
      .order('name');

    if (flowData && flowData.length > 0) {
      const flowIds = flowData.map(f => f.id);
      const { data: nodesData } = await supabase
        .from('automation_nodes')
        .select('flow_id, node_type, label, config, sort_order')
        .in('flow_id', flowIds)
        .order('sort_order');

      const mapped: FlowWithNodes[] = flowData.map(f => ({
        ...f,
        nodes: (nodesData || []).filter(n => n.flow_id === f.id),
      }));
      setFlows(mapped);
    } else {
      setFlows([]);
    }
    setLoadingFlows(false);
  };

  useEffect(() => {
    if (activeTab === 'flows') fetchFlows();
  }, [activeTab, nicheId]);

  const formatFlowAsKnowledge = (flow: FlowWithNodes): string => {
    const lines: string[] = [];
    lines.push(`Fluxo: ${flow.name}`);
    if (flow.description) lines.push(`Descrição: ${flow.description}`);
    lines.push(`Status: ${flow.is_active ? 'Ativo' : 'Inativo'}`);
    lines.push(`Total de etapas: ${flow.nodes.length}`);
    lines.push('');
    lines.push('--- ETAPAS DO FLUXO ---');

    for (const node of flow.nodes) {
      lines.push('');
      lines.push(`[${node.sort_order + 1}] ${node.label} (${node.node_type})`);
      const cfg = node.config as Record<string, any> || {};

      if (node.node_type === 'message' || node.node_type === 'text') {
        if (cfg.text) lines.push(`  Mensagem: ${cfg.text}`);
        if (cfg.mediaUrl) lines.push(`  Mídia: ${cfg.mediaUrl}`);
        if (cfg.mediaType) lines.push(`  Tipo de mídia: ${cfg.mediaType}`);
      } else if (node.node_type === 'delay') {
        lines.push(`  Atraso: ${cfg.delay || cfg.seconds || 0}s`);
      } else if (node.node_type === 'set_funnel_stage') {
        lines.push(`  Define etapa do funil: ${cfg.stage || cfg.stageKey || 'N/A'}`);
      } else if (node.node_type === 'tag') {
        lines.push(`  Etiqueta: ${cfg.tagName || cfg.tag || 'N/A'}`);
      } else if (node.node_type === 'webhook') {
        lines.push(`  Webhook URL: ${cfg.url || 'N/A'}`);
      } else if (node.node_type === 'quick_reply') {
        lines.push(`  Resposta rápida: ${cfg.text || ''}`);
        if (cfg.buttons) lines.push(`  Botões: ${JSON.stringify(cfg.buttons)}`);
      } else {
        const cfgStr = JSON.stringify(cfg);
        if (cfgStr !== '{}') lines.push(`  Config: ${cfgStr}`);
      }
    }

    return lines.join('\n');
  };

  const importFlow = async (flow: FlowWithNodes) => {
    if (!currentWorkspace?.id) return;
    setImportingFlowId(flow.id);
    const content = formatFlowAsKnowledge(flow);
    const { error } = await supabase.from('knowledge_base_items').insert({
      type: 'text',
      title: `Fluxo: ${flow.name}`,
      content: content.substring(0, 50000),
      niche_id: nicheId || null,
      workspace_id: currentWorkspace?.id,
      country_code: countryCode,
    });
    if (error) {
      toast.error('Erro ao importar fluxo');
    } else {
      toast.success(`Fluxo "${flow.name}" adicionado à base de conhecimento`);
      fetchItems();
    }
    setImportingFlowId(null);
  };

  const importAllFlows = async () => {
    if (flows.length === 0 || !currentWorkspace?.id) return;
    setImportingFlowId('all');
    let success = 0;
    for (const flow of flows) {
      const content = formatFlowAsKnowledge(flow);
      const { error } = await supabase.from('knowledge_base_items').insert({
        type: 'text',
        title: `Fluxo: ${flow.name}`,
        content: content.substring(0, 50000),
        niche_id: nicheId || null,
        workspace_id: currentWorkspace?.id,
        country_code: countryCode,
      });
      if (!error) success++;
    }
    toast.success(`${success} fluxo(s) importado(s) com sucesso`);
    fetchItems();
    setImportingFlowId(null);
  };

  const isFlowAlreadyImported = (flowName: string) =>
    items.some(i => i.title === `Fluxo: ${flowName}`);

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'text', label: 'Texto Livre', icon: <FileText className="h-3.5 w-3.5" /> },
    { key: 'qa', label: 'Perguntas e Respostas', icon: <MessageSquare className="h-3.5 w-3.5" /> },
    { key: 'file', label: 'Arquivos', icon: <Upload className="h-3.5 w-3.5" /> },
    ...(nicheId ? [{ key: 'flows' as TabType, label: 'Fluxos', icon: <Workflow className="h-3.5 w-3.5" /> }] : []),
  ];

  const typeIcon = (type: string) => {
    if (type === 'qa') return <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />;
    if (type === 'file') return <Upload className="h-3.5 w-3.5 text-primary shrink-0" />;
    return <FileText className="h-3.5 w-3.5 text-primary shrink-0" />;
  };

  const typeLabel = (type: string) => {
    if (type === 'qa') return 'P&R';
    if (type === 'file') return 'Arquivo';
    return 'Texto';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="rounded-xl border border-border bg-card p-6 shadow-elevated"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
          <BookOpen className="h-5 w-5 text-accent-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-card-foreground">Base de Conhecimento</p>
          <p className="text-xs text-muted-foreground">
            Informações que a IA usa para responder com mais precisão
          </p>
        </div>
      </div>

      {!textOnly && (
        <div className="flex gap-1 rounded-lg bg-muted p-1 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 flex-1 justify-center rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Add Forms */}
      {activeTab !== 'flows' && (
        <div className="mb-4 space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">País deste conteúdo</label>
          <select
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="any">Qualquer país</option>
            <option value="MX">México</option>
            <option value="UY">Uruguai</option>
            <option value="AR">Argentina</option>
            <option value="BR">Brasil</option>
          </select>
        </div>
      )}
      {activeTab === 'text' && (
        <div className="space-y-3 mb-6">
          <input
            value={textTitle}
            onChange={(e) => setTextTitle(e.target.value)}
            placeholder="Título (ex: Informações sobre a empresa)"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            rows={5}
            placeholder="Cole aqui informações sobre produtos, serviços, FAQs, políticas, etc."
            className="w-full resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={addTextItem}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Adicionar Conhecimento
          </button>
        </div>
      )}

      {activeTab === 'qa' && (
        <div className="space-y-3 mb-6">
          <input
            value={qaQuestion}
            onChange={(e) => setQaQuestion(e.target.value)}
            placeholder="Pergunta (ex: Qual o horário de funcionamento?)"
            className="w-full rounded-lg border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            value={qaAnswer}
            onChange={(e) => setQaAnswer(e.target.value)}
            rows={3}
            placeholder="Resposta (ex: Funcionamos de segunda a sexta, das 9h às 18h)"
            className="w-full resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={addQAItem}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Adicionar Pergunta e Resposta
          </button>
        </div>
      )}

      {activeTab === 'file' && (
        <div className="space-y-3 mb-6">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-background p-8 cursor-pointer hover:border-primary/50 transition-colors"
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            )}
            <p className="text-sm font-medium text-foreground">
              {uploading ? 'Enviando...' : 'Clique para enviar um arquivo'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF, TXT, MD, CSV, JSON — máx 10MB
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.csv,.json,.doc,.docx"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {activeTab === 'flows' && nicheId && (
        <div className="space-y-3 mb-6">
          {loadingFlows ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : flows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Workflow className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Nenhum fluxo encontrado neste nicho.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Crie fluxos de automação na aba "Fluxos" primeiro.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {flows.length} fluxo(s) disponível(is) neste nicho
                </p>
                <button
                  onClick={importAllFlows}
                  disabled={importingFlowId === 'all'}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {importingFlowId === 'all' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Importar Todos
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {flows.map((flow) => {
                  const alreadyImported = isFlowAlreadyImported(flow.name);
                  return (
                    <div
                      key={flow.id}
                      className="rounded-lg border border-border bg-background p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Workflow className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-sm font-medium text-foreground truncate">
                            {flow.name}
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            flow.is_active
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-secondary text-muted-foreground'
                          }`}>
                            {flow.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 ml-5.5">
                          {flow.nodes.length} etapa(s)
                          {flow.description && ` · ${flow.description.substring(0, 60)}`}
                        </p>
                      </div>
                      {alreadyImported ? (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 shrink-0">
                          <Check className="h-3.5 w-3.5" />
                          Importado
                        </span>
                      ) : (
                        <button
                          onClick={() => importFlow(flow)}
                          disabled={importingFlowId === flow.id}
                          className="shrink-0 flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/80 transition-colors disabled:opacity-50"
                        >
                          {importingFlowId === flow.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Plus className="h-3 w-3" />
                          )}
                          Importar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Items List */}
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">
            Nenhum conhecimento adicionado. Adicione textos, perguntas ou arquivos para treinar a IA.
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-border bg-background p-3 group"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  {typeIcon(item.type)}
                  <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {typeLabel(item.type)}
                  </span>
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {item.country_code === 'any' ? 'Qualquer país' : item.country_code}
                  </span>
                </div>
                <button
                  onClick={() => deleteItem(item)}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 ml-5.5">
                {item.type === 'qa' ? `R: ${item.content}` : item.content.substring(0, 150)}
                {item.content.length > 150 && '...'}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-border/50 bg-muted/30 p-3 mt-4">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Dica:</strong> Adicione informações completas sobre seus produtos,
          serviços, preços e políticas. Quanto mais contexto a IA tiver, melhor serão as respostas.
        </p>
      </div>
    </motion.div>
  );
}
