import { gateway } from "../src";

async function main() {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) {
    throw new Error("Set MIDTRANS_SERVER_KEY before running this example.");
  }

  gateway.configure({
    provider: "midtrans",
    serverKey,
    sandbox: true,
  });

  console.log("Capabilities:", gateway.capabilities());

  const vaPayment = await gateway.createPayment({
    method: "virtual_account",
    orderId: `INV-VA-${Date.now()}`,
    amount: 50_000,
    bank: "bca",
    customerEmail: "customer@example.com",
    notificationUrl: "https://merchant.example/webhooks/midtrans",
  });

  if (vaPayment.method === "virtual_account") {
    console.log("VA number:", vaPayment.vaNumber);
  }

  const checkout = await gateway.createCheckout({
    orderId: `INV-SNAP-${Date.now()}`,
    amount: 75_000,
    enabledMethods: ["qris", "virtual_account", "ewallet"],
    customerEmail: "customer@example.com",
    notificationUrl: "https://merchant.example/webhooks/midtrans",
  });

  console.log("Checkout URL:", checkout.checkoutUrl);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
