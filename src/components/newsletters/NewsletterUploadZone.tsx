import { useState, useCallback } from "react";
import { Upload, FileText, X, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import * as pdfjsLib from "pdfjs-dist";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface UploadingFile {
  file: File;
  progress: number;
  status: "extracting" | "uploading" | "done" | "error";
  error?: string;
  rawText?: string;
}

interface NewsletterUploadZoneProps {
  onUpload: (file: File, rawText: string, sourceName: string) => Promise<void>;
}

export function NewsletterUploadZone({ onUpload }: NewsletterUploadZoneProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + "\n\n";
    }
    
    return fullText.trim();
  };

  const processFile = async (file: File) => {
    const uploadingFile: UploadingFile = {
      file,
      progress: 0,
      status: "extracting",
    };

    setUploadingFiles((prev) => [...prev, uploadingFile]);

    try {
      // Extract text from PDF
      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.file === file ? { ...f, progress: 30, status: "extracting" } : f
        )
      );

      const rawText = await extractTextFromPdf(file);

      if (!rawText || rawText.length < 50) {
        throw new Error("Could not extract text from PDF. The file may be image-based or corrupted.");
      }

      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.file === file ? { ...f, progress: 60, status: "uploading", rawText } : f
        )
      );

      // Generate source name from filename
      const sourceName = file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");

      // Upload to backend
      await onUpload(file, rawText, sourceName);

      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.file === file ? { ...f, progress: 100, status: "done" } : f
        )
      );

      // Remove from list after delay
      setTimeout(() => {
        setUploadingFiles((prev) => prev.filter((f) => f.file !== file));
      }, 2000);
    } catch (error) {
      console.error("Error processing file:", error);
      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.file === file
            ? {
                ...f,
                status: "error",
                error: error instanceof Error ? error.message : "Failed to process",
              }
            : f
        )
      );
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf"
    );

    if (files.length === 0) {
      toast.error("Please upload PDF files only");
      return;
    }

    files.forEach(processFile);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (f) => f.type === "application/pdf"
    );

    if (files.length === 0) {
      toast.error("Please upload PDF files only");
      return;
    }

    files.forEach(processFile);
    e.target.value = ""; // Reset input
  };

  const removeFile = (file: File) => {
    setUploadingFiles((prev) => prev.filter((f) => f.file !== file));
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        className={cn(
          "relative border-2 border-dashed rounded-lg p-12 text-center transition-all",
          "hover:border-primary/50 hover:bg-primary/5",
          isDragging ? "border-primary bg-primary/10" : "border-border"
        )}
      >
        <div className="space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Upload className="w-8 h-8 text-primary" />
          </div>
          <div>
            <p className="text-lg font-medium text-foreground">
              Drop newsletter PDFs here
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              or click to browse • Multiple files supported
            </p>
          </div>
          <Button variant="outline" className="relative">
            <FileText className="w-4 h-4 mr-2" />
            Select PDFs
            <input
              type="file"
              accept="application/pdf"
              multiple
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </Button>
        </div>
      </div>

      {/* Upload Progress */}
      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((uf, i) => (
            <div
              key={`${uf.file.name}-${i}`}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border",
                uf.status === "error"
                  ? "bg-destructive/10 border-destructive/20"
                  : uf.status === "done"
                  ? "bg-emerald-500/10 border-emerald-500/20"
                  : "bg-secondary border-border"
              )}
            >
              {uf.status === "done" ? (
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              ) : uf.status === "error" ? (
                <X className="w-5 h-5 text-destructive shrink-0" />
              ) : (
                <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{uf.file.name}</p>
                {uf.status === "extracting" && (
                  <p className="text-xs text-muted-foreground">Extracting text...</p>
                )}
                {uf.status === "uploading" && (
                  <p className="text-xs text-muted-foreground">Uploading...</p>
                )}
                {uf.status === "done" && (
                  <p className="text-xs text-emerald-500">Complete!</p>
                )}
                {uf.status === "error" && (
                  <p className="text-xs text-destructive">{uf.error}</p>
                )}
              </div>

              {(uf.status === "extracting" || uf.status === "uploading") && (
                <Progress value={uf.progress} className="w-20" />
              )}

              {uf.status === "error" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeFile(uf.file)}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
