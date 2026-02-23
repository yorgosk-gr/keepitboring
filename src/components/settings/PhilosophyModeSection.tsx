import { Shield, Scale, Flame } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "@/components/common/HelpTooltip";
import type { PortfolioMode } from "@/hooks/useSettings";

interface PhilosophyModeSectionProps {
  currentMode: PortfolioMode;
  onModeChange: (mode: PortfolioMode) => void;
}

const modes: { value: PortfolioMode; label: string; icon: typeof Shield; description: string; details: string }[] = [
  {
    value: "capital_preservation",
    label: "Capital Preservation",
    icon: Shield,
    description: "Prioritise protecting wealth",
    details: "Bonds up to 45% · Gold 3–10% neutral · Conservative rebalancing",
  },
  {
    value: "balanced",
    label: "Balanced",
    icon: Scale,
    description: "Growth with guardrails",
    details: "Bonds 20–35% · Standard allocation targets",
  },
  {
    value: "aggressive",
    label: "Aggressive",
    icon: Flame,
    description: "Maximise long-term growth",
    details: "Bonds 10–25% · Higher equity tolerance",
  },
];

export function PhilosophyModeSection({ currentMode, onModeChange }: PhilosophyModeSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Philosophy Mode</CardTitle>
          <HelpTooltip content="Sets the overall portfolio stance. This influences how allocation rules are interpreted but does not override your explicit hard limits." />
        </div>
        <CardDescription>Choose how aggressively the analysis engine interprets your allocation rules</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {modes.map((mode) => {
            const Icon = mode.icon;
            const isSelected = currentMode === mode.value;
            return (
              <button
                key={mode.value}
                onClick={() => onModeChange(mode.value)}
                className={`relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all hover:border-primary/50 ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card"
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  isSelected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className={`font-semibold text-sm ${isSelected ? "text-primary" : "text-foreground"}`}>
                    {mode.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{mode.description}</p>
                </div>
                <p className="text-[11px] text-muted-foreground/70 leading-tight">{mode.details}</p>
                {isSelected && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
