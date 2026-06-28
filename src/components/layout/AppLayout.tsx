import { useState, useEffect } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import AppSidebar from './AppSidebar';
import logoImg from '@/assets/logo-group-liberty.jpg';

export default function AppLayout() {
  const { session, loading, isApproved } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  // Close drawer on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (!isApproved) return <Navigate to="/pending-approval" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          aria-hidden
        />
      )}

      <AppSidebar mobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col min-w-0 lg:ml-64">
        {/* Mobile top bar */}
        <header
          className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-3 lg:hidden"
          style={{
            background: 'linear-gradient(180deg, #130D1A 0%, #0F0A14 100%)',
            borderColor: 'rgba(124,58,237,0.15)',
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white/80 active:bg-white/10"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <img src={logoImg} alt="" className="h-7 w-7 rounded-md object-cover" />
            <span className="text-sm font-semibold text-white truncate">Group Liberty</span>
          </div>
        </header>

        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
