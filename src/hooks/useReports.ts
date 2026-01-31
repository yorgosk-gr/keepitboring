import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePositions } from "./usePositions";
import { usePhilosophyRules } from "./usePhilosophyRules";
import { useDecisionLogs } from "./useDecisionLogs";
import { toast } from "sonner";
import { format, subDays, startOfMonth } from "date-fns";

export interface Report {
  id: string;
  user_id: string;
  created_at: string;
  report_month: string;
  title: string;
  content: string;
  summary: string | null;
  portfolio_value_start: number | null;
  portfolio_value_end: number | null;
  performance_percent: number | null;
}

export function useReports() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { positions } = usePositions();
  const { rules, evaluateRule } = usePhilosophyRules();
  const { decisions } = useDecisionLogs();
  const [currentReport, setCurrentReport] = useState<{ content: string; title: string } | null>(null);

  // Fetch report history
  const reportsQuery = useQuery({
    queryKey: ["reports", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Report[];
    },
    enabled: !!user,
  });

  // Fetch 30-day data for report
  const fetchReportData = async () => {
    const thirtyDaysAgo = subDays(new Date(), 30);

    // Get portfolio snapshots for value comparison
    const { data: snapshots } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .limit(2);

    const currentValue = positions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
    const previousValue = snapshots?.[1]?.total_value ?? snapshots?.[0]?.total_value ?? currentValue;

    // Get newsletters count
    const { count: newslettersCount } = await supabase
      .from("newsletters")
      .select("*", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgo.toISOString());

    // Get recent insights
    const { data: insights } = await supabase
      .from("insights")
      .select(`*, newsletters (source_name)`)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(10);

    // Get alerts
    const { data: alerts } = await supabase
      .from("alerts")
      .select("*")
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    // Evaluate rules compliance
    const rulesCompliance = rules
      .filter((r) => r.is_active)
      .map((rule) => {
        const result = evaluateRule(rule);
        return {
          name: rule.name,
          type: rule.rule_type,
          status: result.status,
          message: result.message,
        };
      });

    const monthYear = format(new Date(), "MMMM yyyy");

    return {
      positions,
      portfolioValueStart: previousValue,
      portfolioValueEnd: currentValue,
      newslettersCount: newslettersCount ?? 0,
      insights: insights?.map((i) => ({
        type: i.insight_type,
        content: i.content,
        sentiment: i.sentiment,
        source: (i.newsletters as any)?.source_name,
        tickers: i.tickers_mentioned,
      })) ?? [],
      alerts: alerts?.map((a) => ({
        type: a.alert_type,
        severity: a.severity,
        message: a.message,
        resolved: a.resolved,
      })) ?? [],
      decisions: decisions.slice(0, 10).map((d) => ({
        action: d.action_type,
        ticker: d.position_ticker,
        reasoning: d.reasoning?.substring(0, 200),
        confidence: d.confidence_level,
      })),
      rulesCompliance,
      monthYear,
    };
  };

  // Generate report mutation
  const generateMutation = useMutation({
    mutationFn: async () => {
      const reportData = await fetchReportData();

      const { data, error } = await supabase.functions.invoke("generate-report", {
        body: reportData,
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      return {
        ...data,
        portfolioValueStart: reportData.portfolioValueStart,
        portfolioValueEnd: reportData.portfolioValueEnd,
      };
    },
    onSuccess: (data) => {
      setCurrentReport({ content: data.content, title: data.title });
      toast.success("Report generated successfully");
    },
    onError: (error) => {
      console.error("Report generation failed:", error);
      toast.error("Failed to generate report: " + error.message);
    },
  });

  // Save report mutation
  const saveMutation = useMutation({
    mutationFn: async (reportData: {
      content: string;
      title: string;
      summary?: string;
      portfolioValueStart?: number;
      portfolioValueEnd?: number;
    }) => {
      const performancePercent = reportData.portfolioValueStart && reportData.portfolioValueEnd
        ? ((reportData.portfolioValueEnd - reportData.portfolioValueStart) / reportData.portfolioValueStart) * 100
        : null;

      const { data, error } = await supabase.from("reports").insert({
        user_id: user!.id,
        report_month: startOfMonth(new Date()).toISOString().split("T")[0],
        title: reportData.title,
        content: reportData.content,
        summary: reportData.summary || null,
        portfolio_value_start: reportData.portfolioValueStart || null,
        portfolio_value_end: reportData.portfolioValueEnd || null,
        performance_percent: performancePercent,
      }).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Report saved to history");
    },
    onError: (error) => {
      toast.error("Failed to save report: " + error.message);
    },
  });

  // Delete report mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Report deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete report: " + error.message);
    },
  });

  return {
    reports: reportsQuery.data ?? [],
    isLoadingReports: reportsQuery.isLoading,
    currentReport,
    setCurrentReport,
    generateReport: generateMutation.mutate,
    isGenerating: generateMutation.isPending,
    generatedData: generateMutation.data,
    saveReport: saveMutation.mutate,
    isSaving: saveMutation.isPending,
    deleteReport: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    hasData: positions.length > 0,
  };
}
