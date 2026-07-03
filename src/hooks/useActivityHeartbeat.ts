import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const HEARTBEAT_INTERVAL_MS = 60_000; // 1 min while active
const IDLE_THRESHOLD_MS = 90_000; // stop pinging if no interaction for 90s
const STORAGE_KEY = 'activity_session_id';

function getSessionId(): string {
  let id = sessionStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

/**
 * Sends periodic heartbeats to activity-heartbeat edge function.
 * Server captures the real IP from request headers.
 * Only pings when user is active (interacted within IDLE_THRESHOLD_MS)
 * and the tab is visible.
 */
export function useActivityHeartbeat() {
  const { session } = useAuth();
  const location = useLocation();
  const lastInteractionRef = useRef<number>(Date.now());
  const pendingActionsRef = useRef<number>(0);
  const routeRef = useRef<string>(location.pathname);

  routeRef.current = location.pathname;

  // Track interactions to know if the user is really active
  useEffect(() => {
    const bump = () => {
      lastInteractionRef.current = Date.now();
    };
    const bumpAndCount = () => {
      lastInteractionRef.current = Date.now();
      pendingActionsRef.current += 1;
    };
    window.addEventListener('mousemove', bump, { passive: true });
    window.addEventListener('keydown', bumpAndCount, { passive: true });
    window.addEventListener('click', bumpAndCount, { passive: true });
    window.addEventListener('touchstart', bumpAndCount, { passive: true });
    return () => {
      window.removeEventListener('mousemove', bump);
      window.removeEventListener('keydown', bumpAndCount);
      window.removeEventListener('click', bumpAndCount);
      window.removeEventListener('touchstart', bumpAndCount);
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const sessionId = getSessionId();

    const ping = async (force = false) => {
      const idleFor = Date.now() - lastInteractionRef.current;
      if (!force && (idleFor > IDLE_THRESHOLD_MS || document.hidden)) return;

      const delta = pendingActionsRef.current;
      pendingActionsRef.current = 0;

      try {
        await supabase.functions.invoke('activity-heartbeat', {
          body: {
            session_id: sessionId,
            route: routeRef.current,
            action_delta: delta,
          },
        });
      } catch {
        // swallow — don't want telemetry to break the app
        pendingActionsRef.current += delta;
      }
    };

    // Fire immediately on mount
    ping(true);

    const interval = setInterval(() => ping(false), HEARTBEAT_INTERVAL_MS);

    const onVisible = () => {
      if (!document.hidden) {
        lastInteractionRef.current = Date.now();
        ping(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session]);
}
