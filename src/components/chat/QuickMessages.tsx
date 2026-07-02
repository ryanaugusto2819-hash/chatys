import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Zap, Plus, X, Type, Mic, Search, Trash2, Edit2, Save, Volume2, Tag as TagIcon, TagIcon as TagOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

interface QuickMessage {
  id: string;
  title: string;
  content: string;
  type: string;
  audio_url: string | null;
  shortcut: string | null;
  sort_order: number;
  tag_id?: string | null;
}

interface TagOption {
  id: string;
  name: string;
  color: string;
}

type QMType = 'text' | 'audio' | 'add_tag' | 'remove_tag';

interface Props {
  onSelect: (content: string) => void;
  contactPhone?: string;
  onTagChanged?: () => void;
}

export default function QuickMessages({ onSelect, contactPhone, onTagChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<QuickMessage[]>([]);
  const [tags, setTags] = useState<TagOption[]>([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formType, setFormType] = useState<QMType>('text');
  const [formShortcut, setFormShortcut] = useState('');
  const [formTagId, setFormTagId] = useState<string>('');
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchMessages = async () => {
    const [{ data: msgs }, { data: tagList }] = await Promise.all([
      supabase.from('quick_messages').select('*').order('sort_order', { ascending: true }),
      supabase.from('tags').select('id, name, color').order('name'),
    ]);
    if (msgs) setMessages(msgs as any);
    if (tagList) setTags(tagList);
  };

  useEffect(() => {
    if (open) fetchMessages();
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const resetForm = () => {
    setFormTitle('');
    setFormContent('');
    setFormType('text');
    setFormShortcut('');
    setFormTagId('');
    setEditingId(null);
    setShowForm(false);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) return;
    const isTagType = formType === 'add_tag' || formType === 'remove_tag';
    if (formType === 'text' && !formContent.trim()) return;
    if (formType === 'audio' && !formContent) return;
    if (isTagType && !formTagId) {
      toast.error('Selecione uma etiqueta');
      return;
    }

    const payload: any = {
      title: formTitle,
      content: isTagType ? '' : formContent,
      type: formType,
      shortcut: formShortcut || null,
      tag_id: isTagType ? formTagId : null,
    };

    if (editingId) {
      await (supabase.from('quick_messages') as any).update({
        ...payload,
        updated_at: new Date().toISOString(),
      }).eq('id', editingId);
      toast.success('Mensagem atualizada');
    } else {
      await (supabase.from('quick_messages') as any).insert({
        ...payload,
        sort_order: messages.length,
      });
      toast.success('Mensagem rápida criada');
    }

    resetForm();
    fetchMessages();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('quick_messages').delete().eq('id', id);
    toast.success('Mensagem removida');
    fetchMessages();
  };

  const handleEdit = (msg: QuickMessage) => {
    setEditingId(msg.id);
    setFormTitle(msg.title);
    setFormContent(msg.content);
    setFormType(msg.type as QMType);
    setFormShortcut(msg.shortcut || '');
    setFormTagId(msg.tag_id || '');
    setShowForm(true);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormContent(reader.result as string);
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start();
      setRecording(true);
    } catch {
      toast.error('Não foi possível acessar o microfone');
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleTagAction = async (msg: QuickMessage) => {
    if (!contactPhone) {
      toast.error('Nenhum contato selecionado');
      return;
    }
    if (!msg.tag_id) {
      toast.error('Etiqueta não configurada');
      return;
    }
    const tag = tags.find(t => t.id === msg.tag_id);
    const tagName = tag?.name || 'etiqueta';

    try {
      if (msg.type === 'add_tag') {
        const { data: existing } = await supabase
          .from('contact_tags')
          .select('id')
          .eq('contact_phone', contactPhone)
          .eq('tag_id', msg.tag_id)
          .maybeSingle();
        if (existing) {
          toast.info(`Etiqueta "${tagName}" já está aplicada`);
        } else {
          await supabase.from('contact_tags').insert({ contact_phone: contactPhone, tag_id: msg.tag_id });
          toast.success(`Etiqueta "${tagName}" adicionada`);
        }
      } else {
        await supabase
          .from('contact_tags')
          .delete()
          .eq('contact_phone', contactPhone)
          .eq('tag_id', msg.tag_id);
        toast.success(`Etiqueta "${tagName}" removida`);
      }
      onTagChanged?.();
      setOpen(false);
    } catch {
      toast.error('Erro ao alterar etiqueta');
    }
  };

  const filteredMessages = messages.filter(m =>
    m.title.toLowerCase().includes(search.toLowerCase()) ||
    m.content.toLowerCase().includes(search.toLowerCase()) ||
    (m.shortcut && m.shortcut.toLowerCase().includes(search.toLowerCase()))
  );

  const isTagType = formType === 'add_tag' || formType === 'remove_tag';

  const renderTypeIcon = (t: string) => {
    if (t === 'audio') return <Mic className="h-3.5 w-3.5" />;
    if (t === 'add_tag') return <TagIcon className="h-3.5 w-3.5" />;
    if (t === 'remove_tag') return <TagOff className="h-3.5 w-3.5" />;
    return <Type className="h-3.5 w-3.5" />;
  };

  const typeIconBg = (t: string) => {
    if (t === 'audio') return 'bg-orange-500/10 text-orange-500';
    if (t === 'add_tag') return 'bg-emerald-500/10 text-emerald-500';
    if (t === 'remove_tag') return 'bg-red-500/10 text-red-500';
    return 'bg-primary/10 text-primary';
  };

  const previewText = (m: QuickMessage) => {
    if (m.type === 'audio') return '🎵 Mensagem de áudio';
    if (m.type === 'add_tag' || m.type === 'remove_tag') {
      const tag = tags.find(t => t.id === m.tag_id);
      const label = m.type === 'add_tag' ? 'Adicionar' : 'Remover';
      return `🏷️ ${label} etiqueta "${tag?.name || '—'}"`;
    }
    return m.content;
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
        title="Mensagens rápidas"
      >
        <Zap className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-12 left-0 w-80 rounded-xl border border-border bg-card shadow-lg overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-card-foreground">Mensagens Rápidas</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { resetForm(); setShowForm(!showForm); }}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary transition-colors"
                >
                  {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Form */}
            <AnimatePresence>
              {showForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-b border-border overflow-hidden"
                >
                  <div className="p-3 space-y-2.5">
                    {/* Type selector */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => setFormType('text')}
                        className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                          formType === 'text' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        <Type className="h-3 w-3" /> Texto
                      </button>
                      <button
                        onClick={() => setFormType('audio')}
                        className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                          formType === 'audio' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        <Mic className="h-3 w-3" /> Áudio
                      </button>
                      <button
                        onClick={() => setFormType('add_tag')}
                        className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                          formType === 'add_tag' ? 'bg-emerald-500 text-white' : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        <TagIcon className="h-3 w-3" /> Add Etiqueta
                      </button>
                      <button
                        onClick={() => setFormType('remove_tag')}
                        className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                          formType === 'remove_tag' ? 'bg-red-500 text-white' : 'bg-secondary text-secondary-foreground'
                        }`}
                      >
                        <TagOff className="h-3 w-3" /> Remover Etiqueta
                      </button>
                    </div>

                    <input
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="Título (ex: Saudação)"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />

                    {formType === 'text' && (
                      <textarea
                        value={formContent}
                        onChange={(e) => setFormContent(e.target.value)}
                        placeholder="Conteúdo da mensagem..."
                        rows={3}
                        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    )}

                    {formType === 'audio' && (
                      <div className="space-y-2">
                        {formContent ? (
                          <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-2">
                            <Volume2 className="h-4 w-4 text-primary shrink-0" />
                            <span className="text-xs text-card-foreground flex-1">Áudio gravado</span>
                            <button onClick={() => setFormContent('')} className="text-muted-foreground hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={recording ? stopRecording : startRecording}
                            className={`w-full flex items-center justify-center gap-2 rounded-lg py-3 text-xs font-medium transition-colors ${
                              recording
                                ? 'bg-destructive text-destructive-foreground animate-pulse'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            }`}
                          >
                            <Mic className="h-4 w-4" />
                            {recording ? 'Gravando... Clique para parar' : 'Clique para gravar'}
                          </button>
                        )}
                      </div>
                    )}

                    {isTagType && (
                      <div className="space-y-1.5">
                        {tags.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground px-1">
                            Nenhuma etiqueta cadastrada. Crie uma etiqueta primeiro no gerenciador de etiquetas.
                          </p>
                        ) : (
                          <select
                            value={formTagId}
                            onChange={(e) => setFormTagId(e.target.value)}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">Selecione uma etiqueta...</option>
                            {tags.map(t => (
                              <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                    <input
                      value={formShortcut}
                      onChange={(e) => setFormShortcut(e.target.value)}
                      placeholder="Atalho (ex: /ola) — opcional"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />

                    <button
                      onClick={handleSave}
                      disabled={
                        !formTitle.trim() ||
                        (formType === 'text' && !formContent.trim()) ||
                        (formType === 'audio' && !formContent) ||
                        (isTagType && !formTagId)
                      }
                      className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary text-primary-foreground py-2 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      <Save className="h-3 w-3" />
                      {editingId ? 'Atualizar' : 'Salvar'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Search */}
            {!showForm && messages.length > 3 && (
              <div className="px-3 pt-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar mensagem..."
                    className="w-full rounded-lg border border-input bg-background pl-7 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}

            {/* List */}
            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
              {filteredMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Zap className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {messages.length === 0 ? 'Nenhuma mensagem rápida cadastrada' : 'Nenhum resultado encontrado'}
                  </p>
                  {messages.length === 0 && (
                    <button
                      onClick={() => setShowForm(true)}
                      className="mt-2 text-xs text-primary hover:underline"
                    >
                      Criar primeira mensagem
                    </button>
                  )}
                </div>
              ) : (
                filteredMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="group flex items-start gap-2 rounded-lg p-2.5 hover:bg-secondary/60 transition-colors cursor-pointer"
                    onClick={() => {
                      if (msg.type === 'text') {
                        onSelect(msg.content);
                        setOpen(false);
                      } else if (msg.type === 'add_tag' || msg.type === 'remove_tag') {
                        handleTagAction(msg);
                      }
                    }}
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${typeIconBg(msg.type)}`}>
                      {renderTypeIcon(msg.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-card-foreground truncate">{msg.title}</span>
                        {msg.shortcut && (
                          <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">
                            {msg.shortcut}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {previewText(msg)}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(msg); }}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-card-foreground hover:bg-secondary"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(msg.id); }}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
