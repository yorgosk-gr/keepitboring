import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ThesisCheck } from "@/hooks/usePortfolioAnalysis";

interface ThesisComplianceTableProps {
  checks: ThesisCheck[];
}

export function ThesisComplianceTable({ checks }: ThesisComplianceTableProps) {
  const CheckIcon = ({ value }: { value: boolean }) => (
    value 
      ? <CheckCircle2 className="w-5 h-5 text-primary mx-auto" />
      : <XCircle className="w-5 h-5 text-destructive mx-auto" />
  );

  const getDaysColor = (days: number) => {
    if (days <= 30) return "text-primary";
    if (days <= 90) return "text-yellow-500";
    return "text-destructive";
  };

  const getComplianceScore = (check: ThesisCheck) => {
    let score = 0;
    if (check.has_thesis) score++;
    if (check.has_invalidation) score++;
    if (check.bet_type_declared) score++;
    if (check.confidence_set) score++;
    return score;
  };

  return (
    <div className="stat-card">
      <h3 className="text-lg font-semibold text-foreground mb-4">Thesis Compliance</h3>
      
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead className="text-center">Thesis</TableHead>
              <TableHead className="text-center">Invalidation</TableHead>
              <TableHead className="text-center">Bet Type</TableHead>
              <TableHead className="text-center">Confidence</TableHead>
              <TableHead className="text-center">Last Review</TableHead>
              <TableHead className="text-center">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checks.map((check) => {
              const score = getComplianceScore(check);
              return (
                <TableRow key={check.ticker}>
                  <TableCell className="font-medium">{check.ticker}</TableCell>
                  <TableCell><CheckIcon value={check.has_thesis} /></TableCell>
                  <TableCell><CheckIcon value={check.has_invalidation} /></TableCell>
                  <TableCell><CheckIcon value={check.bet_type_declared} /></TableCell>
                  <TableCell><CheckIcon value={check.confidence_set} /></TableCell>
                  <TableCell className="text-center">
                    <span className={getDaysColor(check.days_since_review)}>
                      {check.days_since_review}d ago
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      "font-bold",
                      score === 4 ? "text-primary" :
                      score >= 2 ? "text-yellow-500" : "text-destructive"
                    )}>
                      {score}/4
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {checks.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No positions to check
        </div>
      )}
    </div>
  );
}
