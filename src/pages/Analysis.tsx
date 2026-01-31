import { BarChart3 } from "lucide-react";

export default function Analysis() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <BarChart3 className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">Analysis</h1>
      <p className="text-muted-foreground max-w-md">
        Advanced portfolio analytics, risk metrics, and performance attribution will appear here.
      </p>
    </div>
  );
}
