import { useState } from "react";
import { CheckCircle, AlertTriangle, Loader2, ShieldCheck, Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { HelpTooltip } from "@/components/common/HelpTooltip";
import { supabase } from "@/integrations/supabase/client";

export function ApiConfigSection() {
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleTestConnection = async () => {
    setTestStatus("testing");
    setErrorMessage("");
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setTestStatus("error");
        setErrorMessage("You must be logged in to test the AI connection.");
        return;
      }

      // Test by invoking the verify-ticker function with a known ticker
      const { data, error } = await supabase.functions.invoke("verify-ticker", {
        body: { ticker: "AAPL" },
      });

      if (error) {
        setTestStatus("error");
        setErrorMessage(error.message || "Connection test failed");
        return;
      }

      if (data) {
        setTestStatus("success");
      } else {
        setTestStatus("error");
        setErrorMessage("Unexpected response from AI service");
      }
    } catch (err) {
      setTestStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Connection test failed");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">AI Configuration</CardTitle>
          <HelpTooltip content="AI-powered features use a secure, server-side connection. No API keys are exposed to your browser." />
        </div>
        <CardDescription>Status of AI-powered portfolio analysis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-primary/50 bg-primary/5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <AlertDescription className="text-muted-foreground">
            <strong className="text-foreground">Secure Configuration:</strong> All AI requests are processed through secure backend functions. No API keys are stored in your browser.
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Anthropic Claude</p>
              <p className="text-sm text-muted-foreground">Server-side via Supabase Edge Functions</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testStatus === "testing"}
            className="min-w-[140px]"
          >
            {testStatus === "testing" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {testStatus === "success" && <CheckCircle className="w-4 h-4 mr-2 text-primary" />}
            {testStatus === "error" && <AlertTriangle className="w-4 h-4 mr-2 text-destructive" />}
            Test Connection
          </Button>
        </div>

        {testStatus === "success" && (
          <Alert className="border-primary/50 bg-primary/5">
            <CheckCircle className="h-4 w-4 text-primary" />
            <AlertDescription className="text-primary">
              Connection successful! AI analysis is ready to use.
            </AlertDescription>
          </Alert>
        )}

        {testStatus === "error" && (
          <Alert className="border-destructive/50 bg-destructive/5">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-destructive">
              {errorMessage || "Connection failed. Please try again later."}
            </AlertDescription>
          </Alert>
        )}

        <div className="p-3 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Rate Limits:</strong> Maximum 30 AI requests per hour to prevent excessive usage.</p>
              <p><strong>Features Powered by AI:</strong> Screenshot extraction, newsletter analysis, price refresh, portfolio analysis, and intelligence briefs.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
