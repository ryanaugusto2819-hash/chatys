import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import TopBar from '@/components/layout/TopBar';
import StatusBadge from '@/components/shared/StatusBadge';
import { supabase } from '@/integrations/supabase/client';
import { Search, Loader2, X, Smartphone, Globe, MessageCircle, SlidersHorizontal, UserPlus, FileText } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useInboxQuery, type InboxFilters, type InboxConversation, type ContactTagInfo } from '@/hooks/useInboxQuery';
import { SECTORS, type SectorValue } from '@/lib/sectors';

const CONVERSATIONS_FILTERS_STORAGE_KEY = 'conversations-filters';
const CONVERSATIONS_TAB_STORAGE_KEY = 'conversations-active-tab';

type SectorTab = 'all' | SectorValue;

interface PersistedConversationFilters {
  search: string;
  activeFilter: string;
  selectedTags: string[];
  selectedAgent: string;
  selectedConnections: string[];
  onlyUnread: boolean;
}

const defaultConversationFilters: PersistedConversationFilters = {
  search: '',
  activeFilter: 'all',
  selectedTags: [],
  selectedAgent: 'all',
  selectedConnections: [],
  onlyUnread: false,
};

const getStoredConversationFilters = (): PersistedConversationFilters => {
  if (typeof window === 'undefined') return defaultConversationFilters;
  const stored = window.localStorage.getItem(CONVERSATIONS_FILTERS_STORAGE_KEY)
    ?? window.sessionStorage.getItem(CONVERSATIONS_FILTERS_STORAGE_KEY);
  if (!stored) return defaultConversationFilters;
  try {
    const parsed = JSON.parse(stored);
    // Back-compat: previously stored `selectedTag` as string
    let selectedTags: string[] = defaultConversationFilters.selectedTags;
    if (Array.isArray(parsed.selectedTags)) {
      selectedTags = parsed.selectedTags.filter((v: unknown): v is string => typeof v === 'string');
    } else if (typeof parsed.selectedTag === 'string' && parsed.selectedTag !== 'all') {
      selectedTags = [parsed.selectedTag];
    }
    return {
      search: typeof parsed.search === 'string' ? parsed.search : defaultConversationFilters.search,
      activeFilter: typeof parsed.activeFilter === 'string' ? parsed.activeFilter : defaultConversationFilters.activeFilter,
      selectedTags,
      selectedAgent: typeof parsed.selectedAgent === 'string' ? parsed.selectedAgent : defaultConversationFilters.selectedAgent,
      selectedConnections: Array.isArray(parsed.selectedConnections)
        ? parsed.selectedConnections.filter((v: unknown): v is string => typeof v === 'string')
        : defaultConversationFilters.selectedConnections,
      onlyUnread: typeof parsed.onlyUnread === 'boolean' ? parsed.onlyUnread : defaultConversationFilters.onlyUnread,
    };
  } catch {
    return defaultConversationFilters;
  }
};


interface ConnectionInfo {
  id: string;
  label: string;
  connection_id: string;
}

const statusFilters = ['all', 'last_customer'] as const;
const statusLabels: Record<string, string> = { all: 'Todos', last_customer: 'Última Msg Cliente' };

// ─── Memoized conversation item ───
interface ConversationItemProps {
  conversation: InboxConversation;
  isSelected: boolean;
  connectionInfo: ConnectionInfo | null;
  onClick: (id: string) => void;
}

