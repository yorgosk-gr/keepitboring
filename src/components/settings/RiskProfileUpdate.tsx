import { useState, useMemo } from "react";
import { Shield, ArrowRight, ArrowRightLeft, CheckCircle, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useRiskProfile, type RiskProfileType } from "@/hooks/useRiskProfile";
import { format } from "date-fns";

interface RiskProfileUpdateProps {
  open: boolean;
  onClose: () => void;
}

interface Question {
  id: string;
  question: string;
  options: { label: string; value: number; description: string }[];
}

const QUESTIONS: Question[] = [
  {
    id: "loss_reaction",
    question: "Reflecting on recent volatility — how would you react to a 20% drop now?",
    options: [
      { label: "Sell everything", value: 1, description: "Get out, reassess later" },
      { label: "Trim risky positions", value: 2, description: "Reduce but stay invested" },
      { label: "Hold and wait", value: 3, description: "Stick to the plan" },
      { label: "Buy more aggressively", value: 4, description: "Opportunity knocks" },
    ],
  },
  {
    id: "time_horizon",
    question: "Has your investment timeline changed?",
    options: [
      { label: "Shorter — need money sooner", value: 1, description: "Within 2 years" },
      { label: "About the same", value: 2, description: "3–5 years" },
      { label: "Longer — more patient now", value: 3, description: "5–10 years" },
      { label: "Much longer", value: 4, description: "10+ years, maximizing growth" },
    ],
  },
  {
    id: "concentration",
    question: "After seeing your portfolio performance, how do you feel about concentration?",
    options: [
      { label: "Want more diversification", value: 1, description: "Spread risk wider" },
      { label: "Current mix is fine", value: 2, description: "Core-satellite works" },
      { label: "Open to more themes", value: 3, description: "Selective exposure" },
      { label: "Want bigger bets", value: 4, description: "Concentrate on winners" },
    ],
  },
  {
    id: "volatility_comfort",
    question: "How has recent market volatility affected your comfort level?",
    options: [
      { label: "Much less comfortable", value: 1, description: "Want calmer portfolio" },
      { label: "Slightly less comfortable", value: 2, description: "A bit more cautious" },
      { label: "No change", value: 3, description: "Steady as before" },
      { label: "More comfortable", value: 4, description: "Learned to embrace it" },
    ],
  },
  {
    id: "past_behavior",
    question: "Looking at your actual trading behavior, were your moves aligned with your strategy?",
    options: [
      { label: "I made reactive trades", value: 1, description: "Emotion drove decisions" },
      { label: "Mostly reactive", value: 2, description: "Some panic, some plan" },
      { label: "Mostly strategic", value: 3, description: "Followed plan with minor deviations" },
      { label: "Fully strategic", value: 4, description: "Every move was intentional" },
    ],
  },
];

function scoreToProfile(score: number): RiskProfileType {
  if (score <= 8) return "cautious";
  if (score <= 13) return "balanced";
  if (score <= 17) return "growth";
  return "aggressive";
}

const PROFILE_LABELS: Record<RiskProfileType, string> = {
  cautious: "Cautious",
  balanced: "Balanced",
  growth: "Growth",
  aggressive: "Aggressive",
};

