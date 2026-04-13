/**
 * Google Drive upload functionality
 * Currently disabled - requires Puppeteer for PDF generation
 * To re-enable: implement alternative PDF generation method
 */

export async function uploadDocumentToDrive(
  documentId: string,
  docNumber: string,
  type: "invoice" | "quotation",
  date: string
): Promise<string | null> {
  throw new Error(
    "Drive upload is currently disabled. PDF generation requires reimplementation."
  );
}
