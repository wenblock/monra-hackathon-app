import { createHash, createVerify, randomUUID } from "node:crypto";

import { config } from "../config.js";
import { updateUserBridgeStatuses } from "../db.js";
import { fetchWithRetry } from "./outboundHttp.js";
import type {
  AccountType,
  AppUser,
  BankRecipientType,
  BridgeComplianceState,
  BridgeKycStatus,
  OnrampDestinationAsset,
  OfframpSourceAsset,
  BridgeSourceDepositInstructions,
  BridgeTransferState,
  BridgeTosStatus,
} from "../types.js";

interface BridgeKycLinkResponse {
  id: string;
  customer_id: string;
  kyc_link: string;
  kyc_status: BridgeKycStatus;
  tos_link: string;
  tos_status: BridgeTosStatus;
}

interface BridgeCustomerResponse {
  has_accepted_terms_of_service: boolean;
  status: Exclude<BridgeKycStatus, "approved">;
}

interface BridgeExternalAccountResponse {
  id: string;
  customer_id: string;
  account_owner_name: string;
  bank_name: string;
  active: boolean;
  account_owner_type?: BankRecipientType;
  first_name?: string;
  last_name?: string;
  business_name?: string;
  iban?: {
    account_number: string;
    bic: string;
    country: string;
  };
  created_at: string;
  updated_at: string;
}

interface BridgeTransferSourceDepositInstructionsResponse {
  payment_rail?: string;
  amount?: string;
  currency?: string;
  deposit_message?: string;
  from_address?: string;
  to_address?: string;
  blockchain_memo?: string;
  bank_name?: string;
  bank_address?: string;
  iban?: string;
  bic?: string;
  account_holder_name?: string;
  bank_routing_number?: string;
  bank_account_number?: string;
  bank_beneficiary_name?: string;
  bank_beneficiary_address?: string;
}

interface BridgeTransferReceiptResponse {
  final_amount?: string;
  converted_amount?: string;
  subtotal_amount?: string;
  destination_tx_hash?: string;
  url?: string;
}

interface BridgeTransferResponse {
  id: string;
  amount: string;
  state: BridgeTransferState;
  source: {
    currency?: string;
    payment_rail?: string;
  };
  destination: {
    currency?: string;
    payment_rail?: string;
    to_address?: string;
  };
  source_deposit_instructions?: BridgeTransferSourceDepositInstructionsResponse | null;
  receipt?: BridgeTransferReceiptResponse | null;
  created_at: string;
  updated_at: string;
}

interface BridgeRequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  method?: "DELETE" | "GET" | "POST";
  path: string;
}

export class BridgeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "BridgeApiError";
  }
}

interface BridgeWebhookSignatureVerificationResult {
  isValid: boolean;
  error?: string;
}

async function readBridgeJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const rawMessage =
      data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : `Bridge request failed with status ${response.status}.`;

    const message =
      response.status === 401
        ? "Bridge API unauthorized. Check BRIDGE_API_KEY and make sure it matches the Bridge environment you are using."
        : rawMessage;

    throw new BridgeApiError(message, response.status);
  }

  return data as T;
}

async function bridgeRequest<T>({
  body,
  idempotencyKey,
  method = "GET",
  path,
}: BridgeRequestOptions): Promise<T> {
  const response = await fetchWithRetry(
    `${config.bridgeApiBaseUrl}${path}`,
    {
      method,
      headers: {
        "Api-Key": config.bridgeApiKey,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    {
      retries: config.outboundRequestRetries,
      timeoutMs: config.outboundRequestTimeoutMs,
    },
  );

  return readBridgeJson<T>(response);
}

export function isBridgeApiError(error: unknown): error is BridgeApiError {
  return error instanceof BridgeApiError;
}

function createKycLinkIdempotencyKey(cdpUserId: string) {
  const digest = createHash("sha256").update(`monra-bridge-kyc:${cdpUserId}`).digest("hex");
  return `monra-${digest}`;
}

function createExternalAccountIdempotencyKey(input: {
  bic: string;
  bankCountryCode: string;
  bankName: string;
  displayName: string;
  iban: string;
  recipientType: BankRecipientType;
  userId: number;
}) {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        bankCountryCode: input.bankCountryCode,
        bankName: input.bankName,
        bic: input.bic,
        displayName: input.displayName,
        iban: input.iban,
        recipientType: input.recipientType,
        userId: input.userId,
      }),
    )
    .digest("hex");

  return `monra-recipient-${digest}`;
}

