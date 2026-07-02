import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { Zap, Loader2, Pin, Mic, Type, Tag as TagIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface PinnedQM {
  id: string;
  title: string;
  content: string;
  type: string;
  audio_url: string | null;
  category: string | null;
  tag_id: string | null;
  add_tag_id: string | null;
  remove_tag_id: string | null;
}

interface Props {
  conversationId: string;
  contactPhone: string;
  onTagChanged?: () => void;
}

const UNCATEGORIZED = 'Sem categoria';

export default function PinnedQuickMessageShortcuts({ conversationId, contactPhone, onTagChanged }: Props) {
  const { currentWorkspace } = useWorkspace();
  const [items, setItems] = useState<PinnedQM[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    let query: any = supabase
      .from('quick_messages')
      .select('id, title, content, type, audio_url, category, tag_id, add_tag_id, remove_tag_id')
      .eq('is_pinned_sidebar', true)
      .order('sort_order');
    // Quick messages are shared across workspaces (QuickMessages.tsx doesn't filter by workspace)
    const { data } = await query;
    setItems((data as any) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
    const channel = supabase
      .channel('pinned-qm-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_messages' }, () => fetchItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id]);

  const grouped = useMemo(() => {
    const map: Record<string, PinnedQM[]> = {};
    items.forEach((it) => {
      const key = (it.category && it.category.trim()) || UNCATEGORIZED;
      if (!map[key]) map[key] = [];
      map[key].push(it);
    });
    return Object.entries(map)
      .sort(([a], [b]) => {
        if (a === UNCATEGORIZED) return 1;
        if (b === UNCATEGORIZED) return -1;
        return a.localeCompare(b);
      })
      .map(([label, list]) => ({ label, items: list }));
  }, [items]);

  useEffect(() => {
    if (grouped.length === 0) { setActiveCategory(null); return; }
    if (!activeCategory || !grouped.some(g => g.label === activeCategory)) {
      setActiveCategory(grouped[0].label);
    }
  }, [grouped, activeCategory]);

  const kindOf = (m: PinnedQM): 'text' | 'audio' | 'tag_action' => {
    if (m.type === 'audio') return 'audio';
    if (m.type === 'add_tag' || m.type === 'remove_tag' || m.type === 'tag_action' || m.add_tag_id || m.remove_tag_id) return 'tag_action';
    return 'text';
  };

  const applyTags = async (m: PinnedQM) => {
    const addId = m.add_tag_id || (m.type === 'add_tag' ? m.tag_id : null) || null;
    const removeId = m.remove_tag_id || (m.type === 'remove_tag' ? m.tag_id : null) || null;
    if (removeId) {
      await supabase.from('contact_tags').delete().eq('contact_phone', contactPhone).eq('tag_id', removeId);
    }
    if (addId) {
      const { data: existing } = await supabase
        .from('contact_tags')
        .select('id')
        .eq('contact_phone', contactPhone)
        .eq('tag_id', addId)
        .maybeSingle();
      if (!existing) {
        await supabase.from('contact_tags').insert({ contact_phone: contactPhone, tag_id: addId });
      }
    }
  };

  const run = async (m: PinnedQM) => {
    if (running) return;
    setRunning(m.id);
    try {
      const kind = kindOf(m);

      if (kind === 'audio') {
        if (!m.audio_url && !m.content) {
          toast.error('Áudio não disponível');
          return;
        }
        await sendWhatsAppMessage(conversationId, '', {
          mediaUrl: m.audio_url || m.content,
          messageType: 'audio',
        });
        toast.success(`▶ ${m.title}`);
      } else if (kind === 'tag_action') {
        await applyTags(m);
        if (m.content && m.content.trim()) {
          await sendWhatsAppMessage(conversationId, m.content.trim());
        }
        onTagChanged?.();
        toast.success(`▶ ${m.title}`);
      } else {
        if (!m.content.trim()) {
          toast.error('Mensagem vazia');
          return;
        }
        await sendWhatsAppMessage(conversationId, m.content.trim());
        toast.success(`▶ ${m.title}`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao enviar: ' + (err?.message || 'desconhecido'));
    } finally {
      setRunning(null);
    }
  };

  const iconFor = (m: PinnedQM) => {
    const k = kindOf(m);
    if (k === 'audio') return <Mic className="h-3 w-3" />;
    if (k === 'tag_action') return <TagIcon className="h-3 w-3" />;
    return <Type className="h-3 w-3" />;
  };

  const active = grouped.find(g => g.label === activeCategory)?.items || [];

  return (
    <div>
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Zap className="h-3 w-3" /> Atalhos de Mensagens Rápidas
      </p>

      {loading ? (
        <div className="rounded-lg border border-border bg-background/50 p-4 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-background/30 p-4 text-center">
          <Pin className="h-4 w-4 text-muted-foreground/40 mx-auto mb-1.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Nenhuma mensagem fixada. Abra <span className="font-medium text-foreground">Mensagens Rápidas</span> (raio ⚡ no chat), defina uma categoria e clique no
            <Pin className="inline h-2.5 w-2.5 mx-1" />.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-background/50 p-2 space-y-2">
          {grouped.length > 1 && (
            <div className="flex flex-wrap gap-1 px-1 pt-1">
              {grouped.map(g => (
                <button
                  key={g.label}
                  onClick={() => setActiveCategory(g.label)}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    activeCategory === g.label
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {g.label}
                  <span className="ml-1 opacity-60">{g.items.length}</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 gap-1.5 p-1">
            {active.map((m) => {
              const busy = running === m.id;
              return (
                <motion.button
                  key={m.id}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => run(m)}
                  disabled={!!running}
                  className="group flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                  title="Clique para enviar imediatamente"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : iconFor(m)}
                  </div>
                  <span className="text-[11px] font-medium text-card-foreground truncate flex-1">{m.title}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
