import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const SHOPIFY_API_VERSION = "2025-10";

async function getShopifyClient(shop) {
  const sess = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    orderBy: { expires: "desc" },
  });
  if (!sess?.accessToken) return null;
  return {
    endpoint: `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": sess.accessToken,
    },
  };
}

async function setVariantPriceByGid(variantGid, price, endpoint, headers) {
  await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      query: `mutation {
        productVariantUpdate(input: { id: "${variantGid}", price: "${parseFloat(price || 0).toFixed(2)}" }) {
          productVariant { id }
          userErrors { field message }
        }
      }`,
    }),
  });
}

async function setVariantPrice(shop, productGid, price) {
  const client = await getShopifyClient(shop);
  if (!client) return;
  const { endpoint, headers } = client;

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

  const { productId, price, depositVariantGid } = body;

  // Reset main booking variant price back to pricePerNight
  if (productId && price != null) {
    const productGid = String(productId).startsWith("gid://")
      ? productId
      : `gid://shopify/Product/${productId}`;
    await setVariantPrice(session.shop, productGid, price);
  }

  // Reset deposit variant price back to 0
  if (depositVariantGid) {
    const client = await getShopifyClient(session.shop);
    if (client) {
      await setVariantPriceByGid(depositVariantGid, 0, client.endpoint, client.headers);
    }
  }

  return Response.json({ ok: true });
};
