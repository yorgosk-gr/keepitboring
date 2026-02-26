import { useState } from "react";
import { Shield, ArrowRight, CheckCircle } from "lucide-react";
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

interface RiskProfileOnboardingProps {
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
    question: "Your portfolio drops 20% in one month. What do you do?",
    options: [
      { label: "Sell everything", value: 1, description: "Protect remaining capital immediately" },
      { label: "Trim risky positions", value: 2, description: "Reduce exposure but stay invested" },
      { label: "Hold and wait", value: 3, description: "Stay the course, ride it out" },
      { label: "Buy more aggressively", value: 4, description: "Use the dip as an opportunity" },
    ],
  },
  {
    id: "time_horizon",
    question: "When do you expect to need this money?",
    options: [
      { label: "Within 2 years", value: 1, description: "Short-term needs, preserve capital" },
      { label: "3–5 years", value: 2, description: "Medium-term goals" },
      { label: "5–10 years", value: 3, description: "Long-term growth" },
      { label: "10+ years", value: 4, description: "Maximum compounding time" },
    ],
  },
  {
    id: "concentration",
    question: "How comfortable are you with concentrated bets?",
    options: [
      { label: "Only broad index funds", value: 1, description: "Maximum diversification" },
      { label: "Mostly indices, some themes", value: 2, description: "Core-satellite approach" },
      { label: "Mix of themes and stocks", value: 3, description: "Active but diversified" },
      { label: "High-conviction picks", value: 4, description: "Concentrated positions welcome" },
    ],
  },
  {
    id: "volatility_comfort",
    question: "How do you feel about seeing daily swings of ±3%?",
    options: [
      { label: "Very uncomfortable", value: 1, description: "I'd lose sleep over it" },
      { label: "Somewhat uncomfortable", value: 2, description: "I'd notice but cope" },
      { label: "Neutral", value: 3, description: "Part of investing" },
      { label: "Excited", value: 4, description: "Volatility creates opportunity" },
    ],
  },
  {
    id: "past_behavior",
    question: "In previous market crashes, what did you actually do?",
    options: [
      { label: "Panic sold", value: 1, description: "Sold to stop the pain" },
      { label: "Froze and did nothing", value: 2, description: "Couldn't decide so held" },
      { label: "Stuck to plan", value: 3, description: "Followed my strategy" },
      { label: "Bought the dip", value: 4, description: "Added to positions" },
    ],
  },
];

function scoreToProfile(score: number): RiskProfileType {
  if (score <= 8) return "cautious";
  if (score <= 13) return "balanced";
  if (score <= 17) return "growth";
  return "aggressive";
}

export function RiskProfileOnboarding({ open, onClose }: RiskProfileOnboardingProps) {
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [showResult, setShowResult] = useState(false);
  const { saveProfile } = useRiskProfile();

  const progress = ((currentQ + 1) / QUESTIONS.length) * 100;
  const question = QUESTIONS[currentQ];

  const handleSelect = (value: number) => {
    const newAnswers = { ...answers, [question.id]: value };
    setAnswers(newAnswers);

    if (currentQ < QUESTIONS.length - 1) {
      setTimeout(() => setCurrentQ(currentQ + 1), 300);
    } else {
      setShowResult(true);
    }
  };

  const totalScore = Object.values(answers).reduce((sum, v) => sum + v, 0);
  const profile = scoreToProfile(totalScore);

  const handleSave = async () => {
    await saveProfile.mutateAsync({
      profile,
      score: totalScore,
      dimensionScores: answers,
      source: "onboarding",
    });
    handleClose();
  };

  const handleClose = () => {
    setCurrentQ(0);
    setAnswers({});
    setShowResult(false);
    onClose();
  };

  const PROFILE_LABELS: Record<RiskProfileType, { label: string; description: string }> = {
    cautious: { label: "Cautious", description: "Capital preservation focus. Broad diversified core with minimal concentrated bets." },
    balanced: { label: "Balanced", description: "Steady growth with reasonable risk. Core index positions with select thematic tilts." },
    growth: { label: "Growth", description: "Growth-oriented with tolerance for drawdowns. Mix of broad and thematic exposure." },
    aggressive: { label: "Aggressive", description: "High conviction, high volatility tolerance. Comfortable with concentrated positions." },
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px] bg-card border-border p-0 gap-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {showResult ? "Your Risk Profile" : "Risk Assessment"}
          </DialogTitle>
          <DialogDescription>
            {showResult
              ? "Based on your answers, here's your investment risk profile."
              : `Question ${currentQ + 1} of ${QUESTIONS.length}`}
          </DialogDescription>
        </DialogHeader>

        {!showResult && (
          <div className="px-6 pt-3">
            <Progress value={progress} className="h-1" />
          </div>
        )}

        <div className="p-6 space-y-4">
          {!showResult ? (
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
          ) : (
            <>
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-center space-y-2">
                <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-primary" />
                </div>
                <p className="text-xl font-bold text-foreground">{PROFILE_LABELS[profile].label}</p>
                <p className="text-sm text-muted-foreground">{PROFILE_LABELS[profile].description}</p>
                <p className="text-xs text-muted-foreground">Score: {totalScore}/20</p>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { setCurrentQ(0); setAnswers({}); setShowResult(false); }}>
                  Retake
                </Button>
                <Button className="flex-1 gap-2" onClick={handleSave} disabled={saveProfile.isPending}>
                  {saveProfile.isPending ? "Saving..." : "Accept Profile"}
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