const ConversationItem = memo(function ConversationItem({ conversation: c, isSelected, connectionInfo, hiddenTagIds, onClick }: ConversationItemProps & { hiddenTagIds: Set<string> }) {
  const cTags = (c.contact_tags || []).filter(t => !hiddenTagIds.has(t.tag_id));

  return (
    <button
      onClick={() => onClick(c.id)}
      className={`flex items-center gap-4 w-full px-5 py-4 text-left hover:bg-secondary/40 transition-colors ${
        isSelected ? 'bg-primary/5 border-l-2 border-primary' : ''
      }`}
    >
      <div className="relative shrink-0">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
          {c.contact_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className={`text-sm font-semibold truncate ${c.unread_count > 0 ? 'text-card-foreground' : 'text-card-foreground/80'}`}>{c.contact_name}</p>
            <ConnectionBadge conn={connectionInfo} />
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
            {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>
        <p className={`text-xs truncate ${c.unread_count > 0 ? 'text-card-foreground font-medium' : 'text-muted-foreground'}`}>{c.last_message}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <StatusBadge status={c.status as 'new' | 'pending' | 'active' | 'resolved'} />
          {cTags.map(t => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
              style={{ backgroundColor: t.color }}
            >
              {t.name}
            </span>
          ))}
          {c.unread_count > 0 && (
            <span className="ml-auto h-2.5 w-2.5 rounded-full bg-primary shrink-0" />
          )}
        </div>
      </div>
    </button>
  );
});

function ConnectionBadge({ conn }: { conn: ConnectionInfo | null }) {
  if (!conn) return null;
  const isMeta = conn.connection_id === 'whatsapp';
  const isEvolution = conn.connection_id === 'evolution';
  const Icon = isMeta ? Globe : Smartphone;
  const providerLabel = isMeta ? 'Meta Cloud API' : isEvolution ? 'Evolution' : 'Z-API';
  const colorClass = isMeta
    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
    : isEvolution
    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${colorClass}`}>
            <Icon className="h-3 w-3" />
            <span className="max-w-[100px] truncate">{conn.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {conn.label} ({providerLabel})
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>

  );
}

// ─── Main component ───
interface ConversationsProps {
  embedded?: boolean;
  selectedId?: string;
  onSelectConversation?: (id: string) => void;
}

export default function Conversations({ embedded, selectedId, onSelectConversation }: ConversationsProps = {}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const storedFilters = getStoredConversationFilters();
  const [searchInput, setSearchInput] = useState(storedFilters.search);
  const [debouncedSearch, setDebouncedSearch] = useState(storedFilters.search);
  const [searchByMessage, setSearchByMessage] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>(storedFilters.activeFilter);
  const [selectedTags, setSelectedTags] = useState<string[]>(storedFilters.selectedTags);
  const [selectedAgent, setSelectedAgent] = useState<string>(storedFilters.selectedAgent);
  const [selectedConnections, setSelectedConnections] = useState<string[]>(storedFilters.selectedConnections);
  const [onlyUnread, setOnlyUnread] = useState(storedFilters.onlyUnread);
  const [activeTab, setActiveTab] = useState<SectorTab>(() => {
    const stored = localStorage.getItem(CONVERSATIONS_TAB_STORAGE_KEY);
    return (stored === 'comercial' || stored === 'pos_venda' || stored === 'cobranca') ? stored : 'all';
  });
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Persist active tab
  useEffect(() => {
    localStorage.setItem(CONVERSATIONS_TAB_STORAGE_KEY, activeTab);
    window.dispatchEvent(new CustomEvent('conversations-tab-change', { detail: activeTab }));
  }, [activeTab]);


  // Filter dropdown options (moved up so allConnections is available for tab filtering)
  const { data: tags = [] } = useQuery({
    queryKey: ['filter-tags'],
    queryFn: async () => {
      const { data } = await supabase.from('tags').select('id, name, color, is_hidden');
      return (data || []) as Array<{ id: string; name: string; color: string; is_hidden: boolean }>;
    },
    staleTime: 300_000,
  });

  const hiddenTagIds = useMemo(() => new Set(tags.filter(t => t.is_hidden).map(t => t.id)), [tags]);

  const { data: agents = [] } = useQuery({
    queryKey: ['filter-agents'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name');
      return data || [];
    },
    staleTime: 300_000,
  });

  const { data: allConnections = [] } = useQuery({
    queryKey: ['filter-connections'],
    queryFn: async () => {
      const { data } = await supabase.from('connection_configs').select('id, label, connection_id, config').eq('is_connected', true);
      return (data || []).map((c: any) => ({
        id: c.id,
        label: c.label || c.config?.instance_name || c.config?.phone_number || 'Sem nome',
        connection_id: c.connection_id,
      })) as ConnectionInfo[];
    },
    staleTime: 300_000,
  });


  // Compute filters for the query — sector comes from the tab; connection filter is manual only
  const inboxFilters = useMemo<InboxFilters>(() => ({
    search: searchByMessage ? '' : debouncedSearch,
    status: !['all', 'last_customer'].includes(activeFilter) ? activeFilter : '',
    agentId: selectedAgent !== 'all' ? selectedAgent : null,
    connectionIds: selectedConnections,
    tagId: selectedTags.length === 1 ? selectedTags[0] : null,
    onlyUnread,
    lastCustomer: activeFilter === 'last_customer',
    sector: activeTab !== 'all' ? activeTab : '',
  }), [debouncedSearch, activeFilter, selectedAgent, selectedConnections, selectedTags, onlyUnread, searchByMessage, activeTab]);


  const { conversations, totalCount, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInboxQuery(inboxFilters);


  const { currentWorkspace } = useWorkspace();

  // Message content search
  interface MessageSearchResult {
    conversation_id: string;
    content: string;
    created_at: string;
    contact_name: string;
    contact_phone: string;
  }

  const { data: messageSearchResults = [], isLoading: isSearchingMessages } = useQuery<MessageSearchResult[]>({
    queryKey: ['message-search', debouncedSearch, currentWorkspace?.id],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 3) return [];
      
      let query = supabase
        .from('messages')
        .select('conversation_id, content, created_at, conversations!inner(contact_name, contact_phone, workspace_id)')
        .ilike('content', `%${debouncedSearch}%`)
        .order('created_at', { ascending: false })
        .limit(50);

      const { data, error } = await query;
      if (error) throw error;

      // Dedupe by conversation_id, keep first (most recent) match
      const seen = new Set<string>();
      const results: MessageSearchResult[] = [];
      for (const row of (data || []) as any[]) {
        const conv = row.conversations;
        if (currentWorkspace?.id && conv.workspace_id !== currentWorkspace.id) continue;
        if (seen.has(row.conversation_id)) continue;
        seen.add(row.conversation_id);
        results.push({
          conversation_id: row.conversation_id,
          content: row.content,
          created_at: row.created_at,
          contact_name: conv.contact_name,
          contact_phone: conv.contact_phone,
        });
      }
      return results;
    },
    enabled: searchByMessage && !!debouncedSearch && debouncedSearch.length >= 3,
    staleTime: 30_000,
  });

  const connectionMap = useMemo(() => {
    const map: Record<string, ConnectionInfo> = {};
    allConnections.forEach(c => { map[c.id] = c; });
    return map;
  }, [allConnections]);

  // Persist filters
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const serialized = JSON.stringify({
      search: searchInput,
      activeFilter,
      selectedTags,
      selectedAgent,
      selectedConnections,
      onlyUnread,
    } satisfies PersistedConversationFilters);
    window.localStorage.setItem(CONVERSATIONS_FILTERS_STORAGE_KEY, serialized);
    window.sessionStorage.setItem(CONVERSATIONS_FILTERS_STORAGE_KEY, serialized);
  }, [searchInput, activeFilter, selectedTags, selectedAgent, selectedConnections, onlyUnread]);


  // Infinite scroll observer
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const activeFiltersCount = (selectedTags.length > 0 ? 1 : 0) + (selectedAgent !== 'all' ? 1 : 0) + (selectedConnections.length > 0 ? 1 : 0) + (!['all', 'last_customer'].includes(activeFilter) ? 1 : 0);

  const clearFilters = () => {
    setSelectedTags([]);

    setSelectedAgent('all');
    setSelectedConnections([]);
    if (!['all', 'last_customer'].includes(activeFilter)) setActiveFilter('all');
  };

  const handleConversationClick = useCallback((conversationId: string) => {
    if (onSelectConversation) {
      onSelectConversation(conversationId);
    } else {
      navigate(`/conversations/${conversationId}`);
    }
  }, [onSelectConversation, navigate]);

  // ─── Create contact dialog (Cobrança tab) ───
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [creatingContact, setCreatingContact] = useState(false);

  const handleCreateContact = async () => {
    const phone = newContactPhone.replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      toast.error('Informe um número de telefone válido');
      return;
    }
    if (!newContactName.trim()) {
      toast.error('Informe o nome do contato');
      return;
    }

    setCreatingContact(true);
    try {
      // Find zapi connection to link
      const zapiConnection = allConnections.find(c => c.connection_id === 'zapi');

      // Check if conversation already exists for this phone
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        toast.info('Conversa já existe para este número');
        setShowCreateContact(false);
        setNewContactName('');
        setNewContactPhone('');
        handleConversationClick(existing.id);
        return;
      }

      const { data: newConv, error } = await supabase
        .from('conversations')
        .insert({
          contact_name: newContactName.trim(),
          contact_phone: phone,
          status: 'new',
          tags: [],
          connection_config_id: zapiConnection?.id || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      toast.success('Contato criado com sucesso');
      setShowCreateContact(false);
      setNewContactName('');
      setNewContactPhone('');
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
      if (newConv) {
        handleConversationClick(newConv.id);
      }
    } catch (err) {
      console.error('Error creating contact:', err);
      toast.error('Erro ao criar contato');
    } finally {
      setCreatingContact(false);
    }
  };

  const SECTOR_TABS: SectorTab[] = ['all', 'comercial', 'pos_venda', 'cobranca'];
  const tabLabels: Record<SectorTab, string> = {
    all: 'Todos',
    comercial: 'Comercial',
    pos_venda: 'Pós-Venda',
    cobranca: 'Cobrança',
  };
  const showTabs = true;

  return (
    <div className={embedded ? 'flex flex-col h-full overflow-hidden' : ''}>
      {!embedded && <TopBar title="Conversas" subtitle={`${totalCount} conversas totais`} />}
      {embedded && (
        <div className="px-4 pt-4 pb-0 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Conversas</h2>
              <p className="text-[11px] text-muted-foreground">{totalCount} conversas</p>
            </div>
            {activeTab === 'cobranca' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => setShowCreateContact(true)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Criar Contato
              </Button>
            )}
          </div>
          {showTabs && (
            <div className="flex gap-0 overflow-x-auto">
              {SECTOR_TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative shrink-0 px-4 py-2 text-xs font-medium transition-colors ${
                    activeTab === tab
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tabLabels[tab]}
                  {activeTab === tab && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {!embedded && showTabs && (
        <div className="px-6 pt-2">
          <div className="flex items-center gap-0 border-b border-border overflow-x-auto">
            {SECTOR_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative shrink-0 px-4 py-2 text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tabLabels[tab]}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
                )}
              </button>
            ))}
            {activeTab === 'cobranca' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5 ml-auto mb-1"
                onClick={() => setShowCreateContact(true)}
              >
                <UserPlus className="h-3.5 w-3.5" />
                Criar Contato
              </Button>
            )}
          </div>
        </div>
      )}
      <div className={`${embedded ? 'p-3 flex-1 overflow-hidden flex flex-col' : 'p-6'} space-y-4`}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={searchByMessage ? "Buscar por conteúdo da mensagem..." : "Buscar por nome ou número..."}
                className="w-full rounded-lg border border-input bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setSearchByMessage(!searchByMessage)}
                    className={`shrink-0 flex items-center justify-center h-[42px] w-[42px] rounded-lg border transition-colors ${
                      searchByMessage
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card text-muted-foreground border-input hover:text-foreground hover:bg-secondary/60'
                    }`}
                  >
                    <FileText className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {searchByMessage ? 'Voltar para busca por contato' : 'Buscar por conteúdo da mensagem'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {statusFilters.map((f) => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  activeFilter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                {statusLabels[f]}
              </button>
            ))}
            <button
              onClick={() => setOnlyUnread(!onlyUnread)}
              className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                onlyUnread
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              <MessageCircle className="h-3 w-3" />
              Não lidas
            </button>

            <div className="h-5 w-px bg-border mx-1 shrink-0" />

            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    activeFiltersCount > 0
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filtros
                  {activeFiltersCount > 0 && (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-foreground/20 text-[10px] font-bold">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Filtros avançados</p>
                  {activeFiltersCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="flex items-center gap-1 text-xs font-medium text-destructive hover:text-destructive/80 transition-colors"
                    >
                      <X className="h-3 w-3" /> Limpar
                    </button>
                  )}
                </div>

                {/* Status */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Status</label>
                  <select
                    value={activeFilter === 'all' || activeFilter === 'last_customer' ? 'all' : activeFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val !== 'all') setActiveFilter(val);
                    }}
                    className="w-full rounded-lg border border-input bg-background px-2.5 py-2 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="all">Todos os status</option>
                    <option value="new">Novos</option>
                    <option value="pending">Pendentes</option>
                    <option value="active">Em atendimento</option>
                  </select>
                </div>

                {/* Tags (multi-select) */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">
                      Etiquetas {selectedTags.length > 0 && (
                        <span className="text-primary font-semibold">({selectedTags.length})</span>
                      )}
                    </label>
                    {selectedTags.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedTags([])}
                        className="text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto rounded-lg border border-input bg-background p-1">
                    {tags.filter(t => !t.is_hidden).length > 0 ? tags.filter(t => !t.is_hidden).map((t) => {
                      const isChecked = selectedTags.includes(t.id);
                      return (
                        <label key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/60 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              setSelectedTags((prev) => {
                                if (e.target.checked) return [...prev, t.id];
                                return prev.filter((id) => id !== t.id);
                              });
                            }}
                            className="rounded border-input text-primary focus:ring-ring h-3.5 w-3.5"
                          />
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ background: t.color }}
                          />
                          <span className="text-xs text-foreground truncate">{t.name}</span>
                        </label>
                      );
                    }) : (
                      <p className="text-xs text-muted-foreground px-2 py-1">Nenhuma etiqueta</p>
                    )}
                  </div>
                </div>



                {/* Agent */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Agente</label>
                  <select
                    value={selectedAgent}
                    onChange={(e) => setSelectedAgent(e.target.value)}
                    className={`w-full rounded-lg border px-2.5 py-2 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring ${
                      selectedAgent !== 'all'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-input bg-background text-foreground'
                    }`}
                  >
                    <option value="all">Todos os agentes</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.full_name}</option>
                    ))}
                  </select>
                </div>

                {/* Connection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Conexão</label>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {allConnections.length > 0 ? allConnections.map((c) => {
                      const isChecked = selectedConnections.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-secondary/60 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              setSelectedConnections((prev) => {
                                if (e.target.checked) return [...prev, c.id];
                                return prev.filter((id) => id !== c.id);
                              });
                            }}
                            className="rounded border-input text-primary focus:ring-ring h-3.5 w-3.5"
                          />
                          <span className="text-xs text-foreground">{c.label} ({c.connection_id === 'whatsapp' ? 'Meta' : c.connection_id === 'evolution' ? 'Evolution' : 'Z-API'})</span>
                        </label>
                      );
                    }) : (
                      <p className="text-xs text-muted-foreground px-2 py-1">Nenhuma conexão ativa</p>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className={`rounded-xl border border-border bg-card shadow-elevated overflow-hidden ${embedded ? 'flex-1 overflow-y-auto' : ''}`}>
          {searchByMessage && debouncedSearch.length >= 3 ? (
            // Message content search results
            isSearchingMessages ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="divide-y divide-border">
                {messageSearchResults.map((r) => (
                  <button
                    key={`${r.conversation_id}-${r.created_at}`}
                    onClick={() => handleConversationClick(r.conversation_id)}
                    className={`flex flex-col gap-1 w-full px-5 py-4 text-left hover:bg-secondary/40 transition-colors ${
                      selectedId === r.conversation_id ? 'bg-primary/5 border-l-2 border-primary' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-card-foreground truncate">{r.contact_name}</p>
                      <span className="text-[11px] text-muted-foreground shrink-0 ml-2">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.contact_phone}</p>
                    <p className="text-xs text-foreground/80 line-clamp-2 mt-0.5 bg-muted/50 rounded px-2 py-1">
                      <FileText className="inline h-3 w-3 mr-1 text-muted-foreground" />
                      {r.content}
                    </p>
                  </button>
                ))}
                {messageSearchResults.length === 0 && (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                    {debouncedSearch.length < 3 ? 'Digite pelo menos 3 caracteres' : 'Nenhuma mensagem encontrada'}
                  </div>
                )}
              </div>
            )
          ) : searchByMessage ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Digite pelo menos 3 caracteres para buscar
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {conversations.map((c) => (
                <ConversationItem
                  key={c.id}
                  conversation={c}
                  isSelected={selectedId === c.id}
                  connectionInfo={c.connection_config_id ? connectionMap[c.connection_config_id] || null : null}
                  hiddenTagIds={hiddenTagIds}
                  onClick={handleConversationClick}
                />
              ))}
              {hasNextPage && (
                <div ref={sentinelRef} className="flex items-center justify-center py-4">
                  {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              )}
              {conversations.length === 0 && (
                <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                  Nenhuma conversa encontrada
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Contact Dialog */}
      <Dialog open={showCreateContact} onOpenChange={setShowCreateContact}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Criar Contato (Cobrança)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="contact-name">Nome</Label>
              <Input
                id="contact-name"
                placeholder="Nome do contato"
                value={newContactName}
                onChange={(e) => setNewContactName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">Telefone (com DDD)</Label>
              <Input
                id="contact-phone"
                placeholder="5511999999999"
                value={newContactPhone}
                onChange={(e) => setNewContactPhone(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateContact(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateContact} disabled={creatingContact}>
              {creatingContact ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
