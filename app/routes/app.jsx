import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Fetch shop details from Shopify and upsert into our database
  try {
    const response = await admin.graphql(`
      query {
        shop {
          name
          email
          plan { displayName }
          currencyCode
          ianaTimezone
          billingAddress { countryCodeV2 }
        }
      }
    `);
    const { data } = await response.json();
    const s = data?.shop;

    await prisma.shop.upsert({
      where: { shop: session.shop },
      update: {
        name: s?.name,
        email: s?.email,
        plan: s?.plan?.displayName,
        currency: s?.currencyCode,
        timezone: s?.ianaTimezone,
        country: s?.billingAddress?.countryCodeV2,
      },
      create: {
        shop: session.shop,
        name: s?.name,
        email: s?.email,
        plan: s?.plan?.displayName,
        currency: s?.currencyCode,
        timezone: s?.ianaTimezone,
        country: s?.billingAddress?.countryCodeV2,
      },
    });
  } catch (e) {
    // Non-fatal — don't break the app if shop fetch fails
    console.error("Failed to sync shop details:", e);
  }

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Dashboard</s-link>
        <s-link href="/app/apartments">Apartments Settings</s-link>
        <s-link href="/app/settings">Global Settings</s-link>
        <s-link href="/app/booking">Booking</s-link>
        <s-link href="/app/notifications">Notifications</s-link>
        <s-link href="/app/subscribtion">Subscription</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
