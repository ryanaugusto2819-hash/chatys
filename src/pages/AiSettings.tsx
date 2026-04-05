import { useState, useEffect } from 'react';
import TopBar from '@/components/layout/TopBar';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  Layers, Plus, Trash2, Save, Loader2, Bot, GitBranch, BookOpen,
  Pencil, Check, X, MessageSquare, Sparkles, Phone, Wifi, WifiOff, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import KnowledgeBase from '@/components/ai/KnowledgeBase';
import NicheFollowUps from '@/components/follow-ups/NicheFollowUps';
import AutoReplyLogs from '@/components/ai/AutoReplyLogs';

interface Niche {
  id: string;
  name: string;
  whatsapp_phone_number_id: string | null;
  zapi_instance_id: string | null;
  system_prompt: string;
  flow_selector_instructions: string;
  auto_reply_enabled: boolean;
  flow_selector_enabled: boolean;
  language: string;
  created_at: string;
}

interface FlowItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  niche_id: string | null;
}

interface ConnectionConfig {
  id: string;
  connection_id: string;
  label: string;
  status: string;
  is_connected: boolean;
}

const PROVIDER_NAMES: Record<string, string> = {
  whatsapp: 'WhatsApp Cloud API',
  zapi: 'Z-API (QR Code)',
};

const defaultPrompt =
  'Você é um assistente virtual amigável de atendimento ao cliente via WhatsApp. Responda de forma concisa, útil e educada em português brasileiro. Se não souber a resposta, diga que vai encaminhar para um atendente humano.';

