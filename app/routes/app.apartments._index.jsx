import { useState, useMemo } from "react";
import { useLoaderData, useSubmit, useNavigate } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Icon } from "@shopify/polaris";
import { EditIcon, CalendarIcon, ViewIcon, DeleteIcon, DuplicateIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPlanLimits } from "../plans.server";
import { PlanCard } from "../components/PlanCard";

const PAGE_SIZE = 10;

export const loader = async ({ request }) => {
  const { session: { shop } } = await authenticate.admin(request);
  const [apartments, shopRecord] = await Promise.all([
    prisma.apartment.findMany({ where: { shop }, orderBy: { createdAt: "desc" } }),
    prisma.shop.findUnique({ where: { shop } }),
  ]);
  const limits = getPlanLimits(shopRecord?.plan);
  return {
    apartments,
    apartmentLimit: limits.apartments,
  };
};

export const action = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const id = formData.get("id");

  if (intent === "delete") {
    const apartment = await prisma.apartment.findUnique({ where: { id } });
    await prisma.apartment.delete({ where: { id } });
    if (apartment?.productId) {
      await admin.graphql(
        `#graphql
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) { product { id } }
        }`,
        {
          variables: {
            input: {
              id: apartment.productId.startsWith('gid://') ? apartment.productId : `gid://shopify/Product/${apartment.productId}`,
              metafields: [{ namespace: "rentfic", key: "is_apartment", value: "false", type: "single_line_text_field" }],
            },
          },
        }
      );
    }
    return { success: true };
  }

  if (intent === "bulk") {
    const ids = JSON.parse(formData.get("ids"));
    const bulkAction = formData.get("bulkAction");
    if (bulkAction === "delete") {
      await prisma.apartment.deleteMany({ where: { shop: session.shop, id: { in: ids } } });
    } else {
      await prisma.apartment.updateMany({
        where: { shop: session.shop, id: { in: ids } },
        data: { status: bulkAction === "activate" ? "active" : "inactive" },
      });
    }
    return { success: true };
  }
  
  if (intent === "duplicate") {
    const id = formData.get("id");
    const source = await prisma.apartment.findUnique({ where: { id } });
    if (!source) return { error: "Not found" };

    const count = await prisma.apartment.count({ where: { shop: session.shop } });
    const shopRecord = await prisma.shop.findUnique({ where: { shop: session.shop } });
    const limits = getPlanLimits(shopRecord?.plan);
    
    if (limits.apartments !== Infinity && count >= limits.apartments) {
      return { error: "Plan limit reached" };
    }

    await prisma.apartment.create({
      data: {
        shop:         source.shop,
        productId:    source.productId,
        productTitle: source.productTitle + " (Copy)",
        name:         source.name + " (Copy)",
        status:       "draft",
        pricePerNight: source.pricePerNight,
        settings:     source.settings ? JSON.parse(JSON.stringify(source.settings)) : {},
      },
    });

    return { success: true };
  }

  return { success: true };
};

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? "s" : ""} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? "s" : ""} ago`;
}


export default function ApartmentsIndexPage() {
  const { apartments, apartmentLimit } = useLoaderData();
  const atLimit = apartmentLimit !== Infinity && apartments.length >= apartmentLimit;
  const submit = useSubmit();
  const navigate = useNavigate();
  const shopify = useAppBridge();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());

  const existingProductIds = useMemo(
    () => new Set(apartments.map((a) => a.productId)),
    [apartments]
  );

  const filtered = useMemo(() => {
    let list = apartments.filter((a) =>
      a.productTitle.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase())
    );
    if (sort === "oldest") list = [...list].reverse();
    return list;
  }, [apartments, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const allOnPageSelected =
    paginated.length > 0 && paginated.every((a) => selected.has(a.id));

  const toggleSelectAll = () => {
    if (allOnPageSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        paginated.forEach((a) => next.delete(a.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        paginated.forEach((a) => next.add(a.id));
        return next;
      });
    }
  };

  const submitBulk = (action) => {
    if (action === "delete" && !confirm("Are you sure you want to delete the selected apartments?")) return;
    const fd = new FormData();
    fd.append("intent", "bulk");
    fd.append("ids", JSON.stringify(Array.from(selected)));
    fd.append("bulkAction", action);
    submit(fd, { method: "POST" });
    setSelected(new Set());
  };

  const handleCreate = async () => {
    if (atLimit) {
      shopify.toast.show(`Free plan allows ${apartmentLimit} apartment. Upgrade to add more.`, { isError: true });
      return;
    }
    const result = await shopify.resourcePicker({ type: "product", multiple: false });
    const items = Array.isArray(result) ? result : result ? [result] : [];
    if (!items.length) return;
    const p = items[0];
    if (existingProductIds.has(p.id)) {
      shopify.toast.show("An apartment already exists for this product", { isError: true });
      return;
    }
    const params = new URLSearchParams({ productId: p.id, productTitle: p.title });
    navigate(`/app/apartments/new?${params.toString()}`);
  };

  const handleDelete = (id, name) => {
    if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      submit({ id, intent: "delete" }, { method: "POST" });
    }
  };

  const handleDuplicate = (id, name) => {
    if (atLimit) {
      shopify.toast.show(`Free plan allows ${apartmentLimit} apartment. Upgrade to add more.`, { isError: true });
      return;
    }
    if (window.confirm(`Duplicate "${name}"?`)) {
      submit({ id, intent: "duplicate" }, { method: "POST" });
    }
  };

  const handlePageChange = (next) => {
    if (next >= 1 && next <= totalPages) setPage(next);
  };

  if (apartments.length === 0) {
    return (
      <s-page heading="Apartments">
        <s-button slot="primary-action" onClick={handleCreate} disabled={atLimit ? "" : undefined}>
          {atLimit ? "Plan Limit Reached" : "Create Apartment"}
        </s-button>
        <PlanCard />
        <s-section>
          <div style={emptyStyle}>
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
            <button onClick={handleCreate} style={createBtnStyle}>
              Create Apartment
            </button>
          </div>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Apartments">
      <s-button slot="primary-action" onClick={handleCreate}>
        Create Apartment
      </s-button>
      <PlanCard />

      <s-section>
        <div style={cardStyle}>
          {/* Search */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e1e3e5" }}>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search Products"
              style={searchStyle}
            />
          </div>

          {/* Toolbar */}
          <div style={toolbarStyle}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <input
                type="checkbox"
                checked={allOnPageSelected}
                onChange={toggleSelectAll}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#008060" }}
              />
              <span style={{ fontSize: "14px", color: "#202223", fontWeight: 500 }}>
                {filtered.length} Product{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button style={ghostBtnStyle}>
                <Icon source={ViewIcon} />
                <span style={{ marginLeft: 6 }}>Show</span>
              </button>
              <div style={{ position: "relative" }}>
                <select
                  value={sort}
                  onChange={(e) => { setSort(e.target.value); setPage(1); }}
                  style={sortSelectStyle}
                >
                  <option value="newest">Sort by Newest</option>
                  <option value="oldest">Sort by Oldest</option>
                </select>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderBottom: "1px solid #e1e3e5" }} />

          {/* Bulk Actions Bar */}
          {selected.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#f4f6f8", borderBottom: "1px solid #e1e3e5" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#202223" }}>{selected.size} apartments selected</span>
              <button
                onClick={() => submitBulk("activate")}
                style={{ padding: "5px 12px", fontSize: 13, fontWeight: 500, borderRadius: 4, border: "1px solid #c9cccf", background: "#fff", cursor: "pointer" }}
              >
                Activate Selected
              </button>
              <button
                onClick={() => submitBulk("deactivate")}
                style={{ padding: "5px 12px", fontSize: 13, fontWeight: 500, borderRadius: 4, border: "1px solid #c9cccf", background: "#fff", cursor: "pointer" }}
              >
                Deactivate Selected
              </button>
              <button
                onClick={() => submitBulk("delete")}
                style={{ padding: "5px 12px", fontSize: 13, fontWeight: 500, borderRadius: 4, border: "1px solid #c9cccf", background: "#fff", color: "#d82c0d", cursor: "pointer", marginLeft: "auto" }}
              >
                Delete Selected
              </button>
            </div>
          )}

          {/* Rows */}
          {paginated.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "#6d7175", fontSize: 14 }}>
              No apartments match your search.
            </div>
          ) : (
            paginated.map((apt, i) => (
              <div
                key={apt.id}
                style={{
                  ...rowStyle,
                  borderBottom: i < paginated.length - 1 ? "1px solid #e1e3e5" : "none",
                }}
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(apt.id)}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      next.has(apt.id) ? next.delete(apt.id) : next.add(apt.id);
                      return next;
                    })
                  }
                  style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0, accentColor: "#008060" }}
                />

                {/* Thumbnail */}
                <div style={thumbStyle} />

                {/* Title */}
                {console.log(apt)}
                <div style={{ minWidth: 120, flex: "0 0 auto" }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#202223" }}>
                    {apt.productTitle}
                  </div>
                  {apt.name !== apt.productTitle && (
                    <div style={{ fontSize: 12, color: "#6d7175" }}>{apt.name}</div>
                  )}
                </div>

                {/* Badges row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 }}>
                  <span style={badge("#f6f6f7", "#202223")}>Apartment</span>

                 
                  {/* Status */}
                  <span style={statusBadge(apt.status)}>
                    {apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                  </span>

                  {/* Price */}
                  {apt.pricePerNight != null && (
                    <span style={{ fontSize: 13, color: "#6d7175" }}>
                      ${apt.pricePerNight.toFixed(2)}/night
                    </span>
                  )}
                </div>

                {/* Actions + timestamp */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      title="Duplicate"
                      onClick={() => handleDuplicate(apt.id, apt.name)}
                      style={iconBtnStyle}
                    >
                      <Icon source={DuplicateIcon} />
                    </button>
                    <button
                      title="Edit"
                      onClick={() => navigate(`/app/apartments/${apt.id}`)}
                      style={iconBtnStyle}
                    >
                      <Icon source={EditIcon} />
                    </button>
                    <button
                      title="Availability"
                      onClick={() => navigate(`/app/apartments/${apt.id}`)}
                      style={iconBtnStyle}
                    >
                      <Icon source={CalendarIcon} />
                    </button>
                    <button
                      title="Delete"
                      onClick={() => handleDelete(apt.id, apt.name)}
                      style={{ ...iconBtnStyle, color: "#c0392b" }}
                    >
                      <Icon source={DeleteIcon} tone="critical" />
                    </button>
                  </div>
                  <span style={{ fontSize: 11, color: "#8c9196" }}>{timeAgo(apt.createdAt)}</span>
                </div>
              </div>
            ))
          )}

          {/* Pagination */}
          <div style={paginationStyle}>
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              style={pageArrowStyle(page === 1)}
            >
              ‹
            </button>
            <span style={{ fontSize: 13, color: "#202223" }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
              style={pageArrowStyle(page === totalPages)}
            >
              ›
            </button>
          </div>
        </div>
      </s-section>
    </s-page>
  );
}

const cardStyle = {
  border: "1px solid #e1e3e5",
  borderRadius: "8px",
  overflow: "hidden",
  background: "#fff",
};

const searchStyle = {
  width: "100%",
  padding: "8px 14px",
  border: "1px solid #c9cccf",
  borderRadius: "8px",
  fontSize: 14,
  boxSizing: "border-box",
  outline: "none",
};

const toolbarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 16px",
};

const ghostBtnStyle = {
  display: "flex",
  alignItems: "center",
  padding: "6px 12px",
  border: "1px solid #c9cccf",
  borderRadius: "8px",
  background: "#fff",
  fontSize: 13,
  cursor: "pointer",
  color: "#202223",
};

const sortSelectStyle = {
  padding: "6px 28px 6px 12px",
  border: "1px solid #c9cccf",
  borderRadius: "8px",
  background: "#fff",
  fontSize: 13,
  cursor: "pointer",
  color: "#202223",
  appearance: "auto",
};

const rowStyle = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "14px 16px",
};

const thumbStyle = {
  width: 44,
  height: 44,
  borderRadius: 6,
  background: "#e1e3e5",
  flexShrink: 0,
};

const iconBtnStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  border: "1px solid #e1e3e5",
  borderRadius: "6px",
  background: "#fff",
  cursor: "pointer",
  color: "#202223",
  padding: 0,
};

const paginationStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: "14px 16px",
  borderTop: "1px solid #e1e3e5",
};

const pageArrowStyle = (disabled) => ({
  width: 32,
  height: 32,
  border: "1px solid #e1e3e5",
  borderRadius: "6px",
  background: disabled ? "#f6f6f7" : "#fff",
  cursor: disabled ? "not-allowed" : "pointer",
  color: disabled ? "#c9cccf" : "#202223",
  fontSize: 18,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
});

const badge = (bg, color) => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 600,
  background: bg,
  color,
  border: "1px solid #e1e3e5",
});

const statusBadge = (status) => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 12,
  fontSize: 12,
  fontWeight: 600,
  background: status === "active" ? "#d4edda" : status === "draft" ? "#fff3cd" : "#f8d7da",
  color: status === "active" ? "#155724" : status === "draft" ? "#856404" : "#721c24",
});

const emptyStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "60px 24px",
  gap: "16px",
  textAlign: "center",
};

const createBtnStyle = {
  marginTop: "8px",
  padding: "10px 20px",
  background: "#008060",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
};
