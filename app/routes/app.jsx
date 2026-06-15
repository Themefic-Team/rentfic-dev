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

    // Never overwrite plan — managed by billing webhook
    await prisma.shop.upsert({
      where:  { shop },
      update: {
        name:     s?.name,
        email:    s?.email,
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

  const [shopRecord, apartmentCount] = await Promise.all([
    prisma.shop.findUnique({ where: { shop } }),
    prisma.apartment.count({ where: { shop } }),
  ]);

  const appPlan = shopRecord?.plan ?? "free";
  const limits  = getPlanLimits(appPlan);
  const apartmentLimit = limits.apartments === Infinity ? null : limits.apartments;

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    appPlan,
    apartmentCount,
    apartmentLimit,
    renewalDate,
  };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={enTranslations}>
        <s-app-nav>
          <s-link href="/app">Dashboard</s-link>
          <s-link href="/app/apartments">Apartments Settings</s-link>
          <s-link href="/app/settings">Global Settings</s-link>
          <s-link href="/app/booking">Booking</s-link>
          <s-link href="/app/notifications">Notifications</s-link>
          <s-link href="/app/subscribtion">Subscription</s-link>
        </s-app-nav>
        <Outlet />
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
