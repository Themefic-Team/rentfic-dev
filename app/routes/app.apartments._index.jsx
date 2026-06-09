import { useLoaderData, useSubmit, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const apartments = await prisma.apartment.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });
  return { apartments };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = formData.get("id");

  if (intent === "delete") {
    await prisma.apartment.delete({
      where: { id },
    });
  }
  return { success: true };
};

const statusBadgeStyle = (status) => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: "12px",
  fontSize: "12px",
  fontWeight: 600,
  background: status === "active" ? "#d4edda" : status === "draft" ? "#fff3cd" : "#f8d7da",
  color: status === "active" ? "#155724" : status === "draft" ? "#856404" : "#721c24",
});

export default function ApartmentsIndexPage() {
  const { apartments } = useLoaderData();
  const submit = useSubmit();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const handleCreate = async () => {
    const selected = await shopify.resourcePicker({ type: "product", multiple: false });
    const items = Array.isArray(selected) ? selected : selected ? [selected] : [];
    if (!items.length) return;
    const p = items[0];
    const params = new URLSearchParams({
      productId: p.id,
      productTitle: p.title,
    });
    navigate(`/app/apartments/new?${params.toString()}`);
  };

  const handleDelete = (id, name) => {
    if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      submit({ id, intent: "delete" }, { method: "POST" });
    }
  };

  return (
    <s-page heading="Apartments">
      <s-button slot="primary-action" onClick={handleCreate}>
        Create Apartment
      </s-button>

      {apartments.length === 0 ? (
        <s-section>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "60px 24px",
              gap: "16px",
              textAlign: "center",
            }}
          >
            <img
              src="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              alt="No apartments"
              style={{ width: 160, opacity: 0.7 }}
            />
            <div style={{ fontSize: "18px", fontWeight: 600, color: "#202223" }}>
              Manage your rental apartments
            </div>
            <div style={{ fontSize: "14px", color: "#6d7175", maxWidth: 400 }}>
              Connect your Shopify products to rental apartments and manage
              pricing, availability, and customization.
            </div>
            <button
              onClick={handleCreate}
              style={{
                marginTop: "8px",
                padding: "10px 20px",
                background: "#008060",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Create Apartment
            </button>
          </div>
        </s-section>
      ) : (
        <s-section>
          <div
            style={{
              border: "1px solid #e1e3e5",
              borderRadius: "8px",
              overflow: "hidden",
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f6f6f7", borderBottom: "1px solid #e1e3e5" }}>
                  <th style={thStyle}>Apartment</th>
                  <th style={thStyle}>Product</th>
                  <th style={thStyle}>Price / Night</th>
                  <th style={thStyle}>Guests</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {apartments.map((apt, i) => (
                  <tr
                    key={apt.id}
                    style={{
                      borderBottom:
                        i < apartments.length - 1 ? "1px solid #e1e3e5" : "none",
                    }}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600, color: "#202223" }}>{apt.name}</div>
                      {apt.city && (
                        <div style={{ fontSize: "12px", color: "#6d7175" }}>
                          {[apt.city, apt.country].filter(Boolean).join(", ")}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontSize: "13px", color: "#6d7175" }}>
                        {apt.productTitle}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {apt.pricePerNight != null
                        ? `$${apt.pricePerNight.toFixed(2)}`
                        : "—"}
                    </td>
                    <td style={tdStyle}>
                      {apt.maxGuests != null ? apt.maxGuests : "—"}
                    </td>
                    <td style={tdStyle}>
                      <span style={statusBadgeStyle(apt.status)}>
                        {apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                        <button
                          onClick={() => navigate(`/app/apartments/${apt.id}`)}
                          style={actionBtnStyle("#008060")}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() =>
                            shopify.intents?.invoke?.("edit:shopify/Product", {
                              value: apt.productId,
                            })
                          }
                          style={actionBtnStyle("#4a4a4a")}
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDelete(apt.id, apt.name)}
                          style={actionBtnStyle("#c0392b")}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </s-section>
      )}
    </s-page>
  );
}

const thStyle = {
  padding: "10px 16px",
  fontSize: "13px",
  fontWeight: 600,
  color: "#6d7175",
  textAlign: "left",
};

const tdStyle = {
  padding: "14px 16px",
  fontSize: "14px",
  color: "#202223",
  verticalAlign: "middle",
};

const actionBtnStyle = (bg) => ({
  padding: "5px 12px",
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
});
