import TopBar from '@/components/layout/TopBar';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, AlertTriangle, CheckCircle2, Info, Lightbulb,
  TrendingUp, ArrowRight, Clock, RefreshCw, Filter, X,
  BookOpen, Save, Brain, FileText, MessageSquare, Upload, Loader2,
  ChevronDown, ChevronUp, Repeat, MessageCircle, Send, User, GitBranch, Bell,
} from 'lucide-react';
import { toast } from 'sonner';
import KnowledgeBase from '@/components/ai/KnowledgeBase';

interface Issue {
  type: 'error' | 'warning' | 'info' | 'justified';
  title: string;
  description: string;
  excerpt?: string;
  justification?: string;
}

interface Suggestion {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
}

interface FlowAnalyzed {
  flow_name: string;
  was_appropriate: boolean;
  reason: string;
}

interface Analysis {
  id: string;
  conversation_id: string;
  overall_score: number;
  flow_accuracy_score: number;
  response_quality_score: number;
  context_adherence_score: number;
  summary: string;
  issues: Issue[];
  suggestions: Suggestion[];
  flows_analyzed: FlowAnalyzed[];
  created_at: string;
  conversations?: { contact_name: string; contact_phone: string; status: string };
}

interface EvalCriteria {
  name: string;
  weight: number;
  description: string;
}

function ScoreCircle({ score, label, size = 'md' }: { score: number; label: string; size?: 'sm' | 'md' | 'lg' }) {
  const color = score >= 80 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-destructive';
  const bgColor = score >= 80 ? 'bg-success/10' : score >= 50 ? 'bg-warning/10' : 'bg-destructive/10';
  const sizeClasses = size === 'lg' ? 'h-24 w-24 text-3xl' : size === 'md' ? 'h-16 w-16 text-xl' : 'h-12 w-12 text-sm';

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`${sizeClasses} ${bgColor} ${color} rounded-full flex items-center justify-center font-bold`}>
        {score}
      </div>
      <span className="text-xs text-muted-foreground text-center">{label}</span>
    </div>
  );
}

