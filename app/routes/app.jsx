import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPlanLimits } from "../plans.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  let renewalDate = null;

  try {
    const response = await admin.graphql(`
      query {
        shop {
          name
          email
          currencyCode
          ianaTimezone
          billingAddress { countryCodeV2 }
        }
        currentAppInstallation {
          activeSubscriptions {
            name
            status
            currentPeriodEnd
          }
        }
      }
    `);
    const { data } = await response.json();
    const s   = data?.shop;
    const sub = (data?.currentAppInstallation?.activeSubscriptions ?? [])
      .find((x) => x.status === "ACTIVE");

    renewalDate = sub?.currentPeriodEnd ?? null;

    // Never overwrite plan - managed by billing webhook
    await prisma.shop.upsert({
      where:  { shop },
      update: {
        name:     s?.name,
        email:    s?.email,
        // plan:     "free",
        currency: s?.currencyCode,
        timezone: s?.ianaTimezone,
        country:  s?.billingAddress?.countryCodeV2,
      },
      create: {
        shop,
        name:     s?.name,
        email:    s?.email,
        plan:     "free",
        currency: s?.currencyCode,
        timezone: s?.ianaTimezone,
        country:  s?.billingAddress?.countryCodeV2,
      },
    });
  } catch (e) {
    console.error("Failed to sync shop details:", e);
  }

  const [shopRecord, listingCount] = await Promise.all([
    prisma.shop.findUnique({ where: { shop } }),
    prisma.apartment.count({ where: { shop } }),
  ]);

  const appPlan = shopRecord?.plan ?? "free";
  const limits  = getPlanLimits(appPlan);
  const listingLimit = limits.listings === Infinity ? null : limits.listings;

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    appPlan,
    listingCount,
    listingLimit,
    renewalDate,
  };
};

export default function App() {
  const { apiKey, appPlan } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={enTranslations}>
        <s-app-nav>
          <s-link href="/app">Dashboard</s-link>
          <s-link href="/app/apartments">Rentals</s-link>
          <s-link href="/app/settings">Global Settings</s-link>
          <s-link href="/app/booking">Booking</s-link>
          <s-link href="/app/notifications">Notifications</s-link>
          {appPlan === "business" && (
            <s-link href="/app/analytics">Analytics</s-link>
          )}
          <s-link href="/app/subscribtion">Subscription</s-link>
          <s-link href="/app/help">Help</s-link>
        </s-app-nav>
        <Outlet />
        {appPlan === "business" && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                window.$crisp=[];window.CRISP_WEBSITE_ID="YOUR_CRISP_ID";
                (function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";
                s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();
              `,
            }}
          />
        )}
      </PolarisProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