function createTransferIdempotencyKey(input: Record<string, string>) {
  const digest = createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");

  return `monra-transfer-${digest}`;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBridgeSourceDepositInstructions(
  value: BridgeTransferSourceDepositInstructionsResponse | null | undefined,
): BridgeSourceDepositInstructions | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    paymentRail: readString(value.payment_rail),
    amount: readString(value.amount),
    currency: readString(value.currency),
    depositMessage: readString(value.deposit_message),
    fromAddress: readString(value.from_address),
    toAddress: readString(value.to_address),
    blockchainMemo: readString(value.blockchain_memo),
    bankName: readString(value.bank_name),
    bankAddress: readString(value.bank_address),
    iban: readString(value.iban),
    bic: readString(value.bic),
    accountHolderName: readString(value.account_holder_name),
    bankRoutingNumber: readString(value.bank_routing_number),
    bankAccountNumber: readString(value.bank_account_number),
    bankBeneficiaryName: readString(value.bank_beneficiary_name),
    bankBeneficiaryAddress: readString(value.bank_beneficiary_address),
  };
}

function extractExpectedDestinationAmount(transfer: BridgeTransferResponse) {
  return (
    readString(transfer.receipt?.final_amount) ??
    readString(transfer.receipt?.converted_amount) ??
    readString(transfer.receipt?.subtotal_amount)
  );
}

function normalizeBridgeWebhookSignatureValue(value: string) {
  const normalized = value.trim();

  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

function parseBridgeWebhookSignatureHeader(signatureHeader: string) {
  const signatureParts = signatureHeader
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);
  const timestamp = signatureParts.find(part => part.startsWith("t="))?.slice(2)?.trim();
  const signaturePart = signatureParts.find(part => part.startsWith("v0="));
  const signature = signaturePart
    ? normalizeBridgeWebhookSignatureValue(signaturePart.slice(3))
    : undefined;

  if (!timestamp || !signature) {
    return null;
  }

  return {
    signature,
    timestamp,
  };
}

export function describeBridgeWebhookSignatureHeader(signatureHeader: string) {
  const parsedSignature = parseBridgeWebhookSignatureHeader(signatureHeader);
  const signatureParts = signatureHeader
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);
  const rawSignatureValue = signatureParts.find(part => part.startsWith("v0="))?.slice(3) ?? "";
  const normalizedSignatureValue = normalizeBridgeWebhookSignatureValue(rawSignatureValue);

  return {
    hasPadding: /=+$/.test(normalizedSignatureValue),
    hasQuotes: rawSignatureValue.trim().startsWith('"') && rawSignatureValue.trim().endsWith('"'),
    hasUrlSafeCharacters: /[-_]/.test(normalizedSignatureValue),
    hasWhitespace: /\s/.test(rawSignatureValue),
    isParsable: Boolean(parsedSignature),
    normalizedSignatureLength: normalizedSignatureValue.length,
    partCount: signatureParts.length,
    timestampLength: parsedSignature?.timestamp.length ?? 0,
  };
}

export function buildStoredBridgeComplianceState(user: AppUser): BridgeComplianceState {
  const hasAcceptedTermsOfService = user.bridgeTosStatus === "approved";
  const customerStatus = user.bridgeKycStatus;

  return {
    customerStatus,
    hasAcceptedTermsOfService,
    showKycAlert: Boolean(user.bridgeKycLink && customerStatus !== "active"),
    showTosAlert: Boolean(user.bridgeTosLink && !hasAcceptedTermsOfService),
  };
}

