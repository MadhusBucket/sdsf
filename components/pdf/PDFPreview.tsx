"use client";

interface PDFPreviewProps {
  documentId: string;
}

export function PDFPreview({ documentId }: PDFPreviewProps) {
  if (!documentId) {
    return (
      <div className="flex w-full items-center justify-center rounded-lg border bg-muted/15 text-sm text-muted-foreground" style={{ height: "calc(100vh - 320px)", minHeight: "600px" }}>
        Preview unavailable — missing document id.
      </div>
    );
  }

  const src = `/invoice/${encodeURIComponent(documentId)}`;

  return (
    <div className="w-full overflow-hidden rounded-lg border bg-muted/15">
      <iframe
        src={src}
        className="w-full border-0 bg-white"
        style={{ height: "calc(100vh - 320px)", minHeight: "600px" }}
        title="Invoice Preview"
      />
    </div>
  );
}
