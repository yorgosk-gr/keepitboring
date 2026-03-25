import { useState, useCallback } from "react";
import { Upload, FileText, X, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "text/markdown",
  "text/csv",
];

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md", ".csv"];

function isAcceptedFile(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  return ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

interface UploadingFile {
  file: File;
  progress: number;
  status: "extracting" | "uploading" | "done" | "error";
  error?: string;
  rawText?: string;
}

interface NewsletterUploadZoneProps {
  onUpload: (file: File, rawText: string, sourceName: string) => Promise<void>;
  compact?: boolean;
}

export function NewsletterUploadZone({ onUpload, compact }: NewsletterUploadZoneProps) {
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const extractTextFromPdf = async (file: File): Promise<string> => {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
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

  const extractTextFromDocx = async (file: File): Promise<string> => {
    const mammoth = (await import("mammoth")).default;
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim();
  };

  const extractTextFromFile = async (file: File): Promise<string> => {
    const name = file.name.toLowerCase();
    if (name.endsWith(".pdf")) {
      return extractTextFromPdf(file);
    }
    if (name.endsWith(".docx")) {
      return extractTextFromDocx(file);
    }
    // TXT, MD, CSV — read as plain text
    return file.text();
  };

  /** Check if extracted text is mostly garbage (arrows, symbols, whitespace) */
  const isLowQualityText = (text: string): boolean => {
    const alphanumeric = text.replace(/[^a-zA-Z0-9]/g, "").length;
    const ratio = alphanumeric / Math.max(text.length, 1);
    // If less than 20% of the text is actual letters/numbers, it's likely garbage
    return ratio < 0.2;
  };

  const processFile = async (file: File) => {
    const uploadingFile: UploadingFile = {
      file,
      progress: 0,
      status: "extracting",
    };

    setUploadingFiles((prev) => [...prev, uploadingFile]);

    try {
      // Extract text from file
      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.file === file ? { ...f, progress: 30, status: "extracting" } : f
        )
      );

      const rawText = await extractTextFromFile(file);

      if (!rawText || rawText.length < 50) {
        throw new Error("Could not extract text from this file. It may be image-based or corrupted.");
      }

      if (isLowQualityText(rawText)) {
        throw new Error(
          "This document uses complex formatting (shapes, text boxes, charts) that couldn't be read. Please use 'Paste Newsletter Text' to add the content manually."
        );
      }

      setUploadingFiles((prev) =>
        prev.map((f) =>
          f.file === file ? { ...f, progress: 60, status: "uploading", rawText } : f
        )
      );

      // Generate source name from filename
      const sourceName = file.name.replace(/\.(pdf|docx|txt|md|csv)$/i, "").replace(/[-_]/g, " ");

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

    const files = Array.from(e.dataTransfer.files).filter(isAcceptedFile);

    if (files.length === 0) {
      toast.error("Unsupported file type. Use PDF, DOCX, TXT, MD, or CSV.");
      return;
    }

    files.forEach(processFile);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(isAcceptedFile);

    if (files.length === 0) {
      toast.error("Unsupported file type. Use PDF, DOCX, TXT, MD, or CSV.");
      return;
    }

    files.forEach(processFile);
    e.target.value = "";
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
          "relative border-2 border-dashed rounded-lg text-center transition-all",
          "hover:border-primary/50 hover:bg-primary/5",
          isDragging ? "border-primary bg-primary/10" : "border-border",
          compact ? "p-8" : "p-12"
        )}
      >
        <div className="space-y-3">
          <div className={cn("rounded-full bg-primary/10 flex items-center justify-center mx-auto", compact ? "w-12 h-12" : "w-16 h-16")}>
            <Upload className={cn("text-primary", compact ? "w-6 h-6" : "w-8 h-8")} />
          </div>
          <div>
            <p className={cn("font-medium text-foreground", compact ? "text-base" : "text-lg")}>
              Drop newsletter files here
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              PDF, DOCX, TXT, MD, CSV
            </p>
          </div>
          <Button variant="outline" className="relative">
            <FileText className="w-4 h-4 mr-2" />
            Select Files
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv"
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
