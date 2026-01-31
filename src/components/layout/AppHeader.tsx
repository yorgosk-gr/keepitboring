import { RefreshCw, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const lastSyncDate = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
      <div>
        <h1 className="text-xl font-semibold text-foreground">YK InvestAgent</h1>
        <p className="text-sm text-muted-foreground">
          Last synced: {lastSyncDate}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full animate-pulse-glow" />
        </Button>
      </div>
    </header>
  );
}
