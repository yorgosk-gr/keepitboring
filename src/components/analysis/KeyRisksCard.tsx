import { AlertTriangle } from "lucide-react";

interface KeyRisksCardProps {
  risks: string[];
}

export function KeyRisksCard({ risks }: KeyRisksCardProps) {
  if (risks.length === 0) {
    return null;
  }

  return (
    <div className="p-4 rounded-lg border-2 border-yellow-500/50 bg-yellow-500/5">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-5 h-5 text-yellow-500" />
        <h3 className="font-semibold text-yellow-600 dark:text-yellow-400">Key Risks</h3>
      </div>
      <ul className="space-y-2">
        {risks.map((risk, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="text-yellow-500 mt-0.5">•</span>
            <span className="text-foreground">{risk}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
