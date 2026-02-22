import { useState, useEffect } from "react";
import { Plus, PlayCircle, Loader2, BookOpen, AlertTriangle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePhilosophyRules,
  type PhilosophyRule,
  type RuleCheckResult,
} from "@/hooks/usePhilosophyRules";
import { PhilosophyRuleCard } from "@/components/philosophy/PhilosophyRuleCard";
import { AddRuleModal } from "@/components/philosophy/AddRuleModal";
import { RuleCheckResultsModal } from "@/components/philosophy/RuleCheckResultsModal";
import { toast } from "sonner";

export default function Philosophy() {
  const {
    rules,
    isLoading,
    seedDefaultRules,
    isSeeding,
    addRule,
    isAdding,
    updateRule,
    deleteRule,
    evaluateRule,
    runAllChecks,
  } = usePhilosophyRules();

  const [showAddModal, setShowAddModal] = useState(false);
  const [checkResults, setCheckResults] = useState<Map<string, RuleCheckResult>>(new Map());
  const [allCheckResults, setAllCheckResults] = useState<RuleCheckResult[]>([]);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [isRunningAllChecks, setIsRunningAllChecks] = useState(false);
  const [checkingRuleId, setCheckingRuleId] = useState<string | null>(null);
  const [openAuthors, setOpenAuthors] = useState<string[]>([]);

  // Seed default rules on first load if none exist
  useEffect(() => {
    if (!isLoading && rules.length === 0) {
      seedDefaultRules();
    }
  }, [isLoading, rules.length]);

  const handleCheckRule = async (rule: PhilosophyRule) => {
    setCheckingRuleId(rule.id);
    try {
      const result = evaluateRule(rule);
      setCheckResults((prev) => new Map(prev).set(rule.id, result));
    } finally {
      setCheckingRuleId(null);
    }
  };

  const handleRunAllChecks = async () => {
    setIsRunningAllChecks(true);
    try {
      const results = await runAllChecks();
      setAllCheckResults(results);

      // Update individual results map
      const newMap = new Map<string, RuleCheckResult>();
      results.forEach((r) => newMap.set(r.rule.id, r));
      setCheckResults(newMap);

      setShowResultsModal(true);

      const failing = results.filter((r) => r.status === "failing").length;
      const warnings = results.filter((r) => r.status === "warning").length;

      if (failing > 0) {
        toast.error(`${failing} critical violation(s) found`);
      } else if (warnings > 0) {
        toast.warning(`${warnings} warning(s) found`);
      } else {
        toast.success("All rules passing!");
      }
    } catch (error) {
      toast.error("Failed to run checks");
    } finally {
      setIsRunningAllChecks(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    await deleteRule(id);
    setCheckResults((prev) => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  };

  // Group rules by author
  const rulesByAuthor = rules.reduce((acc, rule) => {
    const books = rule.source_books && rule.source_books.length > 0 ? rule.source_books : ["Other"];
    books.forEach((book) => {
      if (!acc[book]) acc[book] = [];
      if (!acc[book].find((r) => r.id === rule.id)) {
        acc[book].push(rule);
      }
    });
    return acc;
  }, {} as Record<string, PhilosophyRule[]>);

  const authorDetails: Record<string, { title: string; work: string }> = {
    Graham: { title: "Benjamin Graham", work: "The Intelligent Investor" },
    Malkiel: { title: "Burton Malkiel", work: "A Random Walk Down Wall Street" },
    Siegel: { title: "Jeremy Siegel", work: "Stocks for the Long Run" },
    Greenblatt: { title: "Joel Greenblatt", work: "The Little Book That Beats the Market" },
    Thorndike: { title: "William Thorndike", work: "The Outsiders" },
    Duke: { title: "Annie Duke", work: "Thinking in Bets" },
    Marks: { title: "Howard Marks", work: "The Most Important Thing" },
    Kindleberger: { title: "Charles Kindleberger", work: "Manias, Panics, and Crashes" },
    Taleb: { title: "Nassim Taleb", work: "Fooled by Randomness & The Black Swan" },
    Lefèvre: { title: "Edwin Lefèvre", work: "Reminiscences of a Stock Operator" },
    Erkan: { title: "Erkan", work: "Portfolio Strategy" },
    Clason: { title: "George S. Clason", work: "The Richest Man in Babylon" },
    Other: { title: "Other", work: "Custom rules" },
  };

  const authorOrder = Object.keys(authorDetails);

  if (isLoading || isSeeding) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Investment Philosophy</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your investment philosophy, synthesized from 13 books. These rules guide all analysis.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleRunAllChecks}
            disabled={isRunningAllChecks || rules.length === 0}
          >
            {isRunningAllChecks ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PlayCircle className="w-4 h-4" />
            )}
            Run All Checks
          </Button>
          <Button className="gap-2" onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4" />
            Add Rule
          </Button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
        <div className="flex items-start gap-3">
          <BookOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium">
              Rules sourced from investment classics
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Graham • Malkiel • Siegel • Greenblatt • Thorndike • Duke • Marks • Kindleberger • Taleb • Lefèvre • Erkan • Clason
            </p>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {rules.length === 0 && (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No rules configured</h3>
          <p className="text-muted-foreground mb-4">
            Default rules should load automatically. Click below to retry.
          </p>
          <Button onClick={() => seedDefaultRules()}>Load Default Rules</Button>
        </div>
      )}

      {/* Rules by Author */}
      {authorOrder
        .filter((author) => rulesByAuthor[author]?.length > 0)
        .map((author) => {
          const isOpen = openAuthors.includes(author);
          return (
            <div key={author} className="rounded-lg border border-border bg-card overflow-hidden">
              <button
                onClick={() =>
                  setOpenAuthors((prev) =>
                    prev.includes(author)
                      ? prev.filter((a) => a !== author)
                      : [...prev, author]
                  )
                }
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-colors text-left"
              >
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {authorDetails[author]?.title ?? author}
                  </h2>
                  <p className="text-xs text-muted-foreground italic">
                    {authorDetails[author]?.work}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {rulesByAuthor[author].length} rule{rulesByAuthor[author].length !== 1 ? "s" : ""}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>
              {isOpen && (
                <div className="px-5 pb-5 pt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 border-t border-border">
                  {rulesByAuthor[author].map((rule) => (
                    <PhilosophyRuleCard
                      key={rule.id}
                      rule={rule}
                      checkResult={checkResults.get(rule.id)}
                      onCheck={handleCheckRule}
                      onUpdate={(id, updates) => updateRule({ id, updates })}
                      onDelete={handleDeleteRule}
                      isChecking={checkingRuleId === rule.id}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

      {/* Add Rule Modal */}
      <AddRuleModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={async (data) => { await addRule(data); }}
        isLoading={isAdding}
      />

      {/* Check Results Modal */}
      <RuleCheckResultsModal
        open={showResultsModal}
        onClose={() => setShowResultsModal(false)}
        results={allCheckResults}
      />
    </div>
  );
}
