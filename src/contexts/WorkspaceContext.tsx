import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Workspace {
  id: string;
  name: string;
  country: string;
  role: string;
  is_active: boolean;
  slug: string;
  logo_url: string | null;
  plan_name: string;
  plan_slug: string;
  status: string;
}

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  loading: boolean;
  switchWorkspace: (workspaceId: string) => void;
  refetchWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  currentWorkspace: null,
  loading: true,
  switchWorkspace: () => {},
  refetchWorkspaces: async () => {},
});

const STORAGE_KEY = 'aiox_workspace_id';

const COUNTRY_FLAGS: Record<string, string> = {
  BR: '🇧🇷',
  UY: '🇺🇾',
};

export function getCountryFlag(country: string): string {
  return COUNTRY_FLAGS[country] ?? '🌐';
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkspaces = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspace(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await (supabase.rpc as any)('get_user_workspaces');
      if (error) throw error;

      const list = (data || []) as Workspace[];
      setWorkspaces(list);

      if (list.length === 0) {
        setCurrentWorkspace(null);
        setLoading(false);
        return;
      }

      // Restore previously selected workspace (per user)
      const storedId = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
      const stored = list.find((w) => w.id === storedId);

      if (stored) {
        setCurrentWorkspace(stored);
      } else {
        // Default to first workspace
        setCurrentWorkspace(list[0]);
        localStorage.setItem(`${STORAGE_KEY}_${user.id}`, list[0].id);
      }
    } catch (e) {
      console.error('Error fetching workspaces:', e);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const switchWorkspace = useCallback(
    (workspaceId: string) => {
      const target = workspaces.find((w) => w.id === workspaceId);
      if (!target || !user) return;
      setCurrentWorkspace(target);
      localStorage.setItem(`${STORAGE_KEY}_${user.id}`, workspaceId);
    },
    [workspaces, user]
  );

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        currentWorkspace,
        loading,
        switchWorkspace,
        refetchWorkspaces: fetchWorkspaces,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export const useWorkspace = () => useContext(WorkspaceContext);
