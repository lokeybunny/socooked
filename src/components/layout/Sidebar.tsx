import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Handshake, FolderKanban, FileText,
  LogOut, ChevronLeft, Menu, MessageSquare, Receipt,
  Mail, Phone, Video, Bot, Link2, Sparkles, CalendarDays, CalendarClock, Layers, Share2, Search,
  Target, HardHat, Crosshair, Shield, Warehouse, Key, ChevronRight, Megaphone,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

type NavItem = {
  to: string; icon: any; label: string; botIcon?: boolean; highlight?: boolean; divider?: string; green?: boolean; red?: boolean; yellow?: boolean; disabled?: boolean; badge?: number; external?: boolean;
};

type NavGroup = {
  icon: any; label: string; divider?: string; grey?: boolean;
  children: NavItem[];
};

type NavEntry = NavItem | NavGroup;

function isGroup(entry: NavEntry): entry is NavGroup {
  return 'children' in entry;
}

const navEntries: NavEntry[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/customers', icon: Users, label: 'Customers', botIcon: true },
  { to: '/leads', icon: Handshake, label: 'Leads', botIcon: true },
  { to: '/invoices', icon: Receipt, label: 'Invoices', botIcon: true },
  { to: '/messages', icon: Mail, label: 'E-Mail', botIcon: true },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar', botIcon: true },
  { to: '/custom-u', icon: Link2, label: 'Custom-U', botIcon: true },
  { to: '/calendly', icon: CalendarClock, label: 'Calendly', botIcon: true },
  { to: '/meetings', icon: Video, label: 'Meetings', botIcon: true },
  { to: '/content', icon: FileText, label: 'Content', botIcon: true },
  { to: '/ai-staff', icon: Bot, label: 'AI Staff', botIcon: true },
  { to: '/research', icon: Target, label: 'Finder', botIcon: true },
  { to: '/phone', icon: Phone, label: 'Phone', botIcon: true },
  { to: '/funnels', icon: Layers, label: 'Funnels', yellow: true, botIcon: true },
  { to: '/ads', icon: Megaphone, label: 'ADS', botIcon: true },
  { to: '/api-management', icon: Key, label: 'API', botIcon: true },
  {
    icon: Crosshair, label: 'X Promo', grey: true,
    children: [
      { to: '/dashboard/smm', icon: Share2, label: 'SMM', botIcon: true },
      { to: '/shillers', icon: HardHat, label: 'Shillers', botIcon: true },
      { to: '/shillers/raiders', icon: Shield, label: 'Raiders', botIcon: true },
      { to: '/shill-crm', icon: Crosshair, label: 'Shill CRM', botIcon: true },
      { to: '/x-shill', icon: Target, label: 'X Shill', botIcon: true },
    ],
  },
  { to: '/wholesale', icon: Warehouse, label: 'Real Estate', divider: 'Services', green: true },
  { to: '/previews', icon: Sparkles, label: 'Websites', green: true },
  { to: '/videography-hub', icon: Video, label: 'Videography', green: true },
  
  { to: '#', icon: Target, label: 'Crypto', red: true, disabled: true },
];

