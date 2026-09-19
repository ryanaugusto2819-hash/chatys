import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, ReceiptText, RefreshCw, Send, XCircle } from 'lucide-react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface OxxoCharge {
  id: string;
  amount: number;
  fee: number | null;
  status: 'creating' | 'pending' | 'confirmed' | 'failed' | 'cancelled';
  reference: string | null;
  barcode_url: string | null;
  request_number: string | null;
  error_message: string | null;
  confirmed_at: string | null;
  created_at: string;
}

interface OxxoChargesPanelProps {
  conversationId: string;
  contactName: string;
  onSendVoucher: (voucher: { amount: number; reference: string; barcodeUrl: string }) => Promise<void>;
}

const statusLabel: Record<OxxoCharge['status'], string> = {
  creating: 'Gerando',
  pending: 'Aguardando pagamento',
  confirmed: 'Pago',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

export default function OxxoChargesPanel({ conversationId, contactName, onSendVoucher }: OxxoChargesPanelProps) {
  const [charges, setCharges] = useState<OxxoCharge[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [amount, setAmount] = useState('');
  const [payerName, setPayerName] = useState(contactName);
  const [payerEmail, setPayerEmail] = useState('');
  const [sendingChargeId, setSendingChargeId] = useState<string | null>(null);

  const loadCharges = useCallback(async () => {
    const { data, error } = await supabase
      .from('oxxo_charges')
      .select('id, amount, fee, status, reference, barcode_url, request_number, error_message, confirmed_at, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });
    if (error) toast.error('Não foi possível carregar as cobranças OXXO');
    setCharges((data as OxxoCharge[] | null) ?? []);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    setPayerName(contactName);
  }, [contactName]);

  useEffect(() => {
    setLoading(true);
    void loadCharges();
    const refreshInterval = window.setInterval(() => void loadCharges(), 30000);
    const channel = supabase
      .channel(`oxxo-charges-${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'oxxo_charges',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => void loadCharges())
      .subscribe();
    return () => {
      window.clearInterval(refreshInterval);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, loadCharges]);

  const createCharge = async () => {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 10 || parsedAmount > 10000) {
      toast.error('Informe um valor entre 10 e 10.000 MXN');
      return;
    }
    if (payerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
      toast.error('Informe um e-mail válido');
      return;
    }

    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke('oxxo-create', {
        body: { conversationId, amount: parsedAmount, payerName: payerName.trim(), payerEmail: payerEmail.trim() },
      });
      if (error) {
        const details = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
        let message = details;
        try { message = JSON.parse(details)?.error || details; } catch { /* plain-text error */ }
        throw new Error(message);
      }
      if (!data?.success) throw new Error(data?.error || 'Não foi possível gerar o voucher');
      if (!data?.charge) throw new Error('Voucher gerado sem dados para envio');
      await sendVoucher(data.charge as OxxoCharge);
      toast.success('Voucher OXXO gerado e enviado');
      setAmount('');
      setPayerEmail('');
      setOpen(false);
      await loadCharges();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar voucher OXXO');
    } finally {
      setCreating(false);
    }
  };

  const copyReference = async (reference: string) => {
    await navigator.clipboard.writeText(reference);
    toast.success('Referência copiada');
  };

  const sendVoucher = async (charge: OxxoCharge) => {
    if (!charge.reference || !charge.barcode_url || sendingChargeId) return;
    setSendingChargeId(charge.id);
    try {
      await onSendVoucher({
        amount: Number(charge.amount),
        reference: charge.reference,
        barcodeUrl: charge.barcode_url,
      });
      toast.success('Voucher enviado ao lead');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o voucher');
    } finally {
      setSendingChargeId(null);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase text-muted-foreground">
          <ReceiptText className="h-3.5 w-3.5" /> Cobrança OXXO
        </p>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void loadCharges()} title="Atualizar cobranças">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {!open ? (
        <Button variant="secondary" size="sm" className="w-full" onClick={() => setOpen(true)}>
          <ReceiptText className="h-3.5 w-3.5" /> Gerar voucher OXXO
        </Button>
      ) : (
        <div className="space-y-2.5 rounded-lg border border-border bg-background p-3">
          <div>
            <label className="text-[11px] text-muted-foreground">Valor exato em MXN *</label>
            <input type="number" min="10" max="10000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="250.00" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">Nome do pagador</label>
            <input type="text" maxLength={150} value={payerName} onChange={(event) => setPayerName(event.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground">E-mail do pagador</label>
            <input type="email" maxLength={255} value={payerEmail} onChange={(event) => setPayerEmail(event.target.value)} placeholder="cliente@correo.com" className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">O cliente deve pagar o valor exato em uma loja OXXO.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setOpen(false)} disabled={creating}>Cancelar</Button>
            <Button size="sm" className="flex-1" onClick={createCharge} disabled={creating || !amount}>
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Gerar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {!loading && charges.length === 0 && <p className="rounded-lg border border-border bg-background/50 p-3 text-center text-xs text-muted-foreground">Nenhum voucher gerado.</p>}
        {charges.map((charge) => (
          <article key={charge.id} className="overflow-hidden rounded-lg border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold text-foreground">MX$ {Number(charge.amount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
              <span className={`flex items-center gap-1 text-[10px] font-semibold ${charge.status === 'confirmed' ? 'text-success' : charge.status === 'failed' ? 'text-destructive' : 'text-warning'}`}>
                {charge.status === 'confirmed' ? <Check className="h-3 w-3" /> : charge.status === 'failed' ? <XCircle className="h-3 w-3" /> : null}
                {statusLabel[charge.status]}
              </span>
            </div>
            <div className="space-y-2 p-3">
              {charge.reference && (
                <div>
                  <p className="text-[10px] text-muted-foreground">Referência para pagamento</p>
                  <div className="mt-1 flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all text-xs font-semibold text-foreground">{charge.reference}</code>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => void copyReference(charge.reference || '')} title="Copiar referência"><Copy className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              )}
              {charge.barcode_url && <img src={charge.barcode_url} alt="Código de barras OXXO" loading="lazy" className="h-20 w-full rounded-md bg-card object-contain p-2" />}
              {charge.reference && charge.barcode_url && (
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => void sendVoucher(charge)}
                  disabled={sendingChargeId !== null}
                >
                  {sendingChargeId === charge.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {sendingChargeId === charge.id ? 'Enviando...' : 'Reenviar ao lead'}
                </Button>
              )}
              {charge.fee !== null && <p className="text-[10px] text-muted-foreground">Taxa: MX$ {Number(charge.fee).toFixed(2)}</p>}
              {charge.error_message && <p className="text-[10px] text-destructive">{charge.error_message}</p>}
              <p className="text-[10px] text-muted-foreground">{new Date(charge.created_at).toLocaleString('pt-BR')}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}