import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError, useLoaderData } from "react-router";
import { PlanCard } from "../components/PlanCard";
import prisma from "../db.server";
import { getPlanLimits } from "../plans.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const [shopRecord, apartmentCount] = await Promise.all([
    prisma.shop.findUnique({ where: { shop } }),
    prisma.apartment.count({ where: { shop } }),
  ]);
  const appPlan = shopRecord?.plan ?? "free";
  const limits  = getPlanLimits(appPlan);
  const apartmentLimit = limits.apartments === Infinity ? null : limits.apartments;
  return { appPlan, apartmentCount, apartmentLimit, renewalDate: null };
};

// ─── Dummy data ───────────────────────────────────────────────────────────────

const STATS = [
  { label: "Total Bookings",     value: "124" },
  { label: "Active Apartments",  value: "8"   },
  { label: "Revenue This Month", value: "$4,280" },
  { label: "Avg. Occupancy",     value: "73%" },
];

const RECENT_BOOKINGS = [
  { id: "#1042", guest: "Sarah Johnson",  apartment: "Ocean View Suite",  checkIn: "Jun 12",  checkOut: "Jun 16",  total: "$580",  status: "confirmed" },
  { id: "#1041", guest: "Marco Rossi",    apartment: "Downtown Loft",     checkIn: "Jun 10",  checkOut: "Jun 14",  total: "$420",  status: "confirmed" },
  { id: "#1040", guest: "Aisha Patel",    apartment: "Garden Studio",     checkIn: "Jun 8",   checkOut: "Jun 11",  total: "$315",  status: "completed" },
  { id: "#1039", guest: "James Carter",   apartment: "Rooftop Penthouse", checkIn: "Jun 5",   checkOut: "Jun 10",  total: "$950",  status: "completed" },
  { id: "#1038", guest: "Elena Müller",   apartment: "Ocean View Suite",  checkIn: "Jun 1",   checkOut: "Jun 4",   total: "$435",  status: "cancelled" },
];

const STATUS_STYLE = {
  confirmed: { background: "#d4edda", color: "#155724" },
  completed: { background: "#e2e3e5", color: "#383d41" },
  cancelled: { background: "#f8d7da", color: "#721c24" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const planData = useLoaderData();
  return (
    <s-page heading="Dashboard">
      <PlanCard data={planData} />

      {/* Stats */}
      <s-section heading="Overview">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
          {STATS.map((s) => (
            <div
              key={s.label}
              style={{
                padding: "16px",
                border: "1px solid #e1e3e5",
                borderRadius: "8px",
              }}
            >
              <div style={{ fontSize: "13px", color: "#6d7175", marginBottom: "6px" }}>
                {s.label}
              </div>
              <div style={{ fontSize: "22px", fontWeight: 700, color: "#202223" }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </s-section>

      {/* Recent bookings */}
      <s-section heading="Recent Bookings">
        <s-paragraph>Latest bookings across all apartments.</s-paragraph>
        <div style={{ border: "1px solid #e1e3e5", borderRadius: "8px", overflow: "hidden", marginTop: "12px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                {["Order", "Guest", "Apartment", "Check-in", "Check-out", "Total", "Status"].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RECENT_BOOKINGS.map((b, i) => (
                <tr
                  key={b.id}
                  style={{ borderBottom: i < RECENT_BOOKINGS.length - 1 ? "1px solid #e1e3e5" : "none" }}
                >
                  <td style={tdStyle}>{b.id}</td>
                  <td style={tdStyle}>{b.guest}</td>
                  <td style={{ ...tdStyle, color: "#6d7175" }}>{b.apartment}</td>
                  <td style={tdStyle}>{b.checkIn}</td>
                  <td style={tdStyle}>{b.checkOut}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{b.total}</td>
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      padding: "2px 10px",
                      borderRadius: "10px",
                      ...STATUS_STYLE[b.status],
                    }}>
                      {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </s-section>

      {/* Quick actions aside */}
      <s-section slot="aside" heading="Quick Actions">
        <s-unordered-list>
          <s-list-item><s-link href="/app/apartments">Manage Apartments</s-link></s-list-item>
          <s-list-item><s-link href="/app/booking">View Bookings</s-link></s-list-item>
          <s-list-item><s-link href="/app/notifications">Notification Settings</s-link></s-list-item>
          <s-list-item><s-link href="/app/settings">Global Settings</s-link></s-list-item>
        </s-unordered-list>
      </s-section>

      {/* Summary aside */}
      <s-section slot="aside" heading="This Month">
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[
            { label: "New bookings",  value: "16"      },
            { label: "Cancellations", value: "2"       },
            { label: "Avg. stay",     value: "3.8 nights" },
            { label: "Top apartment", value: "Rooftop Penthouse" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", paddingBottom: "10px", borderBottom: "1px solid #f1f2f3" }}>
              <span style={{ color: "#6d7175" }}>{s.label}</span>
              <span style={{ fontWeight: 600, color: "#202223" }}>{s.value}</span>
            </div>
          ))}
        </div>
      </s-section>

    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);

const thStyle = {
  padding: "10px 14px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#6d7175",
  textAlign: "left",
};

const tdStyle = {
  padding: "12px 14px",
  fontSize: "14px",
  color: "#202223",
  verticalAlign: "middle",
};
