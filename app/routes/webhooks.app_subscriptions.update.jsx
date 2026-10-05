import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { planKeyFromName } from "../plans.server";

export const action = async ({ request }) => {
  try {
    const { shop, payload } = await authenticate.webhook(request);

    // Shopify sends the subscription object as the payload itself or nested under app_subscription.
    const sub    = payload?.app_subscription ?? payload ?? {};
    const status = sub.status ?? "";
    const name   = sub.name  ?? "";

    const newPlan = status === "ACTIVE" ? planKeyFromName(name) : "free";

    await prisma.shop.upsert({
      where:  { shop },
      update: { plan: newPlan },
      create: { shop, plan: newPlan },
    });

    console.log(`[Rentfic] ${shop} plan → ${newPlan} (subscription "${name}" ${status})`);
    return new Response();
  } catch (err) {
    console.error("Webhook processing error:", err);
    // Return 200 so Shopify doesn't disable the webhook, but we log the error for debugging
    return new Response();
  }
};