export function Sidebar() {
  const { signOut, user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [funnelCount, setFunnelCount] = useState(0);
  const lastSeenMessagesRef = useRef<string | null>(null);
  const funnelLastSeenRef = useRef<string | null>(null);

  useEffect(() => {
    lastSeenMessagesRef.current = localStorage.getItem('messages_last_seen');

    const checkNew = async () => {
      const { data: readTracker } = await supabase
        .from('communications')
        .select('created_at')
        .eq('provider', 'gmail-read-tracker')
        .order('created_at', { ascending: false })
        .limit(1);

      const lastRead = readTracker?.[0]?.created_at || lastSeenMessagesRef.current;

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
        if (
          row.type === 'email' &&
          row.direction === 'inbound' &&
          row.provider !== 'gmail-read-tracker' &&
          location.pathname !== '/messages'
        ) {
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
    if (location.pathname === '/funnels') {
      setFunnelCount(0);
      localStorage.setItem('funnels_last_seen', new Date().toISOString());
      funnelLastSeenRef.current = new Date().toISOString();
    }
  }, [location.pathname]);

  // Fetch unseen funnel lead count
  useEffect(() => {
    funnelLastSeenRef.current = localStorage.getItem('funnels_last_seen');
    const fetchFunnelCount = async () => {
      const lastSeen = funnelLastSeenRef.current || '2020-01-01T00:00:00Z';
      // Count customers from funnels (webdesign + videography)
      const { count: custCount } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .in('source', ['webdesign-landing', 'videography-landing'])
        .gt('created_at', lastSeen);
      // Count RE leads
      const { count: reCount } = await supabase
        .from('lw_landing_leads')
        .select('id', { count: 'exact', head: true })
        .not('landing_page_id', 'is', null)
        .gt('created_at', lastSeen);
      setFunnelCount((custCount || 0) + (reCount || 0));
    };
    fetchFunnelCount();
    const interval = setInterval(fetchFunnelCount, 60000);
    return () => clearInterval(interval);
  }, []);

  const renderNavItem = (item: NavItem) => {
    const isActive = location.pathname === item.to;
    const showDot = item.to === '/messages' && hasNewMessages;
    const showFunnelBadge = item.to === '/funnels' && funnelCount > 0;

    if (item.disabled) {
      return (
        <span
          key={item.label}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-normal cursor-default",
            item.red ? "text-destructive/70" : "text-muted-foreground/50",
          )}
        >
          <span className="relative shrink-0">
            <item.icon className="h-4.5 w-4.5" />
          </span>
          {!collapsed && <span className="flex-1">{item.label}</span>}
        </span>
      );
    }

    const linkClasses = cn(
      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-normal transition-colors duration-100",
      isActive
        ? "bg-accent text-foreground"
        : item.red
          ? "text-destructive hover:bg-accent"
          : item.green
            ? "text-emerald-500 hover:bg-accent hover:text-emerald-600 dark:text-emerald-400 dark:hover:text-emerald-300"
            : item.yellow
              ? "text-yellow-500 hover:bg-accent hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300"
              : item.highlight
                ? "text-red-500 hover:bg-accent hover:text-red-600 dark:text-emerald-400 dark:hover:text-emerald-300"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
    );

    const linkContent = (
      <>
        <span className="relative shrink-0">
          <item.icon className="h-4.5 w-4.5" />
          {showDot && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-destructive border-2 border-sidebar animate-pulse" />
          )}
        </span>
        {!collapsed && (
          <span className="flex items-center gap-1.5 flex-1">
            {item.label}
            {item.botIcon && <Bot className="h-3 w-3 text-primary/60" />}
            {showFunnelBadge && (
              <span className="ml-auto bg-yellow-500 text-black text-[10px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                {funnelCount}
              </span>
            )}
          </span>
        )}
      </>
    );

    if (item.external) {
      return (
        <a
          key={item.to}
          href={item.to}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClasses}
        >
          {linkContent}
        </a>
      );
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        className={linkClasses}
      >
        {linkContent}
      </NavLink>
    );
  };

  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [manualClosed, setManualClosed] = useState<string | null>(null);

  const renderGroup = (group: NavGroup) => {
    const isChildActive = group.children.some(c => location.pathname === c.to);
    const isHovered = hoveredGroup === group.label;
    const isExpanded = expandedGroup === group.label;
    const isManuallyClosed = manualClosed === group.label;
    const isOpen = isManuallyClosed ? false : (isChildActive || isHovered || isExpanded);

    return (
      <div
        key={group.label}
        className="space-y-1"
        onMouseEnter={() => !collapsed && setHoveredGroup(group.label)}
        onMouseLeave={() => !collapsed && setHoveredGroup(null)}
      >
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => {
            if (collapsed) {
              setCollapsed(false);
              setExpandedGroup(group.label);
              return;
            }
            setExpandedGroup(prev => prev === group.label ? null : group.label);
          }}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-normal transition-colors duration-100 w-full",
            group.grey
              ? "text-muted-foreground/60 hover:bg-accent hover:text-muted-foreground"
              : isOpen
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <group.icon className="h-4.5 w-4.5 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{group.label}</span>
              <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-90")} />
            </>
          )}
        </button>

        {!collapsed && isOpen && (
          <div className="ml-4 space-y-1 border-l border-border/60 pl-3">
            {group.children.map(child => {
              const isActive = location.pathname === child.to;
              return (
                <NavLink
                  key={child.to}
                  to={child.to}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-100",
                    isActive
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <child.icon className="h-4 w-4 shrink-0" />
                  <span className="flex items-center gap-1.5">
                    {child.label}
                    {child.botIcon && <Bot className="h-3 w-3 text-primary/60" />}
                  </span>
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    );
  };

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
            {collapsed ? "GU" : "GURU"}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navEntries.map((entry) => {
            if (isGroup(entry)) {
              return (
                <div key={entry.label}>
                  {entry.divider && (
                    <div className={cn("flex items-center gap-2 px-3 pt-4 pb-1.5", collapsed && "justify-center")}>
                      {!collapsed && entry.divider.trim() ? (
                        <>
                          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium">{entry.divider}</span>
                          <div className="flex-1 h-px bg-border/40" />
                        </>
                      ) : (
                        <div className="flex-1 h-px bg-border/40" />
                      )}
                    </div>
                  )}
                  {renderGroup(entry)}
                </div>
              );
            }

            const item = entry as NavItem;
            return (
              <div key={item.to}>
                {item.divider && (
                  <div className={cn("flex items-center gap-2 px-3 pt-4 pb-1.5", collapsed && "justify-center")}>
                    {!collapsed && item.divider.trim() ? (
                      <>
                        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 font-medium">{item.divider}</span>
                        <div className="flex-1 h-px bg-border/40" />
                      </>
                    ) : (
                      <div className="flex-1 h-px bg-border/40" />
                    )}
                  </div>
                )}
                {renderNavItem(item)}
              </div>
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
