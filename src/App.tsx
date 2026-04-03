import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { Suspense } from 'react';
import DomainLanding from "./components/DomainLanding";
import { AuthLayoutGate } from "./components/layout/AuthLayoutGate";

// /warren-landing renders the Warren landing page directly
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Leads from "./pages/Leads";

import Tasks from "./pages/Tasks";
import Content from "./pages/Content";
import CustomerUpload from "./pages/CustomerUpload";

import Threads from "./pages/Threads";
import Invoices from "./pages/Invoices";

import EmailPage from "./pages/Email";
import PhonePage from "./pages/Phone";
import PortalSign from "./pages/portal/PortalSign";
import AgreementSign from "./pages/portal/AgreementSign";
import Notifications from "./pages/Notifications";
import Meetings from "./pages/Meetings";
import MeetingRoom from "./pages/MeetingRoom";
import AIStaff from "./pages/AIStaff";
import CustomU from "./pages/CustomU";

import SMM from "./pages/SMM";
import ClientUpload from "./pages/portal/ClientUpload";
import Previews from "./pages/Previews";
import CalendarPage from "./pages/Calendar";
import NotFound from "./pages/NotFound";
import PromptMachine from "./pages/PromptMachine";
import Calendly from "./pages/Calendly";
import LetsMeet from "./pages/LetsMeet";
import ManageBooking from "./pages/ManageBooking";
import SharedContent from "./pages/SharedContent";
import Research from "./pages/Research";
import ThankYou from "./pages/ThankYou";
import WarrenLanding from "./pages/WarrenLanding";
import BundlerDocs from "./pages/BundlerDocs";
import Vanities from "./pages/Vanities";
import ReplyEngine from "./pages/ReplyEngine";
import Raiders from "./pages/Raiders";
import ShillCRM from "./pages/ShillCRM";
import ShillTeam from "./pages/ShillTeam";
import XShill from "./pages/XShill";
import Wholesale from "./pages/Wholesale";
import ApiManagement from "./pages/ApiManagement";
import Ads from "./pages/Ads";
import SellerLanding from "./pages/SellerLanding";
import VideographyLanding from "./pages/VideographyLanding";
import WebDesignLanding from "./pages/WebDesignLanding";
import Pricing from "./pages/Pricing";
import Terms from "./pages/Terms";
import ClientLogin from "./pages/ClientLogin";
import ClientDashboard from "./pages/ClientDashboard";

import { ResearchLoopProvider } from "./hooks/useResearchLoop";
import { LeadLoopProvider } from "./hooks/useLeadLoop";
import { YelpLoopProvider } from "./hooks/useYelpLoop";
import { GMapsLoopProvider } from "./hooks/useGMapsLoop";

const queryClient = new QueryClient();

/** Gate that redirects restricted users to /research */
function RestrictedGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.email === 'warren@guru.com') return <Navigate to="/research" replace />;
  // brucemillis786@gmail.com now has full admin access (same as warren)
  return <>{children}</>;
}

/** Gate that only allows warren@stu25.com */
function WarrenOnlyGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center min-h-screen bg-background"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>;
  if (user?.email !== 'warren@stu25.com') return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

