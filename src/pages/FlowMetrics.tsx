import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, BarChart3, BookOpen, CheckCircle2, ChevronDown,
  ChevronRight, CircleAlert, Clock3, GitBranch, HelpCircle, Loader2, Search,
  ShieldCheck, UserRound, XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import TopBar from '@/components/layout/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface FlowInfo {
  id: string;
  name: string;
  description: string | null;
  trigger_count: number;
  is_active: boolean;
}

interface ConversationInfo {
  contact_name: string | null;
  contact_phone: string;
}

interface ExecutionRow {
  id: string;
  status: string;
  total_nodes: number;
  completed_nodes: number;
  failed_at_node_id: string | null;
  started_at: string;
  completed_at: string | null;
  waiting_since: string | null;
  conversations: ConversationInfo | ConversationInfo[] | null;
}

interface StepRow {
  id: string;
  execution_id: string;
  node_id: string;
  node_type: string;
  node_label: string;
  sort_order: number;
  status: string;
  error_message: string | null;
  executed_at: string;
}

interface SmartReplyRow {
  id: string;
  niche_id: string | null;
  country_code: string | null;
  customer_message: string;
  context_snapshot: string;
  confidence: number | null;
  outcome: string;
  reason: string | null;
  safe_error: string | null;
  created_at: string;
  conversations: ConversationInfo | ConversationInfo[] | null;
  niches: { name: string } | { name: string }[] | null;
}

interface NodeMetric {
  node_id: string;
  node_label: string;
  node_type: string;
  total: number;
  completed: number;
  failed: number;
  attention: number;
}

interface ProblemGroup {
  key: string;
  nodeId: string;
  block: string;
  message: string;
  count: number;
  lastAt: string;
  solution: string;
}

interface QuestionGroup {
  key: string;
  message: string;
  count: number;
  lastAt: string;
  confidence: number | null;
  reason: string;
  context: string;
  country: string | null;
  nicheId: string | null;
  nicheName: string;
  contact: string;
}

const statusLabels: Record<string, string> = {
  completed: 'Concluído', failed: 'Falhou', running: 'Executando',
  waiting_for_response: 'Aguardando resposta', superseded: 'Substituído',
};

const stepStatusLabels: Record<string, string> = {
  completed: 'Concluído', failed: 'Falhou', skipped: 'Ignorado',
  review_required: 'Precisa de revisão', waiting_for_response: 'Aguardando resposta',
};

const getRelation = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] || null : value;

const getProblemSolution = (message: string, nodeType: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('conecte') || normalized.includes('saída')) return 'Abra o fluxo e conecte todas as saídas indicadas neste bloco.';
  if (normalized.includes('fonte') || normalized.includes('base')) return 'Atualize a Base de Conhecimento ou revise os conteúdos escolhidos neste bloco.';
  if (normalized.includes('confiança')) return 'Revise a pergunta e adicione uma informação oficial mais específica à Base de Conhecimento.';
  if (normalized.includes('timeout') || normalized.includes('prazo')) return 'Abra o bloco e defina um prazo válido.';
  if (nodeType === 'smart_reply') return 'Revise a Base de Conhecimento e as configurações da Resposta Inteligente.';
  return 'Abra este bloco no editor, revise sua configuração e execute um novo teste.';
};

const normalizeQuestion = (value: string) => value.toLocaleLowerCase('pt-BR').replace(/[^a-z0-9áàâãéêíóôõúç ]/gi, '').replace(/\s+/g, ' ').trim();

