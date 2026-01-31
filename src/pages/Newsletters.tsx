import { useState } from "react";
import { useNewsletters, type Newsletter } from "@/hooks/useNewsletters";
import { NewsletterUploadZone } from "@/components/newsletters/NewsletterUploadZone";
import { NewsletterList } from "@/components/newsletters/NewsletterList";
import { InsightsModal } from "@/components/newsletters/InsightsModal";

export default function Newsletters() {
  const {
    newsletters,
    isLoading,
    uploadNewsletter,
    updateSourceName,
    processNewsletter,
    isProcessing,
    deleteNewsletter,
  } = useNewsletters();

  const [processingId, setProcessingId] = useState<string | null>(null);
  const [viewingNewsletter, setViewingNewsletter] = useState<Newsletter | null>(null);

  const handleUpload = async (file: File, rawText: string, sourceName: string) => {
    await uploadNewsletter({ file, rawText, sourceName });
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
      <div>
        <h1 className="text-2xl font-bold text-foreground">Newsletters</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload investment newsletters to extract insights with AI
        </p>
      </div>

      {/* Upload Zone */}
      <NewsletterUploadZone onUpload={handleUpload} />

      {/* Newsletter List */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Uploaded Newsletters
        </h2>
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
    </div>
  );
}
