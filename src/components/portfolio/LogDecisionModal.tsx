import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Position } from "@/hooks/usePositions";

interface LogDecisionModalProps {
  open: boolean;
  onClose: () => void;
  position: Position | null;
}

type ActionType = "buy" | "sell" | "hold" | "trim" | "add" | "rebalance";

export function LogDecisionModal({ open, onClose, position }: LogDecisionModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    action_type: "hold" as ActionType,
    reasoning: "",
    information_set: "",
    confidence_level: 5,
    probability_estimate: "",
    invalidation_triggers: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !position) return;

    setIsLoading(true);

    try {
      const { error } = await supabase.from("decision_log").insert({
        user_id: user.id,
        position_id: position.id,
        action_type: formData.action_type,
        reasoning: formData.reasoning || null,
        information_set: formData.information_set || null,
        confidence_level: formData.confidence_level,
        probability_estimate: formData.probability_estimate || null,
        invalidation_triggers: formData.invalidation_triggers || null,
      });

      if (error) throw error;

      toast.success("Decision logged successfully");
      queryClient.invalidateQueries({ queryKey: ["decision_logs"] });
      onClose();
      
      // Reset form
      setFormData({
        action_type: "hold",
        reasoning: "",
        information_set: "",
        confidence_level: 5,
        probability_estimate: "",
        invalidation_triggers: "",
      });
    } catch (error: any) {
      toast.error("Failed to log decision: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!position) return null;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Log Decision: <span className="text-primary">{position.ticker}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select
              value={formData.action_type}
              onValueChange={(v) => setFormData({ ...formData, action_type: v as ActionType })}
            >
              <SelectTrigger className="bg-secondary border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
                <SelectItem value="trim">Trim</SelectItem>
                <SelectItem value="add">Add</SelectItem>
                <SelectItem value="rebalance">Rebalance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reasoning</Label>
            <Textarea
              value={formData.reasoning}
              onChange={(e) => setFormData({ ...formData, reasoning: e.target.value })}
              placeholder="Why are you making this decision?"
              rows={3}
              className="bg-secondary border-border resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Information Set</Label>
            <Textarea
              value={formData.information_set}
              onChange={(e) => setFormData({ ...formData, information_set: e.target.value })}
              placeholder="What information informed this decision?"
              rows={2}
              className="bg-secondary border-border resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Confidence Level: {formData.confidence_level}/10</Label>
            <Slider
              value={[formData.confidence_level]}
              onValueChange={([v]) => setFormData({ ...formData, confidence_level: v })}
              min={1}
              max={10}
              step={1}
              className="py-4"
            />
          </div>

          <div className="space-y-2">
            <Label>Probability Estimate</Label>
            <Textarea
              value={formData.probability_estimate}
              onChange={(e) => setFormData({ ...formData, probability_estimate: e.target.value })}
              placeholder="What's your probability estimate for success?"
              rows={1}
              className="bg-secondary border-border resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label>Invalidation Triggers</Label>
            <Textarea
              value={formData.invalidation_triggers}
              onChange={(e) => setFormData({ ...formData, invalidation_triggers: e.target.value })}
              placeholder="What would make you reconsider this decision?"
              rows={2}
              className="bg-secondary border-border resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Logging..." : "Log Decision"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
