import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu, X, TrendingUp, PenLine } from "lucide-react";
import {
  Home,
  Briefcase,
  Newspaper,
  BookOpen,
  BarChart3,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

const navItems = [
  { title: "Dashboard", path: "/", icon: Home },
  { title: "Portfolio", path: "/portfolio", icon: Briefcase },
  { title: "Newsletters", path: "/newsletters", icon: Newspaper },
  { title: "Philosophy", path: "/philosophy", icon: BookOpen },
  { title: "Analysis", path: "/analysis", icon: BarChart3 },
  { title: "Journal", path: "/journal", icon: PenLine },
  { title: "Settings", path: "/settings", icon: Settings },
];

function SidebarContent({ collapsed, onNavClick }: { collapsed: boolean; onNavClick?: () => void }) {
  const location = useLocation();

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {navItems.map((item) => {
        const isActive = location.pathname === item.path;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onNavClick}
            className={cn(
              "nav-item",
              isActive && "nav-item-active"
            )}
          >
            <item.icon className={cn("w-5 h-5 flex-shrink-0", isActive && "text-primary")} />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Mobile hamburger menu
  if (isMobile) {
    return (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-4 left-4 z-50 lg:hidden bg-card/80 backdrop-blur-sm border border-border"
          >
            <Menu className="w-5 h-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar border-sidebar-border">
          {/* Logo */}
          <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">KeepItBoring</span>
              <span className="text-xs text-muted-foreground">Personal Portfolio Intelligence</span>
            </div>
          </div>

          <SidebarContent collapsed={false} onNavClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop sidebar
  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out h-screen sticky top-0",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-semibold text-foreground">KeepItBoring</span>
            <span className="text-xs text-muted-foreground">Personal Portfolio Intelligence</span>
          </div>
        )}
      </div>

      <SidebarContent collapsed={collapsed} />

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center p-3 border-t border-sidebar-border text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-5 h-5" />
        ) : (
          <>
            <ChevronLeft className="w-5 h-5 mr-2" />
            <span className="text-sm">Collapse</span>
          </>
        )}
      </button>
    </aside>
  );
}
