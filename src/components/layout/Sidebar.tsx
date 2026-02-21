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
  Receipt,
  FileCode2,
  Radar,
  Mail,
  Phone,
  Video,
  Bot,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/customers', icon: Users, label: 'Customers' },
  { to: '/deals', icon: Handshake, label: 'Deals' },
  { to: '/threads', icon: MessageSquare, label: 'Threads' },
  { to: '/projects', icon: FolderKanban, label: 'Projects' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/content', icon: FileText, label: 'Content' },
  { to: '/templates', icon: FileCode2, label: 'Templates' },
  { to: '/invoices', icon: Receipt, label: 'Invoices' },
  { to: '/leads', icon: Radar, label: 'Leads' },
  { to: '/messages', icon: Mail, label: 'Messages' },
  { to: '/phone', icon: Phone, label: 'Phone' },
  { to: '/boards', icon: LayoutGrid, label: 'Boards' },
  { to: '/meetings', icon: Video, label: 'Meetings' },
  { to: '/ai-staff', icon: Bot, label: 'AI Staff' },
];

export function Sidebar() {
  const { signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

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
                  <Icon className="h-4.5 w-4.5 shrink-0" />
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
