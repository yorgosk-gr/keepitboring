import { useState } from "react";
import { CheckCircle, AlertTriangle, Loader2, ShieldCheck, Info } from "lucide-react";
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
        setErrorMessage("You must be logged in to test the API connection.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("claude-proxy", {
        body: { action: "test" },
      });

      if (error) {
        setTestStatus("error");
        setErrorMessage(error.message || "Connection test failed");
        return;
      }

      if (data?.success) {
        setTestStatus("success");
      } else if (data?.error) {
        setTestStatus("error");
        setErrorMessage(data.error);
      } else {
        setTestStatus("error");
        setErrorMessage("Unexpected response from server");
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
          <HelpTooltip content="AI-powered analysis uses Claude. The API key is stored securely on the server and never exposed to your browser." />
        </div>
        <CardDescription>Status of AI-powered portfolio analysis</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-primary/50 bg-primary/5">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <AlertDescription className="text-muted-foreground">
            <strong className="text-foreground">Secure Configuration:</strong> Your Claude API key is stored as a server-side secret and is never exposed to the browser. All AI requests are processed through secure backend functions.
          </AlertDescription>
        </Alert>

        <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Claude API</p>
              <p className="text-sm text-muted-foreground">Server-side configuration active</p>
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
              {errorMessage || "Connection failed. Please contact the administrator."}
            </AlertDescription>
          </Alert>
        )}

        <Alert className="border-warning/50 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            <strong>Cost Warning:</strong> AI analysis uses API credits. Each full analysis may cost ~$0.10-0.50 depending on portfolio size.
          </AlertDescription>
        </Alert>

        <div className="p-3 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p><strong>Rate Limits:</strong> Maximum 30 AI requests per hour to prevent excessive costs.</p>
              <p><strong>Features Powered by AI:</strong> Screenshot extraction, newsletter analysis, price refresh, portfolio analysis, and monthly reports.</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
