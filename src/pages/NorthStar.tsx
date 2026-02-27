import { useState, useMemo, useCallback, useEffect } from "react";
import { Compass, Plus, Trash2, Pencil, Check, X, Loader2, Import, ArrowUpDown, ArrowUp, ArrowDown, DollarSign, CheckCircle2, AlertTriangle } from "lucide-react";
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
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const statusConfig = {
  build: { label: "Build", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  hold: { label: "Hold", color: "bg-muted text-muted-foreground border-border" },
  reduce: { label: "Reduce", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  exit: { label: "Exit", color: "bg-destructive/20 text-destructive border-destructive/30" },
};
export default function NorthStar() {
  const { user } = useAuth();
  const {
    portfolio, positions: nsPositions, isLoading, isLoadingPositions,
    createPortfolio, addPosition, updatePosition, deletePosition,
    importFromCurrent, isImporting, updateCashTarget,
  } = useNorthStar();
  const { weights: ibWeights, cashWeight, totalValue, isLoading: ibLoading } = useIBCurrentWeights();


  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<NorthStarPosition>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [cashTarget, setCashTarget] = useState<{ ideal: string; min: string; max: string }>({ ideal: "10", min: "8", max: "15" });
  const [cashTargetLoaded, setCashTargetLoaded] = useState(false);
  const [editingCash, setEditingCash] = useState(false);
  const [sortKey, setSortKey] = useState<string>("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [newPos, setNewPos] = useState({
    ticker: "", name: "", target_weight_ideal: "", target_weight_min: "", target_weight_max: "",
    status: "hold" as const, priority: 2, rationale: "",
  });

  useEffect(() => {
    if (portfolio && !cashTargetLoaded) {
      setCashTarget({
        ideal: String(portfolio.cash_target_ideal ?? 10),
        min: String(portfolio.cash_target_min ?? 8),
        max: String(portfolio.cash_target_max ?? 15),
      });
      setCashTargetLoaded(true);
    }
  }, [portfolio, cashTargetLoaded]);

  const enrichedPositions = useMemo(() => {
    return nsPositions.map((pos) => {
      const currentWeight = ibWeights[pos.ticker] ?? 0;
      const derived = deriveStatus(currentWeight, pos.target_weight_min, pos.target_weight_max, pos.status);
      const tooltip = statusTooltip(currentWeight, pos.target_weight_min, pos.target_weight_max, derived);
      const inIB = pos.ticker in ibWeights;
      return { ...pos, currentWeight, derivedStatus: derived, statusTooltip: tooltip, inIB };
    });
  }, [nsPositions, ibWeights]);

  const toggleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }, [sortKey]);

  const sortedPositions = useMemo(() => {
    const sorted = [...enrichedPositions];
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sortKey) {
        case "ticker": av = a.ticker; bv = b.ticker; return dir * av.localeCompare(bv);
        case "current": av = a.currentWeight; bv = b.currentWeight; break;
        case "ideal": av = a.target_weight_ideal ?? 0; bv = b.target_weight_ideal ?? 0; break;
        case "range": av = a.target_weight_min ?? 0; bv = b.target_weight_min ?? 0; break;
        case "status": av = a.derivedStatus; bv = b.derivedStatus; return dir * av.localeCompare(bv);
        case "rationale": av = a.rationale ?? ""; bv = b.rationale ?? ""; return dir * (av as string).localeCompare(bv as string);
      }
      return dir * ((av as number) - (bv as number));
    });
    return sorted;
  }, [enrichedPositions, sortKey, sortDir]);

  const rebalancingData = useMemo(() => {
    if (enrichedPositions.length === 0) return { score: 0, totalSells: 0, availableCash: 0, totalFunding: 0, rawTotalBuys: 0, gap: 0, buyScale: 1, scaledBuys: {} as Record<string, number>, scaledSells: {} as Record<string, number>, cashRemaining: 0, scaleBackPositions: [] as { ticker: string; cut: number }[] };

    const rawIdealTotal = enrichedPositions.reduce((s, p) => s + (p.target_weight_ideal ?? 0), 0) + (parseFloat(cashTarget.ideal) || 0);
    const normFactor = rawIdealTotal > 0 ? 100 / rawIdealTotal : 1;

    // Calculate raw diffs per position
    const diffs = enrichedPositions.map((p) => {
      const normalizedIdeal = (p.target_weight_ideal ?? 0) * normFactor;
      const idealUsd = (normalizedIdeal / 100) * totalValue;
      const currentUsd = (p.currentWeight / 100) * totalValue;
      const diff = idealUsd - currentUsd;
      return { ticker: p.ticker, diff, status: p.derivedStatus, currentWeight: p.currentWeight };
    });

    // Sells: reduce + exit positions (diff < 0)
    const sells = diffs.filter((d) => d.diff < 0);
    const totalSells = sells.reduce((s, d) => s + Math.abs(d.diff), 0);

    // Available cash above cash target min
    const cashCurrentUsd = (cashWeight / 100) * totalValue;
    const cashMinUsd = ((parseFloat(cashTarget.min) || 0) * normFactor / 100) * totalValue;
    const availableCash = Math.max(0, cashCurrentUsd - cashMinUsd);

    const totalFunding = totalSells + availableCash;

    // Raw buys: build positions (diff > 0)
    const buys = diffs.filter((d) => d.diff > 0);
    const rawTotalBuys = buys.reduce((s, d) => s + d.diff, 0);

    // Scale buys proportionally to fit within funding
    const buyScale = rawTotalBuys > 0 ? Math.min(1, totalFunding / rawTotalBuys) : 1;

    const scaledBuys: Record<string, number> = {};
    for (const b of buys) {
      scaledBuys[b.ticker] = b.diff * buyScale;
    }
    const scaledSells: Record<string, number> = {};
    for (const s of sells) {
      scaledSells[s.ticker] = s.diff; // sells stay as-is (negative)
    }

    const gap = rawTotalBuys - totalFunding;

    // If gap > 0, show which Build positions to scale back (smallest first)
    const scaleBackPositions = gap > 0
      ? buys
          .sort((a, b) => a.diff - b.diff) // smallest buys first
          .map((b) => ({ ticker: b.ticker, cut: b.diff * (1 - buyScale) }))
          .filter((x) => x.cut > 10)
      : [];

    // Cash remaining after rebalancing
    const totalScaledBuys = Object.values(scaledBuys).reduce((s, v) => s + v, 0);
    const cashRemaining = totalFunding - totalScaledBuys;

    // Alignment score
    const nonExit = enrichedPositions.filter((p) => p.derivedStatus !== "exit" && p.status !== "exit");
    const exitPositions = enrichedPositions.filter((p) => p.status === "exit");
    const alignedNonExit = nonExit.filter((p) => p.derivedStatus === "hold").length;
    const alignedExit = exitPositions.filter((p) => p.currentWeight === 0).length;
    const totalDenom = nonExit.length + exitPositions.length;
    const score = totalDenom > 0 ? Math.round(((alignedNonExit + alignedExit) / totalDenom) * 100) : 0;

    return { score, totalSells, availableCash, totalFunding, rawTotalBuys, gap, buyScale, scaledBuys, scaledSells, cashRemaining, scaleBackPositions };
  }, [enrichedPositions, totalValue, cashWeight, cashTarget]);

  const handleImport = async () => {
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

  const startEdit = (pos: typeof enrichedPositions[0]) => {
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
    if (!editingId || !user) return;
    setIsSavingEdit(true);
    try {
      const editingPos = enrichedPositions.find(p => p.id === editingId);
      if (!editingPos) return;

      await updatePosition({ id: editingId, ...editForm });
      setEditingId(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSavingEdit(false);
    }
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
            ) : (() => {
              const rawIdealSum = enrichedPositions.reduce((s, p) => s + (p.target_weight_ideal ?? 0), 0) + (parseFloat(cashTarget.ideal) || 0);
              const idealNormFactor = rawIdealSum > 0 ? 100 / rawIdealSum : 1;
              return (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-secondary/50 text-muted-foreground text-xs uppercase">
                      {[
                        { key: "ticker", label: "Ticker", align: "text-left" },
                        { key: "current", label: "Current %", align: "text-right" },
                        { key: "currentUsd", label: "Current $", align: "text-right" },
                        { key: "ideal", label: "Ideal %", align: "text-right" },
                        { key: "idealUsd", label: "Ideal $", align: "text-right" },
                        { key: "buySell", label: "Buy/Sell $", align: "text-right" },
                        { key: "range", label: "Range", align: "text-right" },
                        { key: "status", label: "Status", align: "text-center" },
                        { key: "rationale", label: "Rationale", align: "text-left" },
                      ].map((col) => (
                        <th
                          key={col.key}
                          className={`px-3 py-2 ${col.align} cursor-pointer hover:text-foreground transition-colors select-none`}
                          onClick={() => toggleSort(col.key)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {col.label}
                            {sortKey === col.key ? (
                              sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-30" />
                            )}
                          </span>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPositions.map((pos) => {
                      const isEditing = editingId === pos.id;
                      const sc = statusConfig[pos.derivedStatus];
                      return (
                        <>
                          <tr key={pos.id} className="border-t border-border hover:bg-secondary/20 transition-colors">
                            <td className="px-3 py-2 font-mono font-medium text-foreground">
                              {pos.ticker}
                            </td>
                            <td className={`px-3 py-2 text-right ${!pos.inIB || pos.status === "exit" ? "text-destructive" : "text-muted-foreground"}`}>
                              {pos.currentWeight.toFixed(1)}%
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              ${(pos.currentWeight / 100 * totalValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {isEditing ? (
                                <Input type="number" className="w-16 h-7 text-xs inline" value={editForm.target_weight_ideal ?? ""} onChange={(e) => setEditForm({ ...editForm, target_weight_ideal: parseFloat(e.target.value) || null })} />
                              ) : (
                                <span className="text-foreground">{pos.target_weight_ideal?.toFixed(1) ?? "-"}%</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">
                              ${((pos.target_weight_ideal ?? 0) * idealNormFactor / 100 * totalValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            {(() => {
                              const scaledAmount = rebalancingData.scaledBuys[pos.ticker] ?? rebalancingData.scaledSells[pos.ticker] ?? 0;
                              if (Math.abs(scaledAmount) < 1) return <td className="px-3 py-2 text-right text-muted-foreground">—</td>;
                              return (
                                <td className={`px-3 py-2 text-right font-mono text-xs ${scaledAmount > 0 ? "text-emerald-500" : "text-amber-500"}`}>
                                  {scaledAmount > 0 ? "+" : ""}{scaledAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </td>
                              );
                            })()}
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
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={saveEdit} disabled={isSavingEdit}>
                                    {isSavingEdit ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex gap-1 justify-end">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(pos)}><Pencil className="w-3 h-3" /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deletePosition(pos.id)}><Trash2 className="w-3 h-3" /></Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        </>
                      );
                    })}
                    {/* Cash Target Row */}
                    <tr className="border-t border-border bg-secondary/10">
                      <td className="px-3 py-2 font-mono font-medium text-foreground">💵 CASH</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{cashWeight.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        ${(cashWeight / 100 * totalValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {editingCash ? (
                          <Input type="number" className="w-16 h-7 text-xs inline" value={cashTarget.ideal} onChange={(e) => setCashTarget({ ...cashTarget, ideal: e.target.value })} />
                        ) : (
                          <span className="text-foreground">{parseFloat(cashTarget.ideal).toFixed(1)}%</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        ${((parseFloat(cashTarget.ideal) || 0) * idealNormFactor / 100 * totalValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      {(() => {
                        const totalScaledBuys = Object.values(rebalancingData.scaledBuys).reduce((s, v) => s + v, 0);
                        const netCashEffect = rebalancingData.totalSells - totalScaledBuys;
                        if (Math.abs(netCashEffect) < 1) return <td className="px-3 py-2 text-right text-muted-foreground">—</td>;
                        return (
                          <td className={`px-3 py-2 text-right font-mono text-xs ${netCashEffect > 0 ? "text-emerald-500" : "text-amber-500"}`}>
                            {netCashEffect > 0 ? "+" : ""}{netCashEffect.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                        );
                      })()}
                      <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                        {editingCash ? (
                          <div className="flex gap-1 justify-end">
                            <Input type="number" className="w-14 h-7 text-xs" value={cashTarget.min} onChange={(e) => setCashTarget({ ...cashTarget, min: e.target.value })} />
                            <Input type="number" className="w-14 h-7 text-xs" value={cashTarget.max} onChange={(e) => setCashTarget({ ...cashTarget, max: e.target.value })} />
                          </div>
                        ) : (
                          `${parseFloat(cashTarget.min).toFixed(0)}–${parseFloat(cashTarget.max).toFixed(0)}%`
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {(() => {
                          const cs = deriveStatus(cashWeight, parseFloat(cashTarget.min) || 0, parseFloat(cashTarget.max) || 100, null);
                          const sc = statusConfig[cs];
                          return <Badge variant="outline" className={sc.color}>{sc.label}</Badge>;
                        })()}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">Dry powder buffer</td>
                      <td className="px-3 py-2 text-right">
                        {editingCash ? (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={() => { setEditingCash(false); updateCashTarget({ cash_target_ideal: parseFloat(cashTarget.ideal) || 10, cash_target_min: parseFloat(cashTarget.min) || 8, cash_target_max: parseFloat(cashTarget.max) || 15 }); }}><Check className="w-3 h-3" /></Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingCash(true)}><Pencil className="w-3 h-3" /></Button>
                        )}
                      </td>
                    </tr>
                    {/* Total row */}
                    {(() => {
                      const totalCurrentPct = enrichedPositions.reduce((s, p) => s + p.currentWeight, 0) + cashWeight;
                      const totalCurrentUsd = totalCurrentPct / 100 * totalValue;
                      const idealSum = enrichedPositions.reduce((s, p) => s + (p.target_weight_ideal ?? 0), 0) + (parseFloat(cashTarget.ideal) || 0);
                      const isOff = Math.abs(idealSum - 100) > 1;
                      const totalScaledBuys = Object.values(rebalancingData.scaledBuys).reduce((s, v) => s + v, 0);
                      const totalSellsAmount = Object.values(rebalancingData.scaledSells).reduce((s, v) => s + v, 0); // negative
                      const netTotal = totalScaledBuys + totalSellsAmount; // buys positive + sells negative
                      return (
                        <tr className="border-t-2 border-border font-semibold bg-secondary/20">
                          <td className="px-3 py-2 text-foreground">Total</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{totalCurrentPct.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right text-foreground">
                            ${totalCurrentUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className={`px-3 py-2 text-right ${isOff ? "text-amber-400" : "text-foreground"}`}>
                            {idealSum.toFixed(1)}%
                            {isOff && <span className="ml-1 text-xs">⚠️ ≠100%</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-foreground">
                            ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                            {rebalancingData.buyScale < 1 && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="text-amber-400">scaled {Math.round(rebalancingData.buyScale * 100)}%</span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">
                                  Buys scaled to {Math.round(rebalancingData.buyScale * 100)}% to fit within sell proceeds + available cash
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </td>
                          <td className="px-3 py-2" colSpan={4}></td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
                {nsPositions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No target positions yet. Click "Add Position" to start.
                  </div>
                )}
              </div>
              );
            })()}

          </div>

          {/* Right: Progress */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Alignment Score</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 mb-3">
                  <span className="text-4xl font-bold text-primary">{rebalancingData.score}%</span>
                  <span className="text-sm text-muted-foreground mb-1">aligned</span>
                </div>
                <Progress value={rebalancingData.score} className="h-2" />
                <p className="text-xs text-muted-foreground mt-2">
                  Positions within target range / total positions
                </p>
              </CardContent>
            </Card>

            {/* Rebalancing Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Rebalancing Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sell proceeds</span>
                    <span className="font-mono text-foreground">${rebalancingData.totalSells.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Available cash (above min)</span>
                    <span className="font-mono text-foreground">${rebalancingData.availableCash.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5">
                    <span className="text-muted-foreground font-medium">Total funding</span>
                    <span className="font-mono font-medium text-foreground">${rebalancingData.totalFunding.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>

                {rebalancingData.gap <= 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm text-emerald-500 font-medium">Fully funded — rebalancing covers all buys</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ~${rebalancingData.cashRemaining.toLocaleString(undefined, { maximumFractionDigits: 0 })} cash remaining after rebalancing
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span className="text-sm text-amber-500 font-medium">
                        ${rebalancingData.gap.toLocaleString(undefined, { maximumFractionDigits: 0 })} shortfall
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Buys scaled to {Math.round(rebalancingData.buyScale * 100)}%. Reduce targets or sell more.
                    </p>
                    {rebalancingData.scaleBackPositions.length > 0 && (
                      <div className="text-xs space-y-0.5">
                        <span className="text-muted-foreground font-medium">Scale back:</span>
                        {rebalancingData.scaleBackPositions.map((p) => (
                          <div key={p.ticker} className="flex justify-between pl-2">
                            <span className="font-mono">{p.ticker}</span>
                            <span className="text-amber-500">-${p.cut.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
