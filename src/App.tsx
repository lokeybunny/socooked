import { Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { AuthLayoutGate } from "./components/layout/AuthLayoutGate";
import { AppLoadingScreen } from "@/components/app/AppLoadingScreen";
import { lazyWithRetry } from "@/lib/lazyWithRetry";

const Auth = lazyWithRetry(() => import("./pages/Auth"), "page-auth");
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"), "page-dashboard");
const Customers = lazyWithRetry(() => import("./pages/Customers"), "page-customers");
const Leads = lazyWithRetry(() => import("./pages/Leads"), "page-leads");
const Tasks = lazyWithRetry(() => import("./pages/Tasks"), "page-tasks");
const Content = lazyWithRetry(() => import("./pages/Content"), "page-content");
const CustomerUpload = lazyWithRetry(() => import("./pages/CustomerUpload"), "page-customer-upload");
const Threads = lazyWithRetry(() => import("./pages/Threads"), "page-threads");
const Invoices = lazyWithRetry(() => import("./pages/Invoices"), "page-invoices");
const EmailPage = lazyWithRetry(() => import("./pages/Email"), "page-email");
const PhonePage = lazyWithRetry(() => import("./pages/Phone"), "page-phone");
const PortalSign = lazyWithRetry(() => import("./pages/portal/PortalSign"), "page-portal-sign");
const AgreementSign = lazyWithRetry(() => import("./pages/portal/AgreementSign"), "page-agreement-sign");
const Notifications = lazyWithRetry(() => import("./pages/Notifications"), "page-notifications");
const Meetings = lazyWithRetry(() => import("./pages/Meetings"), "page-meetings");
const MeetingRoom = lazyWithRetry(() => import("./pages/MeetingRoom"), "page-meeting-room");
const AIStaff = lazyWithRetry(() => import("./pages/AIStaff"), "page-ai-staff");
const CustomU = lazyWithRetry(() => import("./pages/CustomU"), "page-custom-u");
const SMM = lazyWithRetry(() => import("./pages/SMM"), "page-smm");
const ClientUpload = lazyWithRetry(() => import("./pages/portal/ClientUpload"), "page-client-upload");
const Previews = lazyWithRetry(() => import("./pages/Previews"), "page-previews");
const CalendarPage = lazyWithRetry(() => import("./pages/Calendar"), "page-calendar");
const NotFound = lazyWithRetry(() => import("./pages/NotFound"), "page-not-found");
const PromptMachine = lazyWithRetry(() => import("./pages/PromptMachine"), "page-prompt-machine");
const Calendly = lazyWithRetry(() => import("./pages/Calendly"), "page-calendly");
const LetsMeet = lazyWithRetry(() => import("./pages/LetsMeet"), "page-lets-meet");
const ManageBooking = lazyWithRetry(() => import("./pages/ManageBooking"), "page-manage-booking");
const SharedContent = lazyWithRetry(() => import("./pages/SharedContent"), "page-shared-content");
const ResearchRoute = lazyWithRetry(() => import("./pages/ResearchRoute"), "page-research-route");
const ThankYou = lazyWithRetry(() => import("./pages/ThankYou"), "page-thank-you");
const ThankYouVideography = lazyWithRetry(() => import("./pages/ThankYouVideography"), "page-thank-you-videography");
const ThankYouSeller = lazyWithRetry(() => import("./pages/ThankYouSeller"), "page-thank-you-seller");
const ThankYouWebDesign = lazyWithRetry(() => import("./pages/ThankYouWebDesign"), "page-thank-you-webdesign");
const WarrenLanding = lazyWithRetry(() => import("./pages/WarrenLanding"), "page-warren-landing");
const BundlerDocs = lazyWithRetry(() => import("./pages/BundlerDocs"), "page-bundler-docs");
const Vanities = lazyWithRetry(() => import("./pages/Vanities"), "page-vanities");
const ReplyEngine = lazyWithRetry(() => import("./pages/ReplyEngine"), "page-reply-engine");
const Raiders = lazyWithRetry(() => import("./pages/Raiders"), "page-raiders");
const ShillCRM = lazyWithRetry(() => import("./pages/ShillCRM"), "page-shill-crm");
const ShillTeam = lazyWithRetry(() => import("./pages/ShillTeam"), "page-shill-team");
const XShill = lazyWithRetry(() => import("./pages/XShill"), "page-x-shill");
const Wholesale = lazyWithRetry(() => import("./pages/Wholesale"), "page-wholesale");
const ArbitragePage = lazyWithRetry(() => import("./pages/Arbitrage"), "page-arbitrage");
const Liquidate = lazyWithRetry(() => import("./pages/Liquidate"), "page-liquidate");
const ApiManagement = lazyWithRetry(() => import("./pages/ApiManagement"), "page-api-management");
const Ads = lazyWithRetry(() => import("./pages/Ads"), "page-ads");
const Funnels = lazyWithRetry(() => import("./pages/Funnels"), "page-funnels");
const SellerLanding = lazyWithRetry(() => import("./pages/SellerLanding"), "page-seller-landing");
const VideographyHub = lazyWithRetry(() => import("./pages/VideographyHub"), "page-videography-hub");
const VideographyLanding = lazyWithRetry(() => import("./pages/VideographyLanding"), "page-videography");
const WebDesignLanding = lazyWithRetry(() => import("./pages/WebDesignLanding"), "page-webdesign");
const Terms = lazyWithRetry(() => import("./pages/Terms"), "page-terms");
const Stream = lazyWithRetry(() => import("./pages/Stream"), "page-stream");
const ClientDashboard = lazyWithRetry(() => import("./pages/ClientDashboard"), "page-client-dashboard");
const Crypto = lazyWithRetry(() => import("./pages/Crypto"), "page-crypto");
const Store = lazyWithRetry(() => import("./pages/Store"), "page-store");
const StoreProduct = lazyWithRetry(() => import("./pages/StoreProduct"), "page-store-product");
const AIGen = lazyWithRetry(() => import("./pages/AIGen"), "page-ai-gen");

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RestrictedGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.email === "warren@guru.com") return <Navigate to="/research" replace />;
  return <>{children}</>;
}

function WarrenOnlyGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoadingScreen label="Loading account…" />;
  if (user?.email !== "warren@stu25.com") return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

/* cache-bust: v2 */
const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<AppLoadingScreen />}>
              <Routes>
                <Route path="/" element={<WarrenLanding />} />
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
                <Route path="/funnels" element={<WarrenOnlyGate><Funnels /></WarrenOnlyGate>} />
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
                <Route path="/research" element={<ResearchRoute />} />
                <Route path="/thankyou" element={<ThankYou />} />
                <Route path="/thankyou-videography" element={<ThankYouVideography />} />
                <Route path="/thankyou-seller" element={<ThankYouSeller />} />
                <Route path="/thankyou-webdesign" element={<ThankYouWebDesign />} />
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
                <Route path="/arbitrage" element={<WarrenOnlyGate><AuthLayoutGate><ArbitragePage /></AuthLayoutGate></WarrenOnlyGate>} />
                <Route path="/sell/:slug" element={<SellerLanding />} />
                <Route path="/api-management" element={<WarrenOnlyGate><AuthLayoutGate><ApiManagement /></AuthLayoutGate></WarrenOnlyGate>} />
                <Route path="/ads" element={<WarrenOnlyGate><AuthLayoutGate><Ads /></AuthLayoutGate></WarrenOnlyGate>} />
                <Route path="/videography-hub" element={<WarrenOnlyGate><AuthLayoutGate><VideographyHub /></AuthLayoutGate></WarrenOnlyGate>} />
                <Route path="/videography" element={<VideographyLanding />} />
                <Route path="/webdesign" element={<WebDesignLanding />} />
                <Route path="/liquidate" element={<Liquidate />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/stream" element={<Stream />} />
                <Route path="/crypto" element={<WarrenOnlyGate><AuthLayoutGate><Crypto /></AuthLayoutGate></WarrenOnlyGate>} />
                <Route path="/client-login" element={<Navigate to="/auth" replace />} />
                <Route path="/client-dashboard" element={<ClientDashboard />} />
                <Route path="/store" element={<Store />} />
                <Route path="/shop" element={<Navigate to="/store" replace />} />
                <Route path="/store/:id" element={<StoreProduct />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
