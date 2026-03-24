import assert from "node:assert/strict";
import test from "node:test";
import type { AppUser } from "../types.js";
import type { TokenBalanceAmount, TransactionStreamResponse, YieldAsset } from "../types.js";

process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/monra";
process.env.ALCHEMY_API_KEY = "alchemy-api-key";
process.env.ALCHEMY_WEBHOOK_ID = "alchemy-webhook-id";
process.env.ALCHEMY_WEBHOOK_AUTH_TOKEN = "alchemy-webhook-auth-token";
process.env.ALCHEMY_WEBHOOK_SIGNING_KEY = "alchemy-webhook-signing-key";
process.env.CDP_API_KEY_ID = "cdp-api-key-id";
process.env.CDP_API_KEY_SECRET = "cdp-api-key-secret";
process.env.BRIDGE_API_KEY = "bridge-api-key";
process.env.BRIDGE_WEBHOOK_PUBLIC_KEY = "test-public-key";
process.env.BRIDGE_WEBHOOK_MAX_AGE_MS = "600000";

const { confirmYieldTransactionForUser, getYieldLedgerSummaryForUser } = await import("./yieldService.js");
const { ServiceError } = await import("./errors.js");

const JUPITER_LEND_EARN_PROGRAM_ID = "jup3YeL8QhtSx1e253b2FDvsMNC87fDrgQZivbrndc9";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const JL_USDC_MINT = "9BEcn9aPEmhSPbPQeFGjidRiEKki46fVQDyPpSQXPA2D";
const USER_WALLET_ADDRESS = "Wallet1111111111111111111111111111111111111";
const USER_TOKEN_ACCOUNT = "UserToken1111111111111111111111111111111111";
const VAULT_TOKEN_ACCOUNT = "VaultToken111111111111111111111111111111111";
const USER_JL_TOKEN_ACCOUNT = "UserJlToken1111111111111111111111111111111";
const VAULT_WALLET_ADDRESS = "VaultWallet1111111111111111111111111111111";

test("getYieldLedgerSummaryForUser delegates to the repository", async () => {
  const summary = await getYieldLedgerSummaryForUser(
    7,
    {
      async getYieldLedgerSummaryByUserId(userId: number) {
        assert.equal(userId, 7);
        return {
          eurc: { formatted: "0", raw: "0" },
          usdc: { formatted: "1", raw: "1000000" },
        };
      },
    } as any,
  );

  assert.equal(summary.usdc.raw, "1000000");
});

test("confirmYieldTransactionForUser validates the transfer and records the confirmed deposit", async () => {
  let storedInput: {
    action: "deposit" | "withdraw";
    amountRaw: string;
    asset: YieldAsset;
    counterpartyWalletAddress?: string | null;
    fromWalletAddress: string;
  } | null = null;
  let broadcastedUserId: number | null = null;

  const result = await confirmYieldTransactionForUser(
    {
      action: "deposit",
      amount: "1",
      asset: "usdc",
      transactionSignature: "yield-signature-1",
      user: createUserFixture(),
    },
    {
      async broadcastLatestTransactionSnapshot(
        userId: number,
        balances: Record<"sol" | "usdc" | "eurc", TokenBalanceAmount> | undefined,
      ) {
        broadcastedUserId = userId;
        assert.equal((balances as any).usdc.raw, "0");
        return {} as TransactionStreamResponse;
      },
      async createConfirmedYieldTransaction(input: {
        action: "deposit" | "withdraw";
        amountRaw: string;
        asset: YieldAsset;
        counterpartyWalletAddress?: string | null;
        fromWalletAddress: string;
      }) {
        storedInput = input;
        return {
          balances: {
            eurc: { formatted: "0", raw: "0" },
            sol: { formatted: "0", raw: "0" },
            usdc: { formatted: "0", raw: "0" },
          },
          transaction: { id: 99 },
        } as any;
      },
      async fetchSolanaParsedTransaction() {
        return createParsedYieldDepositTransactionFixture();
      },
      async getYieldLedgerSummaryByUserId() {
        return {
          eurc: { formatted: "0", raw: "0" },
          usdc: { formatted: "1", raw: "1000000" },
        };
      },
    },
  );

  assert.equal(broadcastedUserId, 7);
  assert.equal(storedInput?.action, "deposit");
  assert.equal(storedInput?.amountRaw, "1000000");
  assert.equal(storedInput?.asset, "usdc");
  assert.equal(storedInput?.counterpartyWalletAddress, VAULT_WALLET_ADDRESS);
  assert.equal(storedInput?.fromWalletAddress, USER_WALLET_ADDRESS);
  assert.equal((result as any).transaction.id, 99);
});

