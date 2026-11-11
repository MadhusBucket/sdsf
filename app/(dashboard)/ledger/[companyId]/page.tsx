import { CompanyLedgerClient } from "@/components/ledger/CompanyLedgerClient";

interface CompanyLedgerPageProps {
  params: Promise<{ companyId: string }>;
}

export default async function CompanyLedgerPage({ params }: CompanyLedgerPageProps) {
  const { companyId } = await params;
  return (
    <div className="p-4 pb-16 sm:p-6">
      <CompanyLedgerClient companyId={companyId} />
    </div>
  );
}