export default function AiSettings() {
  const [niches, setNiches] = useState<Niche[]>([]);
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [connections, setConnections] = useState<ConnectionConfig[]>([]);
  const [nicheConnectionIds, setNicheConnectionIds] = useState<string[]>([]);
  const [selectedNicheId, setSelectedNicheId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newNicheName, setNewNicheName] = useState('');
  const [renamingNicheId, setRenamingNicheId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const { currentWorkspace } = useWorkspace();

  // Editing state
  const [editForm, setEditForm] = useState<Partial<Niche>>({});
  const [editingFlow, setEditingFlow] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id]);

  useEffect(() => {
    if (selectedNicheId && niches.length) {
      const niche = niches.find((n) => n.id === selectedNicheId);
      if (niche) setEditForm(niche);
    }
  }, [selectedNicheId, niches]);

  const fetchData = async () => {
    const wsId = currentWorkspace?.id;

    const nichesQuery = wsId
      ? (supabase.from('niches') as any).select('*').eq('workspace_id', wsId).order('created_at', { ascending: true })
      : supabase.from('niches').select('*').order('created_at', { ascending: true });

    const flowsQuery = wsId
      ? (supabase.from('automation_flows') as any).select('id, name, description, is_active, niche_id').eq('workspace_id', wsId).order('name')
      : supabase.from('automation_flows').select('id, name, description, is_active, niche_id').order('name');

    const connectionsQuery = wsId
      ? (supabase.from('connection_configs') as any).select('id, connection_id, label, status, is_connected').in('connection_id', ['whatsapp', 'zapi']).eq('workspace_id', wsId).order('created_at')
      : supabase.from('connection_configs').select('id, connection_id, label, status, is_connected').in('connection_id', ['whatsapp', 'zapi']).order('created_at');

    const [nichesRes, flowsRes, connectionsRes] = await Promise.all([
      nichesQuery,
      flowsQuery,
      connectionsQuery,
    ]);

    const nicheList = (nichesRes.data || []) as unknown as Niche[];
    setNiches(nicheList);
    setFlows((flowsRes.data || []) as unknown as FlowItem[]);
    setConnections((connectionsRes.data || []) as unknown as ConnectionConfig[]);

    if (nicheList.length > 0 && !selectedNicheId) {
      setSelectedNicheId(nicheList[0].id);
    }
    setLoading(false);
  };

  const fetchNicheConnections = async (nicheId: string) => {
    const { data } = await supabase
      .from('niche_connections')
      .select('connection_config_id')
      .eq('niche_id', nicheId);
    setNicheConnectionIds((data || []).map((r: any) => r.connection_config_id));
  };

  useEffect(() => {
    if (selectedNicheId) fetchNicheConnections(selectedNicheId);
  }, [selectedNicheId]);

  const toggleNicheConnection = async (connectionConfigId: string) => {
    if (!selectedNicheId) return;
    const isLinked = nicheConnectionIds.includes(connectionConfigId);

    if (isLinked) {
      const { error } = await supabase
        .from('niche_connections')
        .delete()
        .eq('niche_id', selectedNicheId)
        .eq('connection_config_id', connectionConfigId);
      if (error) { toast.error('Erro ao desvincular'); return; }
      setNicheConnectionIds(prev => prev.filter(id => id !== connectionConfigId));
      toast.success('Conexão desvinculada');
    } else {
      const { error } = await supabase
        .from('niche_connections')
        .insert({ niche_id: selectedNicheId, connection_config_id: connectionConfigId });
      if (error) { toast.error('Erro ao vincular'); return; }
      setNicheConnectionIds(prev => [...prev, connectionConfigId]);
      toast.success('Conexão vinculada');
    }
  };

  const createNiche = async () => {
    if (!newNicheName.trim()) {
      toast.error('Digite o nome do nicho');
      return;
    }
    setCreating(true);
    const { data, error } = await supabase
      .from('niches')
      .insert({
        name: newNicheName.trim(),
        system_prompt: defaultPrompt,
        ...(currentWorkspace?.id ? { workspace_id: currentWorkspace.id } : {}),
      })
      .select()
      .single();

    if (error) {
      toast.error('Erro ao criar nicho');
    } else {
      const newNiche = data as unknown as Niche;
      setNiches((prev) => [...prev, newNiche]);
      setSelectedNicheId(newNiche.id);
      setNewNicheName('');
      toast.success('Nicho criado!');
    }
    setCreating(false);
  };

  const deleteNiche = async (id: string) => {
    const { error } = await supabase.from('niches').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir nicho');
    } else {
      setNiches((prev) => prev.filter((n) => n.id !== id));
      if (selectedNicheId === id) {
        const remaining = niches.filter((n) => n.id !== id);
        setSelectedNicheId(remaining.length > 0 ? remaining[0].id : null);
      }
      toast.success('Nicho excluído');
    }
  };

  const saveNiche = async () => {
    if (!selectedNicheId || !editForm) return;
    setSaving(true);

    const { error } = await supabase
      .from('niches')
      .update({
        name: editForm.name,
        whatsapp_phone_number_id: editForm.whatsapp_phone_number_id || null,
        zapi_instance_id: editForm.zapi_instance_id || null,
        system_prompt: editForm.system_prompt,
        flow_selector_instructions: editForm.flow_selector_instructions,
        auto_reply_enabled: editForm.auto_reply_enabled,
        flow_selector_enabled: editForm.flow_selector_enabled,
        language: editForm.language || 'pt-BR',
      })
      .eq('id', selectedNicheId);

    if (error) {
      toast.error('Erro ao salvar');
    } else {
      setNiches((prev) =>
        prev.map((n) => (n.id === selectedNicheId ? { ...n, ...editForm } : n))
      );
      toast.success('Nicho salvo!');
    }
    setSaving(false);
  };

  const assignFlowToNiche = async (flowId: string, nicheId: string | null) => {
    const { error } = await supabase
      .from('automation_flows')
      .update({ niche_id: nicheId })
      .eq('id', flowId);

    if (error) {
      toast.error('Erro ao vincular fluxo');
    } else {
      setFlows((prev) => prev.map((f) => (f.id === flowId ? { ...f, niche_id: nicheId } : f)));
      toast.success('Fluxo atualizado');
    }
  };

  const saveFlowDesc = async (flowId: string) => {
    const { error } = await supabase
      .from('automation_flows')
      .update({ description: editDesc })
      .eq('id', flowId);

    if (error) {
      toast.error('Erro ao salvar descrição');
    } else {
      setFlows((prev) => prev.map((f) => (f.id === flowId ? { ...f, description: editDesc } : f)));
      toast.success('Descrição atualizada');
    }
    setEditingFlow(null);
  };

  const selectedNiche = niches.find((n) => n.id === selectedNicheId);
  const nicheFlows = flows.filter((f) => f.niche_id === selectedNicheId);
  const unassignedFlows = flows.filter((f) => !f.niche_id);

  if (loading) {
    return (
      <div>
        <TopBar title="Nichos de Atendimento" subtitle="Configure IA e fluxos por nicho" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar title="Nichos de Atendimento" subtitle="Configure IA, fluxos e base de conhecimento por nicho" />
      <div className="p-6 max-w-4xl">
        {/* Niche selector / creator */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-5 shadow-elevated mb-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
              <Layers className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-card-foreground">Seus Nichos</p>
              <p className="text-xs text-muted-foreground">Cada nicho tem sua própria IA, fluxos e base de conhecimento</p>
            </div>
          </div>

          {/* Niche tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            {niches.map((niche) => (
              <div key={niche.id} className="flex items-center gap-0.5">
                {renamingNicheId === niche.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (renameValue.trim()) {
                            supabase.from('niches').update({ name: renameValue.trim() }).eq('id', niche.id).then(({ error }) => {
                              if (error) { toast.error('Erro ao renomear'); return; }
                              setNiches(prev => prev.map(n => n.id === niche.id ? { ...n, name: renameValue.trim() } : n));
                              toast.success('Nicho renomeado');
                            });
                          }
                          setRenamingNicheId(null);
                        }
                        if (e.key === 'Escape') setRenamingNicheId(null);
                      }}
                      autoFocus
                      className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-40"
                    />
                    <button onClick={() => {
                      if (renameValue.trim()) {
                        supabase.from('niches').update({ name: renameValue.trim() }).eq('id', niche.id).then(({ error }) => {
                          if (error) { toast.error('Erro ao renomear'); return; }
                          setNiches(prev => prev.map(n => n.id === niche.id ? { ...n, name: renameValue.trim() } : n));
                          toast.success('Nicho renomeado');
                        });
                      }
                      setRenamingNicheId(null);
                    }} className="p-1.5 rounded-lg bg-primary text-primary-foreground">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setRenamingNicheId(null)} className="p-1.5 rounded-lg bg-secondary text-secondary-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setSelectedNicheId(niche.id)}
                      onDoubleClick={() => { setRenamingNicheId(niche.id); setRenameValue(niche.name); }}
                      className={`flex items-center gap-2 rounded-l-lg px-4 py-2 text-sm font-medium transition-colors ${
                        selectedNicheId === niche.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                      title="Duplo clique para renomear"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      {niche.name}
                    </button>
                    <button
                      onClick={() => { setRenamingNicheId(niche.id); setRenameValue(niche.name); }}
                      className={`px-2 py-2 text-sm transition-colors ${
                        selectedNicheId === niche.id
                          ? 'bg-primary text-primary-foreground hover:bg-primary/80'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                      title="Renomear nicho"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          className={`rounded-r-lg px-2 py-2 text-sm transition-colors ${
                            selectedNicheId === niche.id
                              ? 'bg-primary text-primary-foreground hover:bg-destructive'
                              : 'bg-secondary text-secondary-foreground hover:bg-destructive hover:text-destructive-foreground'
                          }`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir nicho "{niche.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso removerá o nicho, suas conexões vinculadas e configurações. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteNiche(niche.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Create new niche */}
          <div className="flex gap-2">
            <input
              value={newNicheName}
              onChange={(e) => setNewNicheName(e.target.value)}
              placeholder="Nome do novo nicho (ex: Clínica, Imobiliária...)"
              className="flex-1 rounded-lg border border-input bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => e.key === 'Enter' && createNiche()}
            />
            <button
              onClick={createNiche}
              disabled={creating}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar
            </button>
          </div>
        </motion.div>

        {/* Selected niche config */}
        {selectedNiche && (
          <>
          <Tabs defaultValue="ai" className="space-y-4">
            <TabsList className="w-full">
              <TabsTrigger value="ai" className="flex-1 gap-2">
                <Bot className="h-4 w-4" /> IA & Prompt
              </TabsTrigger>
              <TabsTrigger value="flows" className="flex-1 gap-2">
                <GitBranch className="h-4 w-4" /> Fluxos
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="flex-1 gap-2">
                <BookOpen className="h-4 w-4" /> Conhecimento
              </TabsTrigger>
              <TabsTrigger value="autoreply-logs" className="flex-1 gap-2">
                <MessageSquare className="h-4 w-4" /> Logs IA
              </TabsTrigger>
              <TabsTrigger value="followups" className="flex-1 gap-2">
                <Clock className="h-4 w-4" /> Follow-ups
              </TabsTrigger>
              <TabsTrigger value="connection" className="flex-1 gap-2">
                <Phone className="h-4 w-4" /> Conexão
              </TabsTrigger>
            </TabsList>

            {/* AI & Prompt Tab */}
            <TabsContent value="ai">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-6 shadow-elevated space-y-6"
              >
                {/* Auto-reply toggle */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Resposta Automática com IA</p>
                      <p className="text-xs text-muted-foreground">A IA responde automaticamente neste nicho</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditForm((prev) => ({ ...prev, auto_reply_enabled: !prev.auto_reply_enabled }))}
                    className={`relative h-6 w-11 rounded-full transition-colors ${editForm.auto_reply_enabled ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${editForm.auto_reply_enabled ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {/* Language selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Idioma da IA</label>
                  <p className="text-xs text-muted-foreground">Define o idioma das respostas automáticas e follow-ups</p>
                  <div className="flex gap-2">
                    {[
                      { value: 'pt-BR', label: '🇧🇷 Português' },
                      { value: 'es', label: '🇪🇸 Español' },
                    ].map((lang) => (
                      <button
                        key={lang.value}
                        onClick={() => setEditForm((prev) => ({ ...prev, language: lang.value }))}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                          (editForm.language || 'pt-BR') === lang.value
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-foreground border-input hover:bg-accent'
                        }`}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* System Prompt */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Prompt do Sistema</label>
                  <p className="text-xs text-muted-foreground">Como a IA deste nicho deve se comportar</p>
                  <textarea
                    value={editForm.system_prompt || ''}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, system_prompt: e.target.value }))}
                    rows={6}
                    className="w-full resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Flow selector toggle */}
                <div className="flex items-center justify-between rounded-lg border border-border bg-background p-4">
                  <div className="flex items-center gap-3">
                    <GitBranch className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Seletor de Fluxo por IA</p>
                      <p className="text-xs text-muted-foreground">A IA dispara fluxos automaticamente neste nicho</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditForm((prev) => ({ ...prev, flow_selector_enabled: !prev.flow_selector_enabled }))}
                    className={`relative h-6 w-11 rounded-full transition-colors ${editForm.flow_selector_enabled ? 'bg-primary' : 'bg-muted'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${editForm.flow_selector_enabled ? 'translate-x-5' : ''}`} />
                  </button>
                </div>

                {/* Flow selector instructions */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Instruções do Seletor de Fluxo</label>
                  <textarea
                    value={editForm.flow_selector_instructions || ''}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, flow_selector_instructions: e.target.value }))}
                    rows={3}
                    placeholder="Ex: Priorize o fluxo de vendas quando o cliente perguntar sobre preços..."
                    className="w-full resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

              </motion.div>
            </TabsContent>

            {/* Flows Tab */}
            <TabsContent value="flows">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-6 shadow-elevated space-y-4"
              >
                <div>
                  <p className="text-sm font-semibold text-card-foreground mb-1">Fluxos deste nicho</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    A IA só considerará estes fluxos para conversas do nicho "{selectedNiche.name}"
                  </p>
                </div>

                {nicheFlows.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center">
                    <p className="text-xs text-muted-foreground">Nenhum fluxo vinculado a este nicho. Vincule fluxos abaixo.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {nicheFlows.map((flow) => (
                      <FlowCard
                        key={flow.id}
                        flow={flow}
                        editingFlow={editingFlow}
                        editDesc={editDesc}
                        setEditDesc={setEditDesc}
                        onStartEdit={() => { setEditingFlow(flow.id); setEditDesc(flow.description || ''); }}
                        onSaveDesc={() => saveFlowDesc(flow.id)}
                        onCancelEdit={() => setEditingFlow(null)}
                        onUnassign={() => assignFlowToNiche(flow.id, null)}
                      />
                    ))}
                  </div>
                )}

                {/* Unassigned flows */}
                {unassignedFlows.length > 0 && (
                  <div className="pt-4 border-t border-border">
                    <p className="text-sm font-medium text-foreground mb-2">Fluxos sem nicho</p>
                    <p className="text-xs text-muted-foreground mb-3">Clique para vincular ao nicho "{selectedNiche.name}"</p>
                    <div className="space-y-2">
                      {unassignedFlows.map((flow) => (
                        <button
                          key={flow.id}
                          onClick={() => assignFlowToNiche(flow.id, selectedNicheId)}
                          className="w-full flex items-center gap-3 rounded-lg border border-dashed border-border bg-background p-3 hover:border-primary/50 hover:bg-primary/5 transition-colors text-left"
                        >
                          <GitBranch className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-foreground">{flow.name}</span>
                            <p className="text-xs text-muted-foreground truncate">{flow.description || 'Sem descrição'}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${flow.is_active ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                            {flow.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                          <Plus className="h-4 w-4 text-primary shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </TabsContent>

            {/* Knowledge Base Tab */}
            <TabsContent value="knowledge">
              <KnowledgeBase nicheId={selectedNicheId || undefined} />
            </TabsContent>

            {/* Connection Tab */}
            <TabsContent value="connection">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-6 shadow-elevated space-y-6"
              >
                <div>
                  <p className="text-sm font-semibold text-card-foreground mb-1">Conexões vinculadas</p>
                  <p className="text-xs text-muted-foreground">
                    Selecione quais conexões (números de WhatsApp) atendem este nicho. Mensagens recebidas nessas conexões serão automaticamente classificadas.
                  </p>
                </div>

                {connections.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhuma conexão cadastrada.</p>
                    <p className="text-xs text-muted-foreground mt-1">Vá em <strong>Conexões</strong> para criar uma primeiro.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {connections.map((conn) => {
                      const isLinked = nicheConnectionIds.includes(conn.id);
                      const providerName = PROVIDER_NAMES[conn.connection_id] || conn.connection_id;
                      const isActive = conn.status === 'active';
                      return (
                        <button
                          key={conn.id}
                          onClick={() => toggleNicheConnection(conn.id)}
                          className={`w-full flex items-center gap-3 rounded-xl border p-4 transition-all text-left ${
                            isLinked
                              ? 'border-primary bg-primary/5 shadow-sm'
                              : 'border-border bg-background hover:border-primary/30 hover:bg-primary/5'
                          }`}
                        >
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            isLinked ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          }`}>
                            <MessageSquare className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">
                                {conn.label || providerName}
                              </span>
                              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                                isActive
                                  ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                                  : 'bg-muted text-muted-foreground border-border'
                              }`}>
                                {isActive ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                                {isActive ? 'Ativo' : conn.status === 'pending_setup' ? 'Pendente' : 'Inativo'}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{providerName}</p>
                          </div>
                          <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                            isLinked ? 'bg-primary border-primary text-primary-foreground' : 'border-input bg-background'
                          }`}>
                            {isLinked && <Check className="h-3 w-3" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Dica:</strong> Um nicho pode ter várias conexões. Cada conexão só pode estar vinculada a um nicho por vez para evitar conflitos.
                  </p>
                </div>
              </motion.div>
            </TabsContent>

            {/* Auto-Reply Logs Tab */}
            <TabsContent value="autoreply-logs">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-border bg-card p-6 shadow-elevated"
              >
                <AutoReplyLogs nicheId={selectedNicheId!} />
              </motion.div>
            </TabsContent>

            {/* Follow-ups Tab */}
            <TabsContent value="followups">
              <NicheFollowUps nicheId={selectedNicheId!} />
            </TabsContent>
          </Tabs>

          {/* Save button - always visible */}
          <div className="mt-6">
            <button
              onClick={saveNiche}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Alterações
            </button>
          </div>
          </>
        )}

        {/* Delete niche */}
        {selectedNiche && (
          <div className="mt-6 flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors">
                  <Trash2 className="h-4 w-4" />
                  Excluir nicho "{selectedNiche.name}"
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir nicho</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tem certeza? A base de conhecimento vinculada será excluída. Os fluxos ficarão sem nicho.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteNiche(selectedNiche.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {niches.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Layers className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Nenhum nicho criado</p>
            <p className="text-xs text-muted-foreground">
              Crie seu primeiro nicho acima para começar a separar o atendimento por área.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function FlowCard({
  flow,
  editingFlow,
  editDesc,
  setEditDesc,
  onStartEdit,
  onSaveDesc,
  onCancelEdit,
  onUnassign,
}: {
  flow: FlowItem;
  editingFlow: string | null;
  editDesc: string;
  setEditDesc: (v: string) => void;
  onStartEdit: () => void;
  onSaveDesc: () => void;
  onCancelEdit: () => void;
  onUnassign: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground">{flow.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${flow.is_active ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
            {flow.is_active ? 'Ativo' : 'Inativo'}
          </span>
          <button
            onClick={onUnassign}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Desvincular"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {editingFlow === flow.id ? (
        <div className="flex gap-2 mt-2">
          <input
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="Descreva quando este fluxo deve ser ativado..."
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveDesc();
              if (e.key === 'Escape') onCancelEdit();
            }}
          />
          <button onClick={onSaveDesc} className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={onCancelEdit} className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-start gap-2 mt-1">
          <p className="text-xs text-muted-foreground flex-1">
            {flow.description || <span className="italic text-destructive/70">Sem descrição</span>}
          </p>
          <button onClick={onStartEdit} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors" title="Editar">
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}
