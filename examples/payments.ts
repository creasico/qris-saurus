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

  const va = await gateway.createVirtualAccount({
    orderId: `INV-VA-${Date.now()}`,
    amount: 50_000,
    bank: "bca",
    customerEmail: "customer@example.com",
    notificationUrl: "https://merchant.example/webhooks/midtrans",
  });

  console.log("VA number:", va.vaNumber);

  const checkout = await gateway.createHostedCheckout({
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
