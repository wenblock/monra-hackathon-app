import assert from "node:assert/strict";
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import test from "node:test";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();

process.env.ALLOWED_ORIGINS = "http://localhost:3000";
process.env.DATABASE_URL = "postgres://postgres:postgres@localhost:5432/monra";
process.env.ALCHEMY_API_KEY = "alchemy-api-key";
process.env.ALCHEMY_WEBHOOK_ID = "alchemy-webhook-id";
process.env.ALCHEMY_WEBHOOK_AUTH_TOKEN = "alchemy-webhook-auth-token";
process.env.ALCHEMY_WEBHOOK_SIGNING_KEY = "alchemy-webhook-signing-key";
process.env.CDP_API_KEY_ID = "cdp-api-key-id";
process.env.CDP_API_KEY_SECRET = "cdp-api-key-secret";
process.env.BRIDGE_API_KEY = "bridge-api-key";
process.env.BRIDGE_WEBHOOK_PUBLIC_KEY = publicKeyPem;
process.env.BRIDGE_WEBHOOK_MAX_AGE_MS = "600000";

const { createBridgeOnrampTransfer, validateBridgeWebhookSignature } = await import("./bridge.js");

function signBridgeWebhookPayload(timestamp: string, rawBody: Buffer) {
  const digest = createHash("sha256")
    .update(`${timestamp}.${rawBody.toString("utf8")}`)
    .digest();

  const signer = createSign("RSA-SHA256");
  signer.update(digest);
  signer.end();

  return signer.sign(privateKey, "base64");
}

test("validateBridgeWebhookSignature accepts a standard Bridge signature header", () => {
  const rawBody = Buffer.from('{"message":"Hello World!"}', "utf8");
  const timestamp = Date.now().toString();
  const signature = signBridgeWebhookPayload(timestamp, rawBody);

  const result = validateBridgeWebhookSignature(rawBody, `t=${timestamp},v0=${signature}`);

  assert.equal(result.isValid, true);
});

test("validateBridgeWebhookSignature accepts whitespace after the comma separator", () => {
  const rawBody = Buffer.from('{"message":"Hello World!"}', "utf8");
  const timestamp = Date.now().toString();
  const signature = signBridgeWebhookPayload(timestamp, rawBody);

  const result = validateBridgeWebhookSignature(rawBody, `t=${timestamp}, v0=${signature}`);

  assert.equal(result.isValid, true);
});

test("validateBridgeWebhookSignature accepts surrounding whitespace around the signature value", () => {
  const rawBody = Buffer.from('{"message":"Hello World!"}', "utf8");
  const timestamp = Date.now().toString();
  const signature = signBridgeWebhookPayload(timestamp, rawBody);

  const result = validateBridgeWebhookSignature(rawBody, ` t=${timestamp} , v0=  ${signature}  `);

  assert.equal(result.isValid, true);
});

test("validateBridgeWebhookSignature accepts an unpadded base64 signature", () => {
  const rawBody = Buffer.from('{"message":"Hello World!"}', "utf8");
  const timestamp = Date.now().toString();
  const signature = signBridgeWebhookPayload(timestamp, rawBody).replace(/=+$/, "");

  const result = validateBridgeWebhookSignature(rawBody, `t=${timestamp},v0=${signature}`);

  assert.equal(result.isValid, true);
});

test("validateBridgeWebhookSignature rejects malformed headers missing the timestamp", () => {
  const rawBody = Buffer.from('{"message":"Hello World!"}', "utf8");
  const timestamp = Date.now().toString();
  const signature = signBridgeWebhookPayload(timestamp, rawBody);

  const result = validateBridgeWebhookSignature(rawBody, `v0=${signature}`);

  assert.equal(result.isValid, false);
  assert.equal(result.error, "Missing Bridge webhook timestamp or signature.");
});

test("validateBridgeWebhookSignature rejects malformed headers missing the signature", () => {
  const rawBody = Buffer.from('{"message":"Hello World!"}', "utf8");
  const timestamp = Date.now().toString();

  const result = validateBridgeWebhookSignature(rawBody, `t=${timestamp}`);

  assert.equal(result.isValid, false);
  assert.equal(result.error, "Missing Bridge webhook timestamp or signature.");
});

test("createBridgeOnrampTransfer requests a USDC destination transfer", async () => {
  const originalFetch = globalThis.fetch;
  let requestedCurrency: string | null = null;

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      destination: { currency: string };
    };
    requestedCurrency = body.destination.currency;

    return new Response(
      JSON.stringify({
        amount: "25",
        id: "bridge-transfer-id",
        receipt: {
          final_amount: "24.75",
          url: "https://bridge.example/receipt",
        },
        source: {
          currency: "eur",
          payment_rail: "sepa",
        },
        state: "pending",
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      },
    );
  };

  try {
    const result = await createBridgeOnrampTransfer({
      amount: "25",
      bridgeCustomerId: "customer-id",
      destinationAddress: "wallet-address",
      destinationAsset: "usdc",
    });

    assert.equal(requestedCurrency, "usdc");
    assert.equal(result.destinationAmount, "24.75");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createBridgeOnrampTransfer requests a EURC destination transfer", async () => {
  const originalFetch = globalThis.fetch;
  let requestedCurrency: string | null = null;

  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      destination: { currency: string };
    };
    requestedCurrency = body.destination.currency;

    return new Response(
      JSON.stringify({
        amount: "25",
        id: "bridge-transfer-id",
        receipt: {
          final_amount: "24.75",
          url: "https://bridge.example/receipt",
        },
        source: {
          currency: "eur",
          payment_rail: "sepa",
        },
        state: "pending",
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      },
    );
  };

  try {
    const result = await createBridgeOnrampTransfer({
      amount: "25",
      bridgeCustomerId: "customer-id",
      destinationAddress: "wallet-address",
      destinationAsset: "eurc",
    });

    assert.equal(requestedCurrency, "eurc");
    assert.equal(result.destinationAmount, "24.75");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
