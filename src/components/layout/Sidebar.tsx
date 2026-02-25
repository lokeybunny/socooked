import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Handshake, FolderKanban, FileText,
  LogOut, ChevronLeft, Menu, MessageSquare, Receipt, FileCode2,
  Mail, Phone, Video, Bot, Link2, Sparkles, CalendarDays, CalendarClock, Layers, Share2,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/customers', icon: Users, label: 'Customers', botIcon: true },
  { to: '/leads', icon: Handshake, label: 'Leads', botIcon: true },
  { to: '/invoices', icon: Receipt, label: 'Invoices', botIcon: true },
  { to: '/messages', icon: Mail, label: 'E-Mail', botIcon: true },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar', botIcon: true },
  { to: '/custom-u', icon: Link2, label: 'Custom-U', botIcon: true },
  { to: '/calendly', icon: CalendarClock, label: 'Calendly', botIcon: true },
  { to: '/meetings', icon: Video, label: 'Meetings', botIcon: true },
  { to: '/dashboard/smm', icon: Share2, label: 'SMM', botIcon: true },
  { to: '/threads', icon: MessageSquare, label: 'Analyze', highlight: true },
  { to: '/content', icon: FileText, label: 'Content', highlight: true },
  { to: '/templates', icon: FileCode2, label: 'Templates', highlight: true },
  { to: '/phone', icon: Phone, label: 'Phone', highlight: true },
  { to: '/previews', icon: Sparkles, label: 'Previews', highlight: true },
  { to: '/landing', icon: Layers, label: 'Landing', highlight: true },
  { to: '/ai-staff', icon: Bot, label: 'AI Staff', highlight: true },
  { to: '/projects', icon: FolderKanban, label: 'Projects', greenItem: true },
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
      // Get the latest read-tracker timestamp (marks when user last "read" emails)
      const { data: readTracker } = await supabase
        .from('communications')
        .select('created_at')
        .eq('provider', 'gmail-read-tracker')
        .order('created_at', { ascending: false })
        .limit(1);

      const lastRead = readTracker?.[0]?.created_at || lastSeenMessagesRef.current;

      // Only check for inbound emails from known customers
      let query = supabase
        .from('communications')
        .select('id, from_address, created_at')
        .eq('type', 'email')
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(5);

      if (lastRead) {
        query = query.gt('created_at', lastRead);
      }

      const { data: recent } = await query;
      if (!recent?.length) return;

      // Cross-check sender addresses against CRM customers
      const senders = recent.map(r => r.from_address).filter(Boolean);
      if (!senders.length) return;

      const { data: matches } = await supabase
        .from('customers')
        .select('email')
        .in('email', senders);

      if (matches && matches.length > 0) {
        setHasNewMessages(true);
      }
    };
    checkNew();

    const channel = supabase
      .channel('sidebar_messages_notif')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'communications' }, (payload) => {
        const row = payload.new as Record<string, unknown>;
        // Only fire for inbound emails, skip read-trackers and outbound
        if (
          row.type === 'email' &&
          row.direction === 'inbound' &&
          row.provider !== 'gmail-read-tracker' &&
          location.pathname !== '/messages'
        ) {
          // Quick check if sender is a known customer
          const sender = row.from_address as string;
          if (sender) {
            supabase
              .from('customers')
              .select('id')
              .eq('email', sender)
              .limit(1)
              .then(({ data }) => {
                if (data && data.length > 0) {
                  setHasNewMessages(true);
                }
              });
          }
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
          {navItems.map(({ to, icon: Icon, label, botIcon, highlight, greenItem }, idx) => {
            const isActive = location.pathname === to;
            const showDot = to === '/messages' && hasNewMessages;
            const nextItem = navItems[idx + 1];
            const isGrouped = botIcon && nextItem?.botIcon;
            return (
              <NavLink
                key={to}
                to={to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-normal transition-colors duration-100",
                  isActive
                    ? "bg-accent text-foreground"
                    : greenItem
                      ? "text-emerald-500 hover:bg-accent hover:text-emerald-400"
                      : highlight
                        ? "text-red-500 hover:bg-accent hover:text-red-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  isGrouped && "mb-0"
                )}
               >
                  <span className="relative shrink-0">
                    <Icon className="h-4.5 w-4.5" />
                    {showDot && (
                      <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-sidebar animate-pulse" />
                    )}
                  </span>
                {!collapsed && (
                  <span className="flex items-center gap-1.5 flex-1">
                    {label}
                    {botIcon && <Bot className="h-3 w-3 text-primary/60" />}
                  </span>
                )}
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