test("confirmYieldTransactionForUser rejects transactions without a Jupiter Lend instruction", async () => {
  await assert.rejects(
    confirmYieldTransactionForUser(
      {
        action: "deposit",
        amount: "1",
        asset: "usdc",
        transactionSignature: "yield-signature-2",
        user: createUserFixture(),
      },
      {
        async broadcastLatestTransactionSnapshot() {
          throw new Error("should not be called");
        },
        async createConfirmedYieldTransaction() {
          throw new Error("should not be called");
        },
        async fetchSolanaParsedTransaction() {
          return createParsedYieldDepositTransactionFixture({
            transaction: {
              message: {
                accountKeys: createParsedYieldDepositTransactionFixture().transaction?.message?.accountKeys ?? [],
                instructions: [
                  {
                    parsed: {
                      info: {
                        amount: "1000000",
                        destination: VAULT_TOKEN_ACCOUNT,
                        source: USER_TOKEN_ACCOUNT,
                      },
                      type: "transferChecked",
                    },
                    program: "spl-token",
                  },
                ],
              },
            },
          });
        },
        async getYieldLedgerSummaryByUserId() {
          throw new Error("should not be called");
        },
      },
    ),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.status === 409 &&
      /Jupiter Lend Earn instruction/i.test(error.message),
  );
});

function createUserFixture(overrides: Partial<AppUser> = {}): AppUser {
  return {
    accountType: "individual",
    bridgeCustomerId: "bridge-customer",
    bridgeKycLink: null,
    bridgeKycLinkId: null,
    bridgeKycStatus: "active",
    bridgeTosLink: null,
    bridgeTosStatus: "approved",
    businessName: null,
    cdpUserId: "cdp-user-1",
    countryCode: "DE",
    countryName: "Germany",
    createdAt: "2026-03-19T00:00:00.000Z",
    email: "jane@example.com",
    fullName: "Jane Doe",
    id: 7,
    publicId: "00000000-0000-4000-8000-000000000007",
    solanaAddress: USER_WALLET_ADDRESS,
    updatedAt: "2026-03-19T00:00:00.000Z",
    ...overrides,
  };
}

function createParsedYieldDepositTransactionFixture(
  overrides: Record<string, unknown> = {},
) {
  return {
    blockTime: 1_700_000_000,
    meta: {
      err: null,
      fee: 5000,
      innerInstructions: [],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: USDC_MINT,
          owner: USER_WALLET_ADDRESS,
          uiTokenAmount: {
            amount: "1000000",
          },
        },
        {
          accountIndex: 1,
          mint: USDC_MINT,
          owner: VAULT_WALLET_ADDRESS,
          uiTokenAmount: {
            amount: "1000000",
          },
        },
        {
          accountIndex: 2,
          mint: JL_USDC_MINT,
          owner: USER_WALLET_ADDRESS,
          uiTokenAmount: {
            amount: "1000000",
          },
        },
      ],
      preTokenBalances: [
        {
          accountIndex: 0,
          mint: USDC_MINT,
          owner: USER_WALLET_ADDRESS,
          uiTokenAmount: {
            amount: "2000000",
          },
        },
        {
          accountIndex: 1,
          mint: USDC_MINT,
          owner: VAULT_WALLET_ADDRESS,
          uiTokenAmount: {
            amount: "0",
          },
        },
      ],
    },
    transaction: {
      message: {
        accountKeys: [
          USER_TOKEN_ACCOUNT,
          VAULT_TOKEN_ACCOUNT,
          USER_JL_TOKEN_ACCOUNT,
          {
            pubkey: USER_WALLET_ADDRESS,
            signer: true,
          },
          VAULT_WALLET_ADDRESS,
        ],
        instructions: [
          {
            programId: JUPITER_LEND_EARN_PROGRAM_ID,
            parsed: {
              info: {},
              type: "deposit",
            },
          },
          {
            parsed: {
              info: {
                amount: "1000000",
                destination: VAULT_TOKEN_ACCOUNT,
                source: USER_TOKEN_ACCOUNT,
              },
              type: "transferChecked",
            },
            program: "spl-token",
          },
        ],
      },
    },
    ...overrides,
  };
}
