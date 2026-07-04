import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import StatusBadge from '@/components/shared/StatusBadge';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { ArrowLeft, Send, Paperclip, MoreVertical, User, Clock, CheckCheck, Check, Loader2, Phone, MessageSquare, Tag, Calendar, Hash, History, AlertTriangle, RefreshCw, Bot, UserRound, DollarSign, Image, X, Trash2, FileText, Languages, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import FlowTrigger from '@/components/automation/FlowTrigger';
import QuickMessages from '@/components/chat/QuickMessages';
import PinnedFlowShortcuts from '@/components/chat/PinnedFlowShortcuts';
import LibertyPedidosPanel from '@/components/chat/LibertyPedidosPanel';
import PinnedQuickMessageShortcuts from '@/components/chat/PinnedQuickMessageShortcuts';

import TagManager from '@/components/tags/TagManager';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { useChatMessages, type ChatMessage } from '@/hooks/useChatMessages';
import { AudioPlayer } from '@/components/chat/AudioPlayer';
import { MediaImage, MediaVideo, DocumentBubble } from '@/components/chat/MediaUrl';

interface ConversationData {
  id: string;
  contact_name: string;
  contact_phone: string;
  status: string;
  tags: string[] | null;
  updated_at: string;
  created_at: string;
  assigned_agent_id: string | null;
  ctwa_clid: string | null;
  source_id: string | null;
  ad_title: string | null;
  sector: string | null;
}

interface ContactTag {
  id: string;
  tag: { id: string; name: string; color: string };
}

interface AgentProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

interface AssignmentHistory {
  id: string;
  agent_name: string;
  assigned_at: string;
  unassigned_at: string | null;
}

interface ParsedProviderError {
  code?: number | string;
  title?: string;
  message?: string;
  details?: string;
}

const parseProviderError = (providerError?: string | null): ParsedProviderError | null => {
  if (!providerError) return null;
  try {
    const parsed = JSON.parse(providerError);
    return { code: parsed?.code, title: parsed?.title, message: parsed?.message, details: parsed?.error_data?.details };
  } catch {
    return { message: providerError };
  }
};

// ─── Memoized message bubble ───
interface MessageBubbleProps {
  msg: ChatMessage;
  onDelete?: (messageId: string) => void;
  senderName?: string | null;
}

const MessageBubble = memo(function MessageBubble({ msg, onDelete, senderName }: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const providerError = parseProviderError(msg.provider_error);

  const handleTranslate = async () => {
    if (translation) { setTranslation(null); return; }
    if (!msg.content?.trim()) return;
    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-message', {
        body: { text: msg.content, target: 'pt-BR' },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setTranslation((data as any)?.translation || '');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao traduzir');
    } finally {
      setTranslating(false);
    }
  };


  return (
    <div
      className={`group relative flex ${msg.sender_type === 'agent' ? 'justify-end' : 'justify-start'}`}
      onMouseLeave={() => { setShowMenu(false); setConfirming(false); }}
    >
      {/* Delete — appears on hover next to the bubble */}
      <div className={`absolute top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 ${
        msg.sender_type === 'agent' ? 'right-[calc(70%+8px)]' : 'left-[calc(70%+8px)]'
      }`}>
        {confirming ? (
          <div className="flex items-center gap-1.5 rounded-lg bg-card border border-border px-2.5 py-1.5 shadow-lg">
            <span className="text-[11px] text-foreground whitespace-nowrap">Excluir?</span>
            <button
              onClick={() => { onDelete?.(msg.id); setConfirming(false); setShowMenu(false); }}
              className="text-[11px] font-semibold text-destructive hover:underline"
            >
              Sim
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="text-[11px] text-muted-foreground hover:underline"
            >
              Não
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {msg.content?.trim() && (
              <button
                onClick={handleTranslate}
                disabled={translating}
                className={`flex h-6 w-6 items-center justify-center rounded-full border border-border shadow-sm transition-colors backdrop-blur-sm ${
                  translation
                    ? 'bg-primary/15 text-primary hover:bg-primary/25'
                    : 'bg-card/80 text-muted-foreground hover:bg-primary/10 hover:text-primary'
                }`}
                title={translation ? 'Ocultar tradução' : 'Traduzir para português'}
              >
                {translating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
              </button>
            )}
            <button
              onClick={() => setConfirming(true)}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-card/80 border border-border shadow-sm hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground backdrop-blur-sm"
              title="Excluir mensagem"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>



      <div
        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 sm:px-4 sm:py-2.5 ${
          msg.status === 'failed'
            ? 'bg-destructive/10 border border-destructive/30 text-destructive rounded-br-md'
            : msg.sender_type === 'agent'
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-card border border-border text-card-foreground rounded-bl-md'
        }`}
      >
        {/* Failed banner */}
        {msg.status === 'failed' && (
          <div className="mb-2 pb-1.5 border-b border-destructive/20">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-[11px] font-medium text-destructive">
                Falha no envio{providerError?.code ? ` (cód. ${providerError.code})` : ''}
              </span>
            </div>
            {(providerError?.title || providerError?.message || providerError?.details) && (
              <div className="mt-1 text-[11px] leading-snug text-destructive/90 space-y-0.5">
                {providerError.title && <div className="font-medium">{providerError.title}</div>}
                {providerError.message && <div>{providerError.message}</div>}
                {providerError.details && <div className="opacity-80">{providerError.details}</div>}
              </div>
            )}
          </div>
        )}

        {/* Image */}
        {msg.message_type === 'image' && msg.media_url && (
          <div className="mb-1.5">
            <MediaImage
              src={msg.media_url}
              alt="Imagem"
              className={`rounded-lg max-w-full max-h-64 object-cover cursor-pointer ${msg.status === 'failed' ? 'opacity-50' : ''}`}
              onClick={(url) => window.open(url, '_blank')}
            />
          </div>
        )}

        {/* Audio */}
        {msg.message_type === 'audio' && msg.media_url && (
          <AudioPlayer
            src={msg.media_url}
            inverted={msg.sender_type === 'agent' && msg.status !== 'failed'}
            failed={msg.status === 'failed'}
          />
        )}

        {/* Audio without media_url — show transcription or fallback */}
        {msg.message_type === 'audio' && !msg.media_url && (
          <div className="flex items-center gap-2 min-w-[180px]">
            <span className="text-lg">🎵</span>
            <span className="text-sm italic opacity-70">Áudio (indisponível)</span>
          </div>
        )}

        {/* Video */}
        {msg.message_type === 'video' && msg.media_url && (
          <div className={`mb-1.5 ${msg.status === 'failed' ? 'opacity-50' : ''}`}>
            <MediaVideo src={msg.media_url} className="rounded-lg max-w-full max-h-64" />
          </div>
        )}

        {/* Document / PDF */}
        {msg.message_type === 'document' && msg.media_url && (
          <DocumentBubble url={msg.media_url} content={msg.content} isAgent={msg.sender_type === 'agent'} failed={msg.status === 'failed'} />
        )}

        {/* Document without media_url */}
        {msg.message_type === 'document' && !msg.media_url && (
          <div className="flex items-center gap-2 min-w-[180px]">
            <span className="text-lg">📄</span>
            <span className="text-sm italic opacity-70">Documento (indisponível)</span>
          </div>
        )}

        {/* Text content — always show for audio with transcription */}
        {/* Text content — hide for document (shown in card) and audio without text */}
        {msg.content && msg.message_type !== 'document' && !(msg.message_type === 'audio' && msg.media_url && !msg.content.trim()) && (
          <p className={`text-sm leading-relaxed whitespace-pre-wrap ${msg.status === 'failed' ? 'text-destructive/80' : ''}`}>{msg.content}</p>
        )}

        {/* Inline translation */}
        {translation !== null && (
          <div className={`mt-1.5 pt-1.5 border-t text-sm leading-relaxed whitespace-pre-wrap ${
            msg.sender_type === 'agent'
              ? 'border-primary-foreground/25 text-primary-foreground/90'
              : 'border-border text-card-foreground/90'
          }`}>
            <div className={`mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${
              msg.sender_type === 'agent' ? 'text-primary-foreground/60' : 'text-primary/80'
            }`}>
              <Languages className="h-2.5 w-2.5" /> PT-BR
            </div>
            {translation || <span className="italic opacity-60">Sem tradução</span>}
          </div>
        )}


        {/* Fallback for image/video without URL and no content */}
        {(['image', 'video'].includes(msg.message_type)) && !msg.media_url && !msg.content && (
          <p className="text-sm leading-relaxed italic opacity-70">
            {msg.message_type === 'image' ? '📷 Imagem' : '🎬 Vídeo'}
          </p>
        )}

        {msg.status === 'failed' && providerError && (
          <div className="mt-2 rounded-xl border border-destructive/20 bg-destructive/5 p-2 text-[11px] text-destructive/90 space-y-1">
            {providerError.code && <p><span className="font-semibold">Código:</span> {providerError.code}</p>}
            {(providerError.title || providerError.message) && <p><span className="font-semibold">Erro:</span> {providerError.title || providerError.message}</p>}
            {providerError.details && <p><span className="font-semibold">Detalhe:</span> {providerError.details}</p>}
          </div>
        )}

        <div className={`flex items-center justify-end gap-1.5 mt-1 ${
          msg.status === 'failed' ? 'text-destructive/60' : msg.sender_type === 'agent' ? 'text-primary-foreground/60' : 'text-muted-foreground'
        }`}>
          {msg.sender_type === 'agent' && (() => {
            const label = msg.sender_label;
            const isHuman = label === 'humano' || (!label && msg.sender_agent_id);
            const displayLabel = label === 'ia-vendedora' ? 'IA Vendedora'
              : label === 'ia-auto-reply' ? 'IA Vendedora'
              : label === 'ia-follow-up' ? 'IA Follow-Up'
              : label === 'fluxo' ? 'Fluxo'
              : label === 'ia-seletora' ? 'IA Seletora'
              : isHuman ? (senderName || 'Humano')
              : label ? label
              : 'IA';
            const Icon = isHuman ? UserRound : Bot;
            return (
              <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[9px] font-semibold ${
                msg.status === 'failed'
                  ? 'bg-destructive/10 text-destructive/70'
                  : 'bg-primary-foreground/15 text-primary-foreground/70'
              }`}>
                <Icon className="h-2.5 w-2.5" /> {displayLabel}
              </span>
            );
          })()}
          <span className="text-[10px]">{format(new Date(msg.created_at), 'HH:mm')}</span>
          {msg.sender_type === 'agent' && (
            msg.status === 'failed'
              ? <AlertTriangle className="h-3 w-3 text-destructive" />
              : msg.status === 'read'
                ? <CheckCheck className="h-3 w-3 text-blue-400" />
                : msg.status === 'delivered'
                  ? <CheckCheck className="h-3 w-3 opacity-80" />
                  : msg.status === 'pending'
                    ? <Clock className="h-3 w-3" />
                    : <Check className="h-3 w-3" />
          )}
        </div>
      </div>
    </div>
  );
});

