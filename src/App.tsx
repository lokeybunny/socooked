import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Leads from "./pages/Deals";
import Projects from "./pages/Projects";
import Tasks from "./pages/Tasks";
import Content from "./pages/Content";
import CustomerUpload from "./pages/CustomerUpload";

import Threads from "./pages/Threads";
import Invoices from "./pages/Invoices";
import Templates from "./pages/Templates";
import EmailPage from "./pages/Email";
import PhonePage from "./pages/Phone";
import PortalSign from "./pages/portal/PortalSign";
import Notifications from "./pages/Notifications";
import Meetings from "./pages/Meetings";
import MeetingRoom from "./pages/MeetingRoom";
import AIStaff from "./pages/AIStaff";
import CustomU from "./pages/CustomU";
import LandingPages from "./pages/LandingPages";
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
import LeadFinder from "./pages/LeadFinder";
import { ResearchLoopProvider } from "./hooks/useResearchLoop";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <ResearchLoopProvider>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/content" element={<Content />} />
            <Route path="/content/upload/:customerId" element={<CustomerUpload />} />
            
            <Route path="/threads" element={<Threads />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/messages" element={<EmailPage />} />
            <Route path="/phone" element={<PhonePage />} />
            <Route path="/portal/sign/:threadId" element={<PortalSign />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/meetings" element={<Meetings />} />
            <Route path="/meet/:roomCode" element={<MeetingRoom />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/ai-staff" element={<AIStaff />} />
            <Route path="/custom-u" element={<CustomU />} />
            <Route path="/landing" element={<LandingPages />} />
            <Route path="/dashboard/smm" element={<SMM />} />
            <Route path="/previews" element={<Previews />} />
            <Route path="/u/:token" element={<ClientUpload />} />
            <Route path="/prompt-machine" element={<PromptMachine />} />
            <Route path="/calendly" element={<Calendly />} />
            <Route path="/letsmeet" element={<LetsMeet />} />
            <Route path="/manage-booking/:bookingId" element={<ManageBooking />} />
            <Route path="/shared/:token" element={<SharedContent />} />
            <Route path="/research" element={<Research />} />
            <Route path="/lead-finder" element={<LeadFinder />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </ResearchLoopProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
