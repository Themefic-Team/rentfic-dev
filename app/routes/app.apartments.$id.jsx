import { useState, useEffect, useRef, useCallback } from "react";
import {
  useLoaderData,
  useSubmit,
  useNavigation,
  useSearchParams,
  useActionData,
} from "react-router";
import { redirect } from "react-router";
import { useAppBridge, SaveBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPlanLimits } from "../plans.server";

// ─── Constants ───────────────────────────────────────────────────────────────

const AMENITY_SUGGESTIONS = [
  "WiFi", "Air Conditioning", "Heating", "Kitchen", "Washing Machine", "Dryer",
  "TV", "Netflix", "Free Parking", "EV Charging", "Pool", "Hot Tub", "Gym",
  "Elevator", "Balcony", "Terrace", "Garden", "BBQ Grill", "Sea View",
  "Mountain View", "City View", "Pet Friendly", "Smoking Allowed",
  "Wheelchair Accessible", "24/7 Check-in", "Concierge", "Breakfast Included",
];

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const DEFAULT_WEEKLY = Object.fromEntries(
  DAYS.map(({ key }) => [key, { enabled: true, open: "00:00", close: "23:59" }])
);

const uid = () => Math.random().toString(36).slice(2, 10);

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  if (params.id === "new") {
    const shopRecord = await prisma.shop.findUnique({ where: { shop } });
    const limits     = getPlanLimits(shopRecord?.plan);
    const count      = await prisma.apartment.count({ where: { shop } });
    if (count >= limits.apartments) {
      return {
        apartment:   null,
        limitReached: true,
        currentCount: count,
        planLimit:    limits.apartments,
      };
    }
    return { apartment: null, limitReached: false };
  }

  const apartment = await prisma.apartment.findFirst({
    where: { id: params.id, shop },
  });
  if (!apartment) throw new Response("Not Found", { status: 404 });
  return { apartment, limitReached: false };
};

// ─── Action ──────────────────────────────────────────────────────────────────

async function syncVariantPrice(admin, productId, price) {
  if (!price) return;
  const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`;

  const res = await admin.graphql(
    `#graphql
    query GetFirstVariant($id: ID!) {
      product(id: $id) { variants(first: 1) { edges { node { id } } } }
    }`,
    { variables: { id: gid } }
  );
  const json = await res.json();
  const variantId = json?.data?.product?.variants?.edges?.[0]?.node?.id;
  if (!variantId) return;

  await admin.graphql(
    `#graphql
    mutation BulkUpdatePrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id price }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        productId: gid,
        variants: [{ id: variantId, price: price.toFixed(2) }],
      },
    }
  );
}

