/**
 * gateway.ts — Gateway integration examples
 *
 * Demonstrates: gateway singleton, charge, status, verify
 *
 * Run:
 *   bun run examples/gateway.ts
 *
 * Requires environment variables — see .env.example
 */

import {
  gateway,
  midtransAdapter,
  xenditAdapter,
} from "../src/index";

// ── 1. Gateway singleton (Midtrans) ──────────────────────────────────

async function exampleMidtrans() {
  console.log("=== Midtrans Gateway ===\n");

  gateway.configure({
    provider: "midtrans",
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "SB-Mid-server-xxx",
    sandbox: true,
  });

  // Charge — creates dynamic QR via Midtrans API
  const charge = await gateway.charge("INV-001", 25000, {
    description: "Coffee order",
    customerEmail: "buyer@example.com",
  });
  console.log("QR string:", charge.qrisString?.slice(0, 60) + "...");
  console.log("QR image URL:", charge.qrImageUrl ?? "(not provided)");
  console.log("Gateway order ID:", charge.gatewayOrderId);

  // Status — check payment status
  const status = await gateway.status("INV-001");
  console.log("Status:", status.status);
  if (status.paidAt) {
    console.log("Paid at:", status.paidAt);
  }
  console.log();
}

// ── 2. Gateway singleton (Xendit) ────────────────────────────────────

async function exampleXendit() {
  console.log("=== Xendit Gateway ===\n");

  gateway.configure({
    provider: "xendit",
    secretKey: process.env.XENDIT_SECRET_KEY ?? "xnd_development_xxx",
  });

  const charge = await gateway.charge("INV-002", 50000);
  console.log("QR string:", charge.qrisString?.slice(0, 60) + "...");

  const status = await gateway.status(charge.gatewayOrderId);
  console.log("Status:", status.status);
  console.log();
}

// ── 3. Gateway singleton (Duitku) ────────────────────────────────────

async function exampleDuitku() {
  console.log("=== Duitku Gateway ===\n");

  gateway.configure({
    provider: "duitku",
    merchantCode: process.env.DUITKU_MERCHANT_CODE ?? "Dxxxxx",
    merchantKey: process.env.DUITKU_MERCHANT_KEY ?? "xxx",
    sandbox: true,
  });

  const charge = await gateway.charge("INV-003", 75000, {
    returnUrl: "https://example.com/thanks",
    callbackUrl: "https://example.com/webhooks/duitku",
  });
  console.log("QR string:", charge.qrisString?.slice(0, 60) + "...");

  const status = await gateway.status("INV-003");
  console.log("Status:", status.status);
  console.log();
}

// ── 4. Direct adapter usage (without gateway singleton) ──────────────

async function exampleDirectAdapter() {
  console.log("=== Direct Adapter Usage ===\n");

  // Midtrans adapter directly
  const midtransConfig = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "SB-Mid-server-xxx",
    sandbox: true,
  };

  const result = await midtransAdapter.createDynamicQr(
    { orderId: "INV-DIRECT-001", amount: 30000 },
    midtransConfig,
    { overrideNotificationUrl: "https://example.com/webhooks/midtrans" },
  );
  console.log("Direct Midtrans QR:", result.qrisString?.slice(0, 60) + "...");
  console.log();

  // Xendit adapter directly
  const xenditConfig = {
    secretKey: process.env.XENDIT_SECRET_KEY ?? "xnd_development_xxx",
  };

  const xenditResult = await xenditAdapter.createDynamicQr(
    { orderId: "INV-DIRECT-002", amount: 45000 },
    xenditConfig,
  );
  console.log("Direct Xendit QR:", xenditResult.qrisString?.slice(0, 60) + "...");
  console.log();
}

// ── 5. Webhook verification ──────────────────────────────────────────

async function exampleWebhook() {
  console.log("=== Webhook Verification ===\n");

  const midtransConfig = {
    serverKey: process.env.MIDTRANS_SERVER_KEY ?? "SB-Mid-server-xxx",
    sandbox: true,
  };

  // Parse and verify a Midtrans webhook
  const webhookPayload = {
    order_id: "INV-001",
    transaction_status: "settlement",
    status_code: "200",
    gross_amount: "25000.00",
    signature_key: "xxx",
  };

  // getWebhookStatus extracts normalized status without full verification
  const webhookStatus = midtransAdapter.getWebhookStatus(webhookPayload);
  console.log("Webhook status:", webhookStatus);
  console.log();

  // parseWebhook validates + normalizes
  try {
    const parsed = midtransAdapter.parseWebhook(webhookPayload, midtransConfig);
    console.log("Parsed webhook — order:", parsed.orderId, "status:", parsed.status);
  } catch {
    console.log("Webhook signature invalid (expected in demo)");
  }
  console.log();
}

// ── Run ──────────────────────────────────────────────────────────────

async function main() {
  await exampleMidtrans();
  await exampleXendit();
  await exampleDuitku();
  await exampleDirectAdapter();
  await exampleWebhook();
  console.log("Done!");
}

main().catch(console.error);
