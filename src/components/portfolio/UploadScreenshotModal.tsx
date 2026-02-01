import { useState, useCallback } from "react";
import { Upload, X, Loader2, AlertCircle, CheckCircle, GripVertical, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ScreenshotPreviewTable, type ExtractedPosition, type ExtractionMetadata } from "./ScreenshotPreviewTable";
import { supabase } from "@/integrations/supabase/client";

interface UploadScreenshotModalProps {
  open: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

type ProcessingState = "idle" | "uploading" | "processing" | "preview" | "importing" | "error";

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  pageNumber: number;
}

interface ExtractedData {
  positions: ExtractedPosition[];
  cash_balances?: Record<string, number>;
  total_value?: number | null;
  detected_broker?: string;
  detected_currency?: string;
  extraction_quality?: "good" | "partial" | "poor";
  extraction_notes?: string;
}

const MAX_IMAGES = 5;

export function UploadScreenshotModal({ open, onClose, onImportComplete }: UploadScreenshotModalProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [state, setState] = useState<ProcessingState>("idle");
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const handleClose = () => {
    // Clean up preview URLs
    images.forEach(img => URL.revokeObjectURL(img.preview));
    setImages([]);
    setState("idle");
    setExtractedData(null);
    setErrorMessage(null);
    setRawResponse(null);
    onClose();
  };

  const addImages = useCallback((files: FileList | File[]) => {
    const validFiles: File[] = [];
    
    for (const file of Array.from(files)) {
      if (file.type === "image/png" || file.type === "image/jpeg") {
        validFiles.push(file);
      }
    }
    
    if (validFiles.length === 0) {
      toast.error("Please upload PNG or JPG images");
      return;
    }

    setImages(prev => {
      const currentCount = prev.length;
      const remainingSlots = MAX_IMAGES - currentCount;
      
      if (remainingSlots <= 0) {
        toast.error(`Maximum ${MAX_IMAGES} images allowed`);
        return prev;
      }

      const filesToAdd = validFiles.slice(0, remainingSlots);
      
      if (validFiles.length > remainingSlots) {
        toast.warning(`Only added ${remainingSlots} image(s). Maximum is ${MAX_IMAGES}.`);
      }

      const newImages: UploadedImage[] = filesToAdd.map((file, i) => ({
        id: `img-${Date.now()}-${i}`,
        file,
        preview: URL.createObjectURL(file),
        pageNumber: currentCount + i + 1,
      }));

      return [...prev, ...newImages];
    });

    setState("idle");
    setErrorMessage(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    addImages(e.dataTransfer.files);
  }, [addImages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addImages(e.target.files);
      e.target.value = ""; // Reset to allow re-selecting same files
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const filtered = prev.filter(img => {
        if (img.id === id) {
          URL.revokeObjectURL(img.preview);
          return false;
        }
        return true;
      });
      // Re-number pages
      return filtered.map((img, i) => ({ ...img, pageNumber: i + 1 }));
    });
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    setImages(prev => {
      const newImages = [...prev];
      const [dragged] = newImages.splice(draggedIndex, 1);
      newImages.splice(index, 0, dragged);
      // Re-number pages
      return newImages.map((img, i) => ({ ...img, pageNumber: i + 1 }));
    });
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const processWithAI = async () => {
    if (images.length === 0) return;

    setState("uploading");
    setErrorMessage(null);

    try {
      // Convert all images to base64
      const imageData: { base64: string; mimeType: string }[] = [];
      
      for (const img of images) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const base64Data = result.split(",")[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(img.file);
        });
        imageData.push({ base64, mimeType: img.file.type });
      }

      setState("processing");

      // Get session token for authenticated request
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setErrorMessage("You must be logged in to process screenshots");
        setState("error");
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-screenshot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            images: imageData,
            // Legacy support for single image
            imageBase64: imageData.length === 1 ? imageData[0].base64 : undefined,
            mimeType: imageData.length === 1 ? imageData[0].mimeType : undefined,
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
        toast.success(`Extracted ${result.data.positions.length} positions from ${images.length} page(s)!`);
      } else {
        setErrorMessage("Unexpected response format");
        setState("error");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to process screenshots");
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
        state === "preview" ? "max-w-4xl" : "max-w-2xl"
      )}>
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {state === "preview" ? "Review Extracted Positions" : "Upload Broker Screenshots"}
          </DialogTitle>
        </DialogHeader>

        {state !== "preview" ? (
          <div className="space-y-4">
            {/* Info Note */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
              <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                Upload all pages of your portfolio. If your positions span multiple screenshots, upload them all at once (up to {MAX_IMAGES} images).
              </p>
            </div>

            {/* Image Thumbnails */}
            {images.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {images.length} image{images.length !== 1 ? "s" : ""} selected
                </p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {images.map((img, index) => (
                    <div
                      key={img.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "relative shrink-0 group rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing",
                        draggedIndex === index
                          ? "border-primary opacity-50"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="absolute top-1 left-1 z-10">
                        <GripVertical className="w-4 h-4 text-muted-foreground/60" />
                      </div>
                      <img
                        src={img.preview}
                        alt={`Page ${img.pageNumber}`}
                        className="w-28 h-20 object-cover rounded-lg"
                      />
                      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-background/90 rounded text-xs font-medium">
                        Page {img.pageNumber} of {images.length}
                      </div>
                      <button
                        onClick={() => removeImage(img.id)}
                        className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/90"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Drop Zone */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              className={cn(
                "relative border-2 border-dashed rounded-lg p-6 text-center transition-colors",
                "hover:border-primary/50 hover:bg-primary/5",
                images.length > 0 ? "border-border" : "border-border"
              )}
            >
              <div className="space-y-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-foreground font-medium">
                    {images.length === 0
                      ? "Drag and drop your screenshots here"
                      : "Add more screenshots"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to browse (PNG, JPG) • {images.length}/{MAX_IMAGES} images
                  </p>
                </div>
              </div>
              <input
                type="file"
                accept="image/png,image/jpeg"
                multiple
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={images.length >= MAX_IMAGES}
              />
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
                  {state === "uploading"
                    ? `Uploading ${images.length} image${images.length !== 1 ? "s" : ""}...`
                    : `AI is analyzing ${images.length} screenshot${images.length !== 1 ? "s" : ""}...`}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              {state === "error" && (
                <Button onClick={processWithAI} disabled={images.length === 0}>
                  Retry
                </Button>
              )}
              {state === "idle" && (
                <Button
                  onClick={processWithAI}
                  disabled={images.length === 0}
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
              metadata={{
                detected_broker: extractedData.detected_broker,
                detected_currency: extractedData.detected_currency,
                extraction_quality: extractedData.extraction_quality,
                extraction_notes: extractedData.extraction_notes,
              }}
              onCancel={handleClose}
              onImportComplete={handleImportComplete}
            />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
