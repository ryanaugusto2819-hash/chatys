import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, Clock, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export default function PendingApproval() {
  const navigate = useNavigate();
  const { signOut, user, loading, isApproved } = useAuth();

  useEffect(() => {
    if (!loading && isApproved) {
      navigate('/', { replace: true });
    }
  }, [isApproved, loading, navigate]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const checkApproval = async () => {
      const { data, error } = await (supabase.rpc as any)('get_current_user_meta');
      if (cancelled || error) return;

      const meta = Array.isArray(data) ? data[0] : data;
      if (meta?.is_approved === true) {
        window.location.replace('/');
      }
    };

    void checkApproval();
    const intervalId = window.setInterval(checkApproval, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [user]);

  if (loading || isApproved) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Headphones className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">ZapDesk</h1>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm space-y-4">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-warning/10">
            <Clock className="h-8 w-8 text-warning" />
          </div>
          <h2 className="text-lg font-semibold text-card-foreground">Conta pendente de aprovação</h2>
          <p className="text-sm text-muted-foreground">
            Sua conta <span className="font-medium text-foreground">{user?.email}</span> foi criada com sucesso, mas precisa ser aprovada por um administrador antes de acessar a plataforma.
          </p>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 rounded-xl bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