export function RiskProfileUpdate({ open, onClose }: RiskProfileUpdateProps) {
  const { activeProfile, behavioralSignals, saveProfile } = useRiskProfile();
  const [step, setStep] = useState<"review" | "questions" | "result">("review");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const progress = step === "questions" ? ((currentQ + 1) / QUESTIONS.length) * 100 : 0;
  const question = QUESTIONS[currentQ];

  const totalScore = Object.values(answers).reduce((sum, v) => sum + v, 0);
  const newProfile = scoreToProfile(totalScore);
  const oldProfile = (activeProfile?.profile as RiskProfileType) ?? "balanced";
  const profileChanged = newProfile !== oldProfile;

  const signalSummary = useMemo(() => {
    if (behavioralSignals.length === 0) return null;
    const aligned = behavioralSignals.filter(s => s.aligned).length;
    const total = behavioralSignals.length;
    return { aligned, total, rate: Math.round((aligned / total) * 100) };
  }, [behavioralSignals]);

  const handleSelect = (value: number) => {
    const newAnswers = { ...answers, [question.id]: value };
    setAnswers(newAnswers);

    if (currentQ < QUESTIONS.length - 1) {
      setTimeout(() => setCurrentQ(currentQ + 1), 300);
    } else {
      setStep("result");
    }
  };

  const handleSave = async () => {
    await saveProfile.mutateAsync({
      profile: newProfile,
      score: totalScore,
      dimensionScores: answers,
      source: "update",
    });
    handleClose();
  };

  const handleClose = () => {
    setStep("review");
    setCurrentQ(0);
    setAnswers({});
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px] bg-card border-border p-0 gap-0 max-h-[85vh] overflow-y-auto">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {step === "review" ? "Recalibrate Risk Profile" : step === "questions" ? "Updated Assessment" : "Profile Comparison"}
          </DialogTitle>
          <DialogDescription>
            {step === "review"
              ? "Review your behavioral data, then update your risk profile."
              : step === "questions"
              ? `Question ${currentQ + 1} of ${QUESTIONS.length}`
              : "Compare your old and new profile."}
          </DialogDescription>
        </DialogHeader>

        {step === "questions" && (
          <div className="px-6 pt-3">
            <Progress value={progress} className="h-1" />
          </div>
        )}

        <div className="p-6 space-y-4">
          {step === "review" && (
            <>
              {/* Current profile */}
              <div className="p-3 rounded-lg bg-secondary/50 flex items-center gap-3">
                <Shield className="w-5 h-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Current: <span className="text-primary">{PROFILE_LABELS[oldProfile]}</span>
                  </p>
                  {activeProfile?.applied_at && (
                    <p className="text-xs text-muted-foreground">
                      Since {format(new Date(activeProfile.applied_at), "MMM d, yyyy")}
                    </p>
                  )}
                </div>
              </div>

              {/* Behavioral signals summary */}
              {signalSummary && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">What we observed</p>
                  <div className="p-3 rounded-lg bg-secondary/30 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Alignment rate</span>
                      <span className={cn("font-mono font-medium", signalSummary.rate >= 60 ? "text-primary" : "text-amber-500")}>
                        {signalSummary.rate}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {signalSummary.aligned} of {signalSummary.total} trades aligned with your {PROFILE_LABELS[oldProfile]} profile
                    </p>
                  </div>

                  {/* Recent signals */}
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {behavioralSignals.slice(0, 5).map((signal) => (
                      <div key={signal.id} className="flex items-center gap-2 text-xs p-2 rounded bg-secondary/20">
                        {signal.aligned ? (
                          <CheckCircle className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                        )}
                        <span className="text-muted-foreground truncate">{signal.action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!signalSummary && (
                <p className="text-sm text-muted-foreground">
                  No behavioral data yet. Sync your IB account to see trade-event correlations.
                </p>
              )}

              <Button className="w-full gap-2" onClick={() => setStep("questions")}>
                Start Assessment
                <ArrowRight className="w-4 h-4" />
              </Button>
            </>
          )}

          {step === "questions" && (
            <>
              <p className="text-sm font-medium text-foreground">{question.question}</p>
              <div className="space-y-2">
                {question.options.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      "w-full text-left p-3 rounded-lg border transition-all duration-200",
                      answers[question.id] === opt.value
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/30 hover:border-primary/40 hover:bg-secondary/50"
                    )}
                  >
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </button>
                ))}
              </div>
              {currentQ > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setCurrentQ(currentQ - 1)}>
                  Back
                </Button>
              )}
            </>
          )}

          {step === "result" && (
            <>
              {/* Profile comparison */}
              <div className="flex items-center justify-center gap-4 p-4 rounded-lg bg-secondary/30">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">Previous</p>
                  <p className="text-lg font-bold text-foreground">{PROFILE_LABELS[oldProfile]}</p>
                </div>
                <ArrowRightLeft className={cn("w-5 h-5", profileChanged ? "text-amber-500" : "text-primary")} />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">New</p>
                  <p className={cn("text-lg font-bold", profileChanged ? "text-amber-500" : "text-primary")}>
                    {PROFILE_LABELS[newProfile]}
                  </p>
                </div>
              </div>

              {profileChanged && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-500 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Your profile has shifted. This will update your allocation targets.</span>
                </div>
              )}

              {!profileChanged && (
                <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-primary flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Your profile remains the same. No changes to allocation targets.</span>
                </div>
              )}

              <p className="text-xs text-muted-foreground text-center">Score: {totalScore}/20</p>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setStep("questions"); setCurrentQ(0); setAnswers({}); }}>
                  Retake
                </Button>
                <Button className="flex-1 gap-2" onClick={handleSave} disabled={saveProfile.isPending}>
                  {saveProfile.isPending ? "Saving..." : "Apply Profile"}
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
