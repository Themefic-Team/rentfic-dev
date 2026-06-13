import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { planKeyFromName } from "../plans.server";

export const action = async ({ request }) => {
  const { shop, payload } = await authenticate.webhook(request);

  const sub    = payload?.app_subscription ?? {};
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
};