function IssueIcon({ type }: { type: string }) {
  if (type === 'error') return <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />;
  if (type === 'warning') return <AlertTriangle className="h-4 w-4 text-warning shrink-0" />;
  return <Info className="h-4 w-4 text-info shrink-0" />;
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles = {
    high: 'bg-destructive/10 text-destructive',
    medium: 'bg-warning/10 text-warning',
    low: 'bg-info/10 text-info',
  };
  const labels = { high: 'Alta', medium: 'Média', low: 'Baixa' };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${styles[priority as keyof typeof styles] || ''}`}>
      {labels[priority as keyof typeof labels] || priority}
    </span>
  );
}

type TabView = 'analyses' | 'training';
type ManagerMode = 'human' | 'follow_up' | 'flow_selector';

const MANAGER_MODES: Array<{
  id: ManagerMode;
  label: string;
  icon: typeof User;
  color: string;
  description: string;
  configId: string;
}> = [
  {
    id: 'human',
    label: 'Humano',
    icon: User,
    color: 'text-blue-500',
    description: 'Avalia o desempenho dos vendedores humanos: profissionalismo, técnica de vendas, empatia e resultados.',
    configId: '00000000-0000-0000-0000-000000000001',
  },
  {
    id: 'follow_up',
    label: 'IA de Follow-UP',
    icon: Bell,
    color: 'text-orange-500',
    description: 'Avalia a qualidade das mensagens de follow-up geradas pela IA: personalização, timing, tom e efetividade.',
    configId: '00000000-0000-0000-0000-000000000002',
  },
  {
    id: 'flow_selector',
    label: 'Seletor de Fluxo',
    icon: GitBranch,
    color: 'text-purple-500',
    description: 'Avalia a precisão da IA ao selecionar fluxos de automação: trigger correto, relevância dos nós e oportunidades perdidas.',
    configId: '00000000-0000-0000-0000-000000000003',
  },
];

const DEFAULT_CRITERIA: Record<ManagerMode, EvalCriteria[]> = {
  human: [
    { name: 'Profissionalismo e Empatia', weight: 25, description: 'O atendente foi profissional, empático e educado com o cliente?' },
    { name: 'Tempo de Resposta', weight: 15, description: 'O atendente respondeu com agilidade e manteve o cliente engajado?' },
    { name: 'Conhecimento do Produto', weight: 25, description: 'O atendente demonstrou domínio correto do produto/serviço?' },
    { name: 'Técnica de Vendas', weight: 35, description: 'O atendente identificou necessidades, contornou objeções e avançou no funil?' },
  ],
  follow_up: [
    { name: 'Personalização', weight: 30, description: 'A mensagem fez referência ao contexto real da conversa? Evitou ser genérica?' },
    { name: 'Timing e Adequação ao Funil', weight: 25, description: 'O follow-up foi enviado no momento e etapa certos do funil?' },
    { name: 'Tom Natural e Não Invasivo', weight: 20, description: 'A mensagem soou humana, natural e respeitosa com o cliente?' },
    { name: 'Efetividade e Persuasão', weight: 25, description: 'O follow-up reengajou o cliente? A abordagem foi persuasiva sem ser agressiva?' },
  ],
  flow_selector: [
    { name: 'Precisão da Seleção', weight: 35, description: 'O fluxo selecionado foi o mais adequado para a situação do cliente?' },
    { name: 'Relevância do Trigger', weight: 25, description: 'A condição de disparo fez sentido para o contexto da conversa?' },
    { name: 'Qualidade dos Nós Executados', weight: 25, description: 'As mensagens e ações dentro do fluxo foram relevantes e bem sequenciadas?' },
    { name: 'Oportunidades Perdidas', weight: 15, description: 'Houve fluxos mais adequados que não foram acionados?' },
  ],
};

function IssueCard({ issue, index, analysisId, allIssues, onUpdated }: {
  issue: Issue; index: number; analysisId: string; allIssues: Issue[]; onUpdated: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [justText, setJustText] = useState(issue.justification || '');
  const [saving, setSaving] = useState(false);
  const isJustified = issue.type === 'justified';

  const handleSave = async () => {
    if (!justText.trim()) return;
    setSaving(true);
    const updatedIssues = [...allIssues];
    updatedIssues[index] = { ...updatedIssues[index], type: 'justified', justification: justText.trim() };
    const { error } = await supabase.from('manager_analyses').update({ issues: updatedIssues as any }).eq('id', analysisId);
    setSaving(false);
    if (error) toast.error('Erro ao salvar justificativa');
    else { toast.success('Justificativa salva'); setShowForm(false); onUpdated(); }
  };

  const handleRemove = async () => {
    setSaving(true);
    const updatedIssues = [...allIssues];
    updatedIssues[index] = { ...updatedIssues[index], type: 'warning', justification: undefined };
    const { error } = await supabase.from('manager_analyses').update({ issues: updatedIssues as any }).eq('id', analysisId);
    setSaving(false);
    if (error) toast.error('Erro ao remover');
    else { toast.success('Justificativa removida'); setJustText(''); onUpdated(); }
  };

  return (
    <div className={`p-3 rounded-lg ${isJustified ? 'bg-success/5 border border-success/20' : 'bg-secondary/50'}`}>
      <div className="flex gap-3">
        {isJustified ? <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" /> : <IssueIcon type={issue.type} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium ${isJustified ? 'text-success line-through' : 'text-card-foreground'}`}>{issue.title}</p>
            {isJustified && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success">Justificado</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{issue.description}</p>
          {issue.excerpt && <p className="text-xs text-muted-foreground mt-1 italic border-l-2 border-border pl-2">"{issue.excerpt}"</p>}
          {isJustified && issue.justification && (
            <div className="mt-2 p-2 rounded-md bg-success/5 border border-success/10">
              <p className="text-xs text-success font-medium mb-0.5">Sua justificativa:</p>
              <p className="text-xs text-muted-foreground">{issue.justification}</p>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            {!isJustified && !showForm && (
              <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <MessageCircle className="h-3 w-3" /> Justificar
              </button>
            )}
            {isJustified && (
              <button onClick={handleRemove} disabled={saving} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
                <X className="h-3 w-3" /> Remover justificativa
              </button>
            )}
          </div>
          {showForm && !isJustified && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-2 space-y-2">
              <textarea value={justText} onChange={e => setJustText(e.target.value)} rows={2} placeholder="Explique por que isso não é um erro..."
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" autoFocus />
              <div className="flex items-center gap-2">
                <button onClick={handleSave} disabled={saving || !justText.trim()} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Salvar
                </button>
                <button onClick={() => { setShowForm(false); setJustText(''); }} className="text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ManagerAI() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeView, setActiveView] = useState<TabView>('analyses');
  const [managerMode, setManagerMode] = useState<ManagerMode>('human');

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [scoreFilter, setScoreFilter] = useState<string>('all');
  const [issueTypeFilter, setIssueTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');

  // Training — per mode
  const [customPrompts, setCustomPrompts] = useState<Record<ManagerMode, string>>({ human: '', follow_up: '', flow_selector: '' });
  const [criteriaMap, setCriteriaMap] = useState<Record<ManagerMode, EvalCriteria[]>>({ human: [], follow_up: [], flow_selector: [] });
  const [configLoaded, setConfigLoaded] = useState(false);

  const customPrompt = customPrompts[managerMode];
  const criteria = criteriaMap[managerMode];

  const setCustomPrompt = (v: string) => setCustomPrompts(p => ({ ...p, [managerMode]: v }));
  const setCriteria = (v: EvalCriteria[] | ((prev: EvalCriteria[]) => EvalCriteria[])) => {
    setCriteriaMap(p => ({ ...p, [managerMode]: typeof v === 'function' ? v(p[managerMode]) : v }));
  };

  const { data: analyses, isLoading, refetch } = useQuery({
    queryKey: ['manager-analyses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manager_analyses')
        .select('*, conversations(contact_name, contact_phone, status)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as Analysis[];
    },
  });

  // Load all mode configs
  useQuery({
    queryKey: ['manager-config'],
    queryFn: async () => {
      const { data } = await supabase
        .from('manager_config')
        .select('*');
      if (data) {
        const prompts: Record<ManagerMode, string> = { human: '', follow_up: '', flow_selector: '' };
        const crit: Record<ManagerMode, EvalCriteria[]> = { human: [], follow_up: [], flow_selector: [] };
        for (const row of data as any[]) {
          const m = (row as any).mode as ManagerMode;
          if (m && m in prompts) {
            prompts[m] = row.custom_prompt || '';
            crit[m] = (row.evaluation_criteria || []) as EvalCriteria[];
          }
        }
        setCustomPrompts(prompts);
        setCriteriaMap(crit);
        setConfigLoaded(true);
      }
      return data;
    },
  });

  const saveConfig = useMutation({
    mutationFn: async () => {
      const modeInfo = MANAGER_MODES.find(m => m.id === managerMode)!;
      const { error } = await supabase
        .from('manager_config')
        .update({
          custom_prompt: customPrompts[managerMode],
          evaluation_criteria: criteriaMap[managerMode] as any,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', modeInfo.configId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Configuração do modo "${MANAGER_MODES.find(m => m.id === managerMode)?.label}" salva`);
      queryClient.invalidateQueries({ queryKey: ['manager-config'] });
    },
    onError: () => toast.error('Erro ao salvar configuração'),
  });

  // Filter logic — always scoped to current mode
  const filtered = useMemo(() => {
    if (!analyses) return [];
    // Filter by current mode first
    let result = analyses.filter(a => (a as any).mode === managerMode || !(a as any).mode);

    if (scoreFilter === 'high') result = result.filter(a => a.overall_score >= 80);
    else if (scoreFilter === 'medium') result = result.filter(a => a.overall_score >= 50 && a.overall_score < 80);
    else if (scoreFilter === 'low') result = result.filter(a => a.overall_score < 50);

    if (issueTypeFilter === 'error') result = result.filter(a => a.issues?.some(i => i.type === 'error'));
    else if (issueTypeFilter === 'warning') result = result.filter(a => a.issues?.some(i => i.type === 'warning'));
    else if (issueTypeFilter === 'clean') result = result.filter(a => !a.issues?.length);

    if (dateFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (dateFilter === '24h') cutoff.setHours(now.getHours() - 24);
      else if (dateFilter === '7d') cutoff.setDate(now.getDate() - 7);
      else if (dateFilter === '30d') cutoff.setDate(now.getDate() - 30);
      result = result.filter(a => new Date(a.created_at) >= cutoff);
    }

    return result;
  }, [analyses, scoreFilter, issueTypeFilter, dateFilter, managerMode]);

  const selected = analyses?.find(a => a.id === selectedId);

  // Recurring problems — scoped to current mode
  const recurringProblems = useMemo(() => {
    if (!filtered?.length) return [];
    const countMap: Record<string, { title: string; type: string; count: number; descriptions: string[] }> = {};
    filtered.forEach(a => {
      (a.issues || []).forEach(issue => {
        const key = issue.title.toLowerCase().trim();
        if (!countMap[key]) {
          countMap[key] = { title: issue.title, type: issue.type, count: 0, descriptions: [] };
        }
        countMap[key].count++;
        if (countMap[key].descriptions.length < 3 && !countMap[key].descriptions.includes(issue.description)) {
          countMap[key].descriptions.push(issue.description);
        }
      });
    });
    return Object.values(countMap)
      .filter(p => p.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [analyses]);

  // Aggregate metrics
  const avgScore = filtered?.length
    ? Math.round(filtered.reduce((s, a) => s + a.overall_score, 0) / filtered.length)
    : 0;
  const totalIssues = filtered?.reduce((s, a) => s + (a.issues?.length || 0), 0) || 0;
  const totalErrors = filtered?.reduce((s, a) => s + (a.issues?.filter(i => i.type === 'error').length || 0), 0) || 0;

  const handleManualAnalyze = async () => {
    setAnalyzing(true);
    const modeLabel = MANAGER_MODES.find(m => m.id === managerMode)?.label || managerMode;
    try {
      const res = await supabase.functions.invoke('ai-manager-cron', { body: { mode: managerMode } });
      if (res.error) throw res.error;
      toast.success(`[${modeLabel}] ${res.data?.analyzed || 0} conversas analisadas`);
      refetch();
    } catch (e: any) {
      toast.error('Erro ao analisar: ' + (e.message || 'Erro desconhecido'));
    } finally {
      setAnalyzing(false);
    }
  };

  const hasActiveFilters = scoreFilter !== 'all' || issueTypeFilter !== 'all' || dateFilter !== 'all';
  const clearFilters = () => { setScoreFilter('all'); setIssueTypeFilter('all'); setDateFilter('all'); };

  return (
    <div>
      <TopBar title="IA Gerente" subtitle="3 modos: Humano · IA de Follow-UP · Seletor de Fluxo" />
      <div className="p-6 space-y-6">
        {/* Mode selector */}
        <div className="grid grid-cols-3 gap-3">
          {MANAGER_MODES.map(mode => {
            const Icon = mode.icon;
            const isActive = managerMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => { setManagerMode(mode.id); setSelectedId(null); }}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                  isActive
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border bg-card hover:border-primary/40'
                }`}
              >
                <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className={`text-sm font-semibold ${isActive ? 'text-primary' : 'text-card-foreground'}`}>{mode.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{mode.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setActiveView('analyses')}
              className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeView === 'analyses' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ShieldCheck className="h-4 w-4" />
              Análises
            </button>
            <button
              onClick={() => setActiveView('training')}
              className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeView === 'training' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Brain className="h-4 w-4" />
              Treinamento
            </button>
          </div>
          <div className="flex-1" />
          {activeView === 'analyses' && (
            <>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  hasActiveFilters ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <Filter className="h-4 w-4" />
                Filtros
                {hasActiveFilters && (
                  <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                    {[scoreFilter, issueTypeFilter, dateFilter].filter(f => f !== 'all').length}
                  </span>
                )}
              </button>
              <button
                onClick={handleManualAnalyze}
                disabled={analyzing}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-4 w-4 ${analyzing ? 'animate-spin' : ''}`} />
                {analyzing ? 'Analisando...' : `Analisar — ${MANAGER_MODES.find(m => m.id === managerMode)?.label}`}
              </button>
            </>
          )}
        </div>

        {/* Filters panel */}
        {activeView === 'analyses' && showFilters && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-card-foreground">Filtros</p>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <X className="h-3 w-3" /> Limpar
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Score</label>
                <select value={scoreFilter} onChange={e => setScoreFilter(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="all">Todos</option>
                  <option value="high">Bom (80+)</option>
                  <option value="medium">Regular (50-79)</option>
                  <option value="low">Ruim (&lt;50)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tipo de Problema</label>
                <select value={issueTypeFilter} onChange={e => setIssueTypeFilter(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="all">Todos</option>
                  <option value="error">Com Erros Críticos</option>
                  <option value="warning">Com Alertas</option>
                  <option value="clean">Sem Problemas</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Período</label>
                <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
                  <option value="all">Todo período</option>
                  <option value="24h">Últimas 24h</option>
                  <option value="7d">Últimos 7 dias</option>
                  <option value="30d">Últimos 30 dias</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}

        {activeView === 'analyses' && (
          <>
            {/* Metrics */}
            <div className="grid grid-cols-3 gap-4">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Score Médio</p>
                  <p className="text-xl font-bold text-card-foreground">{avgScore}</p>
                </div>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Problemas</p>
                  <p className="text-xl font-bold text-card-foreground">{totalIssues}</p>
                </div>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Erros Críticos</p>
                  <p className="text-xl font-bold text-card-foreground">{totalErrors}</p>
                </div>
              </motion.div>
            </div>

            {/* Recurring Problems */}
            {recurringProblems.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-card-foreground mb-3 flex items-center gap-2">
                  <Repeat className="h-4 w-4 text-warning" /> Problemas Recorrentes
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {recurringProblems.map((prob, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                      <IssueIcon type={prob.type} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-card-foreground">{prob.title}</p>
                          <span className="shrink-0 rounded-full bg-warning/10 text-warning px-2 py-0.5 text-[10px] font-bold">
                            {prob.count}x
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{prob.descriptions[0]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : !filtered?.length ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <ShieldCheck className="h-12 w-12 mb-3 opacity-40" />
                <p className="text-sm">{hasActiveFilters ? 'Nenhuma análise encontrada com esses filtros' : 'Nenhuma análise realizada ainda'}</p>
                <p className="text-xs mt-1">
                  {hasActiveFilters ? 'Tente ajustar os filtros' : 'A IA Gerente analisa automaticamente conversas inativas há 3+ horas'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* List */}
                <div className="lg:col-span-1 space-y-2 max-h-[calc(100vh-420px)] overflow-y-auto pr-1">
                  {filtered.map((a, i) => (
                    <motion.button
                      key={a.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => setSelectedId(a.id)}
                      className={`w-full text-left rounded-xl border p-4 transition-all ${
                        selectedId === a.id ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-card-foreground truncate">
                          {a.conversations?.contact_name || 'Desconhecido'}
                        </p>
                        <ScoreCircle score={a.overall_score} label="" size="sm" />
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{a.summary}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(a.created_at).toLocaleString('pt-BR')}
                        </span>
                        {(a.issues?.filter(i => i.type === 'error').length || 0) > 0 && (
                          <span className="text-[10px] text-destructive font-medium ml-auto">
                            {a.issues.filter(i => i.type === 'error').length} erro(s)
                          </span>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>

                {/* Detail */}
                <div className="lg:col-span-2">
                  {selected ? (
                    <motion.div key={selected.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                      <div className="rounded-xl border border-border bg-card p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-semibold text-card-foreground">
                            Análise: {selected.conversations?.contact_name}
                          </h3>
                          <button
                            onClick={() => navigate(`/conversations/${selected.conversation_id}`)}
                            className="flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Ver conversa <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex items-center justify-around">
                          <ScoreCircle score={selected.overall_score} label="Geral" size="lg" />
                          <ScoreCircle score={selected.response_quality_score} label="Qualidade" />
                          <ScoreCircle score={selected.flow_accuracy_score} label="Fluxos" />
                          <ScoreCircle score={selected.context_adherence_score} label="Contexto" />
                        </div>
                        <p className="text-sm text-muted-foreground mt-4 text-center">{selected.summary}</p>
                      </div>

                      {selected.issues?.length > 0 && (
                        <div className="rounded-xl border border-border bg-card p-5">
                          <h3 className="text-sm font-semibold text-card-foreground mb-3 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" /> Problemas Identificados
                          </h3>
                          <div className="space-y-3">
                            {selected.issues.map((issue, i) => (
                              <IssueCard
                                key={i}
                                issue={issue}
                                index={i}
                                analysisId={selected.id}
                                allIssues={selected.issues}
                                onUpdated={() => refetch()}
                              />
                            ))}
                          </div>
                        </div>
                      )}

                      {selected.flows_analyzed?.length > 0 && (
                        <div className="rounded-xl border border-border bg-card p-5">
                          <h3 className="text-sm font-semibold text-card-foreground mb-3 flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" /> Análise dos Fluxos
                          </h3>
                          <div className="space-y-2">
                            {selected.flows_analyzed.map((flow, i) => (
                              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                                {flow.was_appropriate
                                  ? <CheckCircle2 className="h-4 w-4 text-success shrink-0 mt-0.5" />
                                  : <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                                }
                                <div>
                                  <p className="text-sm font-medium text-card-foreground">{flow.flow_name}</p>
                                  <p className="text-xs text-muted-foreground">{flow.reason}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selected.suggestions?.length > 0 && (
                        <div className="rounded-xl border border-border bg-card p-5">
                          <h3 className="text-sm font-semibold text-card-foreground mb-3 flex items-center gap-2">
                            <Lightbulb className="h-4 w-4" /> Sugestões de Melhoria
                          </h3>
                          <div className="space-y-2">
                            {selected.suggestions.map((sug, i) => (
                              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                                <PriorityBadge priority={sug.priority} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-card-foreground">{sug.title}</p>
                                  <p className="text-xs text-muted-foreground">{sug.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                      <ShieldCheck className="h-10 w-10 mb-2 opacity-40" />
                      <p className="text-sm">Selecione uma análise para ver os detalhes</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Training tab */}
        {activeView === 'training' && (
          <div className="space-y-6">
            {/* Mode context banner */}
            {(() => {
              const modeInfo = MANAGER_MODES.find(m => m.id === managerMode)!;
              const Icon = modeInfo.icon;
              return (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-card-foreground">Configurando: {modeInfo.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{modeInfo.description}</p>
                  </div>
                </motion.div>
              );
            })()}

            {/* Custom Prompt */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-border bg-card p-6 shadow-elevated">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                  <Brain className="h-5 w-5 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-card-foreground">Instrução da IA — {MANAGER_MODES.find(m => m.id === managerMode)?.label}</p>
                  <p className="text-xs text-muted-foreground">Deixe em branco para usar o prompt padrão deste modo. Ou personalize.</p>
                </div>
              </div>
              <textarea
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                rows={6}
                placeholder={`Deixe em branco para usar o padrão, ou customize. Ex: "Seja mais rigoroso com ${managerMode === 'human' ? 'respostas genéricas do vendedor' : managerMode === 'follow_up' ? 'follow-ups que não citam o contexto' : 'fluxos selecionados sem relevância'}..."`}
                className="w-full resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </motion.div>

            {/* Evaluation Criteria */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-xl border border-border bg-card p-6 shadow-elevated">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                    <CheckCircle2 className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-card-foreground">Critérios de Avaliação</p>
                    <p className="text-xs text-muted-foreground">Pesos e descrições usados pela IA para pontuar ({criteria.length === 0 ? 'usando padrões' : `${criteria.length} customizados`})</p>
                  </div>
                </div>
                {criteria.length === 0 && (
                  <button
                    onClick={() => setCriteria(DEFAULT_CRITERIA[managerMode])}
                    className="text-xs text-primary hover:underline"
                  >
                    Carregar padrões
                  </button>
                )}
                {criteria.length > 0 && (
                  <button
                    onClick={() => setCriteria([])}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Resetar para padrões
                  </button>
                )}
              </div>
              {criteria.length === 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-xs text-muted-foreground mb-2">Critérios padrão (ativos):</p>
                  {DEFAULT_CRITERIA[managerMode].map((c, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30 text-xs">
                      <span className="font-medium text-card-foreground min-w-0 flex-1">{c.name}</span>
                      <span className="shrink-0 text-muted-foreground">{c.weight}%</span>
                      <span className="shrink-0 text-muted-foreground max-w-xs truncate">{c.description}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-3">
                {criteria.map((c, i) => (
                  <div key={i} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex items-center gap-3 mb-2">
                      <input
                        value={c.name}
                        onChange={e => {
                          const updated = [...criteria];
                          updated[i] = { ...updated[i], name: e.target.value };
                          setCriteria(updated);
                        }}
                        className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium"
                        placeholder="Nome do critério"
                      />
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={c.weight}
                          onChange={e => {
                            const updated = [...criteria];
                            updated[i] = { ...updated[i], weight: Number(e.target.value) };
                            setCriteria(updated);
                          }}
                          className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center"
                        />
                        <span className="text-xs text-muted-foreground">%</span>
                      </div>
                      <button
                        onClick={() => setCriteria(criteria.filter((_, j) => j !== i))}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <input
                      value={c.description}
                      onChange={e => {
                        const updated = [...criteria];
                        updated[i] = { ...updated[i], description: e.target.value };
                        setCriteria(updated);
                      }}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-muted-foreground"
                      placeholder="Descrição do critério"
                    />
                  </div>
                ))}
                <button
                  onClick={() => setCriteria([...criteria, { name: '', weight: 25, description: '' }])}
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Lightbulb className="h-3.5 w-3.5" /> Adicionar critério
                </button>
              </div>
            </motion.div>

            {/* Knowledge Base */}
            <KnowledgeBase />

            {/* Save */}
            <div className="flex justify-end">
              <button
                onClick={() => saveConfig.mutate()}
                disabled={saveConfig.isPending}
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saveConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar Configurações
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
