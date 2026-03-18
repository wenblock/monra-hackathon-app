import { createHash } from "node:crypto";

import { config } from "../config.js";
import { updateUserBridgeStatuses } from "../db.js";
import type {
  AccountType,
  AppUser,
  BankRecipientType,
  BridgeComplianceState,
  BridgeKycStatus,
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
  const response = await fetch(`${config.bridgeApiBaseUrl}${path}`, {
    method,
    headers: {
      "Api-Key": config.bridgeApiKey,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

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
