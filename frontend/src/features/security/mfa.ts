import {
  getEnabledMfaMethods,
  getEnrolledMfaMethods,
  isEnrolledInMfa,
  type MfaMethod,
  type User,
} from "@coinbase/cdp-core";

type CdpMfaStatusKind = "enabled" | "not_enrolled" | "unavailable";

interface GetCdpMfaStatusOptions {
  didJustEnroll?: boolean;
}

export interface CdpMfaStatus {
  canEnroll: boolean;
  detail: string;
  enabledMethods: MfaMethod[];
  enrolledMethods: MfaMethod[];
  isAvailable: boolean;
  isEnrolled: boolean;
  methodSummary: string;
  status: CdpMfaStatusKind;
  statusLabel: string;
}

export function getCdpMfaStatus(
  user: User | null,
  options: GetCdpMfaStatusOptions = {},
): CdpMfaStatus {
  const enabledMethods = safeGetEnabledMfaMethods();
  const enrolledMethods = user ? safeGetEnrolledMfaMethods(user) : [];
  const didJustEnroll = options.didJustEnroll ?? false;
  const isAvailable = enabledMethods.length > 0;
  const isEnrolled =
    didJustEnroll || enrolledMethods.length > 0 || (user ? safeIsEnrolledInMfa(user) : false);

  if (!isAvailable && !didJustEnroll) {
    return {
      canEnroll: false,
      detail:
        "MFA is not currently enabled for this CDP project. Protected wallet actions will continue without an enrollment option.",
      enabledMethods,
      enrolledMethods,
      isAvailable,
      isEnrolled: false,
      methodSummary: "Project methods: Not enabled",
      status: "unavailable",
      statusLabel: "Unavailable",
    };
  }

  if (isEnrolled) {
    return {
      canEnroll: false,
      detail:
        "Verification code is needed for protected wallet actions like transaction signing and key export.",
      enabledMethods,
      enrolledMethods,
      isAvailable,
      isEnrolled: true,
      methodSummary:
        enrolledMethods.length > 0
          ? `Enrolled methods: ${formatMfaMethodList(enrolledMethods)}`
          : "Enrollment completed",
      status: "enabled",
      statusLabel: "Enabled",
    };
  }

  return {
    canEnroll: true,
    detail:
      "Set up MFA to add a verification step before protected wallet actions like transaction signing and key export.",
    enabledMethods,
    enrolledMethods,
    isAvailable,
    isEnrolled: false,
    methodSummary: `Available methods: ${formatMfaMethodList(enabledMethods)}`,
    status: "not_enrolled",
    statusLabel: "Not enrolled",
  };
}

function safeGetEnabledMfaMethods() {
  try {
    return normalizeMethods(getEnabledMfaMethods());
  } catch {
    return [];
  }
}

function safeGetEnrolledMfaMethods(user: User) {
  try {
    return normalizeMethods(getEnrolledMfaMethods(user));
  } catch {
    return [];
  }
}

function safeIsEnrolledInMfa(user: User) {
  try {
    return isEnrolledInMfa(user);
  } catch {
    return false;
  }
}

function normalizeMethods(methods: readonly MfaMethod[]) {
  return Array.from(new Set(methods)).sort((left, right) => getMethodOrder(left) - getMethodOrder(right));
}

function getMethodOrder(method: MfaMethod) {
  switch (method) {
    case "totp":
      return 0;
    case "sms":
      return 1;
    default:
      return 2;
  }
}

function formatMfaMethod(method: MfaMethod) {
  switch (method) {
    case "totp":
      return "Authenticator app";
    case "sms":
      return "Text message";
    default:
      return String(method).toUpperCase();
  }
}

export function formatMfaMethodList(methods: readonly MfaMethod[]) {
  const labels = normalizeMethods(methods).map(formatMfaMethod);

  if (labels.length === 0) {
    return "None enabled";
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}
