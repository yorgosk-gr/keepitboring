import { useState } from "react";
import { ClipboardPaste, Mail, Copy, Check, RefreshCw, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useNewsletters, type Newsletter } from "@/hooks/useNewsletters";
import { NewsletterUploadZone } from "@/components/newsletters/NewsletterUploadZone";
import { NewsletterList } from "@/components/newsletters/NewsletterList";
import { InsightsModal } from "@/components/newsletters/InsightsModal";
import { PasteTextModal } from "@/components/newsletters/PasteTextModal";
import { InsightsSummaryCard } from "@/components/newsletters/InsightsSummaryCard";
import { useInsightsSummary } from "@/hooks/useInsightsSummary";
import { AllInsightsPanel } from "@/components/newsletters/AllInsightsPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function Newsletters() {
  const FORWARDING_EMAIL = "5e270f9e04012bf900d8@cloudmailin.net";

  const {
    newsletters,
    isLoading,
    uploadNewsletter,
    isUploading,
    updateTitle,
    processNewsletter,
    isProcessing,
    deleteNewsletter,
    refetch: refetchNewsletters,
    isRefetching,
  } = useNewsletters();

  const { summary, generateSummary, isGenerating } = useInsightsSummary();

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{done: number; total: number} | null>(null);
  const [viewingNewsletter, setViewingNewsletter] = useState<Newsletter | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(FORWARDING_EMAIL);
    setCopied(true);
    toast.success("Email address copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUpload = async (file: File, rawText: string, title: string) => {
    await uploadNewsletter({ file, rawText, title });
  };

  const handlePasteText = async (text: string, title: string) => {
    await uploadNewsletter({ rawText: text, title });
  };

  const handleBulkReprocess = async () => {
    // Only reprocess newsletters that explicitly failed — not ones that processed successfully
    // but yielded 0 insights (those are likely junk/empty and will waste AI credits)
    const unprocessed = newsletters.filter(
      n => !!n.processing_error || !n.processed
    );
    if (unprocessed.length === 0) {
      toast.info("No newsletters need reprocessing");
      return;
    }
    setIsBulkProcessing(true);
    setBulkProgress({ done: 0, total: unprocessed.length });
    let done = 0;
    let failures = 0;
    let delay = 1500;
    for (const newsletter of unprocessed) {
      try {
        await processNewsletter(newsletter);
        delay = 1500; // Reset delay on success
      } catch (e: any) {
        failures++;
        console.error("Failed to process", newsletter.title, e);
        // Back off on rate limits
        if (e?.message?.includes("Rate limit")) {
          delay = Math.min(delay * 2, 15000);
          toast.warning(`Rate limited — slowing down (${Math.round(delay / 1000)}s delay)`);
        }
      }
      done++;
      setBulkProgress({ done, total: unprocessed.length });
      // Don't delay after the last item
      if (done < unprocessed.length) {
        await new Promise(r => setTimeout(r, delay));
      }
    }
    setIsBulkProcessing(false);
    setBulkProgress(null);
    refetchNewsletters(); // Refresh list so banner count and status badges update
    const successCount = done - failures;
    if (failures > 0) {
      toast.warning(`Reprocessed ${successCount}/${done} newsletters (${failures} failed)`);
    } else {
      toast.success(`Reprocessed ${done} newsletters`);
    }
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
        <div className="flex items-center gap-2 self-start">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => generateSummary()}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Regen Brief
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => refetchNewsletters()}
            disabled={isRefetching}
          >
            <RefreshCw className={cn("w-4 h-4", isRefetching && "animate-spin")} />
            Reload List
          </Button>
        </div>
      </div>

      {/* AI Intelligence Brief */}
      <InsightsSummaryCard />

      {/* Upload & Paste Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NewsletterUploadZone onUpload={handleUpload} compact />
        <div
          className="flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed border-border p-8 text-center hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
          onClick={() => setShowPasteModal(true)}
        >
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <ClipboardPaste className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="text-lg font-medium text-foreground">Paste newsletter text</p>
            <p className="text-sm text-muted-foreground mt-1">Copy & paste content directly</p>
          </div>
          <Button variant="outline" onClick={(e) => e.stopPropagation()}>
            <ClipboardPaste className="w-4 h-4 mr-2" />
            Paste Text
          </Button>
        </div>
      </div>

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
      {/* Bulk reprocess button */}
      {newsletters.some(n => !!n.processing_error || !n.processed) && (
        <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
          <div>
            <p className="text-sm font-medium text-amber-500">
              {newsletters.filter(n => !!n.processing_error || !n.processed).length} newsletters need attention
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {bulkProgress ? `Processing ${bulkProgress.done}/${bulkProgress.total}...` : "Some newsletters failed or are pending — click to retry"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
            onClick={handleBulkReprocess}
            disabled={isBulkProcessing}
          >
            {isBulkProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isBulkProcessing ? `${bulkProgress?.done}/${bulkProgress?.total}` : "Re-process all"}
          </Button>
        </div>
      )}

      <Tabs defaultValue="newsletters" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="newsletters">All Newsletters</TabsTrigger>
          <TabsTrigger value="insights">All Insights</TabsTrigger>
        </TabsList>
        <TabsContent value="newsletters">
          <NewsletterList
            newsletters={newsletters}
            isLoading={isLoading}
            onProcess={handleProcess}
            onView={setViewingNewsletter}
            onDelete={handleDelete}
            onUpdateTitle={(id, name) => updateTitle({ id, title: name })}
            processingId={processingId}
          />
        </TabsContent>
        <TabsContent value="insights">
          <AllInsightsPanel />
        </TabsContent>
      </Tabs>

      {/* Insights Modal */}
      <InsightsModal
        open={!!viewingNewsletter}
        onClose={() => setViewingNewsletter(null)}
        newsletterId={viewingNewsletter?.id ?? null}
        newsletterName={viewingNewsletter?.title ?? ""}
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
