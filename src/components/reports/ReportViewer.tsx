import { useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Download, Save, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

interface ReportViewerProps {
  title: string;
  content: string;
  onBack: () => void;
  onSave?: () => void;
  isSaving?: boolean;
  showSave?: boolean;
}

export function ReportViewer({ 
  title, 
  content, 
  onBack, 
  onSave,
  isSaving,
  showSave = true
}: ReportViewerProps) {
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Report copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleDownloadPDF = () => {
    // Open print dialog for PDF export
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${title}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              max-width: 800px;
              margin: 0 auto;
              padding: 40px 20px;
              color: #1a1a1a;
            }
            h1 { font-size: 28px; margin-bottom: 24px; border-bottom: 2px solid #10b981; padding-bottom: 12px; }
            h2 { font-size: 20px; margin-top: 32px; margin-bottom: 16px; color: #059669; }
            h3 { font-size: 16px; margin-top: 24px; margin-bottom: 12px; }
            ul, ol { margin: 12px 0; padding-left: 24px; }
            li { margin: 8px 0; }
            p { margin: 12px 0; }
            strong { color: #059669; }
            blockquote { 
              border-left: 4px solid #10b981; 
              margin: 16px 0; 
              padding: 8px 16px; 
              background: #f0fdf4;
            }
            code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 14px; }
            hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
            @media print {
              body { padding: 0; }
              h1 { page-break-after: avoid; }
              h2, h3 { page-break-after: avoid; }
              ul, ol { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          ${contentRef.current?.innerHTML || ""}
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleCopy} className="gap-2">
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </Button>
          
          <Button variant="outline" onClick={handleDownloadPDF} className="gap-2">
            <Download className="w-4 h-4" />
            Download PDF
          </Button>

          {showSave && onSave && (
            <Button onClick={onSave} disabled={isSaving} className="gap-2">
              <Save className="w-4 h-4" />
              {isSaving ? "Saving..." : "Save to History"}
            </Button>
          )}
        </div>
      </div>

      {/* Report Content */}
      <Card className="p-0 overflow-hidden">
        <ScrollArea className="h-[calc(100vh-280px)]">
          <div ref={contentRef} className="p-8 prose prose-slate dark:prose-invert max-w-none
            prose-headings:text-foreground
            prose-h1:text-2xl prose-h1:font-bold prose-h1:border-b prose-h1:border-primary/30 prose-h1:pb-3 prose-h1:mb-6
            prose-h2:text-lg prose-h2:font-semibold prose-h2:text-primary prose-h2:mt-8 prose-h2:mb-4
            prose-h3:text-base prose-h3:font-medium
            prose-p:text-muted-foreground prose-p:leading-relaxed
            prose-li:text-muted-foreground prose-li:my-1
            prose-strong:text-foreground prose-strong:font-semibold
            prose-ul:my-3 prose-ol:my-3
            prose-blockquote:border-l-primary prose-blockquote:bg-primary/5 prose-blockquote:py-1
            prose-code:bg-secondary prose-code:text-foreground prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
            prose-hr:border-border
          ">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
}
