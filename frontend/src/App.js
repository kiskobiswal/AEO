import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { BrandProvider, useBrand } from "@/context/BrandContext";
import { Layout } from "@/components/Layout";
import Auth from "@/pages/Auth";
import AdminAuth from "@/pages/AdminAuth";
import Pricing from "@/pages/Pricing";
import Signup from "@/pages/Signup";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import Upgrade from "@/pages/Upgrade";
import Overview from "@/pages/Overview";
import BrandOverview from "@/pages/BrandOverview";
import BrandSetup from "@/pages/BrandSetup";
import Prompts from "@/pages/Prompts";
import DomainAnalysis from "@/pages/DomainAnalysis";
import Visibility from "@/pages/Visibility";
import Citations from "@/pages/Citations";
import Reddit from "@/pages/Reddit";
import BrandConsistency from "@/pages/BrandConsistency";
import PRCoverage from "@/pages/PRCoverage";
import SentimentAnalysis from "@/pages/SentimentAnalysis";
import AiAgent from "@/pages/AiAgent";
import ContentWriter from "@/pages/ContentWriter";
import Optimizer from "@/pages/Dashboard";
import AnalysisDetail from "@/pages/AnalysisDetail";
import History from "@/pages/History";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import Profile from "@/pages/Profile";
import { Toaster } from "@/components/ui/sonner";
import { Loader2 } from "lucide-react";

function Protected({ children, allowInactive = false }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  const admin = user?.full_access;
  const active = user?.entitlements?.is_active;
  if (!admin && !active && !allowInactive) return <Navigate to="/app/upgrade" replace />;
  return <Layout>{children}</Layout>;
}

// First-time user flow: block the /app/* dashboard until at least one brand
// exists. Setup/upgrade/profile routes are exempt so users can complete the
// wizard or manage their account without being locked out.
const SETUP_EXEMPT_PREFIXES = ["/app/brands", "/app/upgrade", "/app/profile"];

function BrandGate({ children }) {
  const { ready, hasAny } = useBrand();
  const location = useLocation();
  if (!ready) return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  const exempt = SETUP_EXEMPT_PREFIXES.some((p) => location.pathname === p || location.pathname.startsWith(p + "/"));
  if (!hasAny && !exempt) return <Navigate to="/app/brands/new?first=1" replace />;
  return children;
}

function DashboardHome() {
  // /app entrypoint: land users on the Brand Overview once setup is done.
  return <Navigate to="/app/overview" replace />;
}

function LoginRoute() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (user) return <Navigate to="/app" replace />;
  return <Auth />;
}

function AdminAuthRoute() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="min-h-screen grid place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  if (user) return <Navigate to="/app" replace />;
  return <AdminAuth />;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrandProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route path="/pricing" element={<Pricing />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/cancel" element={<PaymentCancel />} />
              <Route path="/admin/auth" element={<AdminAuthRoute />} />
              <Route path="/admin/register" element={<AdminAuthRoute />} />
              <Route path="/admin/login" element={<AdminAuthRoute />} />
              <Route path="/admin/reset" element={<AdminAuthRoute />} />

              {/* Setup wizard — no BrandGate so first-run works */}
              <Route path="/app/brands/new" element={<Protected><BrandSetup /></Protected>} />

              {/* Brand-scoped dashboard */}
              <Route path="/app" element={<Protected><BrandGate><DashboardHome /></BrandGate></Protected>} />
              <Route path="/app/overview" element={<Protected><BrandGate><BrandOverview /></BrandGate></Protected>} />
              <Route path="/app/prompts" element={<Protected><BrandGate><Prompts /></BrandGate></Protected>} />
              <Route path="/app/citations" element={<Protected><BrandGate><Citations /></BrandGate></Protected>} />

              {/* GEO */}
              <Route path="/app/domain" element={<Protected><BrandGate><DomainAnalysis /></BrandGate></Protected>} />
              <Route path="/app/citation-analysis" element={<Protected><BrandGate><Citations /></BrandGate></Protected>} />
              <Route path="/app/sentiment" element={<Protected><BrandGate><SentimentAnalysis /></BrandGate></Protected>} />
              <Route path="/app/reddit" element={<Protected><BrandGate><Reddit /></BrandGate></Protected>} />
              <Route path="/app/brand-consistency" element={<Protected><BrandGate><BrandConsistency /></BrandGate></Protected>} />
              <Route path="/app/pr" element={<Protected><BrandGate><PRCoverage /></BrandGate></Protected>} />
              {/* Legacy alias */}
              <Route path="/app/brand" element={<Navigate to="/app/brand-consistency" replace />} />
              <Route path="/app/visibility" element={<Navigate to="/app/prompts" replace />} />

              {/* AEO / Assistant */}
              <Route path="/app/optimizer" element={<Protected><BrandGate><Optimizer /></BrandGate></Protected>} />
              <Route path="/app/content-writer" element={<Protected><BrandGate><ContentWriter /></BrandGate></Protected>} />
              <Route path="/app/agent" element={<Protected><BrandGate><AiAgent /></BrandGate></Protected>} />
              <Route path="/app/history" element={<Protected><BrandGate><History /></BrandGate></Protected>} />
              <Route path="/app/analysis/:id" element={<Protected><BrandGate><AnalysisDetail /></BrandGate></Protected>} />

              {/* Site Audit (renamed from Projects) — still reachable directly for admins/power users */}
              <Route path="/app/site-audit" element={<Protected><BrandGate><Projects /></BrandGate></Protected>} />
              <Route path="/app/site-audit/:id" element={<Protected><BrandGate><ProjectDetail /></BrandGate></Protected>} />
              <Route path="/app/projects" element={<Navigate to="/app/site-audit" replace />} />
              <Route path="/app/projects/:id" element={<Protected><BrandGate><ProjectDetail /></BrandGate></Protected>} />

              {/* Account-management routes are exempt from BrandGate */}
              <Route path="/app/upgrade" element={<Protected allowInactive><Upgrade /></Protected>} />
              <Route path="/app/profile" element={<Protected allowInactive><Profile /></Protected>} />

              <Route path="*" element={<Navigate to="/app" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster position="top-right" richColors />
        </BrandProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
