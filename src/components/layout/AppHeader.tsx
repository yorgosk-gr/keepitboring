import { useState } from "react";
import { RefreshCw, Bell, LogOut, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";

export function AppHeader() {
  const { user, signOut } = useAuth();
  const [showLogDecision, setShowLogDecision] = useState(false);
  
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
        <div>
          <h1 className="text-xl font-semibold text-foreground">YK InvestAgent</h1>
          <p className="text-sm text-muted-foreground">
            Last synced: {lastSyncDate}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <span className="text-sm text-muted-foreground mr-2 hidden md:block">
              {user.email}
            </span>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            className="gap-2 text-muted-foreground hover:text-foreground hidden sm:flex"
            onClick={() => setShowLogDecision(true)}
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden lg:inline">Log Decision</span>
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <RefreshCw className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground relative">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full animate-pulse-glow" />
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
