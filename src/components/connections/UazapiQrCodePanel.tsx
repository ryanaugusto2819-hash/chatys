import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, QrCode, RefreshCw, Smartphone, Wifi } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

interface Props { configId: string; onConnected: () => void }

export default function UazapiQrCodePanel({ configId, onConnected }: Props) {
  const [state, setState] = useState<'checking' | 'waiting' | 'connected' | 'error'>('checking');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => { if (timer.current) clearInterval(timer.current); timer.current = null; }, []);
  const invoke = useCallback(async (action: 'status' | 'connect' | 'set_webhook') => {
    const { data, error: invokeError } = await supabase.functions.invoke('uazapigo-manager', { body: { configId, action } });
    if (invokeError || (data as any)?.error) throw new Error((data as any)?.error || invokeError?.message);
    return data as any;
  }, [configId]);
  const check = useCallback(async () => {
    try {
      const data = await invoke('status');
      if (['connected', 'open'].includes(String(data.state).toLowerCase())) {
        setState('connected'); setQrCode(null); setError(''); stop(); onConnected(); return true;
      }
      setState('waiting'); return false;
    } catch (e) { setState('error'); setError(e instanceof Error ? e.message : String(e)); return false; }
  }, [invoke, onConnected, stop]);
  const connect = useCallback(async () => {
    setState('checking'); setError('');
    try {
      await invoke('set_webhook');
      const data = await invoke('connect');
      const qr = data.qrcode;
      setQrCode(qr && !String(qr).startsWith('data:') ? `data:image/png;base64,${qr}` : qr || null);
      setState('waiting');
    } catch (e) { setState('error'); setError(e instanceof Error ? e.message : String(e)); }
  }, [invoke]);

  useEffect(() => {
    void (async () => { if (!(await check())) await connect(); })();
    timer.current = setInterval(() => void check(), 5000);
    return stop;
  }, [check, connect, stop]);

  return <div className="flex flex-col items-center gap-4 py-4">
    <div className="inline-flex items-center gap-2 rounded-full bg-muted px-4 py-1.5 text-xs font-semibold text-muted-foreground">
      {state === 'checking' && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando...</>}
      {state === 'connected' && <><Wifi className="h-3.5 w-3.5 text-primary" /> Conectado</>}
      {(state === 'waiting' || state === 'error') && <><QrCode className="h-3.5 w-3.5" /> Aguardando conexão</>}
    </div>
    {qrCode && <div className="rounded-lg border border-border bg-background p-3"><img src={qrCode} alt="QR Code uazapiGO" className="h-56 w-56 object-contain" /></div>}
    {state === 'connected' ? <p className="text-sm text-muted-foreground">WhatsApp conectado pela uazapiGO.</p> : <div className="flex items-center gap-2 text-xs text-muted-foreground"><Smartphone className="h-4 w-4" /> Escaneie no WhatsApp em Dispositivos conectados.</div>}
    {error && <p className="max-w-sm text-center text-xs text-destructive">{error}</p>}
    {state !== 'connected' && <Button type="button" variant="outline" onClick={() => void connect()}><RefreshCw className="h-4 w-4" /> Gerar novo QR Code</Button>}
  </div>;
}