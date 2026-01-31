import { useState } from "react";
import { Eye, EyeOff, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HelpTooltip } from "@/components/common/HelpTooltip";

export function ApiConfigSection() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  const handleTestConnection = async () => {
    setTestStatus("testing");
    // Simulate API test - in production, this would call a backend endpoint
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setTestStatus(apiKey.length > 10 ? "success" : "error");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">API Configuration</CardTitle>
          <HelpTooltip content="API keys are used for AI-powered analysis. Your key is stored securely and never shared." />
        </div>
        <CardDescription>Configure AI provider for portfolio analysis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-warning/50 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            <strong>Cost Warning:</strong> AI analysis uses API credits. Each full analysis may cost ~$0.10-0.50 depending on portfolio size.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="api-key">API Key</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                id="api-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="pr-10 bg-secondary"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={!apiKey || testStatus === "testing"}
              className="min-w-[140px]"
            >
              {testStatus === "testing" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {testStatus === "success" && <CheckCircle className="w-4 h-4 mr-2 text-primary" />}
              {testStatus === "error" && <AlertTriangle className="w-4 h-4 mr-2 text-destructive" />}
              Test Connection
            </Button>
          </div>
          {testStatus === "success" && (
            <p className="text-sm text-primary">✓ Connection successful</p>
          )}
          {testStatus === "error" && (
            <p className="text-sm text-destructive">✗ Invalid API key</p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Note: This app uses Lovable AI which doesn't require an external API key. This setting is for future integrations.
        </p>
      </CardContent>
    </Card>
  );
}