export async function createBridgeOnrampTransfer(input: {
  amount: string;
  bridgeCustomerId: string;
  destinationAddress: string;
  destinationAsset: OnrampDestinationAsset;
}) {
  const transfer = await bridgeRequest<BridgeTransferResponse>({
    method: "POST",
    path: "/transfers",
    idempotencyKey: createTransferIdempotencyKey({
      amount: input.amount,
      bridgeCustomerId: input.bridgeCustomerId,
      destinationAddress: input.destinationAddress,
      destinationAsset: input.destinationAsset,
      type: "onramp",
    }),
    body: {
      on_behalf_of: input.bridgeCustomerId,
      source: {
        currency: "eur",
        payment_rail: "sepa",
      },
      destination: {
        currency: input.destinationAsset,
        payment_rail: "solana",
        to_address: input.destinationAddress,
      },
      amount: input.amount,
      client_reference_id: randomUUID(),
      dry_run: false,
    },
  });

  const expectedDestinationAmount = extractExpectedDestinationAmount(transfer);
  if (!expectedDestinationAmount) {
    throw new BridgeApiError("Bridge transfer response did not include an expected destination amount.", 502);
  }

  return {
    bridgeTransferId: transfer.id,
    bridgeTransferStatus: transfer.state,
    depositInstructions: normalizeBridgeSourceDepositInstructions(transfer.source_deposit_instructions),
    destinationAmount: expectedDestinationAmount,
    receiptUrl: readString(transfer.receipt?.url),
    sourceAmount: transfer.amount,
    sourceCurrency: readString(transfer.source.currency) ?? "eur",
  };
}

export async function createBridgeOfframpTransfer(input: {
  amount: string;
  bridgeCustomerId: string;
  externalAccountId: string;
  returnAddress: string;
  sourceAddress: string;
  sourceAsset: OfframpSourceAsset;
}) {
  const transfer = await bridgeRequest<BridgeTransferResponse>({
    method: "POST",
    path: "/transfers",
    idempotencyKey: createTransferIdempotencyKey({
      amount: input.amount,
      bridgeCustomerId: input.bridgeCustomerId,
      externalAccountId: input.externalAccountId,
      returnAddress: input.returnAddress,
      sourceAddress: input.sourceAddress,
      sourceAsset: input.sourceAsset,
      type: "offramp",
    }),
    body: {
      on_behalf_of: input.bridgeCustomerId,
      source: {
        currency: input.sourceAsset,
        payment_rail: "solana",
        from_address: input.sourceAddress,
      },
      destination: {
        currency: "eur",
        payment_rail: "sepa",
        external_account_id: input.externalAccountId,
      },
      amount: input.amount,
      client_reference_id: randomUUID(),
      dry_run: false,
      return_instructions: {
        address: input.returnAddress,
      },
    },
  });

  const depositInstructions = normalizeBridgeSourceDepositInstructions(transfer.source_deposit_instructions);
  if (!depositInstructions?.toAddress) {
    throw new BridgeApiError(
      "Bridge transfer response did not include a Solana deposit address.",
      502,
    );
  }

  return {
    bridgeTransferId: transfer.id,
    bridgeTransferStatus: transfer.state,
    depositInstructions,
    receiptUrl: readString(transfer.receipt?.url),
    sourceAmount: readString(transfer.amount) ?? input.amount,
    sourceCurrency: readString(transfer.source.currency) ?? input.sourceAsset,
  };
}

export async function createBridgeKycLink(input: {
  accountType: AccountType;
  cdpUserId: string;
  email: string;
  fullName: string;
}) {
  const bridgeLink = await bridgeRequest<BridgeKycLinkResponse>({
    method: "POST",
    path: "/kyc_links",
    idempotencyKey: createKycLinkIdempotencyKey(input.cdpUserId),
    body: {
      email: input.email,
      endorsements: ["sepa", "base"],
      full_name: input.fullName,
      type: input.accountType,
    },
  });

  return {
    customerId: bridgeLink.customer_id,
    id: bridgeLink.id,
    kycLink: bridgeLink.kyc_link,
    kycStatus: bridgeLink.kyc_status,
    tosLink: bridgeLink.tos_link,
    tosStatus: bridgeLink.tos_status,
  };
}

