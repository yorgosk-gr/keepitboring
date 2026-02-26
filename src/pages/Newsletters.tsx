import { useState } from "react";
import { ClipboardPaste, Mail, Copy, Check, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useNewsletters, type Newsletter } from "@/hooks/useNewsletters";
import { NewsletterUploadZone } from "@/components/newsletters/NewsletterUploadZone";
import { NewsletterList } from "@/components/newsletters/NewsletterList";
import { InsightsModal } from "@/components/newsletters/InsightsModal";
import { PasteTextModal } from "@/components/newsletters/PasteTextModal";
import { InsightsSummaryCard } from "@/components/newsletters/InsightsSummaryCard";
import { toast } from "sonner";

export default function Newsletters() {
  const FORWARDING_EMAIL = "5e270f9e04012bf900d8@cloudmailin.net";

  const {
    newsletters,
    isLoading,
    uploadNewsletter,
    isUploading,
    updateSourceName,
    processNewsletter,
    isProcessing,
    deleteNewsletter,
    refetch: refetchNewsletters,
    isRefetching,
  } = useNewsletters();

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [viewingNewsletter, setViewingNewsletter] = useState<Newsletter | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(FORWARDING_EMAIL);
    setCopied(true);
    toast.success("Email address copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpload = async (file: File, rawText: string, sourceName: string) => {
    await uploadNewsletter({ file, rawText, sourceName });
  };

  const handlePasteText = async (text: string, sourceName: string) => {
    await uploadNewsletter({ rawText: text, sourceName });
  };

  const handleProcess = async (newsletter: Newsletter) => {
    setProcessingId(newsletter.id);
    try {
      await processNewsletter(newsletter);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (newsletter: Newsletter) => {
    await deleteNewsletter(newsletter);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Newsletters</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload investment newsletters to extract insights with AI
          </p>
        </div>
        <Button 
          variant="outline" 
          className="gap-2 self-start"
          onClick={() => setShowPasteModal(true)}
        >
          <ClipboardPaste className="w-4 h-4" />
          Paste Newsletter Text
        </Button>
      </div>

      {/* AI Intelligence Brief */}
      <InsightsSummaryCard />

      {/* Upload Zone */}
      <NewsletterUploadZone onUpload={handleUpload} />

      {/* Email Forwarding Banner */}
      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/50">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Mail className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground font-medium">Auto-import via email</p>
          <p className="text-xs text-muted-foreground">
            Forward newsletters to{" "}
            <button
              onClick={handleCopyEmail}
              className="font-mono text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              {FORWARDING_EMAIL}
              {copied ? (
                <Check className="w-3 h-3 text-primary" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
            {" "}— they'll be processed automatically.
          </p>
        </div>
      </div>

      {/* Newsletter List */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Uploaded Newsletters
          </h2>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => refetchNewsletters()}
            disabled={isRefetching}
          >
            <RefreshCw className={cn("w-4 h-4", isRefetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
        <NewsletterList
          newsletters={newsletters}
          isLoading={isLoading}
          onProcess={handleProcess}
          onView={setViewingNewsletter}
          onDelete={handleDelete}
          onUpdateSourceName={(id, name) => updateSourceName({ id, sourceName: name })}
          processingId={processingId}
        />
      </div>

      {/* Insights Modal */}
      <InsightsModal
        open={!!viewingNewsletter}
        onClose={() => setViewingNewsletter(null)}
        newsletterId={viewingNewsletter?.id ?? null}
        newsletterName={viewingNewsletter?.source_name ?? ""}
      />

      {/* Paste Text Modal */}
      <PasteTextModal
        open={showPasteModal}
        onClose={() => setShowPasteModal(false)}
        onSave={handlePasteText}
        isLoading={isUploading}
      />
    </div>
  );
}
