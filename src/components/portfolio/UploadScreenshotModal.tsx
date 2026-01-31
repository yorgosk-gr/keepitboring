import { useState, useCallback } from "react";
import { Upload, X, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ScreenshotPreviewTable, type ExtractedPosition } from "./ScreenshotPreviewTable";

interface UploadScreenshotModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

type ProcessingState = "idle" | "uploading" | "processing" | "preview" | "importing" | "error";

interface ExtractedData {
  positions: ExtractedPosition[];
  cash_balances?: Record<string, number>;
  total_value?: number | null;
}

export function UploadScreenshotModal({ open, onClose, onImportComplete }: UploadScreenshotModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<ProcessingState>("idle");
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);

  const handleClose = () => {
    setFile(null);
    setPreview(null);
    setState("idle");
    setExtractedData(null);
    setErrorMessage(null);
    setRawResponse(null);
    onClose();
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.type === "image/png" || droppedFile.type === "image/jpeg")) {
      setFile(droppedFile);
      setPreview(URL.createObjectURL(droppedFile));
      setState("idle");
      setErrorMessage(null);
    } else {
      toast.error("Please upload a PNG or JPG image");
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && (selectedFile.type === "image/png" || selectedFile.type === "image/jpeg")) {
      setFile(selectedFile);
      setPreview(URL.createObjectURL(selectedFile));
      setState("idle");
      setErrorMessage(null);
    } else {
      toast.error("Please upload a PNG or JPG image");
    }
  };

  const processWithAI = async () => {
    if (!file) return;

    setState("uploading");
    setErrorMessage(null);

    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove the data URL prefix to get pure base64
          const base64Data = result.split(",")[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setState("processing");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-screenshot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: file.type,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setErrorMessage(result.error || "Processing failed");
        setRawResponse(result.raw || null);
        setState("error");
        return;
      }

      if (result.success && result.data) {
        setExtractedData(result.data);
        setState("preview");
        toast.success(`Extracted ${result.data.positions.length} positions!`);
      } else {
        setErrorMessage("Unexpected response format");
        setState("error");
      }
    } catch (error) {
      console.error("Error processing screenshot:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to process screenshot");
      setState("error");
    }
  };

  const handleImportComplete = () => {
    toast.success("Positions imported successfully!");
    onImportComplete();
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className={cn(
        "bg-card border-border",
        state === "preview" ? "max-w-4xl" : "max-w-lg"
      )}>
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {state === "preview" ? "Review Extracted Positions" : "Upload Broker Screenshot"}
          </DialogTitle>
        </DialogHeader>

        {state !== "preview" ? (
          <div className="space-y-4">
            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                "hover:border-primary/50 hover:bg-primary/5",
                file ? "border-primary bg-primary/5" : "border-border"
              )}
            >
              {preview ? (
                <div className="space-y-4">
                  <div className="relative inline-block">
                    <img
                      src={preview}
                      alt="Screenshot preview"
                      className="max-h-48 rounded-lg shadow-md"
                    />
                    <button
                      onClick={() => {
                        setFile(null);
                        setPreview(null);
                        setState("idle");
                      }}
                      className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">{file?.name}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Upload className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium">
                      Drag and drop your screenshot here
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      or click to browse (PNG, JPG)
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={handleFileSelect}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              )}
            </div>

            {/* Error State */}
            {state === "error" && errorMessage && (
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-sm text-destructive font-medium">{errorMessage}</p>
                    {rawResponse && (
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                          Show raw response
                        </summary>
                        <pre className="mt-2 p-2 bg-muted rounded text-muted-foreground overflow-auto max-h-32">
                          {rawResponse}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Processing State */}
            {(state === "uploading" || state === "processing") && (
              <div className="flex items-center justify-center gap-3 p-4 rounded-lg bg-primary/10">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                <p className="text-sm text-primary">
                  {state === "uploading" ? "Uploading image..." : "AI is analyzing your screenshot..."}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              {state === "error" && (
                <Button onClick={processWithAI} disabled={!file}>
                  Retry
                </Button>
              )}
              {state === "idle" && (
                <Button
                  onClick={processWithAI}
                  disabled={!file}
                  className="gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Process with AI
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Preview State */
          extractedData && (
            <ScreenshotPreviewTable
              positions={extractedData.positions}
              cashBalances={extractedData.cash_balances}
              totalValue={extractedData.total_value}
              onCancel={handleClose}
              onImportComplete={handleImportComplete}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
