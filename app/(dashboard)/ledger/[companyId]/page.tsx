import { CompanyLedgerClient } from "@/components/ledger/CompanyLedgerClient";
import type { Business } from "@/lib/ledger/exportExcel";
import { getBankFromEnv, getMerchantFromEnv, getSignatoryNameFromEnv } from "@/lib/pdf/merchantFromEnv";

interface CompanyLedgerPageProps {
  params: Promise<{ companyId: string }>;
}

export default async function CompanyLedgerPage({ params }: CompanyLedgerPageProps) {
  const { companyId } = await params;
  // Same business and bank details as on the invoices, for the statement sent to clients.
  const m = getMerchantFromEnv();
  const bank = getBankFromEnv();
  const business: Business = {
    name: m.name,
    address: m.addressLines.join(", "),
    gstin: m.gstin ?? "",
    phone: m.phone ?? "",
    email: m.email ?? "",
    signatory: getSignatoryNameFromEnv(),
    bank: bank.accountNumber || bank.bankName ? { ...bank, branch: bank.branch ?? "" } : null,
  };
  return (
    <div className="p-4 pb-16 sm:p-6">
      <CompanyLedgerClient companyId={companyId} business={business} />
    </div>
  );
}