export default function FlowMetrics() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [flow, setFlow] = useState<FlowInfo | null>(null);
  const [executions, setExecutions] = useState<ExecutionRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [smartReplies, setSmartReplies] = useState<SmartReplyRow[]>([]);
  const [counts, setCounts] = useState({ total: 0, completed: 0, failed: 0, waiting: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('30');
  const [historyLimit, setHistoryLimit] = useState(20);
  const [expandedExecution, setExpandedExecution] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const fetchAudit = async () => {
      setLoading(true);
      setError('');
      const countStatus = async (status?: string) => {
        let query = supabase.from('flow_executions').select('id', { count: 'exact', head: true }).eq('flow_id', id);
        if (status) query = query.eq('status', status);
        const result = await query;
        return result.count || 0;
      };
      const [flowRes, executionsRes, total, completed, failed, waiting, repliesRes] = await Promise.all([
        supabase.from('automation_flows').select('id, name, description, trigger_count, is_active').eq('id', id).single(),
        supabase.from('flow_executions')
          .select('id, status, total_nodes, completed_nodes, failed_at_node_id, started_at, completed_at, waiting_since, conversations(contact_name, contact_phone)')
          .eq('flow_id', id).order('started_at', { ascending: false }).limit(100),
        countStatus(), countStatus('completed'), countStatus('failed'), countStatus('waiting_for_response'),
        supabase.from('ai_smart_reply_logs')
          .select('id, niche_id, country_code, customer_message, context_snapshot, confidence, outcome, reason, safe_error, created_at, conversations(contact_name, contact_phone), niches(name)')
          .eq('flow_id', id).eq('outcome', 'no_answer').order('created_at', { ascending: false }).limit(300),
      ]);

      if (flowRes.error || executionsRes.error || repliesRes.error) {
        setError(flowRes.error?.message || executionsRes.error?.message || repliesRes.error?.message || 'Não foi possível carregar a análise.');
        setLoading(false);
        return;
      }

      const executionRows = (executionsRes.data || []) as unknown as ExecutionRow[];
      const executionIds = executionRows.map((execution) => execution.id);
      const stepsRes = executionIds.length
        ? await supabase.from('flow_step_logs')
            .select('id, execution_id, node_id, node_type, node_label, sort_order, status, error_message, executed_at')
            .in('execution_id', executionIds).order('executed_at', { ascending: false }).limit(1000)
        : { data: [], error: null };

      if (stepsRes.error) {
        setError(stepsRes.error.message);
        setLoading(false);
        return;
      }

      setFlow(flowRes.data as FlowInfo);
      setExecutions(executionRows);
      setSteps((stepsRes.data || []) as StepRow[]);
      setSmartReplies((repliesRes.data || []) as unknown as SmartReplyRow[]);
      setCounts({ total, completed, failed, waiting });
      setLoading(false);
    };
    fetchAudit();
  }, [id]);

  const nodeMetrics = useMemo(() => {
    const metrics = new Map<string, NodeMetric>();
    steps.forEach((step) => {
      const current = metrics.get(step.node_id) || {
        node_id: step.node_id, node_label: step.node_label, node_type: step.node_type,
        total: 0, completed: 0, failed: 0, attention: 0,
      };
      current.total += 1;
      if (step.status === 'completed') current.completed += 1;
      if (step.status === 'failed') current.failed += 1;
      if (step.status === 'review_required' || step.status === 'waiting_for_response') current.attention += 1;
      metrics.set(step.node_id, current);
    });
    return Array.from(metrics.values()).sort((a, b) => b.failed - a.failed || b.attention - a.attention || b.total - a.total);
  }, [steps]);

  const problems = useMemo(() => {
    const grouped = new Map<string, ProblemGroup>();
    steps.filter((step) => step.status === 'failed' || step.status === 'review_required').forEach((step) => {
      const message = step.error_message || (step.status === 'review_required' ? 'Este bloco pediu revisão manual.' : 'A execução deste bloco falhou.');
      const key = `${step.node_id}:${message}`;
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
        if (new Date(step.executed_at) > new Date(current.lastAt)) current.lastAt = step.executed_at;
      } else {
        grouped.set(key, {
          key, nodeId: step.node_id, block: step.node_label || step.node_type, message,
          count: 1, lastAt: step.executed_at, solution: getProblemSolution(message, step.node_type),
        });
      }
    });
    return Array.from(grouped.values()).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  }, [steps]);

  const questions = useMemo(() => {
    const grouped = new Map<string, QuestionGroup>();
    smartReplies.forEach((reply) => {
      const key = normalizeQuestion(reply.customer_message) || reply.id;
      const conversation = getRelation(reply.conversations);
      const niche = getRelation(reply.niches);
      const current = grouped.get(key);
      if (current) {
        current.count += 1;
        if (new Date(reply.created_at) > new Date(current.lastAt)) current.lastAt = reply.created_at;
      } else {
        grouped.set(key, {
          key, message: reply.customer_message || 'Mensagem não registrada', count: 1,
          lastAt: reply.created_at, confidence: reply.confidence,
          reason: reply.reason || reply.safe_error || 'A Base de Conhecimento não forneceu uma resposta segura.',
          context: reply.context_snapshot, country: reply.country_code, nicheId: reply.niche_id,
          nicheName: niche?.name || 'Sem nicho',
          contact: conversation?.contact_name || conversation?.contact_phone || 'Cliente não identificado',
        });
      }
    });
    return Array.from(grouped.values()).sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
  }, [smartReplies]);

  const filteredExecutions = useMemo(() => {
    const cutoff = periodFilter === 'all' ? 0 : Date.now() - Number(periodFilter) * 86400000;
    const term = search.toLocaleLowerCase('pt-BR').trim();
    return executions.filter((execution) => {
      const conversation = getRelation(execution.conversations);
      const matchesStatus = statusFilter === 'all' || execution.status === statusFilter;
      const matchesPeriod = !cutoff || new Date(execution.started_at).getTime() >= cutoff;
      const haystack = `${conversation?.contact_name || ''} ${conversation?.contact_phone || ''} ${execution.id}`.toLocaleLowerCase('pt-BR');
      return matchesStatus && matchesPeriod && (!term || haystack.includes(term));
    });
  }, [executions, periodFilter, search, statusFilter]);

  const stepsByExecution = useMemo(() => {
    const grouped = new Map<string, StepRow[]>();
    steps.forEach((step) => grouped.set(step.execution_id, [...(grouped.get(step.execution_id) || []), step]));
    grouped.forEach((items) => items.sort((a, b) => a.sort_order - b.sort_order || new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime()));
    return grouped;
  }, [steps]);

  if (loading) return <div><TopBar title="Análise do Fluxo" subtitle="Carregando histórico..." /><div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></div>;

  if (!flow || error) return (
    <div>
      <TopBar title="Análise do Fluxo" subtitle="Não foi possível abrir esta análise" />
      <div className="mx-auto max-w-5xl p-6">
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error || 'Fluxo não encontrado.'}</div>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/automation')}><ArrowLeft />Voltar para Automação</Button>
      </div>
    </div>
  );

  const successRate = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;

  return (
    <div>
      <TopBar title="Análise do Fluxo" subtitle={flow.name} />
      <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => navigate('/automation')}><ArrowLeft />Voltar</Button>
          <div className="flex items-center gap-2">
            <span className={cn('rounded-md border px-2.5 py-1 text-xs font-medium', flow.is_active ? 'border-success/30 bg-success/10 text-success' : 'border-border bg-secondary text-muted-foreground')}>
              {flow.is_active ? 'Fluxo ativo' : 'Fluxo inativo'}
            </span>
            <Button variant="outline" onClick={() => navigate(`/automation/${flow.id}`)}><GitBranch />Abrir editor</Button>
          </div>
        </div>

        <Tabs defaultValue="overview" className="space-y-5">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-4">
            <TabsTrigger value="overview" className="gap-2"><BarChart3 className="h-4 w-4" />Visão geral</TabsTrigger>
            <TabsTrigger value="problems" className="gap-2"><AlertTriangle className="h-4 w-4" />Problemas <span className="rounded bg-destructive/10 px-1.5 text-[10px] text-destructive">{problems.length}</span></TabsTrigger>
            <TabsTrigger value="history" className="gap-2"><Clock3 className="h-4 w-4" />Histórico</TabsTrigger>
            <TabsTrigger value="questions" className="gap-2"><HelpCircle className="h-4 w-4" />Sem resposta <span className="rounded bg-warning/10 px-1.5 text-[10px] text-warning">{questions.length}</span></TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                { label: 'Execuções', value: counts.total, icon: GitBranch, tone: 'text-primary' },
                { label: 'Concluídas', value: counts.completed, icon: CheckCircle2, tone: 'text-success' },
                { label: 'Taxa de sucesso', value: `${successRate}%`, icon: ShieldCheck, tone: 'text-success' },
                { label: 'Falhas', value: counts.failed, icon: XCircle, tone: 'text-destructive' },
                { label: 'Em espera', value: counts.waiting, icon: Clock3, tone: 'text-warning' },
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between"><span className="text-xs text-muted-foreground">{item.label}</span><item.icon className={cn('h-4 w-4', item.tone)} /></div>
                  <p className="text-2xl font-bold text-card-foreground">{item.value}</p>
                </div>
              ))}
            </div>

            <section className="rounded-md border border-border bg-card">
              <div className="border-b border-border p-5"><h2 className="font-semibold text-card-foreground">Desempenho por bloco</h2><p className="mt-1 text-xs text-muted-foreground">Identifique rapidamente os pontos que exigem atenção.</p></div>
              {nodeMetrics.length === 0 ? <EmptyState icon={BarChart3} title="Nenhuma execução registrada" description="Os blocos aparecerão após a primeira execução." /> : (
                <div className="divide-y divide-border">
                  {nodeMetrics.map((node) => {
                    const success = node.total ? Math.round((node.completed / node.total) * 100) : 0;
                    return <div key={node.node_id} className="grid gap-3 p-4 md:grid-cols-[minmax(180px,1fr)_2fr_auto] md:items-center">
                      <div><p className="text-sm font-medium text-foreground">{node.node_label || node.node_type}</p><p className="text-xs text-muted-foreground">{node.total} passagem(ns)</p></div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-success" style={{ width: `${success}%` }} /></div>
                      <div className="flex gap-3 text-xs"><span className="text-success">{success}% sucesso</span>{node.failed > 0 && <span className="text-destructive">{node.failed} falha(s)</span>}{node.attention > 0 && <span className="text-warning">{node.attention} atenção</span>}</div>
                    </div>;
                  })}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="problems">
            <section className="rounded-md border border-border bg-card">
              <div className="border-b border-border p-5"><h2 className="font-semibold text-card-foreground">Problemas encontrados</h2><p className="mt-1 text-xs text-muted-foreground">Falhas reais e revisões pedidas nas 100 execuções mais recentes.</p></div>
              {problems.length === 0 ? <EmptyState icon={CheckCircle2} title="Nenhum problema recente" description="As execuções analisadas não registraram falhas ou pedidos de revisão." tone="text-success" /> : (
                <div className="divide-y divide-border">
                  {problems.map((problem) => <div key={problem.key} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive"><CircleAlert className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-foreground">{problem.block}</p><p className="mt-1 text-sm text-destructive">{problem.message}</p></div></div>
                      <span className="rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">{problem.count} ocorrência(s)</span>
                    </div>
                    <div className="ml-11 mt-3 rounded-md border border-border bg-background p-3"><p className="text-xs font-semibold text-foreground">Como corrigir</p><p className="mt-1 text-xs text-muted-foreground">{problem.solution}</p></div>
                    <p className="ml-11 mt-2 text-[11px] text-muted-foreground">Última vez {formatDistanceToNow(new Date(problem.lastAt), { addSuffix: true, locale: ptBR })}</p>
                  </div>)}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px_160px]">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, telefone ou execução" className="pl-9" /></div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value="all">Todos os estados</option><option value="completed">Concluídos</option><option value="failed">Falhas</option><option value="running">Executando</option><option value="waiting_for_response">Aguardando resposta</option></select>
              <select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="all">Todo o período</option></select>
            </div>
            <section className="rounded-md border border-border bg-card">
              {filteredExecutions.length === 0 ? <EmptyState icon={Clock3} title="Nenhuma execução encontrada" description="Ajuste os filtros ou aguarde uma nova execução." /> : (
                <div className="divide-y divide-border">
                  {filteredExecutions.slice(0, historyLimit).map((execution) => {
                    const conversation = getRelation(execution.conversations);
                    const executionSteps = stepsByExecution.get(execution.id) || [];
                    const expanded = expandedExecution === execution.id;
                    return <div key={execution.id}>
                      <Button variant="ghost" className="h-auto w-full justify-start rounded-none p-4 text-left hover:bg-secondary/40" onClick={() => setExpandedExecution(expanded ? null : execution.id)}>
                        {expanded ? <ChevronDown /> : <ChevronRight />}
                        <StatusIcon status={execution.status} />
                        <span className="min-w-0 flex-1"><span className="block truncate font-medium text-foreground">{conversation?.contact_name || conversation?.contact_phone || 'Cliente não identificado'}</span><span className="block text-xs font-normal text-muted-foreground">{conversation?.contact_phone || 'Sem telefone'} · {formatDistanceToNow(new Date(execution.started_at), { addSuffix: true, locale: ptBR })}</span></span>
                        <span className="text-right"><span className="block text-xs font-medium text-foreground">{statusLabels[execution.status] || execution.status}</span><span className="block text-[11px] font-normal text-muted-foreground">{execution.completed_nodes}/{execution.total_nodes} blocos</span></span>
                      </Button>
                      {expanded && <div className="border-t border-border bg-background px-5 py-4"><div className="space-y-3 border-l border-border pl-5">{executionSteps.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum detalhe registrado nesta execução.</p> : executionSteps.map((step) => <div key={step.id} className="relative"><span className={cn('absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-background', step.status === 'failed' ? 'bg-destructive' : step.status === 'completed' ? 'bg-success' : 'bg-warning')} /><div className="flex flex-wrap justify-between gap-2"><div><p className="text-xs font-medium text-foreground">{step.node_label || step.node_type}</p><p className="text-[11px] text-muted-foreground">{stepStatusLabels[step.status] || step.status}</p>{step.error_message && <p className="mt-1 text-xs text-destructive">{step.error_message}</p>}</div><span className="text-[10px] text-muted-foreground">{new Date(step.executed_at).toLocaleString('pt-BR')}</span></div></div>)}</div></div>}
                    </div>;
                  })}
                </div>
              )}
              {filteredExecutions.length > historyLimit && <div className="border-t border-border p-4 text-center"><Button variant="outline" onClick={() => setHistoryLimit((value) => value + 20)}>Carregar mais</Button></div>}
            </section>
          </TabsContent>

          <TabsContent value="questions">
            <section className="rounded-md border border-border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5"><div><h2 className="font-semibold text-card-foreground">Dúvidas para atualizar a base</h2><p className="mt-1 text-xs text-muted-foreground">Perguntas agrupadas que não tiveram resposta segura.</p></div><Button onClick={() => navigate('/knowledge-base')}><BookOpen />Abrir Base de Conhecimento</Button></div>
              {questions.length === 0 ? <EmptyState icon={CheckCircle2} title="Nenhuma dúvida pendente" description="A IA encontrou respostas seguras nas ocorrências analisadas." tone="text-success" /> : (
                <div className="divide-y divide-border">
                  {questions.map((question) => <article key={question.key} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="rounded-md bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning">{question.count} vez(es)</span><span className="rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground">{question.nicheName}</span>{question.country && <span className="rounded-md bg-secondary px-2 py-1 text-[11px] text-muted-foreground">{question.country}</span>}</div><blockquote className="text-sm font-medium text-foreground">“{question.message}”</blockquote><p className="mt-2 text-xs text-muted-foreground"><UserRound className="mr-1 inline h-3 w-3" />{question.contact} · {formatDistanceToNow(new Date(question.lastAt), { addSuffix: true, locale: ptBR })}</p></div><Button variant="outline" onClick={() => navigate(`/knowledge-base${question.nicheId ? `?niche=${encodeURIComponent(question.nicheId)}` : ''}`)}><BookOpen />Adicionar resposta</Button></div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2"><div className="rounded-md border border-border bg-background p-3"><p className="text-[11px] font-semibold uppercase text-muted-foreground">Motivo</p><p className="mt-1 text-xs text-foreground">{question.reason}</p>{question.confidence !== null && <p className="mt-2 text-[11px] text-muted-foreground">Confiança: {Math.round(Number(question.confidence) * 100)}%</p>}</div><details className="rounded-md border border-border bg-background p-3"><summary className="cursor-pointer text-[11px] font-semibold uppercase text-muted-foreground">Ver contexto da conversa</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-xs text-foreground">{question.context || 'Contexto não registrado.'}</pre></details></div>
                  </article>)}
                </div>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
  if (status === 'waiting_for_response') return <Clock3 className="h-4 w-4 shrink-0 text-warning" />;
  return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
}

function EmptyState({ icon: Icon, title, description, tone = 'text-muted-foreground' }: { icon: typeof BarChart3; title: string; description: string; tone?: string }) {
  return <div className="flex flex-col items-center px-5 py-14 text-center"><Icon className={cn('mb-3 h-8 w-8', tone)} /><p className="text-sm font-medium text-foreground">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>;
}