/** Gate for phone page — allow phone-only users */
function PhoneGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <ResearchLoopProvider>
    <LeadLoopProvider>
    <YelpLoopProvider>
    <GMapsLoopProvider>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Suspense fallback={null}><DomainLanding /></Suspense>} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<RestrictedGate><Dashboard /></RestrictedGate>} />
            <Route path="/dash" element={<RestrictedGate><Dashboard /></RestrictedGate>} />
            <Route path="/customers" element={<RestrictedGate><Customers /></RestrictedGate>} />
            <Route path="/leads" element={<RestrictedGate><Leads /></RestrictedGate>} />
            
            <Route path="/tasks" element={<RestrictedGate><Tasks /></RestrictedGate>} />
            <Route path="/content" element={<RestrictedGate><Content /></RestrictedGate>} />
            <Route path="/content/upload/:customerId" element={<RestrictedGate><CustomerUpload /></RestrictedGate>} />
            
            <Route path="/threads" element={<RestrictedGate><Threads /></RestrictedGate>} />
            <Route path="/invoices" element={<RestrictedGate><Invoices /></RestrictedGate>} />
            
            <Route path="/messages" element={<RestrictedGate><EmailPage /></RestrictedGate>} />
            <Route path="/phone" element={<PhonePage />} />
            <Route path="/portal/sign/:threadId" element={<PortalSign />} />
            <Route path="/sign/agreement/:documentId" element={<AgreementSign />} />
            <Route path="/notifications" element={<RestrictedGate><Notifications /></RestrictedGate>} />
            <Route path="/meetings" element={<RestrictedGate><Meetings /></RestrictedGate>} />
            <Route path="/meet/:roomCode" element={<MeetingRoom />} />
            <Route path="/calendar" element={<RestrictedGate><CalendarPage /></RestrictedGate>} />
            <Route path="/ai-staff" element={<RestrictedGate><AIStaff /></RestrictedGate>} />
            <Route path="/custom-u" element={<RestrictedGate><CustomU /></RestrictedGate>} />
            <Route path="/landing" element={<RestrictedGate><CustomU /></RestrictedGate>} />
            <Route path="/dashboard/smm" element={<RestrictedGate><SMM /></RestrictedGate>} />
            <Route path="/previews" element={<RestrictedGate><Previews /></RestrictedGate>} />
            <Route path="/u/:token" element={<ClientUpload />} />
            <Route path="/prompt-machine" element={<RestrictedGate><PromptMachine /></RestrictedGate>} />
            <Route path="/calendly" element={<RestrictedGate><Calendly /></RestrictedGate>} />
            <Route path="/letsmeet" element={<LetsMeet />} />
            <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
            <Route path="/shared/:token" element={<SharedContent />} />
            <Route path="/research" element={<Research />} />
            <Route path="/thankyou" element={<ThankYou />} />
            <Route path="/warren-landing" element={<WarrenLanding />} />
            <Route path="/warren-guru" element={<WarrenLanding />} />
            <Route path="/bundler-docs" element={<BundlerDocs />} />
            <Route path="/bundler-docs/:slug" element={<BundlerDocs />} />
            <Route path="/vanities" element={<Vanities />} />
            <Route path="/shillers" element={<AuthLayoutGate><ReplyEngine /></AuthLayoutGate>} />
            <Route path="/shillers/raiders" element={<AuthLayoutGate><Raiders /></AuthLayoutGate>} />
            <Route path="/shill-crm" element={<RestrictedGate><AuthLayoutGate><ShillCRM /></AuthLayoutGate></RestrictedGate>} />
            <Route path="/reply-engine" element={<Navigate to="/shillers" replace />} />
            <Route path="/raiders" element={<Navigate to="/shillers/raiders" replace />} />
            <Route path="/shillteam" element={<ShillTeam />} />
            <Route path="/x-shill" element={<RestrictedGate><AuthLayoutGate><XShill /></AuthLayoutGate></RestrictedGate>} />
            <Route path="/wholesale" element={<WarrenOnlyGate><AuthLayoutGate><Wholesale /></AuthLayoutGate></WarrenOnlyGate>} />
            <Route path="/sell/:slug" element={<SellerLanding />} />
            <Route path="/api-management" element={<WarrenOnlyGate><AuthLayoutGate><ApiManagement /></AuthLayoutGate></WarrenOnlyGate>} />
            <Route path="/ads" element={<WarrenOnlyGate><AuthLayoutGate><Ads /></AuthLayoutGate></WarrenOnlyGate>} />
            {/* pricing route removed */}
            <Route path="/videography" element={<VideographyLanding />} />
            <Route path="/webdesign" element={<WebDesignLanding />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/client-login" element={<Navigate to="/auth" replace />} />
            <Route path="/client-dashboard" element={<ClientDashboard />} />
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </GMapsLoopProvider>
    </YelpLoopProvider>
    </LeadLoopProvider>
    </ResearchLoopProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
