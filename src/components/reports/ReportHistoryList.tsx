import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, Trash2, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Report } from "@/hooks/useReports";

interface ReportHistoryListProps {
  reports: Report[];
  onView: (report: Report) => void;
  onDelete: (id: string) => void;
  isDeleting: boolean;
}

export function ReportHistoryList({ reports, onView, onDelete, isDeleting }: ReportHistoryListProps) {
  if (reports.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <p>No reports generated yet</p>
        <p className="text-sm mt-1">Generate your first monthly report above</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => {
        const isPositive = (report.performance_percent ?? 0) >= 0;
        
        return (
          <Card key={report.id} className="hover:bg-accent/50 transition-colors cursor-pointer" onClick={() => onView(report)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-foreground truncate">{report.title}</h4>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(report.created_at), "PPP 'at' p")}
                    </p>
                    {report.summary && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {report.summary}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  {report.performance_percent !== null && (
                    <div className="text-right">
                      <div className={cn(
                        "flex items-center gap-1 font-semibold",
                        isPositive ? "text-primary" : "text-destructive"
                      )}>
                        {isPositive ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        {isPositive ? "+" : ""}{report.performance_percent.toFixed(2)}%
                      </div>
                      <p className="text-xs text-muted-foreground">30-day performance</p>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(report.id);
                    }}
                    disabled={isDeleting}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
