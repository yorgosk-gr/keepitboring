import { useState } from "react";
import { ClipboardPaste, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PasteTextModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (text: string, sourceName: string) => Promise<void>;
  isLoading?: boolean;
}

export function PasteTextModal({ open, onClose, onSave, isLoading }: PasteTextModalProps) {
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);

    if (!text.trim()) {
      setError("Please paste newsletter text");
      return;
    }

    if (text.trim().length < 100) {
      setError("Text is too short. Please paste at least 100 characters.");
      return;
    }

    if (!sourceName.trim()) {
      setError("Please enter a source name");
      return;
    }

    try {
      await onSave(text.trim(), sourceName.trim());
      // Reset form
      setText("");
      setSourceName("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleClose = () => {
    setText("");
    setSourceName("");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardPaste className="w-5 h-5" />
            Paste Newsletter Text
          </DialogTitle>
          <DialogDescription>
            Paste the text content of an investment newsletter for AI analysis
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="source-name">Source Name</Label>
            <Input
              id="source-name"
              placeholder="e.g., Stratechery Weekly, Matt Levine's Newsletter"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              className="bg-secondary"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="newsletter-text">Newsletter Text</Label>
            <Textarea
              id="newsletter-text"
              placeholder="Paste your newsletter content here..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-[300px] bg-secondary font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {text.length} characters {text.length < 100 && text.length > 0 && "(minimum 100)"}
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !text.trim() || !sourceName.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Newsletter"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
