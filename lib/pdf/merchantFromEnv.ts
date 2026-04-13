/** Merchant / bank fields read on the server and passed into PDF components. */

export interface MerchantDetails {
  name: string;
  addressLines: string[];
  gstin: string | null;
  phone: string | null;
  email: string | null;
}

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifsc: string;
  branch: string | null;
}

export function getMerchantFromEnv(): MerchantDetails {
  const name = process.env.MERCHANT_NAME?.trim() ?? "";
  const rawAddress = process.env.MERCHANT_ADDRESS ?? "";
  const addressLines = rawAddress
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    name,
    addressLines,
    gstin: process.env.MERCHANT_GSTIN?.trim() || null,
    phone: process.env.MERCHANT_PHONE?.trim() || null,
    email: process.env.MERCHANT_EMAIL?.trim() || null,
  };
}

export function getBankFromEnv(): BankDetails {
  return {
    bankName: process.env.MERCHANT_BANK_NAME?.trim() ?? "",
    accountName: process.env.MERCHANT_BANK_ACCOUNT_NAME?.trim() ?? "",
    accountNumber: process.env.MERCHANT_BANK_ACCOUNT_NUMBER?.trim() ?? "",
    ifsc: process.env.MERCHANT_BANK_IFSC?.trim() ?? "",
    branch: process.env.MERCHANT_BANK_BRANCH?.trim() || null,
  };
}

const DEFAULT_SIGNATORY_NAME = "M PRADEEP KUMAR";

/** `MERCHANT_SIGNATORY_NAME` — printed above the signature line on PDFs. */
export function getSignatoryNameFromEnv(): string {
  const raw = process.env.MERCHANT_SIGNATORY_NAME?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_SIGNATORY_NAME;
}
