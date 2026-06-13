import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const SHOPIFY_API_VERSION = "2025-10";

async function setVariantPrice(shop, productGid, price) {
  const sess = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { expires: "desc" },
  });
  if (!sess?.accessToken) return;

  const endpoint = `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  const headers = {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": sess.accessToken,
  };

  const varRes = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `{ product(id: "${productGid}") { variants(first:1) { edges { node { id } } } } }`,
    }),
  });
  const varJson = await varRes.json();
  const variantId = varJson?.data?.product?.variants?.edges?.[0]?.node?.id;
  if (!variantId) return;

  await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `mutation BulkUpdatePrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id price }
          userErrors { field message }
        }
      }`,
      variables: {
        productId: productGid,
        variants: [{ id: variantId, price: parseFloat(price).toFixed(2) }],
      },
    }),
  });
}

export const action = async ({ request }) => {
  if (request.method !== "POST") return Response.json({ ok: false });

  const { session } = await authenticate.public.appProxy(request);

  let body;
  try { body = await request.json(); } catch { return Response.json({ ok: false }); }

  const { productId, price } = body;
  if (!productId || price == null) return Response.json({ ok: false });

  const productGid = String(productId).startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  await setVariantPrice(session.shop, productGid, price);
  return Response.json({ ok: true });
};
