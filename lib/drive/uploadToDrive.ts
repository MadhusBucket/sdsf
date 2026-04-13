import { format } from "date-fns";

export async function uploadDocumentToDrive(
  documentId: string,
  docNumber: string,
  type: "invoice" | "quotation",
  date: string
): Promise<string | null> {
  try {
    const pdfResponse = await fetch(`/api/generate-pdf?id=${encodeURIComponent(documentId)}`);
    if (!pdfResponse.ok) throw new Error("PDF generation failed");
    const pdfBlob = await pdfResponse.blob();

    const docDate = new Date(date);
    const year = format(docDate, "yyyy");
    const month = format(docDate, "MMMM");
    const typeFolder = type === "invoice" ? "Invoices" : "Quotations";

    const safeDocNumber = docNumber.replace(/\//g, "-");

    const formData = new FormData();
    formData.append("file", pdfBlob, `${safeDocNumber}.pdf`);
    formData.append("folderPath", `SDSF/${year}/${month}/${typeFolder}`);
    formData.append("fileName", `${safeDocNumber}.pdf`);

    const uploadResponse = await fetch("/api/drive/upload", {
      method: "POST",
      body: formData,
    });

    if (!uploadResponse.ok) {
      const err = await uploadResponse.json().catch(() => ({}));
      throw new Error(typeof err.error === "string" ? err.error : "Upload failed");
    }

    const { fileId } = await uploadResponse.json();
    return fileId as string;
  } catch (error) {
    console.error("Drive upload error:", error);
    return null;
  }
}
