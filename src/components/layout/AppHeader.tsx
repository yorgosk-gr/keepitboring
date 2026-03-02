import { useState } from "react";
import { LogOut, BookOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const [showLogDecision, setShowLogDecision] = useState(false);
  const { setIsOpen } = useGlobalSearch();
  const isMobile = useIsMobile();
  
  const lastSyncDate = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <div className={isMobile ? "pl-12" : ""}>
          <h1 className="text-xl font-semibold text-foreground">YK InvestAgent</h1>
          <p className="text-sm text-muted-foreground">
            Last synced: {lastSyncDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user && !isMobile && (
            <span className="text-sm text-muted-foreground mr-2 hidden md:block">
              {user.email}
            </span>
          )}
          
          {/* Global Search Button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground hidden sm:flex"
            onClick={() => setIsOpen(true)}
          >
            <Search className="w-4 h-4" />
            <span className="hidden lg:inline">Search</span>
            <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border bg-secondary px-1.5 text-xs font-medium">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2 text-muted-foreground hover:text-foreground hidden sm:flex"
            onClick={() => setShowLogDecision(true)}
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden lg:inline">Log Decision</span>
          </Button>
          {user && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="text-muted-foreground hover:text-destructive"
              onClick={signOut}
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          )}
        </div>
      </header>

      <LogDecisionModal 
        open={showLogDecision} 
        onClose={() => setShowLogDecision(false)} 
      />
    </>
  );
}
