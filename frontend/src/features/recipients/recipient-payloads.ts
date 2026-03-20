import type { CreateRecipientPayload } from "@/types";

type BankRecipientTypeOption = "individual" | "business" | "";

export interface WalletRecipientDraft {
  fullName: string;
  walletAddress: string;
}

export interface BankRecipientDraft {
  bankCountryCode: string;
  recipientType: BankRecipientTypeOption;
  firstName: string;
  lastName: string;
  businessName: string;
  bankName: string;
  iban: string;
  bic: string;
}

export async function buildWalletRecipientPayload(
  walletForm: WalletRecipientDraft,
): Promise<Extract<CreateRecipientPayload, { kind: "wallet" }>> {
  const fullName = walletForm.fullName.trim();
  const walletAddress = walletForm.walletAddress.trim();

  if (!fullName) {
    throw new Error("Full name is required.");
  }

  if (!walletAddress) {
    throw new Error("Solana wallet address is required.");
  }

  const { assertValidSolanaAddress } = await import("@/features/wallet/runtime");
  assertValidSolanaAddress(walletAddress);

  return {
    kind: "wallet",
    fullName,
    walletAddress,
  };
}

export function buildBankRecipientPayload(
  bankForm: BankRecipientDraft,
): Extract<CreateRecipientPayload, { kind: "bank" }> {
  if (!bankForm.bankCountryCode) {
    throw new Error("Bank country is required.");
  }

  if (!bankForm.recipientType) {
    throw new Error("Recipient type is required.");
  }

  const bankName = bankForm.bankName.trim();
  const iban = bankForm.iban.trim().toUpperCase().replace(/\s+/g, "");
  const bic = bankForm.bic.trim().toUpperCase().replace(/\s+/g, "");

  if (!bankName) {
    throw new Error("Bank name is required.");
  }

  if (!iban) {
    throw new Error("IBAN is required.");
  }

  if (!bic) {
    throw new Error("BIC is required.");
  }

  if (bankForm.recipientType === "individual") {
    const firstName = bankForm.firstName.trim();
    const lastName = bankForm.lastName.trim();

    if (!firstName || !lastName) {
      throw new Error("First name and last name are required.");
    }

    return {
      kind: "bank",
      recipientType: "individual",
      bankCountryCode: bankForm.bankCountryCode,
      firstName,
      lastName,
      bankName,
      iban,
      bic,
    };
  }

  const businessName = bankForm.businessName.trim();
  if (!businessName) {
    throw new Error("Business name is required.");
  }

  return {
    kind: "bank",
    recipientType: "business",
    bankCountryCode: bankForm.bankCountryCode,
    businessName,
    bankName,
    iban,
    bic,
  };
}
