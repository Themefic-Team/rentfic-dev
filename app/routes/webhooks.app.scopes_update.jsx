import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;

  if (session && current != null) {
    await db.session.update({
      where: {
        id: session.id,
      },
      data: {
        scope: String(current),
      },
    });
  }

  return new Response();
};
