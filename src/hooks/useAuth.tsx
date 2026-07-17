import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'supervisor' | 'agent';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: AppRole | null;
  isApproved: boolean;
  isAdmin: boolean;
  isPlatformAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  role: null,
  isApproved: false,
  isAdmin: false,
  isPlatformAdmin: false,
  signOut: async () => {},
});

function clearLocalAuthTokens() {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('sb-') && key.includes('-auth-token')) {
      localStorage.removeItem(key);
    }
  });
}

/** Fetch with timeout + retry */
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, timeoutMs = 5000 }: { retries?: number; timeoutMs?: number } = {}
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
        ),
      ]);
      return result;
    } catch (e) {
      if (attempt === retries) throw e;
      // Wait briefly before retry
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error('fetchWithRetry exhausted');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const currentUserIdRef = useRef<string | null>(null);
  const metaCacheRef = useRef<{ userId: string; role: AppRole; isApproved: boolean; isPlatformAdmin: boolean } | null>(null);
  const fetchingRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let requestId = 0;
    let hasInitialized = false;

    if (window.location.pathname === '/login') {
      clearLocalAuthTokens();
    }

    const resetAuthState = () => {
      setRole(null);
      setIsApproved(false);
      setIsPlatformAdmin(false);
      metaCacheRef.current = null;
    };

    const fetchUserMeta = async (userId: string, showBlockingLoader = false) => {
      // Return cached data if available for same user
      if (metaCacheRef.current?.userId === userId) {
        setRole(metaCacheRef.current.role);
        setIsApproved(metaCacheRef.current.isApproved);
        setIsPlatformAdmin(metaCacheRef.current.isPlatformAdmin);
        if (showBlockingLoader) setLoading(false);
        return;
      }

      // Deduplicate concurrent fetches for the same user
      if (fetchingRef.current === userId) return;
      fetchingRef.current = userId;

      const currentRequestId = ++requestId;

      if (showBlockingLoader) {
        setLoading(true);
      }

      try {
        const metaRes = await fetchWithRetry<any>(
          () => (supabase.rpc as any)('get_current_user_meta'),
          { retries: 1, timeoutMs: 8000 }
        );

        if (!mounted || currentRequestId !== requestId) return;

        if (metaRes.error) {
          console.error('Error fetching user meta:', metaRes.error);
        }

        const meta = Array.isArray(metaRes.data) ? metaRes.data[0] : metaRes.data;
        const approved = meta?.is_approved ?? false;
        setIsApproved(approved);

        const resolvedRole: AppRole = meta?.role ?? 'agent';
        setRole(resolvedRole);
        const platformAdmin = meta?.is_platform_admin === true;
        setIsPlatformAdmin(platformAdmin);

        // Cache the result
        metaCacheRef.current = { userId, role: resolvedRole, isApproved: approved, isPlatformAdmin: platformAdmin };
      } catch (e) {
        if (!mounted || currentRequestId !== requestId) return;
        console.error('Error fetching user meta (after retries):', e);
        // If we have a cached value, use it instead of resetting
        if (metaCacheRef.current?.userId === userId) {
          setRole(metaCacheRef.current.role);
          setIsApproved(metaCacheRef.current.isApproved);
          setIsPlatformAdmin(metaCacheRef.current.isPlatformAdmin);
        } else {
          setRole(null);
          setIsApproved(false);
          setIsPlatformAdmin(false);
        }
      } finally {
        fetchingRef.current = null;
        if (mounted && currentRequestId === requestId && showBlockingLoader) {
          setLoading(false);
        }
      }
    };

    const syncSession = (nextSession: Session | null, options?: { initialize?: boolean; blockUi?: boolean }) => {
      if (!mounted) return;

      const isInitialize = options?.initialize ?? false;
      const blockUi = options?.blockUi ?? false;

      setSession(nextSession);
      currentUserIdRef.current = nextSession?.user?.id ?? null;

      if (!nextSession?.user) {
        requestId += 1;
        resetAuthState();
        if (isInitialize || blockUi) {
          setLoading(false);
        }
        if (isInitialize) {
          hasInitialized = true;
        }
        return;
      }

      void fetchUserMeta(nextSession.user.id, blockUi || !hasInitialized);

      if (isInitialize) {
        hasInitialized = true;
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user?.id ?? null;
      const isBackgroundSessionRefresh =
        event === 'SIGNED_IN' &&
        hasInitialized &&
        nextUserId !== null &&
        nextUserId === currentUserIdRef.current;

      const shouldBlockUi =
        event === 'SIGNED_OUT' ||
        event === 'USER_UPDATED' ||
        (event === 'SIGNED_IN' && !isBackgroundSessionRefresh);

      syncSession(nextSession, { blockUi: shouldBlockUi });
    });

    // Safety timeout: if auth takes too long, stop blocking UI
    const safetyTimeout = setTimeout(() => {
      if (mounted && !hasInitialized) {
        console.warn('Auth initialization timed out, unblocking UI');
        hasInitialized = true;
        setLoading(false);
      }
    }, 4000);

    supabase.auth
      .getSession()
      .then(({ data: { session: currentSession } }) => {
        clearTimeout(safetyTimeout);
        syncSession(currentSession, { initialize: true, blockUi: true });
      })
      .catch((e) => {
        clearTimeout(safetyTimeout);
        console.error('Error fetching session:', e);
        if (mounted) {
          setLoading(false);
          hasInitialized = true;
        }
      });

    return () => {
      mounted = false;
      requestId += 1;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isAdmin = role === 'admin';

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, role, isApproved, isAdmin, isPlatformAdmin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
