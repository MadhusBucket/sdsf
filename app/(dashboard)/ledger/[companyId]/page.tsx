import { CompanyLedgerClient } from "@/components/ledger/CompanyLedgerClient";
import { getMerchantFromEnv } from "@/lib/pdf/merchantFromEnv";

interface CompanyLedgerPageProps {
  params: Promise<{ companyId: string }>;
}

export default async function CompanyLedgerPage({ params }: CompanyLedgerPageProps) {
  const { companyId } = await params;
  // Same business details as on the invoices, for the exported sheet's heading.
  const m = getMerchantFromEnv();
  const business = {
    name: m.name,
    address: m.addressLines.join(", "),
    gstin: m.gstin ?? "",
    phone: m.phone ?? "",
  };
  return (
    <div className="p-4 pb-16 sm:p-6">
      <CompanyLedgerClient companyId={companyId} business={business} />
    </div>
  );
}
