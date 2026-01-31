import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { HelpTooltip } from "@/components/common/HelpTooltip";
import { type UserSettings } from "@/hooks/useSettings";

interface NotificationSectionProps {
  settings: UserSettings;
  onUpdate: (updates: Partial<UserSettings>) => void;
}

export function NotificationSection({ settings, onUpdate }: NotificationSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Notification Preferences</CardTitle>
          <HelpTooltip content="Control how and when you receive alerts about your portfolio." />
        </div>
        <CardDescription>Manage alert and notification settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Label>Email Alerts</Label>
              <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Receive email notifications for critical alerts
            </p>
          </div>
          <Switch
            checked={settings.emailAlerts}
            onCheckedChange={(checked) => onUpdate({ emailAlerts: checked })}
            disabled
          />
        </div>

        <div className="space-y-2">
          <Label>Alert Severity Threshold</Label>
          <Select
            value={settings.alertSeverityThreshold}
            onValueChange={(value: "all" | "warning" | "critical") => 
              onUpdate({ alertSeverityThreshold: value })
            }
          >
            <SelectTrigger className="bg-secondary">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Alerts</SelectItem>
              <SelectItem value="warning">Warnings & Critical Only</SelectItem>
              <SelectItem value="critical">Critical Only</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Filter which alerts appear in your dashboard
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
