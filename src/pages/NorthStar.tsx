import { useState, useMemo } from "react";
import { Compass, Plus, Trash2, Pencil, Check, X, Loader2, Import } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useNorthStar, type NorthStarPosition } from "@/hooks/useNorthStar";
import { useIBCurrentWeights, deriveStatus, statusTooltip } from "@/hooks/useIBCurrentWeights";

const statusConfig = {
  build: { label: "Build", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  hold: { label: "Hold", color: "bg-muted text-muted-foreground border-border" },
  reduce: { label: "Reduce", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  exit: { label: "Exit", color: "bg-destructive/20 text-destructive border-destructive/30" },
};

function AlignmentBar({ ticker, current, ideal }: { ticker: string; current: number; ideal: number }) {
  const gap = Math.abs(current - ideal);
  const maxBar = Math.max(current, ideal, 1);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="font-mono">{ticker}</span>
        <span className="text-muted-foreground">
          {current.toFixed(1)}% → {ideal.toFixed(1)}% ({gap > 0 ? (current < ideal ? "+" : "-") : ""}{gap.toFixed(1)}%)
        </span>
      </div>
      <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full bg-primary/40 rounded-full"
          style={{ width: `${(current / maxBar) * 100}%` }}
        />
        <div
          className="absolute top-0 left-0 h-full border-r-2 border-primary"
          style={{ width: `${(ideal / maxBar) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function NorthStar() {
  const {
    portfolio, positions: nsPositions, isLoading, isLoadingPositions,
    createPortfolio, addPosition, updatePosition, deletePosition,
    importFromCurrent, isImporting,
  } = useNorthStar();
  const { weights: ibWeights, cashWeight, totalValue, isLoading: ibLoading } = useIBCurrentWeights();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<NorthStarPosition>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newPos, setNewPos] = useState({
    ticker: "", name: "", target_weight_ideal: "", target_weight_min: "", target_weight_max: "",
    status: "hold" as const, priority: 2, rationale: "",
  });

  // Compute live current weights + derived statuses
  const enrichedPositions = useMemo(() => {
    return nsPositions.map((pos) => {
      const currentWeight = ibWeights[pos.ticker] ?? 0;
      const derived = deriveStatus(currentWeight, pos.target_weight_min, pos.target_weight_max, pos.status);
      const tooltip = statusTooltip(currentWeight, pos.target_weight_min, pos.target_weight_max, derived);
      const inIB = pos.ticker in ibWeights;
      return { ...pos, currentWeight, derivedStatus: derived, statusTooltip: tooltip, inIB };
    });
  }, [nsPositions, ibWeights]);

  // Alignment: % of non-exit positions that are within range (Hold)
  const alignmentData = useMemo(() => {
    if (enrichedPositions.length === 0) return { score: 0, gaps: [], cashNeeded: 0 };

    const nonExit = enrichedPositions.filter((p) => p.derivedStatus !== "exit" && p.status !== "exit");
    const exitPositions = enrichedPositions.filter((p) => p.status === "exit");

    // Non-exit: aligned if within range
    const alignedNonExit = nonExit.filter((p) => p.derivedStatus === "hold").length;

    // Exit: aligned only if current = 0
    const alignedExit = exitPositions.filter((p) => p.currentWeight === 0).length;

    const totalDenom = nonExit.length + exitPositions.length;
    const score = totalDenom > 0 ? Math.round(((alignedNonExit + alignedExit) / totalDenom) * 100) : 0;

    const gaps = enrichedPositions
      .map((p) => ({
        ticker: p.ticker,
        current: p.currentWeight,
        ideal: p.target_weight_ideal ?? 0,
        gap: Math.abs(p.currentWeight - (p.target_weight_ideal ?? 0)),
        status: p.derivedStatus,
      }))
      .sort((a, b) => b.gap - a.gap);

    const cashNeeded = enrichedPositions
      .filter((p) => p.derivedStatus === "build" && p.currentWeight < (p.target_weight_ideal ?? 0))
      .reduce((s, p) => s + (((p.target_weight_ideal ?? 0) - p.currentWeight) / 100) * totalValue, 0);

    return { score, gaps, cashNeeded };
  }, [enrichedPositions, totalValue]);

  const handleImport = async () => {
    // Build mapped positions from IB data
    const mapped = Object.entries(ibWeights).map(([ticker, weight]) => ({
      ticker,
      name: null as string | null,
      weight,
    }));
    await importFromCurrent(mapped);
  };

  const handleStartScratch = async () => {
    await createPortfolio({});
  };

  const handleAddPosition = async () => {
    if (!newPos.ticker.trim()) return;
    await addPosition({
      ticker: newPos.ticker.toUpperCase(),
      name: newPos.name || null,
      target_weight_ideal: parseFloat(newPos.target_weight_ideal) || null,
      target_weight_min: parseFloat(newPos.target_weight_min) || null,
      target_weight_max: parseFloat(newPos.target_weight_max) || null,
      status: newPos.status,
      priority: newPos.priority,
      rationale: newPos.rationale || null,
    });
    setNewPos({ ticker: "", name: "", target_weight_ideal: "", target_weight_min: "", target_weight_max: "", status: "hold", priority: 2, rationale: "" });
    setShowAdd(false);
  };

  const startEdit = (pos: NorthStarPosition) => {
    setEditingId(pos.id);
    setEditForm({
      target_weight_ideal: pos.target_weight_ideal,
      target_weight_min: pos.target_weight_min,
      target_weight_max: pos.target_weight_max,
      status: pos.status,
      priority: pos.priority,
      rationale: pos.rationale,
    });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await updatePosition({ id: editingId, ...editForm });
    setEditingId(null);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!portfolio) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Compass className="w-10 h-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Define your North Star</h1>
        <p className="text-muted-foreground max-w-md mb-8">
          Where do you want your portfolio to be in 3-5 years? Set target weights and statuses for every position.
        </p>
        <div className="flex gap-3">
          <Button onClick={handleImport} disabled={isImporting || Object.keys(ibWeights).length === 0} className="gap-2">
            {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Import className="w-4 h-4" />}
            Import from current portfolio
          </Button>
          <Button variant="outline" onClick={handleStartScratch}>
            Start from scratch
          </Button>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Compass className="w-6 h-6 text-primary" />
            North Star Portfolio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Your target portfolio — where you want to be.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Target positions */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Target Positions</h2>
              <Button size="sm" className="gap-1" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4" /> Add Position
              </Button>
            </div>

            {showAdd && (
              <Card className="border-primary/30">
                <CardContent className="pt-4 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Input placeholder="Ticker" value={newPos.ticker} onChange={(e) => setNewPos({ ...newPos, ticker: e.target.value.toUpperCase() })} className="font-mono" />
                    <Input placeholder="Name" value={newPos.name} onChange={(e) => setNewPos({ ...newPos, name: e.target.value })} />
                    <Input placeholder="Ideal %" type="number" value={newPos.target_weight_ideal} onChange={(e) => setNewPos({ ...newPos, target_weight_ideal: e.target.value })} />
                    <Select value={newPos.status} onValueChange={(v: any) => setNewPos({ ...newPos, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hold">Auto (Build/Hold/Reduce)</SelectItem>
                        <SelectItem value="exit">Exit (manual)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Input placeholder="Min %" type="number" value={newPos.target_weight_min} onChange={(e) => setNewPos({ ...newPos, target_weight_min: e.target.value })} />
                    <Input placeholder="Max %" type="number" value={newPos.target_weight_max} onChange={(e) => setNewPos({ ...newPos, target_weight_max: e.target.value })} />
                    <Input placeholder="Rationale" value={newPos.rationale} onChange={(e) => setNewPos({ ...newPos, rationale: e.target.value })} className="col-span-2" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}><X className="w-4 h-4" /></Button>
                    <Button size="sm" onClick={handleAddPosition}><Check className="w-4 h-4 mr-1" /> Add</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {isLoadingPositions || ibLoading ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}</div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                      <th className="px-3 py-2 text-left">Ticker</th>
                      <th className="px-3 py-2 text-right">Current</th>
                      <th className="px-3 py-2 text-right">Ideal</th>
                      <th className="px-3 py-2 text-right">Range</th>
                      <th className="px-3 py-2 text-center">Status</th>
                      <th className="px-3 py-2 text-left">Rationale</th>
                      <th className="px-3 py-2 text-right w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedPositions.map((pos) => {
                      const isEditing = editingId === pos.id;
                      const sc = statusConfig[pos.derivedStatus];
                      return (
                        <tr key={pos.id} className="border-t border-border hover:bg-secondary/20 transition-colors">
                          <td className="px-3 py-2 font-mono font-medium text-foreground">{pos.ticker}</td>
                          <td className={`px-3 py-2 text-right ${!pos.inIB || pos.status === "exit" ? "text-destructive" : "text-muted-foreground"}`}>
                            {pos.currentWeight.toFixed(1)}%
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isEditing ? (
                              <Input type="number" className="w-16 h-7 text-xs inline" value={editForm.target_weight_ideal ?? ""} onChange={(e) => setEditForm({ ...editForm, target_weight_ideal: parseFloat(e.target.value) || null })} />
                            ) : (
                              <span className="text-foreground">{pos.target_weight_ideal?.toFixed(1) ?? "-"}%</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                            {isEditing ? (
                              <div className="flex gap-1 justify-end">
                                <Input type="number" className="w-14 h-7 text-xs" value={editForm.target_weight_min ?? ""} onChange={(e) => setEditForm({ ...editForm, target_weight_min: parseFloat(e.target.value) || null })} />
                                <Input type="number" className="w-14 h-7 text-xs" value={editForm.target_weight_max ?? ""} onChange={(e) => setEditForm({ ...editForm, target_weight_max: parseFloat(e.target.value) || null })} />
                              </div>
                            ) : (
                              `${pos.target_weight_min?.toFixed(0) ?? "?"}–${pos.target_weight_max?.toFixed(0) ?? "?"}%`
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {isEditing ? (
                              <Select value={editForm.status ?? pos.status} onValueChange={(v: any) => setEditForm({ ...editForm, status: v })}>
                                <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="hold">Auto</SelectItem>
                                  <SelectItem value="exit">Exit</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="outline" className={sc.color}>{sc.label}</Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  {pos.statusTooltip}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                            {isEditing ? (
                              <Input className="h-7 text-xs" value={editForm.rationale ?? ""} onChange={(e) => setEditForm({ ...editForm, rationale: e.target.value })} />
                            ) : (
                              pos.rationale || "—"
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isEditing ? (
                              <div className="flex gap-1 justify-end">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={saveEdit}><Check className="w-3 h-3" /></Button>
                              </div>
                            ) : (
                              <div className="flex gap-1 justify-end">
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(pos)}><Pencil className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deletePosition(pos.id)}><Trash2 className="w-3 h-3" /></Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {nsPositions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No target positions yet. Click "Add Position" to start.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Progress */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Alignment Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 mb-3">
                  <span className="text-4xl font-bold text-primary">{alignmentData.score}%</span>
                  <span className="text-sm text-muted-foreground mb-1">aligned</span>
                </div>
                <Progress value={alignmentData.score} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  Positions within target range / total positions
                </p>
              </CardContent>
            </Card>

            {alignmentData.cashNeeded > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Cash to Reach Target</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-foreground">
                    ${alignmentData.cashNeeded.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Estimated additional investment needed for Build positions
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Position Gaps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {alignmentData.gaps.slice(0, 10).map((g) => (
                  <AlignmentBar key={g.ticker} ticker={g.ticker} current={g.current} ideal={g.ideal} />
                ))}
                {alignmentData.gaps.length === 0 && (
                  <p className="text-sm text-muted-foreground">Add target positions to see gaps</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
