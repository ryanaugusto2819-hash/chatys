import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { ThemeProvider } from "./hooks/useTheme";
import AppLayout from "./components/layout/AppLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Loader2 } from "lucide-react";

// Critical routes loaded eagerly
import ConversationsLayout from "./pages/ConversationsLayout";
import Login from "./pages/Login";

// Lazy loaded routes
const Index = lazy(() => import("./pages/Index"));
const Agents = lazy(() => import("./pages/Agents"));
const Automation = lazy(() => import("./pages/Automation"));
const FlowEditor = lazy(() => import("./pages/FlowEditor"));
const FlowMetrics = lazy(() => import("./pages/FlowMetrics"));
const WebhookMappings = lazy(() => import("./pages/WebhookMappings"));
const AiSettings = lazy(() => import("./pages/AiSettings"));
const Reports = lazy(() => import("./pages/Reports"));
const ManagerAI = lazy(() => import("./pages/ManagerAI"));
const Connections = lazy(() => import("./pages/Connections"));
const UserManagement = lazy(() => import("./pages/UserManagement"));
const PlaceholderPage = lazy(() => import("./pages/PlaceholderPage"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

const LazyFallback = () => (
  <div className="flex h-full items-center justify-center py-20">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <ErrorBoundary>
            <Suspense fallback={<LazyFallback />}>
              <Routes>
                {/* Public routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/pending-approval" element={<PendingApproval />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />

                {/* Protected routes */}
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Index />} />
                  <Route path="/conversations" element={<ConversationsLayout />} />
                  <Route path="/conversations/:id" element={<ConversationsLayout />} />
                  <Route path="/agents" element={<AdminRoute><Agents /></AdminRoute>} />
                  <Route path="/automation" element={<AdminRoute><Automation /></AdminRoute>} />
                  <Route path="/automation/:id" element={<AdminRoute><FlowEditor /></AdminRoute>} />
                  <Route path="/automation/:id/metrics" element={<AdminRoute><FlowMetrics /></AdminRoute>} />
                  <Route path="/webhook-mappings" element={<AdminRoute><WebhookMappings /></AdminRoute>} />
                  <Route path="/ai" element={<AdminRoute><AiSettings /></AdminRoute>} />
                  <Route path="/reports" element={<AdminRoute><Reports /></AdminRoute>} />
                  <Route path="/manager-ai" element={<AdminRoute><ManagerAI /></AdminRoute>} />
                  
                  <Route path="/connections" element={<AdminRoute><Connections /></AdminRoute>} />
                  <Route path="/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
                  <Route path="/settings" element={<AdminRoute><PlaceholderPage title="Configurações" subtitle="Configurar conta e integrações" /></AdminRoute>} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
