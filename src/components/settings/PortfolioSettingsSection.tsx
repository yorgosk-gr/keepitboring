import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HelpTooltip } from "@/components/common/HelpTooltip";
import { type UserSettings } from "@/hooks/useSettings";

interface PortfolioSettingsSectionProps {
  settings: UserSettings;
  onUpdate: (updates: Partial<UserSettings>) => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function PortfolioSettingsSection({ settings, onUpdate }: PortfolioSettingsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Portfolio Settings</CardTitle>
          <HelpTooltip content="Configure how your portfolio data is displayed and calculated." />
        </div>
        <CardDescription>Customize display and calculation preferences</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Default Currency</Label>
            <Select
              value={settings.currency}
              onValueChange={(value) => onUpdate({ currency: value })}
            >
              <SelectTrigger className="bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="€">€ Euro</SelectItem>
                <SelectItem value="$">$ US Dollar</SelectItem>
                <SelectItem value="£">£ British Pound</SelectItem>
                <SelectItem value="CHF">CHF Swiss Franc</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Fiscal Year Start</Label>
            <Select
              value={settings.fiscalYearStart.toString()}
              onValueChange={(value) => onUpdate({ fiscalYearStart: parseInt(value) })}
            >
              <SelectTrigger className="bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month, index) => (
                  <SelectItem key={index} value={(index + 1).toString()}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Rebalancing Frequency</Label>
            <Select
              value={settings.rebalancingFrequency}
              onValueChange={(value: "monthly" | "quarterly" | "annually") => 
                onUpdate({ rebalancingFrequency: value })
              }
            >
              <SelectTrigger className="bg-secondary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annually">Annually</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
