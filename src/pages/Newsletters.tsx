import { Newspaper } from "lucide-react";

export default function Newsletters() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Newspaper className="w-8 h-8 text-primary" />
      </div>
      <h1 className="text-2xl font-semibold text-foreground mb-2">Newsletters</h1>
      <p className="text-muted-foreground max-w-md">
        Curated market insights, investment newsletters, and financial news summaries will appear here.
      </p>
    </div>
  );
}
