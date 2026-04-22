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
  onSave: (text: string, title: string) => Promise<void>;
  isLoading?: boolean;
}

export function PasteTextModal({ open, onClose, onSave, isLoading }: PasteTextModalProps) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
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

    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    try {
      await onSave(text.trim(), title.trim());
      // Reset form
      setText("");
      setTitle("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleClose = () => {
    setText("");
    setTitle("");
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
            <Label htmlFor="newsletter-title">Title</Label>
            <Input
              id="newsletter-title"
              placeholder="e.g., Stratechery — Weekly Update, Matt Levine Money Stuff"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
          <Button onClick={handleSave} disabled={isLoading || !text.trim() || !title.trim()}>
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
