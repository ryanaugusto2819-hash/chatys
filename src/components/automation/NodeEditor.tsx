import { useState, useEffect } from 'react';
import {
  X, MessageSquare, Clock, Image, Music, Video, Upload, Loader2,
  FileText, GitFork, Zap, Bot, ListOrdered, Trash2, Save, Link2, Cog, Tag, Target
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { toast } from 'sonner';

interface NodeConfig {
  [key: string]: unknown;
}

interface NodeEditorProps {
  nodeId: string;
  nodeType: string;
  label: string;
  config: NodeConfig;
  nicheId?: string | null;
  onSave: (nodeId: string, label: string, config: NodeConfig) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

const triggerTypes = [
  { value: 'manual', label: 'Disparo Manual', desc: 'O agente inicia manualmente na conversa' },
  { value: 'message_received', label: 'Ao Receber Mensagem', desc: 'Dispara quando qualquer mensagem é recebida' },
  { value: 'keyword', label: 'Palavra-chave', desc: 'Dispara quando uma palavra específica é detectada' },
  { value: 'new_conversation', label: 'Nova Conversa', desc: 'Dispara quando um novo contato inicia conversa' },
  { value: 'scheduled', label: 'Agendado', desc: 'Executa em horários programados' },
];

const conditionOperators = [
  { value: 'equals', label: 'é igual a' },
  { value: 'contains', label: 'contém' },
  { value: 'starts_with', label: 'começa com' },
  { value: 'not_equals', label: 'é diferente de' },
];

const conditionFields = [
  { value: 'last_message', label: 'Última mensagem' },
  { value: 'contact_name', label: 'Nome do contato' },
  { value: 'status', label: 'Status da conversa' },
  { value: 'tag', label: 'Tag' },
];

export default function NodeEditor({ nodeId, nodeType, label, config, nicheId, onSave, onDelete, onClose }: NodeEditorProps) {
  const { currentWorkspace } = useWorkspace();
  const [editLabel, setEditLabel] = useState(label);
  const [editConfig, setEditConfig] = useState<NodeConfig>(config);
  const [uploading, setUploading] = useState(false);
  const [newButton, setNewButton] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [connections, setConnections] = useState<any[]>([]);
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [funnelStages, setFunnelStages] = useState<any[]>([]);

  // Load connections, tags, agents as needed
  useEffect(() => {
    if (nodeType === 'trigger') {
      supabase.from('connection_configs').select('*').eq('is_connected', true)
        .then(({ data }) => { if (data) setConnections(data); });
    }
    if (nodeType === 'action') {
      supabase.from('tags').select('*').order('name')
        .then(({ data }) => { if (data) setAvailableTags(data); });
      supabase.from('profiles').select('id, full_name')
        .then(({ data }) => { if (data) setAgents(data); });
      if (nicheId) {
        supabase.from('niche_funnel_stages').select('*').eq('niche_id', nicheId).order('sort_order')
          .then(({ data }) => { if (data) setFunnelStages(data); });
      }
    }
  }, [nodeType]);
  // Reset state when nodeId changes
  useEffect(() => {
    setEditLabel(label);
    setEditConfig(config);
  }, [nodeId, label, config]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${nodeId}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage
      .from('automation-media')
      .upload(path, file, { upsert: true });

    if (error) {
      toast.error('Erro ao fazer upload');
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('automation-media')
      .getPublicUrl(path);

    setEditConfig((prev) => ({ ...prev, media_url: urlData.publicUrl }));
    setUploading(false);
    toast.success('Upload concluído');
  };

  const handleSave = () => {
    onSave(nodeId, editLabel, editConfig);
    onClose();
  };

  const addButton = () => {
    if (!newButton.trim()) return;
    const buttons = ((editConfig.buttons as string[]) || []);
    if (buttons.length >= 3) { toast.error('Máximo 3 botões'); return; }
    setEditConfig((p) => ({ ...p, buttons: [...buttons, newButton.trim()] }));
    setNewButton('');
  };

  const removeButton = (i: number) => {
    setEditConfig((p) => ({
      ...p,
      buttons: ((p.buttons as string[]) || []).filter((_, idx) => idx !== i),
    }));
  };

  const addKeyword = () => {
    if (!newKeyword.trim()) return;
    const keywords = ((editConfig.keywords as string[]) || []);
    setEditConfig((p) => ({ ...p, keywords: [...keywords, newKeyword.trim()] }));
    setNewKeyword('');
  };

  const removeKeyword = (i: number) => {
    setEditConfig((p) => ({
      ...p,
      keywords: ((p.keywords as string[]) || []).filter((_, idx) => idx !== i),
    }));
  };

  const iconMap: Record<string, React.ElementType> = {
    trigger: Zap, message: MessageSquare, delay: Clock, image: Image,
    audio: Music, video: Video, document: FileText, condition: GitFork,
    quick_reply: ListOrdered, ai_reply: Bot, action: Cog, call_button: Zap,
  };
  const Icon = iconMap[nodeType] || MessageSquare;

  const typeLabels: Record<string, string> = {
    trigger: 'Gatilho', message: 'Mensagem', delay: 'Espera', image: 'Imagem',
    audio: 'Áudio', video: 'Vídeo', document: 'Documento', condition: 'Condição',
    quick_reply: 'Resposta Rápida', ai_reply: 'Resposta IA', action: 'Ação',
    call_button: 'Botão de Ligação',
  };

  const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
  const labelClass = "text-xs font-medium text-muted-foreground uppercase tracking-wider";
  const selectClass = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none";

  return (
    <div className="absolute right-0 top-0 h-full w-[340px] border-l border-border bg-card z-50 flex flex-col shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <span className="text-sm font-bold text-card-foreground">{typeLabels[nodeType]}</span>
            <p className="text-[10px] text-muted-foreground">Configurar nó</p>
          </div>
        </div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Label (not for trigger) */}
        {nodeType !== 'trigger' && (
          <div className="space-y-1.5">
            <label className={labelClass}>Nome do nó</label>
            <input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className={inputClass} placeholder="Nome..." />
          </div>
        )}

        {/* === TRIGGER CONFIG === */}
        {nodeType === 'trigger' && (
          <>
            <div className="space-y-2">
              <label className={labelClass}>Tipo de Gatilho</label>
              <div className="space-y-1.5">
                {triggerTypes.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => {
                      setEditConfig((p) => ({ ...p, trigger_type: t.value }));
                      setEditLabel(t.label);
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition-all ${
                      editConfig.trigger_type === t.value
                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                        : 'border-border hover:border-primary/30 hover:bg-secondary/50'
                    }`}
                  >
                    <p className="text-sm font-medium text-card-foreground">{t.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {editConfig.trigger_type === 'keyword' && (
              <div className="space-y-2">
                <label className={labelClass}>Palavras-chave</label>
                <div className="flex gap-2">
                  <input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addKeyword()}
                    placeholder="Ex: oi, olá, menu..."
                    className={inputClass}
                  />
                  <button onClick={addKeyword} className="shrink-0 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                    +
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {((editConfig.keywords as string[]) || []).map((k, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                      {k}
                      <button onClick={() => removeKeyword(i)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {editConfig.trigger_type === 'message_received' && (
              <div className="space-y-2">
                <label className={labelClass}>Filtro de mensagem</label>
                <select
                  value={(editConfig.message_filter as string) || 'any'}
                  onChange={(e) => setEditConfig((p) => ({ ...p, message_filter: e.target.value }))}
                  className={selectClass}
                >
                  <option value="any">Qualquer mensagem</option>
                  <option value="contains">Contém texto específico</option>
                  <option value="equals">É exatamente igual a</option>
                  <option value="starts_with">Começa com</option>
                  <option value="not_contains">Não contém</option>
                </select>

                {editConfig.message_filter && editConfig.message_filter !== 'any' && (
                  <div className="space-y-1.5">
                    <label className={labelClass}>
                      {editConfig.message_filter === 'contains' ? 'Texto que deve conter' :
                       editConfig.message_filter === 'equals' ? 'Texto exato' :
                       editConfig.message_filter === 'starts_with' ? 'Texto inicial' :
                       'Texto que não deve conter'}
                    </label>
                    <input
                      value={(editConfig.message_filter_value as string) || ''}
                      onChange={(e) => setEditConfig((p) => ({ ...p, message_filter_value: e.target.value }))}
                      placeholder="Ex: oi, pedido, ajuda..."
                      className={inputClass}
                    />
                    <div className="flex items-center gap-2 mt-1">
                      <input
                        type="checkbox"
                        id="filter-case"
                        checked={(editConfig.message_filter_case_sensitive as boolean) || false}
                        onChange={(e) => setEditConfig((p) => ({ ...p, message_filter_case_sensitive: e.target.checked }))}
                        className="rounded border-input"
                      />
                      <label htmlFor="filter-case" className="text-[11px] text-muted-foreground">Diferenciar maiúsculas/minúsculas</label>
                    </div>
                  </div>
                )}

                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 p-3">
                  <p className="text-[11px] text-blue-700 dark:text-blue-300">
                    📩 {editConfig.message_filter === 'any' || !editConfig.message_filter
                      ? 'Dispara com qualquer mensagem recebida'
                      : editConfig.message_filter === 'contains'
                      ? `Dispara quando a mensagem contém "${(editConfig.message_filter_value as string) || '...'}"`
                      : editConfig.message_filter === 'equals'
                      ? `Dispara quando a mensagem é "${(editConfig.message_filter_value as string) || '...'}"`
                      : editConfig.message_filter === 'starts_with'
                      ? `Dispara quando a mensagem começa com "${(editConfig.message_filter_value as string) || '...'}"`
                      : `Dispara quando a mensagem NÃO contém "${(editConfig.message_filter_value as string) || '...'}"`}
                  </p>
                </div>
              </div>
            )}

            {editConfig.trigger_type === 'scheduled' && (
              <div className="space-y-2">
                <label className={labelClass}>Horário</label>
                <input
                  type="time"
                  value={(editConfig.schedule_time as string) || '09:00'}
                  onChange={(e) => setEditConfig((p) => ({ ...p, schedule_time: e.target.value }))}
                  className={inputClass}
                />
                <label className={labelClass}>Dias da semana</label>
                <div className="flex gap-1.5">
                  {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => {
                    const days = ((editConfig.schedule_days as number[]) || []);
                    const active = days.includes(i);
                    return (
                      <button
                        key={d}
                        onClick={() => setEditConfig((p) => ({
                          ...p,
                          schedule_days: active ? days.filter((x) => x !== i) : [...days, i],
                        }))}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-bold transition-colors ${
                          active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Connection selector inside trigger */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-primary" />
                <label className={labelClass}>Conexões WhatsApp</label>
              </div>
              {connections.length > 0 ? (
                <div className="space-y-1.5">
                  {connections.map((c) => {
                    const connIds = ((editConfig.connection_ids as string[]) || []);
                    const isSelected = connIds.includes(c.id);
                    const connLabel = (c.config as any)?.phone_number_id
                      ? `WhatsApp (${(c.config as any).phone_number_id})`
                      : c.connection_id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => {
                          setEditConfig((p) => {
                            const ids = ((p.connection_ids as string[]) || []);
                            const next = isSelected ? ids.filter(id => id !== c.id) : [...ids, c.id];
                            return { ...p, connection_ids: next, connection_id: next[0] || '' };
                          });
                        }}
                        className={`w-full rounded-lg border p-2.5 text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:border-primary/30 hover:bg-secondary/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                            isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/40'
                          }`}>
                            {isSelected && <span className="text-[8px] text-primary-foreground font-bold">✓</span>}
                          </div>
                          <p className="text-xs font-medium text-card-foreground">{connLabel}</p>
                        </div>
                      </button>
                    );
                  })}
                  <p className="text-[10px] text-muted-foreground">
                    {((editConfig.connection_ids as string[]) || []).length} conexão(ões) selecionada(s)
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-3 text-center">
                  <p className="text-[10px] text-muted-foreground">Nenhuma conexão configurada</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* === MESSAGE CONFIG === */}
        {nodeType === 'message' && (
          <div className="space-y-1.5">
            <label className={labelClass}>Conteúdo da Mensagem</label>
            <textarea
              value={(editConfig.content as string) || ''}
              onChange={(e) => setEditConfig((p) => ({ ...p, content: e.target.value }))}
              rows={5}
              placeholder="Digite a mensagem que será enviada..."
              className={`${inputClass} resize-none`}
            />
            <p className="text-[10px] text-muted-foreground">Variáveis: {"{{nome}}"}, {"{{telefone}}"}</p>
          </div>
        )}

        {/* === DELAY CONFIG === */}
        {nodeType === 'delay' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className={labelClass}>Tempo de espera</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={(editConfig.delay_value as number) || (editConfig.delay_seconds as number) || 5}
                  onChange={(e) => setEditConfig((p) => ({ ...p, delay_value: parseInt(e.target.value) || 1 }))}
                  className={inputClass}
                />
                <select
                  value={(editConfig.delay_unit as string) || 'seconds'}
                  onChange={(e) => setEditConfig((p) => ({ ...p, delay_unit: e.target.value }))}
                  className={selectClass}
                >
                  <option value="seconds">Segundos</option>
                  <option value="minutes">Minutos</option>
                  <option value="hours">Horas</option>
                </select>
              </div>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                ⏱ O fluxo aguardará {(editConfig.delay_value as number) || (editConfig.delay_seconds as number) || 5}{' '}
                {(editConfig.delay_unit as string) === 'minutes' ? 'minutos' : (editConfig.delay_unit as string) === 'hours' ? 'horas' : 'segundos'} antes de continuar
              </p>
            </div>
          </div>
        )}

        {/* === MEDIA CONFIGS (image, audio, video, document) === */}
        {['image', 'audio', 'video', 'document'].includes(nodeType) && (
          <>
            <div className="space-y-2">
              <label className={labelClass}>Arquivo de mídia</label>
              {editConfig.media_url ? (
                <div className="space-y-2">
                  {nodeType === 'image' && <img src={editConfig.media_url as string} alt="" className="w-full rounded-lg border border-border" />}
                  {nodeType === 'audio' && <audio src={editConfig.media_url as string} controls className="w-full" />}
                  {nodeType === 'video' && <video src={editConfig.media_url as string} controls className="w-full rounded-lg" />}
                  {nodeType === 'document' && (
                    <div className="flex items-center gap-2 rounded-lg bg-secondary p-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <p className="text-xs text-card-foreground truncate flex-1">{(editConfig.media_url as string).split('/').pop()}</p>
                    </div>
                  )}
                  <button
                    onClick={() => setEditConfig((p) => ({ ...p, media_url: undefined }))}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remover arquivo
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-input p-8 cursor-pointer hover:border-primary/40 hover:bg-secondary/30 transition-all">
                  <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
                  <p className="text-xs font-medium text-muted-foreground">Clique para enviar</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    {nodeType === 'image' ? 'JPG, PNG, WebP' : nodeType === 'audio' ? 'MP3, OGG, AAC' : nodeType === 'video' ? 'MP4, 3GP' : 'PDF, DOC, XLS'}
                  </p>
                  {uploading && <Loader2 className="h-4 w-4 animate-spin mt-2 text-primary" />}
                  <input
                    type="file"
                    accept={nodeType === 'image' ? 'image/*' : nodeType === 'audio' ? 'audio/*' : nodeType === 'video' ? 'video/*' : '.pdf,.doc,.docx,.xls,.xlsx'}
                    onChange={handleUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {['image', 'video', 'document'].includes(nodeType) && (
              <div className="space-y-1.5">
                <label className={labelClass}>Legenda (opcional)</label>
                <input
                  value={(editConfig.caption as string) || ''}
                  onChange={(e) => setEditConfig((p) => ({ ...p, caption: e.target.value }))}
                  placeholder="Legenda da mídia..."
                  className={inputClass}
                />
              </div>
            )}
          </>
        )}

        {/* === CONDITION CONFIG === */}
        {nodeType === 'condition' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className={labelClass}>Campo</label>
              <select
                value={(editConfig.condition_field as string) || 'last_message'}
                onChange={(e) => setEditConfig((p) => ({ ...p, condition_field: e.target.value }))}
                className={selectClass}
              >
                {conditionFields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Operador</label>
              <select
                value={(editConfig.condition_operator as string) || 'equals'}
                onChange={(e) => setEditConfig((p) => ({ ...p, condition_operator: e.target.value }))}
                className={selectClass}
              >
                {conditionOperators.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Valor</label>
              <input
                value={(editConfig.condition_value as string) || ''}
                onChange={(e) => setEditConfig((p) => ({ ...p, condition_value: e.target.value }))}
                placeholder="Valor para comparar..."
                className={inputClass}
              />
            </div>
            <div className="rounded-lg bg-cyan-50 dark:bg-cyan-900/10 border border-cyan-200 dark:border-cyan-800 p-3">
              <p className="text-[11px] text-cyan-700 dark:text-cyan-300">
                🔀 Conecte as saídas "Verdadeiro" e "Falso" aos próximos nós
              </p>
            </div>
          </div>
        )}

        {/* === QUICK REPLY CONFIG === */}
        {nodeType === 'quick_reply' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className={labelClass}>Texto da mensagem</label>
              <textarea
                value={(editConfig.content as string) || ''}
                onChange={(e) => setEditConfig((p) => ({ ...p, content: e.target.value }))}
                rows={3}
                placeholder="Escolha uma opção:"
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>Botões (máx 3)</label>
              <div className="space-y-1.5">
                {((editConfig.buttons as string[]) || []).map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">{b}</div>
                    <button onClick={() => removeButton(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              {((editConfig.buttons as string[]) || []).length < 3 && (
                <div className="flex gap-2">
                  <input
                    value={newButton}
                    onChange={(e) => setNewButton(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addButton()}
                    placeholder="Texto do botão..."
                    className={inputClass}
                  />
                  <button onClick={addButton} className="shrink-0 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                    +
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* === CALL BUTTON CONFIG === */}
        {nodeType === 'call_button' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className={labelClass}>Texto da mensagem</label>
              <textarea
                value={(editConfig.content as string) || ''}
                onChange={(e) => setEditConfig((p) => ({ ...p, content: e.target.value }))}
                rows={3}
                placeholder="Precisa de ajuda? Ligue para nós!"
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Número de telefone</label>
              <input
                value={(editConfig.call_phone as string) || ''}
                onChange={(e) => setEditConfig((p) => ({ ...p, call_phone: e.target.value }))}
                placeholder="+5531999999999"
                className={inputClass}
              />
              <p className="text-[10px] text-muted-foreground">Inclua o código do país (ex: +55)</p>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Texto do botão</label>
              <input
                value={(editConfig.call_button_text as string) || 'Ligar agora'}
                onChange={(e) => setEditConfig((p) => ({ ...p, call_button_text: e.target.value }))}
                placeholder="Ligar agora"
                className={inputClass}
              />
            </div>
            <div className="rounded-lg bg-teal-50 dark:bg-teal-900/10 border border-teal-200 dark:border-teal-800 p-3">
              <p className="text-[11px] text-teal-700 dark:text-teal-300">
                📞 O cliente receberá uma mensagem com um botão que abre o discador para ligar no número configurado
              </p>
            </div>
          </div>
        )}

        {/* === AI REPLY CONFIG === */}
        {nodeType === 'ai_reply' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className={labelClass}>Prompt da IA</label>
              <textarea
                value={(editConfig.ai_prompt as string) || ''}
                onChange={(e) => setEditConfig((p) => ({ ...p, ai_prompt: e.target.value }))}
                rows={5}
                placeholder="Instruções para a IA responder neste ponto do fluxo..."
                className={`${inputClass} resize-none`}
              />
            </div>
            <div className="rounded-lg bg-fuchsia-50 dark:bg-fuchsia-900/10 border border-fuchsia-200 dark:border-fuchsia-800 p-3">
              <p className="text-[11px] text-fuchsia-700 dark:text-fuchsia-300">
                🤖 A IA gerará uma resposta baseada no contexto da conversa e neste prompt
              </p>
            </div>
          </div>
        )}

        {/* === ACTION CONFIG === */}
        {nodeType === 'action' && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className={labelClass}>Tipo de Ação</label>
              <select
                value={(editConfig.action_type as string) || 'add_tag'}
                onChange={(e) => setEditConfig((p) => ({ ...p, action_type: e.target.value }))}
                className={selectClass}
              >
                <option value="add_tag">Adicionar Etiqueta</option>
                <option value="remove_tag">Remover Etiqueta</option>
                <option value="set_funnel_stage">Definir Etapa do Funil</option>
                <option value="set_billing_stage">Definir Etapa da Cobrança</option>
                <option value="transfer_agent">Transferir para Agente</option>
                <option value="webhook">Enviar Webhook</option>
              </select>
            </div>

            {/* Tag actions */}
            {((editConfig.action_type as string) === 'add_tag' || (editConfig.action_type as string) === 'remove_tag' || !editConfig.action_type) && (
              <div className="space-y-2">
                <label className={labelClass}>Etiqueta</label>
                {availableTags.length > 0 ? (
                  <div className="space-y-1.5">
                    {availableTags.map((tag) => {
                      const isSelected = (editConfig.tag_id as string) === tag.id;
                      return (
                        <button
                          key={tag.id}
                          onClick={() => setEditConfig((p) => ({ ...p, tag_id: tag.id, tag_name: tag.name }))}
                          className={`w-full rounded-lg border p-2.5 text-left transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/5 ring-1 ring-primary'
                              : 'border-border hover:border-primary/30 hover:bg-secondary/50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                            <p className="text-xs font-medium text-card-foreground">{tag.name}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-3 text-center space-y-2">
                    <Tag className="h-5 w-5 text-muted-foreground mx-auto" />
                    <p className="text-[10px] text-muted-foreground">Nenhuma etiqueta criada</p>
                    <p className="text-[9px] text-muted-foreground">Crie etiquetas para usar nas ações</p>
                  </div>
                )}
                {/* Quick create tag */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-[10px] text-muted-foreground">Criar nova etiqueta</label>
                  <div className="flex gap-1.5">
                    <input
                      value={(editConfig._newTagName as string) || ''}
                      onChange={(e) => setEditConfig((p) => ({ ...p, _newTagName: e.target.value }))}
                      placeholder="Nome da etiqueta..."
                      className={inputClass}
                    />
                    <input
                      type="color"
                      value={(editConfig._newTagColor as string) || '#3b82f6'}
                      onChange={(e) => setEditConfig((p) => ({ ...p, _newTagColor: e.target.value }))}
                      className="h-9 w-9 rounded-lg border border-input cursor-pointer"
                    />
                    <button
                      onClick={async () => {
                        const name = (editConfig._newTagName as string)?.trim();
                        if (!name) return;
                        const color = (editConfig._newTagColor as string) || '#3b82f6';
                         if (!currentWorkspace) { toast.error('Workspace não selecionado'); return; }
                         const { data, error } = await supabase
                           .from('tags')
                           .insert({ name, color, workspace_id: currentWorkspace.id })
                           .select()
                           .single();
                        if (error) { toast.error('Erro ao criar etiqueta'); return; }
                        setAvailableTags((prev) => [...prev, data]);
                        setEditConfig((p) => ({ ...p, tag_id: data.id, tag_name: data.name, _newTagName: '', _newTagColor: '#3b82f6' }));
                        toast.success('Etiqueta criada');
                      }}
                      className="shrink-0 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >+</button>
                  </div>
                </div>
              </div>
            )}

            {/* Transfer agent */}
            {(editConfig.action_type as string) === 'transfer_agent' && (
              <div className="space-y-2">
                <label className={labelClass}>Agente</label>
                {agents.length > 0 ? (
                  <select
                    value={(editConfig.agent_id as string) || ''}
                    onChange={(e) => {
                      const agent = agents.find(a => a.id === e.target.value);
                      setEditConfig((p) => ({ ...p, agent_id: e.target.value, agent_name: agent?.full_name || '' }));
                    }}
                    className={selectClass}
                  >
                    <option value="">Selecione um agente...</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.full_name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[10px] text-muted-foreground">Nenhum agente cadastrado</p>
                )}
              </div>
            )}

            {/* Set funnel stage */}
            {(editConfig.action_type as string) === 'set_funnel_stage' && (
              <div className="space-y-2">
                <label className={labelClass}>Etapa do Funil</label>
                {funnelStages.length > 0 ? (
                  <div className="space-y-1.5">
                    {funnelStages.map((stage) => (
                      <button
                        key={stage.stage_key}
                        onClick={() => setEditConfig((p) => ({ ...p, funnel_stage: stage.stage_key, funnel_stage_label: stage.label }))}
                        className={`w-full rounded-lg border p-2.5 text-left transition-all ${
                          (editConfig.funnel_stage as string) === stage.stage_key
                            ? 'border-primary bg-primary/5 ring-1 ring-primary'
                            : 'border-border hover:border-primary/30 hover:bg-secondary/50'
                        }`}
                      >
                        <p className="text-xs font-medium text-card-foreground">{stage.label}</p>
                        <p className="text-[10px] text-muted-foreground">{stage.description}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center space-y-1">
                    <Target className="h-5 w-5 text-muted-foreground mx-auto" />
                    <p className="text-[11px] text-muted-foreground">
                      {nicheId ? 'Nenhuma etapa configurada para este nicho.' : 'Este fluxo não está vinculado a um nicho.'}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Configure as etapas na aba "Follow-ups" do nicho.</p>
                  </div>
                )}
              </div>
            )}

            {/* Set billing stage */}
            {(editConfig.action_type as string) === 'set_billing_stage' && (
              <div className="space-y-2">
                <label className={labelClass}>Etapa da Cobrança</label>
                <input
                  value={(editConfig.billing_stage as string) || ''}
                  onChange={(e) => setEditConfig((p) => ({ ...p, billing_stage: e.target.value }))}
                  placeholder="Ex: pedido pre enviado, enviado, entregue..."
                  className={inputClass}
                />
                <p className="text-[10px] text-muted-foreground">
                  Esse valor será enviado via webhook para a plataforma de atendimento para sincronizar a etapa da cobrança do lead.
                </p>
              </div>
            )}
            {(editConfig.action_type as string) === 'webhook' && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <label className={labelClass}>URL do Webhook</label>
                  <input
                    value={(editConfig.webhook_url as string) || ''}
                    onChange={(e) => setEditConfig((p) => ({ ...p, webhook_url: e.target.value }))}
                    placeholder="https://..."
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Método</label>
                  <select
                    value={(editConfig.webhook_method as string) || 'POST'}
                    onChange={(e) => setEditConfig((p) => ({ ...p, webhook_method: e.target.value }))}
                    className={selectClass}
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Headers (JSON, opcional)</label>
                  <textarea
                    value={(editConfig.webhook_headers as string) || ''}
                    onChange={(e) => setEditConfig((p) => ({ ...p, webhook_headers: e.target.value }))}
                    rows={3}
                    placeholder='{"Authorization": "Bearer ..."}'
                    className={`${inputClass} resize-none font-mono text-[11px]`}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Body (JSON, opcional)</label>
                  <textarea
                    value={(editConfig.webhook_body as string) || ''}
                    onChange={(e) => setEditConfig((p) => ({ ...p, webhook_body: e.target.value }))}
                    rows={3}
                    placeholder='{"contact": "{{telefone}}"}'
                    className={`${inputClass} resize-none font-mono text-[11px]`}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">Variáveis: {"{{nome}}"}, {"{{telefone}}"}, {"{{mensagem}}"}</p>
              </div>
            )}

            <div className="rounded-lg bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800 p-3">
              <p className="text-[11px] text-rose-700 dark:text-rose-300">
                 ⚙️ {(editConfig.action_type as string) === 'add_tag' || !editConfig.action_type
                   ? 'Adiciona uma etiqueta ao contato da conversa'
                   : (editConfig.action_type as string) === 'remove_tag'
                   ? 'Remove uma etiqueta do contato da conversa'
                   : (editConfig.action_type as string) === 'set_funnel_stage'
                    ? 'Define em qual etapa do funil o lead se encontra — isso determina qual IA de follow-up será acionada'
                    : (editConfig.action_type as string) === 'set_billing_stage'
                    ? 'Define a etapa da cobrança do lead — sincroniza com a plataforma de atendimento via webhook'
                    : (editConfig.action_type as string) === 'transfer_agent'
                    ? 'Transfere a conversa para o agente selecionado'
                    : 'Envia uma requisição HTTP para o endpoint configurado'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border space-y-2 bg-secondary/20">
        <button
          onClick={handleSave}
          className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Save className="h-4 w-4" />
          Salvar Alterações
        </button>
        {nodeType !== 'trigger' && (
          <button
            onClick={() => { onDelete(nodeId); onClose(); }}
            className="flex items-center justify-center gap-2 w-full rounded-lg border border-destructive/30 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Excluir Nó
          </button>
        )}
      </div>
    </div>
  );
}
