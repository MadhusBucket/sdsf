"use client";

interface PDFPreviewProps {
  documentId: string;
}

export function PDFPreview({ documentId }: PDFPreviewProps) {
  if (!documentId) {
    return (
      <div className="flex min-h-[800px] w-full items-center justify-center rounded-lg border bg-muted/15 text-sm text-muted-foreground">
        Preview unavailable — missing document id.
      </div>
    );
  }

  const src = `/api/generate-pdf?id=${encodeURIComponent(documentId)}`;

  return (
    <div className="w-full min-h-[800px] overflow-hidden rounded-lg border bg-muted/15">
      <iframe
        className="h-[800px] w-full border-0 bg-white"
        src={src}
        title="Document PDF preview"
      />
    </div>
  );
}
