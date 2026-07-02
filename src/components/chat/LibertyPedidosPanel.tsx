import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, Package, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props { contactPhone?: string | null }

type Pedido = Record<string, any> & { id: string };

const onlyDigits = (v?: string | null) => (v || '').replace(/\D/g, '');

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('libertypos-proxy', { body });
  if (error) throw new Error(error.message);
  if (data && (data as any).ok === false) throw new Error((data as any).error || 'Erro LibertyPOS');
  return data;
}

// Options are loaded dynamically from the LibertyPOS proxy.
type OptionsMap = Record<string, string[]>;

const badgeColor = (v?: string) => {
  const s = (v || '').toLowerCase();
  if (['pago', 'quitado', 'entregue', 'concluído', 'enviado'].some((k) => s.includes(k))) return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  if (['atraso', 'cancelado', 'estornado', 'reembolsado'].some((k) => s.includes(k))) return 'bg-destructive/10 text-destructive border-destructive/30';
  if (['trânsito', 'em transito', 'respondido'].some((k) => s.includes(k))) return 'bg-primary/10 text-primary border-primary/30';
  return 'bg-muted text-muted-foreground border-border';
};

export default function LibertyPedidosPanel({ contactPhone }: Props) {
  const [open, setOpen] = useState(true);
  const phone = useMemo(() => onlyDigits(contactPhone), [contactPhone]);
  const qc = useQueryClient();

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['libertypos-pedidos', phone],
    queryFn: async () => {
      const res = await call({ action: 'list', telefone: phone });
      return ((res as any)?.data || []) as Pedido[];
    },
    enabled: !!phone,
    staleTime: 15_000,
  });

  const { data: optionsMap } = useQuery({
    queryKey: ['libertypos-options'],
    queryFn: async () => {
      const res = await call({ action: 'options' });
      return ((res as any)?.options || {}) as OptionsMap;
    },
    staleTime: 5 * 60_000,
  });
  const opts = optionsMap || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) if (opts[k]?.length) return opts[k];
    return [] as string[];
  };

  const upsert = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      call({ action: 'update', id, data: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['libertypos-pedidos', phone] }),
    onError: (e: Error) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const create = useMutation({
    mutationFn: async () => call({ action: 'create', telefone: phone, data: { telefone: phone } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['libertypos-pedidos', phone] });
      toast.success('Pedido criado no LibertyPOS');
    },
    onError: (e: Error) => toast.error(`Erro ao criar: ${e.message}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => call({ action: 'delete', id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['libertypos-pedidos', phone] });
      toast.success('Pedido excluído');
    },
    onError: (e: Error) => toast.error(`Erro ao excluir: ${e.message}`),
  });

  if (!phone) return null;

  const pedidos = data || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Package className="h-3 w-3" /> Pedidos LibertyPOS
          {pedidos.length > 0 && (
            <span className="ml-1 rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[10px] font-bold">
              {pedidos.length}
            </span>
          )}
        </button>
        <div className="flex items-center gap-1">
          <Button
            size="icon" variant="ghost" className="h-6 w-6"
            onClick={() => refetch()} disabled={isFetching}
            title="Atualizar"
          >
            <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
          </Button>
          <Button
            size="icon" variant="ghost" className="h-6 w-6"
            onClick={() => create.mutate()} disabled={create.isPending}
            title="Novo pedido"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-600/40 bg-red-600/10 p-3 text-[11px] text-red-400">
              {(error as Error).message}
            </div>
          )}
          {!isLoading && !error && pedidos.length === 0 && (
            <div className="rounded-lg border border-border bg-background/50 p-3 text-[11px] text-muted-foreground text-center">
              Nenhum pedido para este contato
            </div>
          )}
          {pedidos.map((p) => (
            <PedidoCard
              key={p.id}
              pedido={p}
              options={{
                status_cobranca: pick('status_cobranca'),
                status_pagamento: pick('status_pagamento', 'pagamento'),
                forma_pagamento: pick('forma_pagamento', 'forma_pgto'),
                logistica: pick('logistica', 'tipo_entrega'),
                status_envio: pick('status_envio', 'envio'),
                wpp_cobranca: pick('wpp_cobranca'),
              }}
              onPatch={(patch) => upsert.mutate({ id: p.id, patch })}
              onDelete={() => remove.mutate(p.id)}
              saving={upsert.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PedidoCard({
  pedido, options, onPatch, onDelete, saving,
}: {
  pedido: Pedido;
  options: Record<string, string[]>;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const [local, setLocal] = useState<Pedido>(pedido);
  useEffect(() => setLocal(pedido), [pedido]);

  const patch = (k: string, v: unknown) => {
    setLocal((prev) => ({ ...prev, [k]: v }));
    onPatch({ [k]: v });
  };

  const cliente = local.nome || local.cliente || local.contact_name || '—';
  const produto = local.produto || local.product || '—';
  const telefone = local.telefone || local.phone || local.whatsapp || '';
  const valor = local.valor ?? local.value;
  const entrada = local.data_entrada || local.entrada || local.created_at;

  const val = (...keys: string[]) => {
    for (const k of keys) if (local[k] != null && local[k] !== '') return local[k];
    return '';
  };

  const paisOptions = ['Brasil', 'Uruguay'];
  const paisCurrent = String(val('pais', 'country') || '');

  const fmtPhone = (p: string, pais: string) => {
    const d = p.replace(/\D/g, '');
    const country = pais.toLowerCase();
    // Uruguay: +598 9 XXX XX XX (mobile) or +598 X XXX XXXX
    if (country.startsWith('uru') || country === 'uy') {
      const local = d.startsWith('598') ? d.slice(3) : d;
      if (local.length === 8) return `+598 ${local.slice(0, 1)} ${local.slice(1, 4)} ${local.slice(4, 6)} ${local.slice(6)}`;
      return `+598 ${local}`;
    }
    // Brasil: +55 (XX) XXXXX-XXXX
    const local = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
    if (local.length === 11) return `+55 (${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
    if (local.length === 10) return `+55 (${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
    return p;
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden transition-colors hover:border-primary/40">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-4 flex items-start justify-between gap-2 hover:bg-muted/40 transition text-left"
      >
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{cliente}</div>
            {paisCurrent && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 shrink-0 uppercase tracking-wide">
                {paisCurrent}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{produto}</div>

          {valor != null && (
            <div className="text-lg font-bold text-primary leading-none">
              R$ {Number(valor).toFixed(2).replace('.', ',')}
            </div>
          )}

          <div className="flex flex-col gap-0.5 pt-0.5">
            {telefone && (
              <span className="text-xs text-foreground/90 font-medium">
                {fmtPhone(String(telefone), paisCurrent)}
              </span>
            )}
            {entrada && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(entrada).toLocaleDateString('pt-BR')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 flex-wrap pt-1">
            {val('status_cobranca') && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md border font-medium', badgeColor(String(val('status_cobranca'))))}>
                {String(val('status_cobranca'))}
              </span>
            )}
            {val('status_envio', 'envio') && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-md border font-medium', badgeColor(String(val('status_envio', 'envio'))))}>
                {String(val('status_envio', 'envio'))}
              </span>
            )}
          </div>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 mt-1 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 mt-1 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="p-3 pt-2 space-y-3 border-t border-border">
          <SelectField label="País" value={paisCurrent} options={paisOptions} onChange={(v) => patch('pais', v)} />

          <div className="grid grid-cols-2 gap-2">
            <SelectField label="Status Cobrança" value={String(val('status_cobranca'))} options={options.status_cobranca} onChange={(v) => patch('status_cobranca', v)} />
            <SelectField label="Pagamento" value={String(val('status_pagamento', 'pagamento'))} options={options.status_pagamento} onChange={(v) => patch('status_pagamento', v)} />
            <SelectField label="Forma Pgto" value={String(val('forma_pagamento', 'forma_pgto'))} options={options.forma_pagamento} onChange={(v) => patch('forma_pagamento', v)} />
            <SelectField label="Logística" value={String(val('logistica', 'tipo_entrega'))} options={options.logistica} onChange={(v) => patch('logistica', v)} />
            <SelectField label="Envio" value={String(val('status_envio', 'envio'))} options={options.status_envio} onChange={(v) => patch('status_envio', v)} />
            <SelectField label="WPP Cobrança" value={String(val('wpp_cobranca'))} options={options.wpp_cobranca} onChange={(v) => patch('wpp_cobranca', v)} />
          </div>





          <div className="flex items-center justify-between pt-1">
            {saving ? (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
              </span>
            ) : <span />}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10">
                  <Trash2 className="h-3 w-3 mr-1" /> Excluir pedido
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir pedido do LibertyPOS?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Essa ação remove o pedido também no LibertyPOS. Não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectField({ label, value, options, onChange }: {
  label: string; value?: string; options: string[]; onChange: (v: string) => void;
}) {
  const norm = (s: string) => s.trim().toLowerCase();
  const raw = (value ?? '').toString();
  // Match option case-insensitively; if upstream sends a value that isn't in
  // our option list (e.g. "a enviar"), keep it as-is so it still shows.
  const matched = options.find((o) => norm(o) === norm(raw));
  const current = matched ?? (raw ? raw : '');
  const allOptions = matched || !raw ? options : [raw, ...options];
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</Label>
      <Select value={current} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-[11px] mt-1">
          <SelectValue placeholder="Selecionar…" />
        </SelectTrigger>
        <SelectContent>
          {allOptions.map((o) => <SelectItem key={o} value={o} className="text-[11px]">{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}


function TextField({ label, value, onCommit, multiline }: {
  label: string; value?: string | number | null; onCommit: (v: string) => void; multiline?: boolean;
}) {
  const [v, setV] = useState<string>(value == null ? '' : String(value));
  useEffect(() => setV(value == null ? '' : String(value)), [value]);
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</Label>
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== (value == null ? '' : String(value))) onCommit(v); }}
        onKeyDown={(e) => { if (!multiline && e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="h-7 text-[11px] mt-1"
      />
    </div>
  );
}
