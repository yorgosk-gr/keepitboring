import { useState } from "react";
import { Loader2, Trash2, AlertCircle, CheckCircle2, AlertTriangle, Info, Check, Search, RefreshCw, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTickerVerification, type VerifiedPosition } from "@/hooks/useTickerVerification";
import { lookupTicker } from "@/lib/tickerReference";

export interface ExtractedPosition {
  ticker: string;
  name: string | null;
  isin?: string | null;
  shares: number | null;
  avg_price: number | null;
  current_price: number | null;
  market_value: number | null;
  pnl: number | null;
  pnl_percent?: number | null;
  currency?: string | null;
  exchange?: string | null;
  source_page?: number;
  needs_verification?: boolean;
}

interface EditablePosition extends ExtractedPosition {
  id: string;
  position_type: "stock" | "etf";
  category: "equity" | "bond" | "commodity";
  selected: boolean;
  verified: boolean;
  originalTicker?: string;
  verification_status?: "confirmed" | "corrected" | "uncertain";
  corrected_ticker?: string;
  verification_notes?: string;
  exchange?: string | null;
}

export interface ExtractionMetadata {
  detected_broker?: string;
  detected_currency?: string;
  extraction_quality?: "good" | "partial" | "poor";
  extraction_notes?: string;
}

interface ScreenshotPreviewTableProps {
  positions: ExtractedPosition[];
  cashBalances?: Record<string, number>;
  totalValue?: number | null;
  metadata?: ExtractionMetadata;
  onCancel: () => void;
  onImportComplete: () => void;
}

