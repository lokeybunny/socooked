import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Handshake,
  FolderKanban,
  CheckSquare,
  FileText,
  
  LayoutGrid,
  LogOut,
  ChevronLeft,
  Menu,
  MessageSquare,
  File,
  Receipt,
  PenTool,
  Radar,
  Mail,
  Phone,
  Bell,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/deals', icon: Handshake, label: 'Deals' },
  { to: '/threads', icon: MessageSquare, label: 'Threads' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/content', icon: FileText, label: 'Content' },
  { to: '/documents', icon: File, label: 'Documents' },
  { to: '/signatures', icon: PenTool, label: 'Signatures' },
  { to: '/invoices', icon: Receipt, label: 'Invoices' },
  { to: '/leads', icon: Radar, label: 'Leads' },
  { to: '/email', icon: Mail, label: 'Email' },
  { to: '/phone', icon: Phone, label: 'Phone' },
  { to: '/boards', icon: LayoutGrid, label: 'Boards' },
  { to: '/notifications', icon: Bell, label: 'Notifications' },
];

export function Sidebar() {
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const lastSeenRef = useRef<string | null>(null);

  useEffect(() => {
    // Load last seen timestamp from localStorage
    lastSeenRef.current = localStorage.getItem('notifications_last_seen');

    // Check if there are newer entries
    const checkNew = async () => {
      const query = supabase.from('activity_log').select('created_at').order('created_at', { ascending: false }).limit(1);
      const { data } = await query;
      if (data?.[0] && (!lastSeenRef.current || data[0].created_at > lastSeenRef.current)) {
        setHasNewNotification(true);
      }
    };
    checkNew();

    // Realtime: any new insert shows the dot
    const channel = supabase
      .channel('sidebar_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => {
        if (location.pathname !== '/notifications') {
          setHasNewNotification(true);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Clear dot when visiting notifications page
  useEffect(() => {
    if (location.pathname === '/notifications') {
      setHasNewNotification(false);
      localStorage.setItem('notifications_last_seen', new Date().toISOString());
      lastSeenRef.current = new Date().toISOString();
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
        <div className={cn("flex items-center gap-3 p-4 border-b border-sidebar-border", collapsed && "justify-center")}>
          <div className="h-8 w-8 rounded-md bg-foreground flex items-center justify-center shrink-0">
            <span className="text-background font-semibold text-xs tracking-wide">ST</span>
          </div>
          {!collapsed && <span className="font-medium text-foreground text-sm tracking-tight">STU25</span>}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => {
            const isActive = location.pathname === to;
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
                <div className="relative">
                  <Icon className="h-4.5 w-4.5 shrink-0" />
                  {label === 'Notifications' && hasNewNotification && (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-sidebar animate-pulse" />
                  )}
                </div>
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
