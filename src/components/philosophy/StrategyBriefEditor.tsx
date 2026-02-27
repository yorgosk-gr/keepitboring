import { useState, useEffect } from "react";
import { Save, Plus, X, Loader2, FileText } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortfolioStrategy, type PositionEntry } from "@/hooks/usePortfolioStrategy";

export function StrategyBriefEditor() {
  const { strategy, isLoading, upsertStrategy, isSaving, seedDefault, isSeeding } = usePortfolioStrategy();

  const [mandate, setMandate] = useState("");
  const [philosophy, setPhilosophy] = useState("");
  const [targetDescription, setTargetDescription] = useState("");
  const [priorities, setPriorities] = useState<string[]>([""]);
  const [positionsToBuild, setPositionsToBuild] = useState<PositionEntry[]>([{ ticker: "", rationale: "" }]);
  const [positionsToExit, setPositionsToExit] = useState<PositionEntry[]>([{ ticker: "", rationale: "" }]);
  const [constraints, setConstraints] = useState("");

  // Seed default on first load
  useEffect(() => {
    if (!isLoading && !strategy && !isSeeding) {
      seedDefault();
    }
  }, [isLoading, strategy, isSeeding]);

  // Populate form when strategy loads
  useEffect(() => {
    if (strategy) {
      setMandate(strategy.mandate || "");
      setPhilosophy(strategy.philosophy || "");
      setTargetDescription(strategy.target_description || "");
      setPriorities(strategy.priorities?.length ? strategy.priorities : [""]);
      setPositionsToBuild(
        (strategy.positions_to_build as PositionEntry[])?.length
          ? (strategy.positions_to_build as PositionEntry[])
          : [{ ticker: "", rationale: "" }]
      );
      setPositionsToExit(
        (strategy.positions_to_exit as PositionEntry[])?.length
          ? (strategy.positions_to_exit as PositionEntry[])
          : [{ ticker: "", rationale: "" }]
      );
      setConstraints(strategy.constraints || "");
    }
  }, [strategy]);

  const handleSave = async () => {
    await upsertStrategy({
      mandate,
      philosophy,
      target_description: targetDescription,
      priorities: priorities.filter((p) => p.trim()),
      positions_to_build: positionsToBuild.filter((p) => p.ticker.trim()),
      positions_to_exit: positionsToExit.filter((p) => p.ticker.trim()),
      constraints,
    });
  };

  if (isLoading || isSeeding) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Last updated */}
      {strategy?.updated_at && (
        <p className="text-xs text-muted-foreground">
          Last updated: {format(new Date(strategy.updated_at), "PPp")}
        </p>
      )}

      {/* Mandate */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Investment Mandate</CardTitle>
          <CardDescription>Your overarching investment goal and time horizon</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={mandate}
            onChange={(e) => setMandate(e.target.value)}
            placeholder="e.g. Long-term wealth building, 10+ year horizon, Balanced risk profile"
            className="min-h-[60px]"
          />
        </CardContent>
      </Card>

      {/* Core Philosophy */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Core Philosophy</CardTitle>
          <CardDescription>Your investment approach in one line</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={philosophy}
            onChange={(e) => setPhilosophy(e.target.value)}
            placeholder="e.g. Index core with high-conviction satellites"
            className="min-h-[60px]"
          />
        </CardContent>
      </Card>

      {/* Target Portfolio Description */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Target Portfolio Description</CardTitle>
          <CardDescription>Describe the intended end state of your portfolio</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={targetDescription}
            onChange={(e) => setTargetDescription(e.target.value)}
            placeholder="e.g. 60% broad market ETFs, 20% theme ETFs, 10% high-conviction stocks, 10% cash"
            className="min-h-[80px]"
          />
        </CardContent>
      </Card>

      {/* Strategic Priorities */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Current Strategic Priorities</CardTitle>
          <CardDescription>Up to 5 bullet points guiding current decisions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {priorities.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={p}
                onChange={(e) => {
                  const next = [...priorities];
                  next[i] = e.target.value;
                  setPriorities(next);
                }}
                placeholder={`Priority ${i + 1}`}
              />
              {priorities.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setPriorities(priorities.filter((_, j) => j !== i))}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
          {priorities.length < 5 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => setPriorities([...priorities, ""])}
            >
              <Plus className="w-3 h-3" /> Add Priority
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Positions to Build */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Positions to Build</CardTitle>
          <CardDescription>Tickers you want to add or increase</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {positionsToBuild.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={p.ticker}
                onChange={(e) => {
                  const next = [...positionsToBuild];
                  next[i] = { ...next[i], ticker: e.target.value.toUpperCase() };
                  setPositionsToBuild(next);
                }}
                placeholder="Ticker"
                className="w-24 font-mono"
              />
              <Input
                value={p.rationale}
                onChange={(e) => {
                  const next = [...positionsToBuild];
                  next[i] = { ...next[i], rationale: e.target.value };
                  setPositionsToBuild(next);
                }}
                placeholder="Rationale"
                className="flex-1"
              />
              {positionsToBuild.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setPositionsToBuild(positionsToBuild.filter((_, j) => j !== i))}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setPositionsToBuild([...positionsToBuild, { ticker: "", rationale: "" }])}
          >
            <Plus className="w-3 h-3" /> Add Ticker
          </Button>
        </CardContent>
      </Card>

      {/* Positions to Exit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Positions to Exit</CardTitle>
          <CardDescription>Tickers you want to reduce or sell</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {positionsToExit.map((p, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={p.ticker}
                onChange={(e) => {
                  const next = [...positionsToExit];
                  next[i] = { ...next[i], ticker: e.target.value.toUpperCase() };
                  setPositionsToExit(next);
                }}
                placeholder="Ticker"
                className="w-24 font-mono"
              />
              <Input
                value={p.rationale}
                onChange={(e) => {
                  const next = [...positionsToExit];
                  next[i] = { ...next[i], rationale: e.target.value };
                  setPositionsToExit(next);
                }}
                placeholder="Rationale & timeline"
                className="flex-1"
              />
              {positionsToExit.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setPositionsToExit(positionsToExit.filter((_, j) => j !== i))}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setPositionsToExit([...positionsToExit, { ticker: "", rationale: "" }])}
          >
            <Plus className="w-3 h-3" /> Add Ticker
          </Button>
        </CardContent>
      </Card>

      {/* Constraints */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Constraints</CardTitle>
          <CardDescription>Hard constraints that must never be violated</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="e.g. Never hold more than 10 individual stocks, Always keep minimum $30k cash"
            className="min-h-[80px]"
          />
        </CardContent>
      </Card>

      {/* Save */}
      <Button className="w-full gap-2" onClick={handleSave} disabled={isSaving}>
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        {isSaving ? "Saving..." : "Save Strategy Brief"}
      </Button>
    </div>
  );
}
