import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  // Redirect to the app dashboard, preserving any query parameters from Shopify (like shop, host, id_token)
  throw redirect(`/app?${url.searchParams.toString()}`);
};

// We still need a default export for the route, but it won't be rendered because the loader always redirects.
export default function Index() {
  return null;
}