// Format currency value
const formatValue = (value: number | null, decimals = 2) => {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

export function ScreenshotPreviewTable({
  positions,
  cashBalances,
  totalValue,
  metadata,
  onCancel,
  onImportComplete,
}: ScreenshotPreviewTableProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const { verifyPositions, verifySinglePosition, isVerifying, progress } = useTickerVerification();

  const [editablePositions, setEditablePositions] = useState<EditablePosition[]>(
    positions.map((p, i) => {
      const lookup = lookupTicker(p.ticker);
      const nameIndicatesETF = p.name ?
        /iShares|Vanguard|SPDR|ETF|UCITS|Index|Tracker|Xtrackers|Amundi|WisdomTree|Invesco/i
          .test(p.name) : false;

      const detectedType = lookup?.type || (nameIndicatesETF ? "etf" : "stock");
      const nameForCategory = (p.name || "").toLowerCase();
      const nameIndicatesCommodity = /\bgold\b|silver|copper|commodit|platinum|palladium|oil\b|crude|natural gas|wheat|corn|soybean|uranium|lithium|nickel|aluminium|aluminum|iron ore|tin\b|zinc\b|lead\b|coal\b/i.test(nameForCategory);
      const nameIndicatesBond = /\bbond\b|treasury|treas\b|gilt|fixed income|iboxx|0-1yr|7-10y|10y|govt|government bond/i.test(nameForCategory);
      const detectedCategory = lookup?.category || (nameIndicatesCommodity ? "commodity" : nameIndicatesBond ? "bond" : "equity");
      const detectedName = p.name && p.name !== "Company name" ? p.name : (lookup?.name || p.name);

      return {
        ...p,
        id: `temp-${i}`,
        name: detectedName,
        position_type: detectedType as "stock" | "etf",
        category: (["equity", "bond", "commodity"].includes(detectedCategory) ? detectedCategory : "equity") as "equity" | "bond" | "commodity",
        selected: true,
        verified: !p.needs_verification,
        originalTicker: p.needs_verification ? p.ticker : undefined,
        exchange: p.exchange || lookup?.exchange || null,
        currency: p.currency || lookup?.currency || null,
      };
    })
  );

  const updatePosition = (id: string, field: keyof EditablePosition, value: unknown) => {
    setEditablePositions((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, [field]: value };
        
        if (field === "shares" || field === "current_price") {
          const shares = field === "shares" ? (value as number) : p.shares;
          const price = field === "current_price" ? (value as number) : p.current_price;
          if (shares !== null && price !== null && price > 0) {
            updated.market_value = Math.round(shares * price * 100) / 100;
          }
        }
        
        return updated;
      })
    );
  };

  const verifyPositionManual = (id: string) => {
    setEditablePositions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, verified: true, needs_verification: false, verification_status: "confirmed" } : p))
    );
  };

  const acceptCorrection = (id: string) => {
    setEditablePositions((prev) =>
      prev.map((p) => {
        if (p.id === id && p.corrected_ticker) {
          return { 
            ...p, 
            ticker: p.corrected_ticker, 
            verified: true, 
            needs_verification: false,
            verification_status: "confirmed"
          };
        }
        return p;
      })
    );
  };

  const keepOriginal = (id: string) => {
    setEditablePositions((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          return { 
            ...p, 
            verified: true, 
            needs_verification: false,
            verification_status: "confirmed",
            corrected_ticker: undefined
          };
        }
        return p;
      })
    );
  };

  const removePosition = (id: string) => {
    setEditablePositions((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleAll = (selected: boolean) => {
    setEditablePositions((prev) => prev.map((p) => ({ ...p, selected })));
  };

  const markAllVerified = () => {
    setEditablePositions((prev) => prev.map((p) => ({
      ...p,
      verified: true,
      needs_verification: false,
      verification_status: "confirmed"
    })));
    toast.success("All positions marked as verified");
  };

  const selectedCount = editablePositions.filter((p) => p.selected).length;
  const unverifiedCount = editablePositions.filter((p) => p.selected && p.needs_verification && !p.verified).length;
  const pendingCorrectionCount = editablePositions.filter(
    (p) => p.selected && p.verification_status === "corrected" && !p.verified
  ).length;

  const canImport = selectedCount > 0 && hasReviewed && pendingCorrectionCount === 0;

  const handleVerifyAll = async () => {
    const positionsToVerify = editablePositions
      .filter(p => p.selected && (p.needs_verification || !p.verified))
      .map(p => ({
        ticker: p.ticker,
        name: p.name,
        isin: p.isin,
        shares: p.shares,
        current_price: p.current_price,
        market_value: p.market_value,
      }));

    if (positionsToVerify.length === 0) {
      toast.info("No positions to verify");
      return;
    }

    const verified = await verifyPositions(positionsToVerify);
    applyVerificationResults(verified);
  };

  const handleVerifySingle = async (id: string) => {
    const pos = editablePositions.find(p => p.id === id);
    if (!pos) return;

    const result = await verifySinglePosition({
      ticker: pos.ticker,
      name: pos.name,
      isin: pos.isin,
      shares: pos.shares,
      current_price: pos.current_price,
      market_value: pos.market_value,
    });

    if (result) {
      applyVerificationResults([result]);
    }
  };

  const applyVerificationResults = (verified: VerifiedPosition[]) => {
    setEditablePositions((prev) =>
      prev.map((p) => {
        const match = verified.find(v => 
          v.original_ticker.toUpperCase() === p.ticker.toUpperCase()
        );
        
        if (!match) return p;

        const wasCorrect = match.verified_ticker.toUpperCase() === p.ticker.toUpperCase();
        
        return {
          ...p,
          name: match.name || p.name,
          position_type: match.asset_type || p.position_type,
          category: (["equity", "bond", "commodity"].includes(match.category) ? match.category : p.category) as "equity" | "bond" | "commodity",
          current_price: match.current_price ?? p.current_price,
          verification_status: match.verification_status,
          verification_notes: match.notes,
          verified: wasCorrect || match.verification_status === "confirmed",
          needs_verification: match.verification_status === "corrected" || match.verification_status === "uncertain",
          corrected_ticker: wasCorrect ? undefined : match.verified_ticker,
        };
      })
    );
  };

  const handleImport = async () => {
    if (!user) {
      toast.error("Please log in to import positions");
      return;
    }

    const toImport = editablePositions.filter((p) => p.selected);
    if (toImport.length === 0) {
      toast.error("Please select at least one position to import");
      return;
    }

    if (unverifiedCount > 0 || pendingCorrectionCount > 0) {
      toast.error("Please verify all positions marked for review");
      return;
    }

    setIsImporting(true);

    try {
      // Delete all existing positions first - new screenshots represent complete portfolio state
      const { error: deleteError } = await supabase
        .from("positions")
        .delete()
        .eq("user_id", user.id);

      if (deleteError) {
        console.error("Failed to clear existing positions:", deleteError);
        toast.error("Failed to clear existing positions");
        setIsImporting(false);
        return;
      }

      const totalMV = toImport.reduce((sum, p) => sum + (p.market_value ?? 0), 0);

      const positionsToInsert = toImport.map((p) => ({
        user_id: user.id,
        ticker: p.ticker.toUpperCase(),
        name: p.name || null,
        position_type: p.position_type,
        category: p.category,
        exchange: p.exchange || null,
        shares: p.shares,
        avg_cost: p.avg_price,
        current_price: p.current_price,
        market_value: p.market_value,
        weight_percent: totalMV > 0 ? ((p.market_value ?? 0) / totalMV) * 100 : 0,
        bet_type: "core",
      }));

      // Insert all new positions in one batch
      const { error: insertError } = await supabase
        .from("positions")
        .insert(positionsToInsert);

      if (insertError) {
        console.error("Failed to insert positions:", insertError);
        toast.error("Failed to import positions");
        setIsImporting(false);
        return;
      }

      const stocksValue = toImport
        .filter((p) => p.position_type === "stock")
        .reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const etfsValue = toImport
        .filter((p) => p.position_type === "etf")
        .reduce((sum, p) => sum + (p.market_value ?? 0), 0);

      await supabase.from("portfolio_snapshots").insert({
        user_id: user.id,
        total_value: totalValue ?? totalMV,
        stocks_percent: totalMV > 0 ? (stocksValue / totalMV) * 100 : 0,
        etfs_percent: totalMV > 0 ? (etfsValue / totalMV) * 100 : 0,
        cash_balance: cashBalances
          ? Object.values(cashBalances).reduce((a, b) => a + b, 0)
          : null,
        data_json: {
          positions: toImport.length,
          cash_balances: cashBalances,
          imported_at: new Date().toISOString(),
          detected_broker: metadata?.detected_broker,
        },
      });

      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });

      onImportComplete();
      navigate("/portfolio");
    } catch (error) {
      toast.error("Failed to import positions. Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const hasIncompleteData = editablePositions.some(
    (p) => p.selected && (p.shares === null || p.market_value === null)
  );

  const needsAttention = unverifiedCount > 0 || pendingCorrectionCount > 0;

  return (
    <div className="space-y-4">
      {/* Header with summary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {metadata?.detected_broker && (
            <Badge variant="secondary" className="gap-1">
              {metadata.detected_broker}
            </Badge>
          )}
          {metadata?.extraction_quality && (
            <Badge 
              variant={metadata.extraction_quality === "good" ? "default" : "outline"}
              className={cn(
                "gap-1",
                metadata.extraction_quality === "good" && "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
                metadata.extraction_quality === "partial" && "border-amber-500/50 text-amber-600",
                metadata.extraction_quality === "poor" && "border-destructive/50 text-destructive"
              )}
            >
              {metadata.extraction_quality === "good" && <CheckCircle2 className="w-3 h-3" />}
              {metadata.extraction_quality === "partial" && <AlertTriangle className="w-3 h-3" />}
              {metadata.extraction_quality === "poor" && <AlertCircle className="w-3 h-3" />}
              {metadata.extraction_quality === "good" ? "Good extraction" : 
               metadata.extraction_quality === "partial" ? "Partial" : "Low quality"}
            </Badge>
          )}
          <span className="text-sm text-muted-foreground">
            {editablePositions.length} positions extracted
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {cashBalances && Object.keys(cashBalances).length > 0 && (
            <span className="text-sm text-muted-foreground">
              Cash: {Object.entries(cashBalances).map(([cur, amt]) => `${cur} ${formatValue(amt, 0)}`).join(" · ")}
            </span>
          )}
        </div>
      </div>

      {/* Extraction notes */}
      {metadata?.extraction_notes && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/50 border border-border">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">{metadata.extraction_notes}</p>
        </div>
      )}

      {/* Verification progress */}
      {isVerifying && (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Verifying positions...
            </span>
            <span className="text-sm text-muted-foreground">
              {progress.current} / {progress.total}
            </span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-1.5" />
        </div>
      )}

      {/* Quick actions bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => toggleAll(true)} className="h-7 px-2 text-xs">
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={() => toggleAll(false)} className="h-7 px-2 text-xs">
            Deselect All
          </Button>
          <span className="text-xs text-muted-foreground">
            {selectedCount} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          {needsAttention && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllVerified}
              className="h-7 px-2 text-xs gap-1"
            >
              <Check className="w-3 h-3" />
              Mark All Verified
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleVerifyAll}
            disabled={isVerifying}
            className="h-7 px-2 text-xs gap-1"
          >
            <Search className="w-3 h-3" />
            Web Verify
          </Button>
        </div>
      </div>

      {/* Warning banner (collapsed) */}
      {(hasIncompleteData || needsAttention) && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-600 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {hasIncompleteData && <span>Some positions have missing data.</span>}
          {needsAttention && !hasIncompleteData && <span>{unverifiedCount + pendingCorrectionCount} position(s) need verification.</span>}
        </div>
      )}

      {/* Compact table with horizontal scroll */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-8 px-2"></TableHead>
                <TableHead className="w-20 px-2">Ticker</TableHead>
                <TableHead className="min-w-[140px] px-2">Name</TableHead>
                <TableHead className="w-16 px-2">Type</TableHead>
                <TableHead className="w-24 px-2">Category</TableHead>
                <TableHead className="w-20 px-2 text-right">Shares</TableHead>
                <TableHead className="w-24 px-2 text-right">Avg Price</TableHead>
                <TableHead className="w-24 px-2 text-right">Current</TableHead>
                <TableHead className="w-28 px-2 text-right">Value</TableHead>
                <TableHead className="w-16 px-2 text-center">Status</TableHead>
                <TableHead className="w-10 px-2"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editablePositions.map((pos) => {
                const isExpanded = expandedRow === pos.id;
                const hasCorrection = pos.verification_status === "corrected" && pos.corrected_ticker;
                const needsReview = (pos.needs_verification && !pos.verified) || hasCorrection;
                
                return (
                  <>
                    <TableRow
                      key={pos.id}
                      className={cn(
                        "border-border cursor-pointer transition-colors",
                        !pos.selected && "opacity-50 bg-muted/30",
                        needsReview && "bg-amber-500/5",
                        isExpanded && "bg-muted/50"
                      )}
                      onClick={() => setExpandedRow(isExpanded ? null : pos.id)}
                    >
                      <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={pos.selected}
                          onCheckedChange={(checked) => updatePosition(pos.id, "selected", checked === true)}
                        />
                      </TableCell>
                      <TableCell className="px-2 font-mono font-semibold text-sm">
                        {hasCorrection ? (
                          <div className="flex items-center gap-1">
                            <span className="line-through text-muted-foreground text-xs">{pos.ticker}</span>
                            <span className="text-primary">{pos.corrected_ticker}</span>
                          </div>
                        ) : (
                          pos.ticker
                        )}
                      </TableCell>
                      <TableCell className="px-2 text-sm truncate max-w-[180px]" title={pos.name || ""}>
                        {pos.name || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="px-2">
                        <Badge variant="outline" className={cn(
                          "text-xs font-normal",
                          pos.position_type === "etf" ? "border-primary/30 text-primary" : "border-muted-foreground/30"
                        )}>
                          {pos.position_type.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2">
                        <Badge variant="outline" className={cn(
                          "text-xs font-normal",
                          pos.category === "equity" && "border-blue-500/30 text-blue-500",
                          pos.category === "bond" && "border-amber-500/30 text-amber-500",
                          pos.category === "commodity" && "border-emerald-500/30 text-emerald-500",
                        )}>
                          {pos.category === "equity" ? "Stock" : pos.category === "bond" ? "Bond" : "Commodity"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-2 text-right text-sm tabular-nums">
                        {formatValue(pos.shares, 0)}
                      </TableCell>
                      <TableCell className="px-2 text-right text-sm tabular-nums">
                        {formatValue(pos.avg_price)}
                      </TableCell>
                      <TableCell className="px-2 text-right text-sm tabular-nums">
                        {formatValue(pos.current_price)}
                      </TableCell>
                      <TableCell className="px-2 text-right font-medium text-sm tabular-nums">
                        {formatValue(pos.market_value, 0)}
                      </TableCell>
                      <TableCell className="px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {pos.verified || pos.verification_status === "confirmed" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                        ) : hasCorrection ? (
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-xs text-emerald-600 hover:text-emerald-700"
                              onClick={() => acceptCorrection(pos.id)}
                            >
                              Accept
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-xs text-muted-foreground"
                              onClick={() => keepOriginal(pos.id)}
                            >
                              Keep
                            </Button>
                          </div>
                        ) : needsReview ? (
                          <div className="flex items-center justify-center gap-1">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-emerald-600 hover:bg-emerald-500/10"
                                    onClick={() => verifyPositionManual(pos.id)}
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Confirm ticker is correct</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-primary hover:bg-primary/10"
                                    onClick={() => handleVerifySingle(pos.id)}
                                    disabled={isVerifying}
                                  >
                                    <Search className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Look up ticker online</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removePosition(pos.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    
                    {/* Expandable edit row */}
                    {isExpanded && (
                      <TableRow key={`${pos.id}-edit`} className="bg-muted/30 border-border">
                        <TableCell colSpan={10} className="p-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Ticker</label>
                              <Input
                                value={pos.ticker}
                                onChange={(e) => updatePosition(pos.id, "ticker", e.target.value)}
                                className="h-8 font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Name</label>
                              <Input
                                value={pos.name || ""}
                                onChange={(e) => updatePosition(pos.id, "name", e.target.value)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Type</label>
                              <Select
                                value={pos.position_type}
                                onValueChange={(v) => updatePosition(pos.id, "position_type", v)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="stock">Stock</SelectItem>
                                  <SelectItem value="etf">ETF</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Category</label>
                              <Select
                                value={pos.category}
                                onValueChange={(v) => updatePosition(pos.id, "category", v)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="equity">Equity</SelectItem>
                                  <SelectItem value="bond">Bond</SelectItem>
                                  <SelectItem value="commodity">Commodity</SelectItem>
                                  <SelectItem value="gold">Gold</SelectItem>
                                  <SelectItem value="country">Country</SelectItem>
                                  <SelectItem value="theme">Theme</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Shares</label>
                              <Input
                                type="number"
                                value={pos.shares ?? ""}
                                onChange={(e) => updatePosition(pos.id, "shares", e.target.value ? parseFloat(e.target.value) : null)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Avg Price</label>
                              <Input
                                type="number"
                                step="0.01"
                                value={pos.avg_price ?? ""}
                                onChange={(e) => updatePosition(pos.id, "avg_price", e.target.value ? parseFloat(e.target.value) : null)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Current Price</label>
                              <Input
                                type="number"
                                step="0.01"
                                value={pos.current_price ?? ""}
                                onChange={(e) => updatePosition(pos.id, "current_price", e.target.value ? parseFloat(e.target.value) : null)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Market Value</label>
                              <Input
                                type="number"
                                step="0.01"
                                value={pos.market_value ?? ""}
                                onChange={(e) => updatePosition(pos.id, "market_value", e.target.value ? parseFloat(e.target.value) : null)}
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Exchange</label>
                              <Input
                                value={pos.exchange || ""}
                                onChange={(e) => updatePosition(pos.id, "exchange", e.target.value || null)}
                                placeholder="LSE, NYSE..."
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Currency</label>
                              <Input
                                value={pos.currency || ""}
                                onChange={(e) => updatePosition(pos.id, "currency", e.target.value || null)}
                                placeholder="USD, GBP..."
                                className="h-8"
                              />
                            </div>
                          </div>
                          {pos.verification_notes && (
                            <p className="mt-2 text-xs text-muted-foreground">{pos.verification_notes}</p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Review checkbox */}
      <div className="flex items-center space-x-2 px-3 py-2 rounded-md bg-muted/30 border border-border">
        <Checkbox
          id="review-confirm"
          checked={hasReviewed}
          onCheckedChange={(checked) => setHasReviewed(checked === true)}
        />
        <label
          htmlFor="review-confirm"
          className="text-sm leading-none cursor-pointer"
        >
          I've reviewed the positions and they look correct
        </label>
      </div>

      {/* Footer actions */}
      <div className="flex justify-between items-center pt-2">
        <div className="text-sm text-muted-foreground">
          {totalValue && (
            <span>Portfolio: ${totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isImporting || isVerifying}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!canImport || isImporting || isVerifying}
            className="gap-2"
          >
            {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
            Import {selectedCount} Position{selectedCount !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
