import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp,
  Briefcase,
  BookOpen,
  BarChart3,
  ArrowRight,
  CheckCircle,
  Upload,
  Plus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

const STEPS = [
  {
    id: "welcome",
    title: "Welcome to KeepItBoring",
    description:
      "Your AI-powered investment companion that helps you make better decisions through structured analysis and philosophy-driven insights.",
    icon: TrendingUp,
    tips: [
      "Track your portfolio with intelligent analysis",
      "Log decisions using Annie Duke's framework",
      "Get AI insights from your investment newsletters",
      "Monitor compliance with your investment philosophy",
    ],
  },
  {
    id: "portfolio",
    title: "Build Your Portfolio",
    description:
      "Start by adding your current holdings. You can upload a screenshot from your broker or manually add positions.",
    icon: Briefcase,
    tips: [
      "Upload broker screenshots for quick import",
      "Add thesis notes to track your reasoning",
      "Set confidence levels for each position",
      "Categorize by type: stocks, ETFs, bonds",
    ],
  },
  {
    id: "philosophy",
    title: "Define Your Philosophy",
    description:
      "Set up rules based on investment principles from books like The Intelligent Investor, Thinking in Bets, and more.",
    icon: BookOpen,
    tips: [
      "Position size limits (e.g., max 8% single stock)",
      "Asset allocation targets (e.g., 80% ETFs / 20% stocks)",
      "Quality thresholds and sector limits",
      "Rules are checked during AI analysis",
    ],
  },
  {
    id: "ready",
    title: "You're All Set!",
    description:
      "You're ready to start using KeepItBoring. Remember: focus on process over outcomes, and stay humble.",
    icon: BarChart3,
    tips: [
      "Run AI Analysis to check portfolio health",
      "Log decisions to build your track record",
      "Generate monthly reports for self-reflection",
      "Use Cmd/Ctrl + K for quick search",
    ],
  },
];

export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const currentStep = STEPS[step];
  const progress = ((step + 1) / STEPS.length) * 100;
  const Icon = currentStep.icon;

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const handleAction = (action: string) => {
    onComplete();
    if (action === "portfolio") {
      navigate("/portfolio", { state: { action: "add-position" } });
    } else if (action === "upload") {
      navigate("/portfolio", { state: { action: "upload" } });
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border p-0 gap-0 [&>button]:hidden">
        {/* Progress */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {STEPS.length}
            </span>
            <button
              onClick={handleSkip}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Skip tour
            </button>
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">
                {currentStep.title}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {currentStep.description}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {currentStep.tips.map((tip, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50"
              >
                <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-sm text-foreground">{tip}</span>
              </div>
            ))}
          </div>

          {/* Quick Actions on final step */}
          {step === STEPS.length - 1 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => handleAction("upload")}
              >
                <Upload className="w-4 h-4" />
                Upload Screenshot
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => handleAction("portfolio")}
              >
                <Plus className="w-4 h-4" />
                Add Position
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-between">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : (
            <div />
          )}
          <Button onClick={handleNext} className="gap-2 min-w-[120px]">
            {step === STEPS.length - 1 ? "Get Started" : "Next"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
