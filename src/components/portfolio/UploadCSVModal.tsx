import { useState, useCallback } from "react";
import { Upload, AlertCircle, AlertTriangle, FileSpreadsheet, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ScreenshotPreviewTable, type ExtractedPosition } from "./ScreenshotPreviewTable";
import { parseIBKRStatement, getAllocationSummary } from "@/lib/ibkrParser";
import { useTickerVerification } from "@/hooks/useTickerVerification";

interface UploadCSVModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

type ProcessingState = "idle" | "verifying" | "preview" | "error";

export function UploadCSVModal({ open, onClose, onImportComplete }: UploadCSVModalProps) {
  const [state, setState] = useState<ProcessingState>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [positions, setPositions] = useState<ExtractedPosition[]>([]);
  const [cashBalances, setCashBalances] = useState<Record<string, number>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { verifyPositions, isVerifying, progress } = useTickerVerification();

  const handleClose = () => {
    setFileName(null);
    setPositions([]);
    setCashBalances({});
    setWarnings([]);
    setState("idle");
    setErrorMessage(null);
    onClose();
  };

  const processFile = async (file: File) => {
    try {
      setFileName(file.name);
      setErrorMessage(null);

      const text = await file.text();
      const portfolio = parseIBKRStatement(text);

      if (portfolio.positions.length === 0) {
        setErrorMessage("No positions found in the CSV file. Make sure this is an IBKR Activity Statement.");
        setState("error");
        return;
      }

      const mapped: ExtractedPosition[] = portfolio.positions.map((p) => ({
        ticker: p.ticker,
        name: p.description || null,
        shares: p.quantity,
        avg_price: p.costPrice,
        current_price: p.closePrice,
        market_value: p.valueUSD,
        pnl: p.unrealizedPL,
        currency: p.currency,
        exchange: null,
        needs_verification: p.assetClass === "Unknown",
        position_type: p.instrumentType === "Stock" ? "stock" as const : "etf" as const,
        category: p.assetClass === "Bonds" ? "bond" as const : p.assetClass === "Commodities" ? "commodity" as const : "equity" as const,
      }));

      setCashBalances({ USD: portfolio.cashUSD });
      setWarnings(portfolio.warnings);

      // Auto-verify positions with empty/blank names
      const needsLookup = mapped.filter((p) => !p.name || !p.name.trim());
      if (needsLookup.length > 0) {
        setState("verifying");
        const toVerify = needsLookup.map((p) => ({
          ticker: p.ticker,
          name: p.name,
          shares: p.shares,
          current_price: p.current_price,
          market_value: p.market_value,
        }));

        const verified = await verifyPositions(toVerify);

        // Enrich mapped positions with verification results
        const enriched = mapped.map((p) => {
          const match = verified.find(
            (v) => v.original_ticker.toUpperCase() === p.ticker.toUpperCase()
          );
          if (!match) return p;
          return {
            ...p,
            name: match.name || p.name,
            needs_verification: match.verification_status === "uncertain",
          } as ExtractedPosition;
        });

        setPositions(enriched);
      } else {
        setPositions(mapped);
      }

      setState("preview");
      toast.success(`Parsed ${mapped.length} positions from CSV`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to parse CSV file");
      setState("error");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
      processFile(file);
    } else {
      toast.error("Please upload a .csv file");
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
      e.target.value = "";
    }
  };

  const handleImportComplete = () => {
    toast.success("Positions imported successfully!");
    onImportComplete();
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className={cn(
        "bg-card border-border",
        state === "preview" ? "max-w-5xl max-h-[90vh] overflow-hidden" : "max-w-2xl"
      )}>
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {state === "preview" ? "Review Extracted Positions" : "Import from Spreadsheet"}
          </DialogTitle>
        </DialogHeader>

        {state !== "preview" && state !== "verifying" ? (
          <div className="space-y-4">
            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className="relative border-2 border-dashed rounded-lg p-8 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 border-border"
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <FileSpreadsheet className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-foreground font-medium">
                    Drag and drop your IBKR CSV file here
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to browse (.csv)
                  </p>
                </div>
              </div>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>

            {/* Error State */}
            {state === "error" && errorMessage && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive font-medium">{errorMessage}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
            </div>
          </div>
        ) : state === "verifying" ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-foreground font-medium">Looking up position names...</p>
            {progress.total > 0 && (
              <div className="w-64 space-y-2">
                <Progress value={(progress.current / progress.total) * 100} className="h-1.5" />
                <p className="text-xs text-muted-foreground text-center">
                  {progress.current} / {progress.total} positions
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 overflow-auto max-h-[calc(90vh-6rem)]">
            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="space-y-2">
                {warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 rounded-lg bg-accent/50 border border-accent">
                    <AlertTriangle className="w-4 h-4 text-accent-foreground shrink-0 mt-0.5" />
                    <p className="text-sm text-muted-foreground">{w}</p>
                  </div>
                ))}
              </div>
            )}

            <ScreenshotPreviewTable
              positions={positions}
              cashBalances={cashBalances}
              onCancel={handleClose}
              onImportComplete={handleImportComplete}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
