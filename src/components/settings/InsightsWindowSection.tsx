import { Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/common/HelpTooltip";
import type { InsightsWindow } from "@/hooks/useInsightStats";

interface InsightsWindowSectionProps {
  value: InsightsWindow;
  onChange: (value: InsightsWindow) => void;
}

const OPTIONS: { value: InsightsWindow; label: string; description: string }[] = [
  {
    value: "7",
    label: "Last 7 days",
    description: "Recommended for weekly reviews",
  },
  {
    value: "30",
    label: "Last 30 days",
    description: "Recommended for monthly reviews",
  },
  {
    value: "90",
    label: "Last 90 days",
    description: "Quarterly perspective",
  },
  {
    value: "all",
    label: "All time",
    description: "Include all historical insights",
  },
];

export function InsightsWindowSection({
  value,
  onChange,
}: InsightsWindowSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Insights Window
          </CardTitle>
          <HelpTooltip content="Controls which insights are sent to AI during Analysis and Report generation. All newsletters and insights remain in the database for browsing — nothing is deleted." />
        </div>
        <CardDescription>
          Set the time window for insights included in AI analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={value}
          onValueChange={(v) => onChange(v as InsightsWindow)}
          className="space-y-3"
        >
          {OPTIONS.map((option) => (
            <div
              key={option.value}
              className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
            >
              <RadioGroupItem value={option.value} id={option.value} className="mt-0.5" />
              <Label htmlFor={option.value} className="flex-1 cursor-pointer">
                <span className="font-medium">{option.label}</span>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {option.description}
                </p>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