export async function fetchBridgeCustomer(customerId: string) {
  const customer = await bridgeRequest<BridgeCustomerResponse>({
    path: `/customers/${customerId}`,
  });

  return {
    hasAcceptedTermsOfService: customer.has_accepted_terms_of_service,
    status: customer.status,
  };
}

export async function createBridgeExternalAccount(input: {
  bankCountryCode: string;
  bankName: string;
  bic: string;
  bridgeCustomerId: string;
  businessName?: string;
  firstName?: string;
  iban: string;
  lastName?: string;
  recipientType: BankRecipientType;
  userId: number;
}) {
  const accountOwnerName =
    input.recipientType === "business"
      ? input.businessName!.trim()
      : `${input.firstName!.trim()} ${input.lastName!.trim()}`.trim();

  return bridgeRequest<BridgeExternalAccountResponse>({
    method: "POST",
    path: `/customers/${input.bridgeCustomerId}/external_accounts`,
    idempotencyKey: createExternalAccountIdempotencyKey({
      userId: input.userId,
      recipientType: input.recipientType,
      displayName: accountOwnerName,
      bankCountryCode: input.bankCountryCode,
      bankName: input.bankName,
      iban: input.iban,
      bic: input.bic,
    }),
    body: {
      currency: "eur",
      bank_name: input.bankName,
      account_owner_name: accountOwnerName,
      account_type: "iban",
      iban: {
        account_number: input.iban,
        bic: input.bic,
        country: input.bankCountryCode,
      },
      account_owner_type: input.recipientType,
      ...(input.recipientType === "business"
        ? { business_name: input.businessName }
        : {
            first_name: input.firstName,
            last_name: input.lastName,
          }),
    },
  });
}

export async function deleteBridgeExternalAccount(input: {
  bridgeCustomerId: string;
  externalAccountId: string;
}) {
  return bridgeRequest<BridgeExternalAccountResponse>({
    method: "DELETE",
    path: `/customers/${input.bridgeCustomerId}/external_accounts/${input.externalAccountId}`,
  });
}

export function validateBridgeWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
): BridgeWebhookSignatureVerificationResult {
  try {
    const parsedSignature = parseBridgeWebhookSignatureHeader(signatureHeader);
    if (!parsedSignature) {
      return {
        isValid: false,
        error: "Missing Bridge webhook timestamp or signature.",
      };
    }

    const timestampMs = Number.parseInt(parsedSignature.timestamp, 10);
    if (!Number.isFinite(timestampMs)) {
      return {
        isValid: false,
        error: "Invalid Bridge webhook timestamp.",
      };
    }

    if (Math.abs(Date.now() - timestampMs) > config.bridgeWebhookMaxAgeMs) {
      return {
        isValid: false,
        error: "Bridge webhook timestamp is outside the accepted window.",
      };
    }

    const digest = createHash("sha256")
      .update(`${parsedSignature.timestamp}.${rawBody.toString("utf8")}`)
      .digest();

    const verifier = createVerify("RSA-SHA256");
    verifier.update(digest);
    verifier.end();

    return {
      isValid: verifier.verify(
        config.bridgeWebhookPublicKey,
        normalizeBridgeWebhookSignatureValue(parsedSignature.signature),
        "base64",
      ),
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "Bridge webhook verification failed.",
    };
  }
}

export async function syncBridgeStatus(user: AppUser) {
  if (!user.bridgeCustomerId) {
    return {
      bridge: buildStoredBridgeComplianceState(user),
      user,
    };
  }

  const customer = await fetchBridgeCustomer(user.bridgeCustomerId);
  const updatedUser = await updateUserBridgeStatuses({
    bridgeKycStatus: customer.status,
    bridgeTosStatus: customer.hasAcceptedTermsOfService ? "approved" : "pending",
    userId: user.id,
  });

  return {
    bridge: {
      customerStatus: customer.status,
      hasAcceptedTermsOfService: customer.hasAcceptedTermsOfService,
      showKycAlert: Boolean(updatedUser.bridgeKycLink && customer.status !== "active"),
      showTosAlert: Boolean(updatedUser.bridgeTosLink && !customer.hasAcceptedTermsOfService),
    },
    user: updatedUser,
  };
}