// ─── Main component ───
interface ChatViewProps {
  embedded?: boolean;
  conversationId?: string;
  onBack?: () => void;
}

export default function ChatView({ embedded, conversationId, onBack }: ChatViewProps = {}) {
  const { id: paramId } = useParams();
  const id = conversationId || paramId;
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [activeSectorTab, setActiveSectorTab] = useState<string>(() =>
    (typeof window !== 'undefined' && localStorage.getItem('conversations-active-tab')) || 'all'
  );
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'string') setActiveSectorTab(detail);
      else setActiveSectorTab(localStorage.getItem('conversations-active-tab') || 'all');
    };
    window.addEventListener('conversations-tab-change', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('conversations-tab-change', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);
  const [translating, setTranslating] = useState(false);

  const translateToUruguayan = async () => {
    if (!input.trim() || translating) return;
    setTranslating(true);
    try {
      const { data, error } = await supabase.functions.invoke('translate-message', {
        body: { text: input, target: 'es-UY' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.translation) {
        setInput(data.translation);
        toast.success('Traduzido para espanhol uruguaio');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Falha ao traduzir');
    } finally {
      setTranslating(false);
    }
  };
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [convLoading, setConvLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [contactTags, setContactTags] = useState<ContactTag[]>([]);
  const [assignedAgent, setAssignedAgent] = useState<AgentProfile | null>(null);
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentHistory[]>([]);
  const [showSaleDialog, setShowSaleDialog] = useState(false);
  const [saleData, setSaleData] = useState({ valor: '', campanha: '', pais: 'brasil', moeda: 'BRL' });
  const [sendingSale, setSendingSale] = useState(false);
  const [saleRegisteredAt, setSaleRegisteredAt] = useState<string | null>(null);

  // Termo state
  const [showTermoDialog, setShowTermoDialog] = useState(false);
  const [termoData, setTermoData] = useState({ nomeCliente: '', cpf: '', meses: '', valor: '', formaPagamento: 'boleto à vista' });
  const [sendingTermo, setSendingTermo] = useState(false);
  const [termoPdfUrl, setTermoPdfUrl] = useState<string | null>(null);
  const [sendingTermoWhatsApp, setSendingTermoWhatsApp] = useState(false);
  const [showMotoboyDialog, setShowMotoboyDialog] = useState(false);
  const [motoboyCity, setMotoboyCity] = useState('');
  const [motoboyResult, setMotoboyResult] = useState<string | null>(null);
  const [blockedConnections, setBlockedConnections] = useState<{ id: string; label: string; status: string }[]>([]);
  const { currentWorkspace } = useWorkspace();
  const [rmkTag, setRmkTag] = useState<{ id: string; name: string; color: string } | null>(null);
  const [rmkLoading, setRmkLoading] = useState(false);
  const [contactDetailsOpen, setContactDetailsOpen] = useState(false);

  // Reset termo state when conversation changes
  useEffect(() => {
    setShowTermoDialog(false);
    setTermoData({ nomeCliente: '', cpf: '', meses: '', valor: '', formaPagamento: 'boleto à vista' });
    setTermoPdfUrl(null);
    setSendingTermo(false);
    setSendingTermoWhatsApp(false);
  }, [id]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLoadingOlderRef = useRef(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { messages, setMessages, loading: msgsLoading, hasMore, loadMore, loadingMore, markAsRead } = useChatMessages(id);

  // Cache: sender_agent_id -> full_name
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const uniqueSenderIds = useMemo(() => {
    const s = new Set<string>();
    for (const m of messages) {
      if (m.sender_type === 'agent' && (m as any).sender_agent_id) s.add((m as any).sender_agent_id);
    }
    return Array.from(s);
  }, [messages]);

  useEffect(() => {
    const missing = uniqueSenderIds.filter(uid => !(uid in agentNames));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('user_id, full_name').in('user_id', missing);
      if (data) {
        setAgentNames(prev => {
          const next = { ...prev };
          for (const p of data as any[]) next[p.user_id] = p.full_name || 'Humano';
          return next;
        });
      }
    })();
  }, [uniqueSenderIds, agentNames]);

  // Only block UI on messages loading — conversation metadata loads in background
  const loading = msgsLoading;

  // Check for blocked connections (once, then every 5min)
  useEffect(() => {
    const checkConnections = async () => {
      const { data } = await supabase
        .from('connection_configs')
        .select('id, label, status, connection_id, status_since' as any)
        .eq('is_connected', true);
      if (data) {
        const STALE_MS = 48 * 60 * 60 * 1000;
        const now = Date.now();
        const blocked = (data as any[]).filter(c => {
          const isWarning = c.status === 'error' || c.status === 'blocked' || c.status === 'warning';
          if (!isWarning) return false;
          const sinceMs = c.status_since ? new Date(c.status_since).getTime() : 0;
          // Hide alert if status has been the same for more than 48h (old/stale problem)
          if (sinceMs > 0 && (now - sinceMs) > STALE_MS) return false;
          return true;
        });
        setBlockedConnections(blocked.map(c => ({ id: c.id, label: c.label || c.connection_id, status: c.status })));
      }
    };
    checkConnections();
    const interval = setInterval(checkConnections, 300_000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom on new messages (but not when loading older)
  useEffect(() => {
    if (!isLoadingOlderRef.current && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Mark as read on initial load
  useEffect(() => {
    if (!msgsLoading && messages.length > 0) {
      markAsRead();
    }
  }, [msgsLoading]);

  const handleLoadMore = useCallback(async () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const prevHeight = container.scrollHeight;
    isLoadingOlderRef.current = true;

    await loadMore();

    requestAnimationFrame(() => {
      container.scrollTop += container.scrollHeight - prevHeight;
      isLoadingOlderRef.current = false;
    });
  }, [loadMore]);

  const fetchConversation = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('conversations')
      .select('id, contact_name, contact_phone, status, tags, updated_at, created_at, assigned_agent_id, ctwa_clid, source_id, ad_title, sale_registered_at, niche_id, sector')
      .eq('id', id)
      .single();
    if (data) {
      setConversation(data);
      setSaleRegisteredAt((data as any).sale_registered_at || null);

      const [agentResult, tagsResult, historyResult] = await Promise.all([
        data.assigned_agent_id
          ? supabase.from('profiles').select('id, full_name, avatar_url').eq('id', data.assigned_agent_id).single()
          : Promise.resolve({ data: null }),
        supabase.from('contact_tags').select('id, tag_id, tags(id, name, color)').eq('contact_phone', data.contact_phone),
        supabase.from('agent_assignment_history').select('id, assigned_at, unassigned_at, agent_id, profiles(full_name)').eq('conversation_id', id).order('assigned_at', { ascending: false }),
      ]);

      setAssignedAgent(agentResult.data || null);

      if (tagsResult.data) {
        setContactTags(tagsResult.data.map((t: any) => ({ id: t.id, tag: t.tags })));
      }

      if (historyResult.data) {
        setAssignmentHistory(historyResult.data.map((h: any) => ({
          id: h.id,
          agent_name: h.profiles?.full_name || 'Agente removido',
          assigned_at: h.assigned_at,
          unassigned_at: h.unassigned_at,
        })));
      }
    }
    setConvLoading(false);
  }, [id]);

  useEffect(() => {
    setConvLoading(true);
    setConversation(null);
    fetchConversation();

    // Listen for conversation updates only
    const channel = supabase
      .channel(`chat-conv-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `id=eq.${id}` }, () => {
        fetchConversation();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Fetch RMK tag for quick toggle
  const fetchRmkTag = useCallback(async () => {
    if (!currentWorkspace) return;
    const { data } = await supabase
      .from('tags')
      .select('id, name, color')
      .eq('name', 'RMK')
      .eq('workspace_id', currentWorkspace.id)
      .maybeSingle();
    if (data) setRmkTag(data);
    else setRmkTag(null);
  }, [currentWorkspace]);

  useEffect(() => {
    fetchRmkTag();
  }, [fetchRmkTag]);

  const toggleRmkTag = async () => {
    if (!rmkTag || !conversation) return;
    setRmkLoading(true);
    try {
      const isAssigned = contactTags.some(ct => ct.tag.id === rmkTag.id);
      if (isAssigned) {
        const ct = contactTags.find(ct => ct.tag.id === rmkTag.id);
        if (ct) {
          await supabase.from('contact_tags').delete().eq('id', ct.id);
          toast.success('Etiqueta RMK removida');
        }
      } else {
        await supabase.from('contact_tags').insert({ contact_phone: conversation.contact_phone, tag_id: rmkTag.id });
        toast.success('Etiqueta RMK adicionada');
      }
      fetchConversation();
    } catch {
      toast.error('Erro ao alterar etiqueta RMK');
    } finally {
      setRmkLoading(false);
    }
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxSize = 16 * 1024 * 1024; // 16MB
    if (file.size > maxSize) {
      toast.error('Arquivo muito grande. Máximo 16MB.');
      return;
    }

    setSelectedFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreview(url);
    } else {
      setFilePreview(null);
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, []);

  const clearSelectedFile = useCallback(() => {
    if (filePreview) URL.revokeObjectURL(filePreview);
    setSelectedFile(null);
    setFilePreview(null);
  }, [filePreview]);

  const getMessageType = (file: File): string => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return 'document';
  };

  const focusMessageInput = useCallback((cursorPosition?: number) => {
    window.setTimeout(() => {
      const textarea = messageInputRef.current;
      if (!textarea) return;
      textarea.focus();
      const position = Math.min(cursorPosition ?? textarea.value.length, textarea.value.length);
      textarea.setSelectionRange(position, position);
      textarea.scrollTop = textarea.scrollHeight;
    }, 0);
  }, []);

  const handleQuickMessageSelect = useCallback((content: string) => {
    const quickText = content.trim();
    if (!quickText) return;

    let nextCursorPosition: number | undefined;

    setInput(prev => {
      const current = prev ?? '';
      const textarea = messageInputRef.current;
      const start = typeof textarea?.selectionStart === 'number' ? textarea.selectionStart : current.length;
      const end = typeof textarea?.selectionEnd === 'number' ? textarea.selectionEnd : start;
      const before = current.slice(0, start);
      const after = current.slice(end);
      const separatorBefore = before && !/[\s\n]$/.test(before) ? '\n' : '';
      const separatorAfter = after && !/^[\s\n]/.test(after) ? '\n' : '';

      const next = `${before}${separatorBefore}${quickText}${separatorAfter}${after}`;
      nextCursorPosition = before.length + separatorBefore.length + quickText.length;
      return next;
    });

    focusMessageInput(nextCursorPosition);
  }, [focusMessageInput]);

  const handleSend = async () => {
    if ((!input.trim() && !selectedFile) || !id || sending) return;
    const msg = input.trim();
    const file = selectedFile;
    setInput('');
    clearSelectedFile();
    setSending(true);

    const optimisticId = `optimistic-${Date.now()}`;
    const messageType = file ? getMessageType(file) : 'text';
    const optimisticMsg: ChatMessage = {
      id: optimisticId,
      content: msg,
      sender_type: 'agent',
      message_type: messageType,
      status: 'sending',
      created_at: new Date().toISOString(),
      sender_label: 'humano',
      media_url: filePreview,
    };
    setMessages(prev => [...prev, optimisticMsg]);

    try {
      let mediaUrl: string | undefined;

      // Upload file if present
      if (file) {
        setUploading(true);
        const ext = file.name.split('.').pop() || 'bin';
        const path = `${id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(path, file, { contentType: file.type });

        if (uploadError) {
          throw new Error('Falha ao fazer upload do arquivo');
        }

        const { data: signed, error: signErr } = await supabase.storage
          .from('chat-media')
          .createSignedUrl(path, 60 * 60 * 24 * 7);
        if (signErr || !signed?.signedUrl) {
          throw new Error('Falha ao gerar URL do arquivo');
        }
        mediaUrl = signed.signedUrl;
        setUploading(false);
      }

      const sendMessage = (messageType === 'document' && !msg && file) ? file.name : (msg || '');
      const result = await sendWhatsAppMessage(id, sendMessage, mediaUrl ? { mediaUrl, messageType } : undefined);

      if (result?.savedMessage) {
        const savedMsg = result.savedMessage as ChatMessage;
        setMessages(prev => {
          const withoutOptimistic = prev.filter(m => m.id !== optimisticId);
          if (withoutOptimistic.some(m => m.id === savedMsg.id)) return withoutOptimistic;
          return [...withoutOptimistic, savedMsg];
        });
        if (savedMsg.status === 'failed') {
          toast.error('Erro ao enviar mensagem. Verifique a conexão do WhatsApp.');
        } else {
          // Auto-atribuir a conversa ao usuário que enviou a mensagem
          try {
            const { data: userData } = await supabase.auth.getUser();
            const uid = userData?.user?.id;
            if (uid && !assignedAgent) {
              const { error: assignErr } = await supabase
                .from('conversations')
                .update({ assigned_agent_id: uid })
                .eq('id', id);
              if (!assignErr) {
                const { data: prof } = await supabase
                  .from('profiles')
                  .select('id, full_name, avatar_url')
                  .eq('id', uid)
                  .single();
                if (prof) setAssignedAgent(prof as AgentProfile);
              }
            }
          } catch (e) { console.warn('auto-assign failed', e); }
        }
      } else {
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
      }
    } catch (err: any) {
      console.error('Send error:', err);
      setUploading(false);
      try {
        const { data: recentMsgs } = await supabase
          .from('messages')
          .select('id, content, sender_type, message_type, status, created_at, media_url, provider_error, provider_status, sender_agent_id, sender_label')
          .eq('conversation_id', id)
          .eq('sender_type', 'agent')
          .order('created_at', { ascending: false })
          .limit(1);

        const recentMsg = recentMsgs?.[0];
        if (recentMsg && (Date.now() - new Date(recentMsg.created_at).getTime()) < 15000) {
          setMessages(prev => {
            const withoutOptimistic = prev.filter(m => m.id !== optimisticId);
            if (withoutOptimistic.some(m => m.id === recentMsg.id)) return withoutOptimistic;
            return [...withoutOptimistic, recentMsg as ChatMessage];
          });
          if (recentMsg.status === 'failed') {
            toast.error('Erro ao enviar mensagem. Verifique a conexão do WhatsApp.');
          }
          return;
        }
      } catch { /* ignore fallback check errors */ }

      setMessages(prev => prev.map(m => m.id === optimisticId ? { ...m, status: 'failed' } : m));
      toast.error('Erro ao enviar mensagem. Verifique a conexão do WhatsApp.');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    // Optimistic removal
    setMessages(prev => prev.filter(m => m.id !== messageId));
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/delete-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ messageId }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast.error('Erro ao excluir mensagem do banco');
        return;
      }
      if (result.whatsappDeleted) {
        toast.success('✅ Mensagem excluída do CRM e do WhatsApp');
      } else if (result.whatsappError) {
        toast.warning(`⚠️ Excluída do CRM, mas falhou no WhatsApp: ${result.whatsappError}`, { duration: 6000 });
      } else {
        toast.success('Mensagem excluída do CRM');
      }
    } catch {
      toast.error('Erro ao excluir mensagem');
    }
  }, []);

  const handleSendSale = async () => {
    if (!saleData.valor || sendingSale) return;
    setSendingSale(true);
    try {
      const payload = {
        campanha: saleData.campanha || 'direto',
        valor: parseFloat(saleData.valor) || 0,
        pais: saleData.pais || 'brasil',
        moeda: saleData.moeda || 'BRL',
        vendas: 1,
      };

      const res = await fetch('https://simuftsgwryjubmkbnaj.supabase.co/functions/v1/webhookSales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Webhook failed');

      // Persist sale registration in the database
      const now = new Date().toISOString();
      await supabase
        .from('conversations')
        .update({ sale_registered_at: now } as any)
        .eq('id', conversationId!);

      // Register sale in sales_orders for DashVendas
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      let vendedor = assignedAgent?.full_name || 'Desconhecido';
      if (!assignedAgent && uid) {
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('user_id', uid).maybeSingle();
        if (prof?.full_name) vendedor = prof.full_name;
      }
      await supabase.from('sales_orders' as any).insert({
        vendedor,
        valor: payload.valor,
        quantidade: 1,
        nome: conversation?.contact_name || null,
        conversation_id: conversationId,
        workspace_id: currentWorkspace?.id || null,
        pais: payload.pais,
        moeda: payload.moeda,
        campanha: payload.campanha,
      });

      toast.success('Venda registrada com sucesso!');
      setShowSaleDialog(false);
      setSaleData({ valor: '', campanha: '', pais: 'brasil', moeda: 'BRL' });
      setSaleRegisteredAt(now);
    } catch (err) {
      console.error('Sale webhook error:', err);
      toast.error('Erro ao registrar venda');
    } finally {
      setSendingSale(false);
    }
  };


  const handleGenerateTermo = async () => {
    if (!termoData.nomeCliente || !termoData.cpf || !termoData.meses || sendingTermo) return;
    setSendingTermo(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-termo', {
        body: {
          conversationId: id,
          nomeCliente: termoData.nomeCliente,
          cpf: termoData.cpf,
          meses: termoData.meses,
          valor: termoData.valor || '397,00',
          formaPagamento: termoData.formaPagamento || 'boleto à vista',
          dataCompra: new Date().toLocaleDateString('pt-BR'),
          empresa: 'MEGAFIT',
          enviar: false,
        },
      });
      if (error) throw error;
      setTermoPdfUrl(data.pdfUrl);
      toast.success('Termo gerado! Revise antes de enviar.');
    } catch (err: any) {
      console.error('Termo error:', err);
      toast.error('Erro ao gerar termo');
    } finally {
      setSendingTermo(false);
    }
  };

  const handleSendTermoWhatsApp = async () => {
    if (!termoPdfUrl || sendingTermoWhatsApp) return;
    setSendingTermoWhatsApp(true);
    try {
      const result = await sendWhatsAppMessage(id!, 'TERMO DE COMPROMISSO', { mediaUrl: termoPdfUrl, messageType: 'document' });
      if (result?.success === false || result?.savedMessage?.status === 'failed') {
        throw new Error(result?.error || 'Falha ao enviar termo');
      }
      toast.success('Termo enviado com sucesso!');
      setShowTermoDialog(false);
      setTermoPdfUrl(null);
      setTermoData({ nomeCliente: '', cpf: '', meses: '', valor: '', formaPagamento: 'boleto à vista' });
    } catch (err: any) {
      console.error('Send termo error:', err);
      toast.error('Erro ao enviar termo');
    } finally {
      setSendingTermoWhatsApp(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!conversation && !convLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Conversa não encontrada
      </div>
    );
  }

  return (
    <div className={embedded ? "flex h-full min-w-0" : "flex h-[calc(100vh-3.5rem)] lg:h-screen min-w-0"}>
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-3">
            <button onClick={() => onBack ? onBack() : navigate('/conversations')} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors lg:hidden">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
              {conversation ? conversation.contact_name.split(' ').map(n => n[0]).join('').slice(0, 2) : '..'}
            </div>
            <div>
              <p className="text-sm font-semibold text-card-foreground">{conversation?.contact_name || 'Carregando...'}</p>
              <p className="text-[11px] text-muted-foreground">{conversation?.contact_phone || ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conversation && (
              <select
                value={conversation.sector || ''}
                onChange={async (e) => {
                  const newSector = e.target.value || null;
                  const prev = conversation.sector;
                  setConversation({ ...conversation, sector: newSector });
                  const { error } = await supabase
                    .from('conversations')
                    .update({ sector: newSector })
                    .eq('id', conversation.id);
                  if (error) {
                    setConversation({ ...conversation, sector: prev });
                    toast.error('Erro ao transferir de setor');
                  } else {
                    toast.success(newSector ? `Transferido para ${newSector === 'pos_venda' ? 'Pós-Venda' : newSector === 'cobranca' ? 'Cobrança' : 'Comercial'}` : 'Setor removido');
                  }
                }}
                className="h-8 rounded-lg border border-input bg-background px-2 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                title="Transferir para outro setor"
              >
                <option value="">Sem setor</option>
                <option value="comercial">Comercial</option>
                <option value="pos_venda">Pós-Venda</option>
                <option value="cobranca">Cobrança</option>
              </select>
            )}
            {conversation && <StatusBadge status={conversation.status as 'new' | 'pending' | 'active' | 'resolved'} />}
            <button className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors">
              <MoreVertical className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Blocked connection warning */}
        {blockedConnections.length > 0 && (
          <div className="mx-4 mt-2 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">
              ⚠️ {blockedConnections.length === 1 ? 'Conexão com problema' : `${blockedConnections.length} conexões com problemas`}:
              {' '}{blockedConnections.map(c => c.label).join(', ')}
              {' '}— Verifique na página de Conexões.
            </span>
          </div>
        )}

        {/* Messages */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 scrollbar-thin bg-background">
          {/* Load older messages */}
          {hasMore && (
            <div className="flex justify-center pb-2">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
              >
                {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <History className="h-3 w-3" />}
                Carregar mensagens anteriores
              </button>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              onDelete={handleDeleteMessage}
              senderName={(msg as any).sender_agent_id ? agentNames[(msg as any).sender_agent_id] : null}
            />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border bg-card p-2 sm:p-4 relative shrink-0" style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}>
          {/* File preview */}
          {selectedFile && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-secondary/50 p-2">
              {filePreview ? (
                <img src={filePreview} alt="Preview" className="h-16 w-16 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Paperclip className="h-6 w-6" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{selectedFile.name}</p>
                <p className="text-[10px] text-muted-foreground">{(selectedFile.size / 1024).toFixed(0)} KB</p>
              </div>
              <button onClick={clearSelectedFile} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,.pdf,.doc,.docx"
            className="hidden"
            onChange={handleFileSelect}
          />

          <div className="flex items-end gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
              title="Anexar arquivo"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <QuickMessages
              onSelect={handleQuickMessageSelect}
              contactPhone={conversation?.contact_phone}
              onTagChanged={fetchConversation}
            />

            <FlowTrigger conversationId={id!} nicheId={(conversation as any)?.niche_id || null} />
            <div className="flex-1 relative">
              <textarea
                ref={messageInputRef}
                data-chat-input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                placeholder={selectedFile ? "Legenda (opcional)..." : "Digite uma mensagem..."}
                rows={1}
                className="w-full resize-none rounded-xl border border-input bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <button
              onClick={translateToUruguayan}
              disabled={translating || !input.trim()}
              title="Traduzir para espanhol (Uruguay) 🇺🇾"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-40"
            >
              {translating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
            </button>
            <button
              onClick={handleSend}
              disabled={sending || uploading || (!input.trim() && !selectedFile)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {sending || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="hidden lg:flex w-80 flex-col border-l border-border bg-card overflow-y-auto">
        {conversation ? (
          activeSectorTab === 'cobranca' ? (
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              <PinnedFlowShortcuts
                conversationId={id!}
                sector="cobranca"
              />
              <LibertyPedidosPanel contactPhone={conversation.contact_phone} />
            </div>
          ) : (
            <>
            {/* Profile Header */}
            <div className="flex flex-col items-center py-6 px-4 border-b border-border bg-gradient-to-b from-primary/5 to-transparent">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary ring-4 ring-primary/20">
                  {conversation.contact_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <span className={`absolute bottom-0 right-1 h-4 w-4 rounded-full border-2 border-card ${conversation.status === 'active' ? 'bg-green-500' : conversation.status === 'pending' ? 'bg-yellow-500' : 'bg-muted-foreground'}`} />
              </div>
              <p className="text-base font-semibold text-card-foreground mt-3">{conversation.contact_name}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Phone className="h-3 w-3 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">{conversation.contact_phone}</p>
              </div>
              <div className="mt-3">
                <StatusBadge status={conversation.status as 'new' | 'pending' | 'active' | 'resolved'} />
              </div>
            </div>


            <div className="p-4 space-y-5 flex-1">
              {/* Register Sale */}
              <div>
                {saleRegisteredAt ? (
                  <div className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-green-800 text-white py-1.5 px-3 text-xs font-medium">
                    <CheckCheck className="h-3.5 w-3.5" />
                    Venda Registrada
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const adParts = conversation.ad_title?.split(' › ') || [];
                      setSaleData({ valor: '', campanha: adParts[0] || '', pais: 'brasil', moeda: 'BRL' });
                      setShowSaleDialog(true);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground py-1.5 px-3 text-xs font-medium transition-colors"
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    Registrar Venda
                  </button>
                )}
              </div>

              {showSaleDialog && (
                <div className="rounded-lg border border-border bg-background p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-card-foreground">Dados da Venda</p>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Campanha</label>
                    <input
                      type="text"
                      value={saleData.campanha}
                      onChange={(e) => setSaleData(prev => ({ ...prev, campanha: e.target.value }))}
                      placeholder="Nome da Campanha"
                      className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Valor *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={saleData.valor}
                      onChange={(e) => setSaleData(prev => ({ ...prev, valor: e.target.value }))}
                      placeholder="150.00"
                      className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-muted-foreground">País</label>
                      <select
                        value={saleData.pais}
                        onChange={(e) => {
                          const pais = e.target.value;
                          const moeda = pais === 'uruguay' ? 'UYU' : 'BRL';
                          setSaleData(prev => ({ ...prev, pais, moeda }));
                        }}
                        className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="brasil">Brasil</option>
                        <option value="uruguay">Uruguay</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Moeda</label>
                      <input
                        type="text"
                        value={saleData.moeda}
                        readOnly
                        className="w-full mt-1 rounded-lg border border-input bg-muted px-3 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowSaleDialog(false)}
                      className="flex-1 rounded-lg border border-border py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSendSale}
                      disabled={!saleData.valor || sendingSale}
                      className="flex-1 rounded-lg bg-green-600 hover:bg-green-700 text-white py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {sendingSale ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'Enviar'}
                    </button>
                  </div>
                </div>
              )}


              {/* Gerar Termo */}
              <div>
                <button
                  onClick={() => {
                    setTermoData(prev => ({ ...prev, nomeCliente: conversation.contact_name }));
                    setShowTermoDialog(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground py-1.5 px-3 text-xs font-medium transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Gerar Termo de Compromisso
                </button>
              </div>

              {showTermoDialog && (
                <div className="rounded-lg border border-border bg-background p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-card-foreground">Termo de Compromisso</p>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Nome do Cliente *</label>
                    <input
                      type="text"
                      value={termoData.nomeCliente}
                      onChange={(e) => setTermoData(prev => ({ ...prev, nomeCliente: e.target.value }))}
                      placeholder="Nome completo"
                      className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">CPF *</label>
                    <input
                      type="text"
                      value={termoData.cpf}
                      onChange={(e) => setTermoData(prev => ({ ...prev, cpf: e.target.value }))}
                      placeholder="000.000.000-00"
                      className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-muted-foreground">Meses de Tratamento *</label>
                      <input
                        type="text"
                        value={termoData.meses}
                        onChange={(e) => setTermoData(prev => ({ ...prev, meses: e.target.value }))}
                        placeholder="5"
                        className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Valor (R$)</label>
                      <input
                        type="text"
                        value={termoData.valor}
                        onChange={(e) => setTermoData(prev => ({ ...prev, valor: e.target.value }))}
                        placeholder="397,00"
                        className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Forma de Pagamento</label>
                    <select
                      value={termoData.formaPagamento}
                      onChange={(e) => setTermoData(prev => ({ ...prev, formaPagamento: e.target.value }))}
                      className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="boleto à vista">Boleto à vista</option>
                      <option value="cartão de crédito">Cartão de crédito</option>
                      <option value="pix">PIX</option>
                    </select>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Empresa: MEGAFIT (fixo) • Data: hoje</p>

                  {/* Preview do PDF gerado */}
                  {termoPdfUrl && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-primary" />
                        <span className="text-xs font-medium text-card-foreground">Termo gerado!</span>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(termoPdfUrl!);
                            const blob = await res.blob();
                            const blobUrl = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = blobUrl;
                            a.download = `termo_${termoData.nomeCliente.replace(/\s+/g, '_')}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                          } catch {
                            toast.error('Erro ao baixar. Desative o bloqueador de anúncios e tente novamente.');
                          }
                        }}
                        className="block w-full text-center rounded-lg border border-border py-1.5 text-xs text-primary font-medium hover:bg-secondary transition-colors"
                      >
                        📄 Baixar e Visualizar Termo
                      </button>
                      <button
                        onClick={handleSendTermoWhatsApp}
                        disabled={sendingTermoWhatsApp}
                        className="w-full rounded-lg bg-green-600 hover:bg-green-700 text-white py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {sendingTermoWhatsApp ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : '📩 Enviar via WhatsApp'}
                      </button>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowTermoDialog(false); setTermoPdfUrl(null); }}
                      className="flex-1 rounded-lg border border-border py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      Cancelar
                    </button>
                    {!termoPdfUrl && (
                      <button
                        onClick={handleGenerateTermo}
                        disabled={!termoData.nomeCliente || !termoData.cpf || !termoData.meses || sendingTermo}
                        className="flex-1 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {sendingTermo ? <Loader2 className="h-3.5 w-3.5 animate-spin mx-auto" /> : 'Gerar Termo'}
                      </button>
                    )}
                  </div>
                </div>
              )}


              {/* Verificar Motoboy */}
              <div>
                <button
                  onClick={() => { setShowMotoboyDialog(true); setMotoboyCity(''); setMotoboyResult(null); }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground py-1.5 px-3 text-xs font-medium transition-colors"
                >
                  🏍️ Verificar Motoboy
                </button>
              </div>

              {showMotoboyDialog && (
                <div className="rounded-lg border border-border bg-background p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-card-foreground">Verificar Entrega Motoboy</p>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Cidade *</label>
                    <input
                      type="text"
                      value={motoboyCity}
                      onChange={(e) => { setMotoboyCity(e.target.value); setMotoboyResult(null); }}
                      placeholder="Digite o nome da cidade"
                      className="w-full mt-1 rounded-lg border border-input bg-background px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  {motoboyResult && (
                    <div className={`rounded-lg p-2.5 text-center text-xs font-bold ${
                      motoboyResult === 'ENTREGA MOTOBOY'
                        ? 'bg-green-600/15 text-green-400 border border-green-600/30'
                        : 'bg-blue-600/15 text-blue-400 border border-blue-600/30'
                    }`}>
                      {motoboyResult}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowMotoboyDialog(false)}
                      className="flex-1 rounded-lg border border-border py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      Fechar
                    </button>
                    <button
                      onClick={() => {
                        if (!motoboyCity.trim()) return;
                        const MOTOBOY_CITIES = ["Abadia de Goiás","Aparecida de Goiânia","Arniqueira","Brasília","Ceilândia","Gama","Goianápolis","Guapó","Hidrolândia","Luziânia","Novo Gama","Samambaia","Senador Canedo","Taguatinga","Trindade","Vicente Pires","Anápolis","Aragoiânia","Bonfinópolis","Caturaí","Cidade Ocidental","Goianira","Goiânia","Guará","Inhumas","Nerópolis","Recanto das Emas","Santa Maria","Sol Nascente/Pôr do Sol","Terezópolis de Goiás","Valparaíso de Goiás","Águas Lindas de Goiás","Belo Horizonte","Carmo do Cajuru","Contagem","Ibirité","Igaratinga","Nova Contagem","Pará de Minas","Sabará","Betim","Citrolândia","Divinópolis","Icaivera","Itaúna","Nova Serrana","Ribeirão das Neves","Santa Luzia","Ananindeua","Marituba","Ribeirão Preto","Campo Grande","Belém","Almirante Tamandaré","Campina Grande do Sul","Colombo","Fazenda Rio Grande","Pinhais","Quatro Barras","São José dos Pinhais","Araucária","Campo Largo","Conde","Manaus","Curitiba","Itaperuçu","Piraquara","Rio Branco do Sul","Caucaia","Fortaleza","Itaitinga","Maranguape","Pacatuba","Eusébio","Horizonte","Ceará-Mirim","Macaíba","Natal","São Gonçalo do Amarante","Extremoz","Mossoró","Parnamirim","São José de Mipibu","Balneário Camboriú","Barra Velha","Camboriú","Itapema","Joinville","Penha","Balneário Piçarras","Blumenau","Itajaí","Jaraguá do Sul","Navegantes","Maracanaú","Pacajus","Alvorada","Bom Princípio","Campo Bom","Carlos Barbosa","Eldorado do Sul","Estância Velha","Garibaldi","Guaíba","Porto Alegre","Sapiranga","São Leopoldo","São Vendelino","Bento Gonçalves","Cachoeirinha","Canoas","Caxias do Sul","Esteio","Farroupilha","Gravataí","Novo Hamburgo","Portão","Sapucaia do Sul","São Sebastião do Caí","Viamão","Abreu e Lima","Cabedelo","Camaragibe","Jaboatão dos Guararapes","Olinda","Recife","São Lourenço da Mata","Bayeux","Cabo de Santo Agostinho","Igarassu","João Pessoa","Paulista","Santa Rita","Belford Roxo","Mesquita","Niterói","Queimados","São João de Meriti","Lauro de Freitas","Salvador","Duque de Caxias","Nilópolis","Nova Iguaçu","Rio de Janeiro","Americana","Barueri","Cajamar","Campo Limpo Paulista","Caçapava","Cubatão","Embu das Artes","Francisco Morato","Guarulhos","Itapevi","Jacareí","Jundiaí","Mogi das Cruzes","Nova Odessa","Paulínia","Praia Grande","Rio Grande da Serra","Santo André","Sumaré","São Bernardo do Campo","São José dos Campos","São Vicente","Taubaté","Vinhedo","Arujá","Caieiras","Campinas","Carapicuíba","Cotia","Diadema","Ferraz de Vasconcelos","Franco da Rocha","Hortolândia","Itaquaquecetuba","Jandira","Mauá","Monte Mor","Osasco","Poá","Ribeirão Pires","Teresina","Timon","Cariacica","Vila Velha","Guarapari","Viana","Vitória","Serra","Santa Bárbara d'Oeste","Santos","Suzano","São Caetano do Sul","São Paulo","Taboão da Serra","Valinhos"];
                        const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim();
                        const inputNorm = normalize(motoboyCity);
                        const found = MOTOBOY_CITIES.some(c => normalize(c) === inputNorm);
                        setMotoboyResult(found ? 'ENTREGA MOTOBOY' : 'ENTREGA CORREIOS');
                      }}
                      disabled={!motoboyCity.trim()}
                      className="flex-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      Verificar
                    </button>
                  </div>
                </div>
              )}


              <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
                <button
                  onClick={() => setContactDetailsOpen(!contactDetailsOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/30 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <User className="h-3 w-3" /> Detalhes do Contato
                  </span>
                  {contactDetailsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {contactDetailsOpen && (
                  <div className="space-y-2.5 p-3 pt-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Telefone</span>
                      <span className="text-xs font-medium text-card-foreground">{conversation.contact_phone}</span>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Primeira conversa</span>
                      <span className="text-xs font-medium text-card-foreground">{format(new Date(conversation.created_at), 'dd/MM/yyyy')}</span>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Última atividade</span>
                      <span className="text-xs font-medium text-card-foreground">{format(new Date(conversation.updated_at), 'dd/MM HH:mm')}</span>
                    </div>
                    {(conversation.ctwa_clid || conversation.source_id || conversation.ad_title) && (
                      <>
                        <div className="h-px bg-border" />
                        {conversation.ad_title && (
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Anúncio</span>
                            <span className="text-xs font-medium text-primary max-w-[140px] truncate" title={conversation.ad_title}>{conversation.ad_title}</span>
                          </div>
                        )}
                        {conversation.ctwa_clid && (
                          <>
                            {conversation.ad_title && <div className="h-px bg-border" />}
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">CTWA Click ID</span>
                              <span className="text-[10px] font-mono text-card-foreground max-w-[120px] truncate" title={conversation.ctwa_clid}>{conversation.ctwa_clid}</span>
                            </div>
                          </>
                        )}
                        {conversation.source_id && (
                          <>
                            <div className="h-px bg-border" />
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Source ID</span>
                              <span className="text-[10px] font-mono text-card-foreground max-w-[120px] truncate" title={conversation.source_id}>{conversation.source_id}</span>
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Pinned Flow Shortcuts */}
              <PinnedFlowShortcuts
                conversationId={id!}
                sector={activeSectorTab}
              />

              {/* LibertyPOS pedidos - apenas na aba Cobrança */}
              {activeSectorTab === 'cobranca' && (
                <LibertyPedidosPanel contactPhone={conversation.contact_phone} />
              )}






              {/* Pinned Quick Message Shortcuts */}
              <PinnedQuickMessageShortcuts
                conversationId={id!}
                contactPhone={conversation.contact_phone}
                onTagChanged={fetchConversation}
              />

              {/* Tags */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Tag className="h-3 w-3" /> Etiquetas
                  </p>
                  <TagManager
                    contactPhone={conversation.contact_phone}
                    contactTags={contactTags}
                    onTagsChanged={fetchConversation}
                  />
                </div>
                <div className="rounded-lg border border-border bg-background/50 p-3">
                  {contactTags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {contactTags.map(ct => (
                        <span
                          key={ct.id}
                          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-white"
                          style={{ backgroundColor: ct.tag.color }}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                          {ct.tag.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-1">Sem etiquetas</p>
                  )}
                </div>
                {rmkTag && (
                  <button
                    onClick={toggleRmkTag}
                    disabled={rmkLoading}
                    className={`mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-3 text-xs font-medium transition-colors ${
                      contactTags.some(ct => ct.tag.id === rmkTag.id)
                        ? 'bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30'
                        : 'bg-secondary/50 text-muted-foreground border border-border hover:bg-secondary'
                    }`}
                  >
                    {rmkLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : contactTags.some(ct => ct.tag.id === rmkTag.id) ? (
                      <Eye className="h-3 w-3" />
                    ) : (
                      <EyeOff className="h-3 w-3" />
                    )}
                    RMK
                  </button>
                )}
              </div>

            </div>
          </>
        )
      ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}
