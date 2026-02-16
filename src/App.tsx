import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Deals from "./pages/Deals";
import Projects from "./pages/Projects";
import Tasks from "./pages/Tasks";
import Content from "./pages/Content";

import Threads from "./pages/Threads";
import Documents from "./pages/Documents";
import Invoices from "./pages/Invoices";
import Signatures from "./pages/Signatures";
import Boards from "./pages/Boards";
import BoardView from "./pages/BoardView";
import Leads from "./pages/Leads";
import EmailPage from "./pages/Email";
import PhonePage from "./pages/Phone";
import PortalSign from "./pages/portal/PortalSign";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/deals" element={<Deals />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/content" element={<Content />} />
            
            <Route path="/threads" element={<Threads />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/signatures" element={<Signatures />} />
            <Route path="/leads" element={<Leads />} />
            <Route path="/email" element={<EmailPage />} />
            <Route path="/phone" element={<PhonePage />} />
            <Route path="/boards" element={<Boards />} />
            <Route path="/boards/:boardId" element={<BoardView />} />
            <Route path="/portal/sign/:threadId" element={<PortalSign />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