async function setRentficMetafields(admin, productId, settings = {}) {
  const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`;
  await admin.graphql(
    `#graphql
    mutation productUpdate($input: ProductInput!) {
      productUpdate(input: $input) { product { id } userErrors { field message } }
    }`,
    {
      variables: {
        input: {
          id: gid,
          metafields: [
            { namespace: "rentfic", key: "is_apartment", value: "true", type: "single_line_text_field" },
            { namespace: "rentfic", key: "additional_fees", value: JSON.stringify(settings.additionalFees ?? []), type: "json" },
          ],
        },
      },
    }
  );
}

export const action = async ({ request, params }) => {
  const { session, admin } = await authenticate.admin(request);
  const fd = await request.formData();

  // Top-level queryable columns
  const pricePerNight = fd.get("pricePerNight") ? parseFloat(fd.get("pricePerNight")) : null;
  const core = {
    shop: session.shop,
    productId: fd.get("productId"),
    productTitle: fd.get("productTitle"),
    name: fd.get("name") || "",
    status: fd.get("status") || "active",
    pricePerNight,
  };

  // Everything else goes into the settings JSON blob
  const settings = {
    description: fd.get("description") || null,
    bookingType: fd.get("bookingType") || "single",
    // availability
    calendarStartDate: fd.get("calendarStartDate") || null,
    calendarEndDate: fd.get("calendarEndDate") || null,
    checkInTime: fd.get("checkInTime") || null,
    checkOutTime: fd.get("checkOutTime") || null,
    minDays: fd.get("minDays") ? parseInt(fd.get("minDays")) : 1,
    maxDays: fd.get("maxDays") ? parseInt(fd.get("maxDays")) : null,
    maxAdults: fd.get("maxAdults") ? parseInt(fd.get("maxAdults")) : null,
    maxChildren: fd.get("maxChildren") ? parseInt(fd.get("maxChildren")) : null,
    maxInfants: fd.get("maxInfants") ? parseInt(fd.get("maxInfants")) : null,
    quantityEnabled: fd.get("quantityEnabled") === "true",
    weeklyAvailability: JSON.parse(fd.get("weeklyAvailability") || "null"),
    // block dates
    blockedDates: JSON.parse(fd.get("blockedDates") || "[]"),
    // stock / capacity
    bedrooms: fd.get("bedrooms") ? parseInt(fd.get("bedrooms")) : null,
    bathrooms: fd.get("bathrooms") ? parseInt(fd.get("bathrooms")) : null,
    maxGuests: fd.get("maxGuests") ? parseInt(fd.get("maxGuests")) : null,
    stockQuantity: fd.get("stockQuantity") ? parseInt(fd.get("stockQuantity")) : null,
    // location
    address: fd.get("address") || null,
    city: fd.get("city") || null,
    country: fd.get("country") || null,
    // amenities
    amenities: fd.getAll("amenities"),
    // additional fees
    additionalFees: JSON.parse(fd.get("additionalFees") || "[]"),
    // discounts
    discountedDates: JSON.parse(fd.get("discountedDates") || "[]"),
    conditionalDiscounts: JSON.parse(fd.get("conditionalDiscounts") || "[]"),
    // payment
    payNowEnabled: fd.get("payNowEnabled") === "true",
    payNowPercent: fd.get("payNowPercent") ? parseFloat(fd.get("payNowPercent")) : null,
    // deposit
    depositEnabled: fd.get("depositEnabled") === "true",
    depositType: fd.get("depositType") || "percent",
    depositAmount: fd.get("depositAmount") ? parseFloat(fd.get("depositAmount")) : null,
  };

  if (params.id === "new") {
    const created = await prisma.apartment.create({ data: { ...core, settings } });
    await syncVariantPrice(admin, core.productId, pricePerNight);
    await setRentficMetafields(admin, core.productId, settings);
    return redirect(`/app/apartments/${created.id}?saved=1`);
  }
  const { shop, ...updateCore } = core;
  await prisma.apartment.update({
    where: { id: params.id },
    data: { ...updateCore, settings },
  });
  await syncVariantPrice(admin, core.productId, pricePerNight);
  await setRentficMetafields(admin, core.productId, settings);
  return { success: true };
};

// ─── UI Primitives ───────────────────────────────────────────────────────────

function Toggle({ enabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: "none", padding: 0,
        background: enabled ? "#008060" : "#c9cccf",
        position: "relative", cursor: "pointer", flexShrink: 0,
        transition: "background 0.2s",
      }}
    >
      <span style={{
        position: "absolute", top: 3,
        left: enabled ? 22 : 3,
        width: 18, height: 18, borderRadius: "50%",
        background: "#fff", transition: "left 0.2s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
      }} />
    </button>
  );
}

function Field({ label, hint, children, style: s }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...s }}>
      <label style={{ fontSize: 14, fontWeight: 500, color: "#202223" }}>{label}</label>
      {hint && <span style={{ fontSize: 12, color: "#6d7175", marginTop: -2 }}>{hint}</span>}
      {children}
    </div>
  );
}

const Inp = ({ style: s, ...props }) => (
  <input style={{ ...inputStyle, ...s }} {...props} />
);
const Sel = ({ style: s, children, ...props }) => (
  <select style={{ ...inputStyle, ...s }} {...props}>{children}</select>
);

function ToggleRow({ label, hint, enabled, onChange }) {
  return (
    <div style={toggleRowStyle}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#202223" }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: "#6d7175", marginTop: 2 }}>{hint}</div>}
      </div>
      <Toggle enabled={enabled} onChange={onChange} />
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ApartmentEditPage() {
  const { apartment, limitReached, currentCount, planLimit } = useLoaderData();
  const actionData = useActionData();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const isNew = !apartment;
  const isSaving = navigation.state === "submitting";

  const productId = apartment?.productId ?? searchParams.get("productId") ?? "";
  const productTitle = apartment?.productTitle ?? searchParams.get("productTitle") ?? "";

  // Flatten settings blob + top-level columns into one initial values ref
  const orig = useRef(null);
  if (!orig.current) {
    const s = apartment?.settings ?? {};
    orig.current = {
      // top-level columns
      name: apartment?.name ?? productTitle,
      status: apartment?.status ?? "active",
      pricePerNight: apartment?.pricePerNight?.toString() ?? "",
      // settings blob
      description: s.description ?? "",
      bookingType: s.bookingType ?? "single",
      calendarStartDate: s.calendarStartDate ?? "",
      calendarEndDate: s.calendarEndDate ?? "",
      checkInTime: s.checkInTime ?? "14:00",
      checkOutTime: s.checkOutTime ?? "11:00",
      minDays: s.minDays?.toString() ?? "1",
      maxDays: s.maxDays?.toString() ?? "",
      maxAdults: s.maxAdults?.toString() ?? "",
    maxChildren: s.maxChildren?.toString() ?? "",
    maxInfants: s.maxInfants?.toString() ?? "",
    quantityEnabled: s.quantityEnabled ?? false,
      weeklyAvailability: s.weeklyAvailability ?? DEFAULT_WEEKLY,
      blockedDates: s.blockedDates ?? [],
      bedrooms: s.bedrooms?.toString() ?? "",
      bathrooms: s.bathrooms?.toString() ?? "",
      maxGuests: s.maxGuests?.toString() ?? "",
      stockQuantity: s.stockQuantity?.toString() ?? "",
      address: s.address ?? "",
      city: s.city ?? "",
      country: s.country ?? "",
      amenities: s.amenities ?? [],
      additionalFees: s.additionalFees ?? [],
      discountedDates: s.discountedDates ?? [],
      conditionalDiscounts: s.conditionalDiscounts ?? [],
      payNowEnabled: s.payNowEnabled ?? false,
      payNowPercent: s.payNowPercent?.toString() ?? "100",
      depositEnabled: s.depositEnabled ?? false,
      depositType: s.depositType ?? "percent",
      depositAmount: s.depositAmount?.toString() ?? "",
    };
  }

  const o = orig.current;
  const [name, setName] = useState(o.name);
  const [status, setStatus] = useState(o.status);
  const [pricePerNight, setPricePerNight] = useState(o.pricePerNight);
  const [description, setDescription] = useState(o.description);
  const [bookingType, setBookingType] = useState(o.bookingType);
  const [calendarStartDate, setCalendarStartDate] = useState(o.calendarStartDate);
  const [calendarEndDate, setCalendarEndDate] = useState(o.calendarEndDate);
  const [checkInTime, setCheckInTime] = useState(o.checkInTime);
  const [checkOutTime, setCheckOutTime] = useState(o.checkOutTime);
  const [minDays, setMinNights] = useState(o.minDays);
  const [maxDays, setMaxNights] = useState(o.maxDays);
  const [maxAdults, setMaxAdults] = useState(o.maxAdults);
  const [maxChildren, setMaxChildren] = useState(o.maxChildren);
  const [maxInfants, setMaxInfants] = useState(o.maxInfants);
  const [quantityEnabled, setQuantityEnabled] = useState(o.quantityEnabled);
  const [weeklyAvailability, setWeeklyAvailability] = useState(o.weeklyAvailability);
  const [blockedDates, setBlockedDates] = useState(o.blockedDates);
  const [bedrooms, setBedrooms] = useState(o.bedrooms);
  const [bathrooms, setBathrooms] = useState(o.bathrooms);
  const [maxGuests, setMaxGuests] = useState(o.maxGuests);
  const [stockQuantity, setStockQuantity] = useState(o.stockQuantity);
  const [address, setAddress] = useState(o.address);
  const [city, setCity] = useState(o.city);
  const [country, setCountry] = useState(o.country);
  const [amenities, setAmenities] = useState(o.amenities);
  const [additionalFees, setAdditionalFees] = useState(o.additionalFees);
  const [discountedDates, setDiscountedDates] = useState(o.discountedDates);
  const [conditionalDiscounts, setConditionalDiscounts] = useState(o.conditionalDiscounts);
  const [payNowEnabled, setPayNowEnabled] = useState(o.payNowEnabled);
  const [payNowPercent, setPayNowPercent] = useState(o.payNowPercent);
  const [depositEnabled, setDepositEnabled] = useState(o.depositEnabled);
  const [depositType, setDepositType] = useState(o.depositType);
  const [depositAmount, setDepositAmount] = useState(o.depositAmount);
  const [isDirty, setIsDirty] = useState(false);

  const [amenityInput, setAmenityInput] = useState("");
  const [blockDateInput, setBlockDateInput] = useState("");
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [discountDateInput, setDiscountDateInput] = useState("");

  const mark = useCallback((setter) => (e) => { setter(e.target.value); setIsDirty(true); }, []);
  const touch = useCallback((setter) => (val) => { setter(val); setIsDirty(true); }, []);

  useEffect(() => {
    if (isDirty) shopify.saveBar.show("apt-save-bar");
    else shopify.saveBar.hide("apt-save-bar");
  }, [isDirty, shopify]);

  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show("Saved");
      setIsDirty(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  useEffect(() => {
    if (searchParams.get("saved")) shopify.toast.show("Apartment created");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDiscard = () => {
    setName(o.name); setStatus(o.status); setPricePerNight(o.pricePerNight);
    setDescription(o.description); setBookingType(o.bookingType);
    setCalendarStartDate(o.calendarStartDate); setCalendarEndDate(o.calendarEndDate);
    setMaxAdults(o.maxAdults); setMaxChildren(o.maxChildren); setMaxInfants(o.maxInfants);
    setCheckInTime(o.checkInTime); setCheckOutTime(o.checkOutTime);
    setMinNights(o.minDays); setMaxNights(o.maxDays);
    setQuantityEnabled(o.quantityEnabled); setWeeklyAvailability(o.weeklyAvailability);
    setBlockedDates(o.blockedDates); setBedrooms(o.bedrooms); setBathrooms(o.bathrooms);
    setMaxGuests(o.maxGuests); setStockQuantity(o.stockQuantity);
    setAddress(o.address); setCity(o.city); setCountry(o.country);
    setAmenities(o.amenities); setAdditionalFees(o.additionalFees); setDiscountedDates(o.discountedDates);
    setConditionalDiscounts(o.conditionalDiscounts); setPayNowEnabled(o.payNowEnabled);
    setPayNowPercent(o.payNowPercent); setDepositEnabled(o.depositEnabled);
    setDepositType(o.depositType); setDepositAmount(o.depositAmount);
    setIsDirty(false);
  };

  const handleSave = () => {
    if (!name.trim()) {
      shopify.toast.show("Apartment name is required", { isError: true });
      return;
    }
    const fd = new FormData();
    // top-level columns
    fd.append("productId", productId);
    fd.append("productTitle", productTitle);
    fd.append("name", name);
    fd.append("status", status);
    fd.append("pricePerNight", pricePerNight);
    // settings fields
    fd.append("description", description);
    fd.append("bookingType", bookingType);
    fd.append("maxAdults", maxAdults);
    fd.append("maxChildren", maxChildren);
    fd.append("maxInfants", maxInfants);
    fd.append("calendarStartDate", calendarStartDate);
    fd.append("calendarEndDate", calendarEndDate);
    fd.append("checkInTime", checkInTime);
    fd.append("checkOutTime", checkOutTime);
    fd.append("minDays", minDays);
    fd.append("maxDays", maxDays);
    fd.append("quantityEnabled", String(quantityEnabled));
    fd.append("weeklyAvailability", JSON.stringify(weeklyAvailability));
    fd.append("blockedDates", JSON.stringify(blockedDates));
    fd.append("bedrooms", bedrooms);
    fd.append("bathrooms", bathrooms);
    fd.append("maxGuests", maxGuests);
    fd.append("stockQuantity", stockQuantity);
    fd.append("address", address);
    fd.append("city", city);
    fd.append("country", country);
    amenities.forEach((a) => fd.append("amenities", a));
    fd.append("additionalFees", JSON.stringify(additionalFees));
    fd.append("discountedDates", JSON.stringify(discountedDates));
    fd.append("conditionalDiscounts", JSON.stringify(conditionalDiscounts));
    fd.append("payNowEnabled", String(payNowEnabled));
    fd.append("payNowPercent", payNowPercent);
    fd.append("depositEnabled", String(depositEnabled));
    fd.append("depositType", depositType);
    fd.append("depositAmount", depositAmount);
    submit(fd, { method: "POST" });
  };

  // ─ Block dates ─
  const addBlockedDate = () => {
    if (!blockDateInput || blockedDates.includes(blockDateInput)) return;
    setBlockedDates((p) => [...p, blockDateInput].sort());
    setBlockDateInput("");
    setIsDirty(true);
  };

  // ─ Discounted dates ─
  const addDateToDiscount = () => {
    if (!discountDateInput || editingDiscount.dates.includes(discountDateInput)) return;
    setEditingDiscount((p) => ({ ...p, dates: [...p.dates, discountDateInput].sort() }));
    setDiscountDateInput("");
  };
  const saveDiscount = () => {
    if (!editingDiscount.dates.length || !editingDiscount.value) return;
    setDiscountedDates((p) => {
      const exists = p.find((d) => d.id === editingDiscount.id);
      return exists
        ? p.map((d) => (d.id === editingDiscount.id ? editingDiscount : d))
        : [...p, editingDiscount];
    });
    setEditingDiscount(null);
    setIsDirty(true);
  };

  // ─ Conditional discounts ─
  const addRule = () => {
    setConditionalDiscounts((p) => [
      ...p,
      { id: uid(), condition: "minDays", conditionValue: "1", discountType: "percent", discountValue: "", applyMode: "once" },
    ]);
    setIsDirty(true);
  };
  const updateRule = (id, field, val) => {
    setConditionalDiscounts((p) => p.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
    setIsDirty(true);
  };

  // ─ Weekly availability ─
  const updateDay = (dayKey, field, value) => {
    setWeeklyAvailability((p) => ({ ...p, [dayKey]: { ...p[dayKey], [field]: value } }));
    setIsDirty(true);
  };

  const fmtDate = (d) => {
    if (!d) return "";
    const [y, m, day] = d.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m) - 1]} ${parseInt(day)}, ${y}`;
  };

  if (limitReached) {
    return (
      <s-page heading="Create Apartment">
        <s-section>
          <div style={{ padding: "24px 20px", background: "#fff4f4", border: "1px solid #fead9a", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#202223", marginBottom: 8 }}>
              Apartment limit reached
            </div>
            <div style={{ fontSize: 14, color: "#6d7175", lineHeight: 1.6, marginBottom: 16 }}>
              You are using {currentCount} of {planLimit} apartment{planLimit !== 1 ? "s" : ""} allowed on the Free plan.
              Upgrade to Pro or Business to add unlimited apartments.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <a
                href="/app/subscribtion"
                style={{
                  display: "inline-block",
                  padding: "9px 20px",
                  background: "#008060",
                  color: "#fff",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Upgrade Plan
              </a>
              <a
                href="/app/apartments"
                style={{
                  display: "inline-block",
                  padding: "9px 20px",
                  background: "#f6f6f7",
                  color: "#202223",
                  border: "1px solid #e1e3e5",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Back to Apartments
              </a>
            </div>
          </div>
        </s-section>
      </s-page>
    );
  }

  return (
    <>
      <SaveBar id="apt-save-bar">
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined}>Save</button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>

      <s-page heading={isNew ? "Create Apartment" : `Edit: ${apartment.name}`}>

        {/* ── Linked Product ── */}
        <s-section heading="Linked Product">
          <div style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 16px", background:"#f6f6f7", borderRadius:8, border:"1px solid #e1e3e5" }}>
            <div style={{ width:48, height:48, borderRadius:8, background:"#e1e3e5", flexShrink:0 }} />
            <div>
              <div style={{ fontSize:14, fontWeight:600, color:"#202223" }}>{productTitle}</div>
              <div style={{ fontSize:12, color:"#6d7175", marginTop:2 }}>ID: {productId}</div>
            </div>
          </div>
        </s-section>

        {/* ══════════════ BOOKING SETTINGS ══════════════ */}
        <s-section heading="Booking Settings">
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:500, color:"#202223", marginBottom:10 }}>Booking Type</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
              {[
                { value:"single",   title:"Single",  icon:"📅", desc:"One fixed date per booking." },
                { value:"range",    title:"Range",   icon:"📆", desc:"Customer selects a date range (check-in → check-out)." },
                { value:"multiple", title:"Multiple",icon:"🗓️", desc:"Customer picks multiple individual dates." },
              ].map(({ value, title, icon, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setBookingType(value); setIsDirty(true); }}
                  style={{
                    padding:"16px 14px", textAlign:"left", cursor:"pointer",
                    border:`2px solid ${bookingType === value ? "#008060" : "#e1e3e5"}`,
                    borderRadius:10,
                    background: bookingType === value ? "#f0faf6" : "#fff",
                    transition:"all 0.15s",
                  }}
                >
                  <div style={{ fontSize:20, marginBottom:6 }}>{icon}</div>
                  <div style={{ fontSize:14, fontWeight:600, color: bookingType === value ? "#008060" : "#202223", marginBottom:4 }}>{title}</div>
                  <div style={{ fontSize:12, color:"#6d7175", lineHeight:1.5 }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <Field label="Apartment Name *">
              <Inp type="text" value={name} onChange={mark(setName)} placeholder="e.g. Ocean View Suite" />
            </Field>
            <Field label="Status">
              <Sel value={status} onChange={mark(setStatus)}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="inactive">Inactive</option>
              </Sel>
            </Field>
            <Field label="Description" style={{ gridColumn:"1 / -1" }}>
              <textarea value={description} onChange={mark(setDescription)} placeholder="Describe the apartment..." rows={3}
                style={{ ...inputStyle, resize:"vertical" }} />
            </Field>
            <Field label="Maximum Adults ⓘ">
              <Inp type="number" min={0} value={maxAdults} onChange={mark(setMaxAdults)} placeholder="e.g. 5" />
            </Field>
            <Field label="Maximum Children ⓘ">
              <Inp type="number" min={0} value={maxChildren} onChange={mark(setMaxChildren)} placeholder="e.g. 5" />
            </Field>
            <Field label="Maximum Infants ⓘ">
              <Inp type="number" min={0} value={maxInfants} onChange={mark(setMaxInfants)} placeholder="e.g. 5" />
            </Field>
          </div>
        </s-section>

        {/* ══════════════ BLOCK DATES ══════════════ */}
        <s-section heading="Block Dates">
          <p style={{ margin:"0 0 14px", fontSize:13, color:"#6d7175" }}>
            Mark specific dates as unavailable. Blocked dates cannot be booked by customers.
          </p>
          <div style={{ display:"flex", gap:10, marginBottom:14 }}>
            <Inp type="date" value={blockDateInput} onChange={(e) => setBlockDateInput(e.target.value)} style={{ flex:1 }} />
            <button type="button" onClick={addBlockedDate} style={primaryBtn}>+ Block Date</button>
          </div>
          {blockedDates.length > 0 ? (
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {blockedDates.map((d) => (
                <span key={d} style={tagStyle}>
                  📅 {fmtDate(d)}
                  <button type="button"
                    onClick={() => { setBlockedDates((p) => p.filter((x) => x !== d)); setIsDirty(true); }}
                    style={tagX}>×</button>
                </span>
              ))}
            </div>
          ) : (
            <div style={{ fontSize:13, color:"#8c9196", fontStyle:"italic" }}>No dates blocked yet.</div>
          )}
        </s-section>

        {/* ══════════════ AVAILABILITY ══════════════ */}
        <s-section heading="Availability">
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
            <Field label="Calendar Start" hint="Earliest bookable date">
              <Inp type="date" value={calendarStartDate} onChange={mark(setCalendarStartDate)} />
            </Field>
            <Field label="Calendar End" hint="Latest bookable date">
              <Inp type="date" value={calendarEndDate} onChange={mark(setCalendarEndDate)} />
            </Field>
            <Field label="Check-in Time">
              <Inp type="time" value={checkInTime} onChange={mark(setCheckInTime)} />
            </Field>
            <Field label="Check-out Time">
              <Inp type="time" value={checkOutTime} onChange={mark(setCheckOutTime)} />
            </Field>
            {(bookingType === "range" || bookingType === "multiple") && (<>
              <Field
                label={"Min Days"}
                hint={"Minimum dates customer must select"}
              >
                <Inp type="number" min={1} value={minDays} onChange={mark(setMinNights)} placeholder="1" />
              </Field>
              <Field
                label={"Max Days"}
                hint={"Maximum dates customer can select"}
              >
                <Inp type="number" min={1} value={maxDays} onChange={mark(setMaxNights)} placeholder="No limit" />
              </Field>
            </>)}
          </div>

          <ToggleRow
            label="Quantity Selector"
            hint="Let customers choose quantity when booking"
            enabled={quantityEnabled}
            onChange={touch(setQuantityEnabled)}
          />

          <div style={{ marginTop:20 }}>
            <div style={{ fontSize:14, fontWeight:500, color:"#202223", marginBottom:12 }}>Weekly Availability</div>
            <div style={{ border:"1px solid #e1e3e5", borderRadius:8, overflow:"hidden" }}>
              {DAYS.map(({ key, label }, i) => {
                const day = weeklyAvailability?.[key] ?? { enabled: true, open: "00:00", close: "23:59" };
                return (
                  <div key={key} style={{
                    display:"flex", alignItems:"center", gap:14, padding:"11px 16px",
                    background: day.enabled ? "#fff" : "#fafafa",
                    borderBottom: i < DAYS.length - 1 ? "1px solid #e1e3e5" : "none",
                  }}>
                    <div style={{ width:100, fontSize:14, fontWeight:500, color: day.enabled ? "#202223" : "#adb5bd" }}>{label}</div>
                    <Toggle enabled={day.enabled} onChange={(v) => updateDay(key, "enabled", v)} />
                    <span style={{ fontSize:12, fontWeight:700, width:28, color: day.enabled ? "#008060" : "#adb5bd" }}>
                      {day.enabled ? "ON" : "OFF"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </s-section>

        {/* ══════════════ STOCK MANAGEMENT ══════════════ */}
        <s-section heading="Stock Management">
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:16 }}>
            <Field label="Bedrooms">
              <Inp type="number" min={0} value={bedrooms} onChange={mark(setBedrooms)} placeholder="0" />
            </Field>
            <Field label="Bathrooms">
              <Inp type="number" min={0} value={bathrooms} onChange={mark(setBathrooms)} placeholder="0" />
            </Field>
            <Field label="Max Guests">
              <Inp type="number" min={1} value={maxGuests} onChange={mark(setMaxGuests)} placeholder="1" />
            </Field>
          </div>

          <ToggleRow
            label="Track Stock Quantity"
            hint="Limit the number of simultaneous bookings"
            enabled={quantityEnabled}
            onChange={touch(setQuantityEnabled)}
          />
          {quantityEnabled && (
            <div style={{ marginTop:14 }}>
              <Field label="Stock Quantity" hint="Max concurrent bookings allowed">
                <Inp type="number" min={1} value={stockQuantity} onChange={mark(setStockQuantity)} placeholder="1" style={{ maxWidth:160 }} />
              </Field>
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginTop:20 }}>
            <Field label="Address" style={{ gridColumn:"1/-1" }}>
              <Inp type="text" value={address} onChange={mark(setAddress)} placeholder="123 Beach Road" />
            </Field>
            <Field label="City">
              <Inp type="text" value={city} onChange={mark(setCity)} placeholder="Miami" />
            </Field>
            <Field label="Country">
              <Inp type="text" value={country} onChange={mark(setCountry)} placeholder="United States" />
            </Field>
          </div>
        </s-section>

        {/* ══════════════ PRICE ══════════════ */}
        <s-section heading="Price">
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
            <Field label="Price per Night ($)">
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#6d7175", fontSize:14 }}>$</span>
                <Inp type="number" min={0} step="0.01" value={pricePerNight} onChange={mark(setPricePerNight)} placeholder="0.00" style={{ paddingLeft:26 }} />
              </div>
            </Field>
          </div>

          {/* Additional Fees */}
          <div style={{ borderTop:"1px solid #f1f2f3", paddingTop:20 }}>
            <div style={{ fontSize:14, fontWeight:600, color:"#202223", marginBottom:4 }}>Additional Fees</div>
            <p style={{ margin:"0 0 14px", fontSize:13, color:"#6d7175" }}>
              Charges added on top of the nightly rate (e.g. cleaning fee, service fee).
            </p>

            {additionalFees.length > 0 && (
              <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
                {additionalFees.map((fee) => (
                  <div key={fee.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:"1px solid #e1e3e5", borderRadius:8, background:"#fff" }}>
                    <div style={{ flex:1, fontSize:14, fontWeight:500, color:"#202223" }}>{fee.name}</div>
                    <span style={discountBadge(fee.type)}>
                      {fee.type === "percent" ? `${fee.amount}%` : `$${fee.amount}`}
                    </span>
                    <span style={{ fontSize:12, color:"#6d7175", background:"#f1f2f3", padding:"2px 8px", borderRadius:10 }}>
                      {fee.applyPer === "booking" ? "per booking" : "per night"}
                    </span>
                    <button type="button"
                      onClick={() => { setAdditionalFees((p) => p.filter((f) => f.id !== fee.id)); setIsDirty(true); }}
                      style={deleteBtn}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ ...editCardStyle, display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:12, alignItems:"end" }}>
                <Field label="Fee Name">
                  <Inp type="text" placeholder="e.g. Cleaning Fee"
                    id="fee-name-input" />
                </Field>
                <Field label="Type">
                  <select id="fee-type-input" style={inputStyle}>
                    <option value="flat">Flat ($)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                </Field>
                <Field label="Amount">
                  <Inp type="number" min={0} step="0.01" placeholder="0.00"
                    id="fee-amount-input" />
                </Field>
                <Field label="Apply Per">
                  <select id="fee-per-input" style={inputStyle}>
                    <option value="booking">Per Booking</option>
                    <option value="night">Per Night</option>
                  </select>
                </Field>
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end" }}>
                <button type="button" style={primaryBtn}
                  onClick={() => {
                    const name = document.getElementById("fee-name-input").value.trim();
                    const type = document.getElementById("fee-type-input").value;
                    const amount = document.getElementById("fee-amount-input").value;
                    const applyPer = document.getElementById("fee-per-input").value;
                    if (!name || !amount) return;
                    setAdditionalFees((p) => [...p, { id: uid(), name, type, amount, applyPer }]);
                    setIsDirty(true);
                    document.getElementById("fee-name-input").value = "";
                    document.getElementById("fee-amount-input").value = "";
                  }}>
                  + Add Fee
                </button>
              </div>
            </div>
          </div>
        </s-section>

        {/* ══════════════ DISCOUNTED DATES ══════════════ */}
        <s-section heading="Discounted Dates">
          <p style={{ margin:"0 0 16px", fontSize:13, color:"#6d7175" }}>
            Set a discount for specific dates. Add multiple date groups each with their own discount.
          </p>
          {discountedDates.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
              {discountedDates.map((item) => (
                <div key={item.id} style={discountRowStyle}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:4 }}>
                      {item.dates.map((d) => (
                        <span key={d} style={{ ...tagStyle, fontSize:12 }}>📅 {fmtDate(d)}</span>
                      ))}
                    </div>
                    <span style={discountBadge(item.type)}>
                      {item.type === "percent" ? `${item.value}% off` : `$${item.value} off`}
                    </span>
                  </div>
                  <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                    <button type="button"
                      onClick={() => { setEditingDiscount(item); setDiscountDateInput(""); }}
                      style={outlineBtn}>Edit</button>
                    <button type="button"
                      onClick={() => { setDiscountedDates((p) => p.filter((d) => d.id !== item.id)); setIsDirty(true); }}
                      style={deleteBtn}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {editingDiscount ? (
            <div style={editCardStyle}>
              <div style={{ fontSize:14, fontWeight:600, color:"#202223", marginBottom:14 }}>
                {discountedDates.find((d) => d.id === editingDiscount.id) ? "Edit Discount Group" : "New Discount Group"}
              </div>
              <div style={{ display:"flex", gap:10, marginBottom:12 }}>
                <Inp type="date" value={discountDateInput} onChange={(e) => setDiscountDateInput(e.target.value)} style={{ flex:1 }} />
                <button type="button" onClick={addDateToDiscount} style={primaryBtn}>+ Add Date</button>
              </div>
              {editingDiscount.dates.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
                  {editingDiscount.dates.map((d) => (
                    <span key={d} style={tagStyle}>
                      📅 {fmtDate(d)}
                      <button type="button"
                        onClick={() => setEditingDiscount((p) => ({ ...p, dates: p.dates.filter((x) => x !== d) }))}
                        style={tagX}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
                <Field label="Discount Type">
                  <Sel value={editingDiscount.type}
                    onChange={(e) => setEditingDiscount((p) => ({ ...p, type: e.target.value }))}>
                    <option value="percent">Percentage (%)</option>
                    <option value="flat">Flat Amount ($)</option>
                  </Sel>
                </Field>
                <Field label={editingDiscount.type === "percent" ? "Percentage" : "Amount ($)"}>
                  <Inp type="number" min={0} step={editingDiscount.type === "percent" ? "1" : "0.01"}
                    value={editingDiscount.value}
                    onChange={(e) => setEditingDiscount((p) => ({ ...p, value: e.target.value }))}
                    placeholder={editingDiscount.type === "percent" ? "20" : "50.00"} />
                </Field>
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
                <button type="button" onClick={() => setEditingDiscount(null)} style={ghostBtn}>Cancel</button>
                <button type="button" onClick={saveDiscount}
                  disabled={!editingDiscount.dates.length || !editingDiscount.value}
                  style={{ ...primaryBtn, opacity: (!editingDiscount.dates.length || !editingDiscount.value) ? 0.5 : 1 }}>
                  Save Group
                </button>
              </div>
            </div>
          ) : (
            <button type="button"
              onClick={() => { setEditingDiscount({ id: uid(), dates: [], type: "percent", value: "" }); setDiscountDateInput(""); }}
              style={outlineBtn}>
              + Add Discount Group
            </button>
          )}
        </s-section>

        {/* ══════════════ CONDITIONAL DISCOUNTS ══════════════ */}
        <s-section heading="Conditional Discounts">
          <p style={{ margin:"0 0 16px", fontSize:13, color:"#6d7175" }}>
            Automatically apply discounts when booking conditions are met.
          </p>
          {conditionalDiscounts.length > 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:16 }}>
              {conditionalDiscounts.map((rule) => (
                <div key={rule.id} style={editCardStyle}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap:12, marginBottom:12 }}>
                    <Field label="Based On">
                      <Sel value={rule.condition} onChange={(e) => updateRule(rule.id, "condition", e.target.value)}>
                        <option value="minDays">Min Nights</option>
                        <option value="minQty">Min Quantity</option>
                        <option value="minTotal">Min Total ($)</option>
                      </Sel>
                    </Field>
                    <Field label={rule.condition === "minDays" ? "Min Nights" : rule.condition === "minQty" ? "Min Qty" : "Min Total ($)"}>
                      <Inp type="number" min={0} step={rule.condition === "minTotal" ? "0.01" : "1"}
                        value={rule.conditionValue}
                        onChange={(e) => updateRule(rule.id, "conditionValue", e.target.value)}
                        placeholder="0" />
                    </Field>
                    <Field label="Discount Type">
                      <Sel value={rule.discountType} onChange={(e) => updateRule(rule.id, "discountType", e.target.value)}>
                        <option value="percent">Percentage (%)</option>
                        <option value="flat">Flat Amount ($)</option>
                      </Sel>
                    </Field>
                    <Field label={rule.discountType === "percent" ? "Discount %" : "Amount ($)"}>
                      <Inp type="number" min={0} step={rule.discountType === "percent" ? "1" : "0.01"}
                        value={rule.discountValue}
                        onChange={(e) => updateRule(rule.id, "discountValue", e.target.value)}
                        placeholder="0" />
                    </Field>
                  </div>
                  <div style={{ display:"flex", alignItems:"flex-end", gap:16 }}>
                    <Field label="Apply Mode" style={{ flex:1 }}>
                      <Sel value={rule.applyMode} onChange={(e) => updateRule(rule.id, "applyMode", e.target.value)}>
                        <option value="once">Single time — applied once to total</option>
                        <option value="each">Per unit — multiplied per night / item</option>
                      </Sel>
                    </Field>
                    <button type="button"
                      onClick={() => { setConditionalDiscounts((p) => p.filter((r) => r.id !== rule.id)); setIsDirty(true); }}
                      style={deleteBtn}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={addRule} style={outlineBtn}>+ Add Discount Rule</button>
        </s-section>

        {/* ══════════════ PAY NOW / ONLINE ══════════════ */}
        <s-section heading="Pay Now / Online Payment">
          <ToggleRow
            label="Enable Online Payment"
            hint="Customers pay online at the time of booking"
            enabled={payNowEnabled}
            onChange={touch(setPayNowEnabled)}
          />
          {payNowEnabled && (
            <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid #f1f1f1" }}>
              <Field label="Percentage to Pay Now" hint="100% = full payment upfront · 50% = half now, half later">
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <Inp type="number" min={1} max={100} value={payNowPercent} onChange={mark(setPayNowPercent)}
                    placeholder="100" style={{ maxWidth:120 }} />
                  <span style={{ fontSize:14, color:"#6d7175" }}>%</span>
                </div>
              </Field>
            </div>
          )}
        </s-section>

        {/* ══════════════ DEPOSIT ══════════════ */}
        <s-section heading="Deposit">
          <ToggleRow
            label="Require Deposit"
            hint="Collect a deposit when the booking is confirmed"
            enabled={depositEnabled}
            onChange={touch(setDepositEnabled)}
          />
          {depositEnabled && (
            <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid #f1f1f1" }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                <Field label="Deposit Type">
                  <Sel value={depositType} onChange={mark(setDepositType)}>
                    <option value="percent">Percentage of total (%)</option>
                    <option value="flat">Fixed amount ($)</option>
                  </Sel>
                </Field>
                <Field label={depositType === "percent" ? "Deposit %" : "Deposit Amount ($)"}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <Inp type="number" min={0}
                      step={depositType === "percent" ? "1" : "0.01"}
                      max={depositType === "percent" ? 100 : undefined}
                      value={depositAmount}
                      onChange={mark(setDepositAmount)}
                      placeholder={depositType === "percent" ? "20" : "100.00"}
                      style={{ flex:1 }} />
                    <span style={{ fontSize:14, color:"#6d7175" }}>{depositType === "percent" ? "%" : "$"}</span>
                  </div>
                </Field>
              </div>
            </div>
          )}
        </s-section>

        {/* ══════════════ FEATURES & AMENITIES ══════════════ */}
        <s-section heading="Features & Amenities">
          {/* Selected amenities */}
          {amenities.length > 0 && (
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
              {amenities.map((item) => (
                <span key={item} style={{ ...tagStyle, background:"#f0faf6", border:"1px solid #008060", color:"#008060" }}>
                  {item}
                  <button type="button"
                    onClick={() => { setAmenities((p) => p.filter((a) => a !== item)); setIsDirty(true); }}
                    style={{ ...tagX, color:"#008060" }}>×</button>
                </span>
              ))}
            </div>
          )}

          {/* Custom input */}
          <div style={{ display:"flex", gap:10, marginBottom:16 }}>
            <Inp
              type="text"
              value={amenityInput}
              onChange={(e) => setAmenityInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = amenityInput.trim();
                  if (val && !amenities.includes(val)) {
                    setAmenities((p) => [...p, val]);
                    setIsDirty(true);
                  }
                  setAmenityInput("");
                }
              }}
              placeholder="Type a feature and press Enter…"
            />
            <button type="button" style={primaryBtn} onClick={() => {
              const val = amenityInput.trim();
              if (val && !amenities.includes(val)) {
                setAmenities((p) => [...p, val]);
                setIsDirty(true);
              }
              setAmenityInput("");
            }}>Add</button>
          </div>

          {/* Suggestions */}
          <div style={{ fontSize:12, color:"#6d7175", marginBottom:8 }}>Common suggestions — click to add:</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {AMENITY_SUGGESTIONS.filter((s) => !amenities.includes(s)).map((item) => (
              <button key={item} type="button"
                onClick={() => { setAmenities((p) => [...p, item]); setIsDirty(true); }}
                style={{
                  padding:"5px 12px", fontSize:13, cursor:"pointer", borderRadius:16,
                  border:"1px solid #e1e3e5", background:"#f6f6f7", color:"#202223",
                }}>
                + {item}
              </button>
            ))}
          </div>
        </s-section>

      </s-page>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const inputStyle = {
  padding:"8px 12px", border:"1px solid #c9cccf", borderRadius:8, fontSize:14,
  background:"#fff", width:"100%", boxSizing:"border-box", outline:"none",
};

const toggleRowStyle = {
  display:"flex", alignItems:"center", justifyContent:"space-between",
  padding:"12px 0", borderTop:"1px solid #f1f2f3", marginTop:4,
};

const tagStyle = {
  display:"inline-flex", alignItems:"center", gap:6, padding:"4px 10px",
  background:"#f0f0f0", borderRadius:16, fontSize:13, color:"#202223",
};

const tagX = {
  border:"none", background:"transparent", cursor:"pointer",
  fontSize:16, color:"#6d7175", padding:0, lineHeight:1,
};

const primaryBtn = {
  padding:"8px 16px", background:"#008060", color:"#fff",
  border:"none", borderRadius:8, fontSize:14, fontWeight:600,
  cursor:"pointer", whiteSpace:"nowrap",
};

const outlineBtn = {
  padding:"8px 16px", background:"#fff", color:"#008060",
  border:"1px solid #008060", borderRadius:8, fontSize:14, fontWeight:600,
  cursor:"pointer", whiteSpace:"nowrap",
};

const ghostBtn = {
  padding:"8px 16px", background:"#fff", color:"#6d7175",
  border:"1px solid #e1e3e5", borderRadius:8, fontSize:14, fontWeight:500, cursor:"pointer",
};

const deleteBtn = {
  padding:"7px 14px", background:"#fff", color:"#c0392b",
  border:"1px solid #f5c6cb", borderRadius:8, fontSize:13, fontWeight:500,
  cursor:"pointer", whiteSpace:"nowrap",
};

const editCardStyle = {
  border:"1px solid #e1e3e5", borderRadius:10, padding:16, background:"#f9fafb",
};

const discountRowStyle = {
  display:"flex", alignItems:"center", gap:16, padding:"14px 16px",
  border:"1px solid #e1e3e5", borderRadius:8, background:"#fff",
};

const discountBadge = (type) => ({
  display:"inline-block", padding:"2px 10px", borderRadius:12,
  fontSize:12, fontWeight:600,
  background: type === "percent" ? "#fff3cd" : "#d4edda",
  color: type === "percent" ? "#856404" : "#155724",
});
