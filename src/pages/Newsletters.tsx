import { useState } from "react";
import { ClipboardPaste, FileText, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useNewsletters, type Newsletter } from "@/hooks/useNewsletters";
import { useNewsletterCleanup } from "@/hooks/useNewsletterCleanup";
import { NewsletterUploadZone } from "@/components/newsletters/NewsletterUploadZone";
import { NewsletterList } from "@/components/newsletters/NewsletterList";
import { NewsletterArchiveTab } from "@/components/newsletters/NewsletterArchiveTab";
import { InsightsModal } from "@/components/newsletters/InsightsModal";
import { PasteTextModal } from "@/components/newsletters/PasteTextModal";
import { CleanupActionsCard } from "@/components/newsletters/CleanupActionsCard";
import { InsightsSummaryCard } from "@/components/newsletters/InsightsSummaryCard";

export default function Newsletters() {
  const {
    newsletters,
    isLoading,
    uploadNewsletter,
    isUploading,
    updateSourceName,
    processNewsletter,
    isProcessing,
    deleteNewsletter,
  } = useNewsletters();

  const { toggleArchive } = useNewsletterCleanup();

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [viewingNewsletter, setViewingNewsletter] = useState<Newsletter | null>(null);
  const [showPasteModal, setShowPasteModal] = useState(false);

  // Split newsletters into active and archived
  const activeNewsletters = newsletters.filter((n) => !n.is_archived);
  const archivedCount = newsletters.filter((n) => n.is_archived).length;

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

  const handleArchive = (newsletter: Newsletter) => {
    toggleArchive({ id: newsletter.id, isArchived: true });
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

      {/* Tabs for Active vs Archived */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active" className="gap-2">
            <FileText className="w-4 h-4" />
            Active
            {activeNewsletters.length > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeNewsletters.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="archived" className="gap-2">
            <Archive className="w-4 h-4" />
            Archived
            {archivedCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {archivedCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Uploaded Newsletters
            </h2>
            <NewsletterList
              newsletters={activeNewsletters}
              isLoading={isLoading}
              onProcess={handleProcess}
              onView={setViewingNewsletter}
              onDelete={handleDelete}
              onArchive={handleArchive}
              onUpdateSourceName={(id, name) => updateSourceName({ id, sourceName: name })}
              processingId={processingId}
            />
          </div>

          {/* Cleanup Actions */}
          <CleanupActionsCard />
        </TabsContent>

        <TabsContent value="archived">
          <NewsletterArchiveTab
            newsletters={newsletters}
            isLoading={isLoading}
            onView={setViewingNewsletter}
            onDelete={handleDelete}
          />
        </TabsContent>
      </Tabs>

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
