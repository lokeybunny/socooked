import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Handshake, FolderKanban, FileText,
  LayoutGrid, LogOut, ChevronLeft, Menu, MessageSquare, Receipt, FileCode2,
  Radar, Mail, Phone, Video, Bot, Link2, Sparkles, CalendarDays, CalendarClock,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/deals', icon: Handshake, label: 'Deals' },
  { to: '/threads', icon: MessageSquare, label: 'Script AI' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/content', icon: FileText, label: 'Content' },
  { to: '/templates', icon: FileCode2, label: 'Templates' },
  { to: '/invoices', icon: Receipt, label: 'Invoices' },
  { to: '/leads', icon: Radar, label: 'Leads' },
  { to: '/messages', icon: Mail, label: 'E-Mail' },
  { to: '/phone', icon: Phone, label: 'Phone' },
  { to: '/boards', icon: LayoutGrid, label: 'Boards' },
  { to: '/meetings', icon: Video, label: 'Meetings' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/custom-u', icon: Link2, label: 'Custom-U' },
  { to: '/previews', icon: Sparkles, label: 'Previews' },
  { to: '/calendly', icon: CalendarClock, label: 'Calendly' },
  { to: '/ai-staff', icon: Bot, label: 'AI Staff' },
];

export function Sidebar() {
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const lastSeenMessagesRef = useRef<string | null>(null);

  useEffect(() => {
    lastSeenMessagesRef.current = localStorage.getItem('messages_last_seen');

    const checkNew = async () => {
      const { data } = await supabase
        .from('communications')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data?.[0] && (!lastSeenMessagesRef.current || data[0].created_at > lastSeenMessagesRef.current)) {
        setHasNewMessages(true);
      }
    };
    checkNew();

    const channel = supabase
      .channel('sidebar_messages_notif')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'communications' }, () => {
        if (location.pathname !== '/messages') {
          setHasNewMessages(true);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (location.pathname === '/messages') {
      setHasNewMessages(false);
      localStorage.setItem('messages_last_seen', new Date().toISOString());
      lastSeenMessagesRef.current = new Date().toISOString();
    }
  }, [location.pathname]);

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-card border border-border md:hidden"
      >
        <Menu className="h-5 w-5 text-foreground" />
      </button>

      <aside
        className={cn(
          "fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-40 transition-all duration-300 flex flex-col",
          collapsed ? "w-16" : "w-60",
          "max-md:translate-x-[-100%] max-md:data-[open=true]:translate-x-0"
        )}
        data-open={!collapsed || undefined}
      >
        {/* Logo */}
        <div className={cn("flex items-center p-4 border-b border-sidebar-border", collapsed && "justify-center")}>
          <span className={cn(
            "text-foreground/70 font-light tracking-[0.15em] uppercase",
            collapsed ? "text-[10px]" : "text-base"
          )}>
            {collapsed ? "ST" : "STU25"}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to;
            const showDot = to === '/messages' && hasNewMessages;
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-normal transition-colors duration-100",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
               >
                  <span className="relative shrink-0">
                    <Icon className="h-4.5 w-4.5" />
                    {showDot && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-sidebar animate-pulse" />
                    )}
                  </span>
                {!collapsed && <span>{label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-sidebar-border space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent w-full transition-colors"
          >
            <ChevronLeft className={cn("h-4 w-4 shrink-0 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && <span>Collapse</span>}
          </button>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive w-full transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Spacer */}
      <div className={cn("hidden md:block shrink-0 transition-all duration-300", collapsed ? "w-16" : "w-60")} />
    </>
  );
}
