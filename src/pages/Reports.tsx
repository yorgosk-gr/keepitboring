import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Play, Loader2, AlertCircle, History } from "lucide-react";
import { useReports } from "@/hooks/useReports";
import { ReportViewer } from "@/components/reports/ReportViewer";
import { ReportHistoryList } from "@/components/reports/ReportHistoryList";
import type { Report } from "@/hooks/useReports";

export default function Reports() {
  const {
    reports,
    isLoadingReports,
    currentReport,
    setCurrentReport,
    generateReport,
    isGenerating,
    generatedData,
    saveReport,
    isSaving,
    deleteReport,
    isDeleting,
    hasData,
  } = useReports();

  const [viewingHistoryReport, setViewingHistoryReport] = useState<Report | null>(null);

  const handleGenerate = () => {
    generateReport();
  };

  const handleSave = () => {
    if (currentReport && generatedData) {
      saveReport({
        content: currentReport.content,
        title: currentReport.title,
        summary: generatedData.summary,
        portfolioValueStart: generatedData.portfolioValueStart,
        portfolioValueEnd: generatedData.portfolioValueEnd,
      });
    }
  };

  const handleViewHistoryReport = (report: Report) => {
    setViewingHistoryReport(report);
  };

  const handleBack = () => {
    setCurrentReport(null);
    setViewingHistoryReport(null);
  };

  // Viewing a generated report
  if (currentReport) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated monthly portfolio reports
          </p>
        </div>
        <ReportViewer
          title={currentReport.title}
          content={currentReport.content}
          onBack={handleBack}
          onSave={handleSave}
          isSaving={isSaving}
          showSave={true}
        />
      </div>
    );
  }

  // Viewing a historical report
  if (viewingHistoryReport) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated monthly portfolio reports
          </p>
        </div>
        <ReportViewer
          title={viewingHistoryReport.title}
          content={viewingHistoryReport.content}
          onBack={handleBack}
          showSave={false}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-generated monthly portfolio reports
        </p>
      </div>

      {/* Generate Report Card */}
      <Card>
        <CardHeader className="text-center pb-2">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-xl">Monthly Portfolio Report</CardTitle>
          <CardDescription className="max-w-lg mx-auto">
            Generate a comprehensive report analyzing your portfolio performance, 
            decision quality, and compliance with your investment philosophy over the past 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center pt-4">
          {!hasData && (
            <div className="flex items-center justify-center gap-2 p-4 mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 max-w-md mx-auto">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="text-sm">Add some positions first to generate a meaningful report</span>
            </div>
          )}
          
          <Button 
            size="lg" 
            onClick={handleGenerate}
            disabled={isGenerating || !hasData}
            className="gap-2 px-8"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Generate Monthly Report
              </>
            )}
          </Button>

          <p className="text-xs text-muted-foreground mt-4">
            Reports include: performance review, allocation status, position analysis, 
            decision quality review, and actionable recommendations
          </p>
        </CardContent>
      </Card>

      {/* Report History */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-foreground">Report History</h2>
        </div>

        {isLoadingReports ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ReportHistoryList
            reports={reports}
            onView={handleViewHistoryReport}
            onDelete={deleteReport}
            isDeleting={isDeleting}
          />
        )}
      </div>
    </div>
  );
}
