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
import { Popover, DatePicker, TextField, Icon } from "@shopify/polaris";
import { CalendarIcon, CalendarTimeIcon, CalendarCheckIcon, HomeIcon, WrenchIcon, DeliveryIcon, PackageIcon, CheckIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getPlanLimits } from "../plans.server";

// ─── Constants ───────────────────────────────────────────────────────────────

const AMENITY_SUGGESTIONS = {
  property: [
    "WiFi", "Air Conditioning", "Heating", "Kitchen", "Washing Machine", "Dryer",
    "TV", "Netflix", "Free Parking", "EV Charging", "Pool", "Hot Tub", "Gym",
    "Elevator", "Balcony", "Terrace", "Garden", "BBQ Grill", "Sea View",
    "Mountain View", "City View", "Pet Friendly", "Smoking Allowed",
    "Wheelchair Accessible", "24/7 Check-in", "Concierge", "Breakfast Included",
  ],
  vehicle: [
    "Bluetooth", "Backup Camera", "GPS Navigation", "Leather Seats", "Sunroof",
    "Heated Seats", "Cruise Control", "Apple CarPlay", "Android Auto",
    "Third-Row Seating", "All-Wheel Drive", "Keyless Entry", "USB Ports",
    "Blind Spot Monitor", "Tow Hitch", "Convertible", "Child Seat Available"
  ],
  equipment: [
    "Batteries Included", "Carrying Case", "Cables Included", "Tripod",
    "Memory Card", "Charger", "Extra Lenses", "Waterproof", "Shockproof",
    "Instruction Manual", "Setup Assistance"
  ],
  other: [
    "Delivery Available", "Setup Included", "Instructions Provided",
    "24/7 Support", "Insurance Available", "Maintenance Included"
  ]
};

// ─── Listing Categories ───────────────────────────────────────────────────────
const LISTING_TYPES = [
  {
    key: "property",
    label: "Property",
    icon: HomeIcon,
    desc: "Apartment, villa, house, room",
    priceUnit: "night",
    priceLabel: "Price per Night ($)",
    showPropertyFields: true,
    showGuestFields: true,
  },
  {
    key: "equipment",
    label: "Equipment",
    icon: WrenchIcon,
    desc: "Tools, cameras, sports gear",
    priceUnit: "day",
    priceLabel: "Price per Day ($)",
    showPropertyFields: false,
    showGuestFields: false,
  },
  {
    key: "vehicle",
    label: "Vehicle",
    icon: DeliveryIcon,
    desc: "Car, scooter, bike, RV",
    priceUnit: "day",
    priceLabel: "Price per Day ($)",
    showPropertyFields: false,
    showGuestFields: false,
  },
  {
    key: "other",
    label: "Other",
    icon: PackageIcon,
    desc: "Any other rentable item",
    priceUnit: "booking",
    priceLabel: "Price per Booking ($)",
    showPropertyFields: false,
    showGuestFields: false,
  },
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
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const urlProductId = url.searchParams.get("productId");

  let apartment = null;
  let limitReached = false;

  if (params.id === "new") {
    const shopRecord = await prisma.shop.findUnique({ where: { shop } });
    const limits     = getPlanLimits(shopRecord?.plan);
    const count      = await prisma.apartment.count({ where: { shop } });
    if (count >= limits.listings) {
      return {
        apartment:   null,
        limitReached: true,
        currentCount: count,
        planLimit:    limits.listings,
        productImage: null,
        productStoreUrl: null,
        defaultProductPrice: null,
      };
    }
  } else {
    apartment = await prisma.apartment.findFirst({
      where: { id: params.id, shop },
    });
    if (!apartment) throw new Response("Not Found", { status: 404 });
  }

  // Fetch product image, storefront URL, and price
  let productImage = null;
  let productStoreUrl = null;
  let defaultProductPrice = null;

  const productId = apartment?.productId || urlProductId;

  if (productId) {
    try {
      const gid = productId.startsWith("gid://")
        ? productId
        : `gid://shopify/Product/${productId}`;
      const res = await admin.graphql(
        `#graphql
        query GetProductData($id: ID!) {
          product(id: $id) {
            featuredImage { url }
            onlineStoreUrl
            handle
            variants(first: 1) {
              edges { node { price } }
            }
          }
        }`,
        { variables: { id: gid } }
      );
      const json = await res.json();
      const p = json?.data?.product;
      productImage = p?.featuredImage?.url ?? null;
      productStoreUrl = p?.onlineStoreUrl ?? (p?.handle ? `https://${shop}/products/${p.handle}` : null);
      defaultProductPrice = p?.variants?.edges?.[0]?.node?.price ?? null;
    } catch (e) {
      console.error("Failed to fetch product data:", e);
    }
  }

  return { apartment, limitReached, currentCount: await prisma.apartment.count({ where: { shop } }), planLimit: getPlanLimits((await prisma.shop.findUnique({ where: { shop } }))?.plan).listings, productImage, productStoreUrl, defaultProductPrice, shop };
};

// ─── Action ──────────────────────────────────────────────────────────────────

async function syncVariantPrice(admin, productId, price) {
  const gid = productId.startsWith('gid://') ? productId : `gid://shopify/Product/${productId}`;

  const res = await admin.graphql(
    `#graphql
    query GetAllVariants($id: ID!) {
      product(id: $id) {
        variants(first: 100) {
          edges { node { id inventoryItem { id } } }
        }
      }
    }`,
    { variables: { id: gid } }
  );
  const json = await res.json();
  const edges = json?.data?.product?.variants?.edges || [];
  if (edges.length === 0) return;

  // Set inventoryPolicy to CONTINUE so the product is never "Sold out"
  const variantsInput = edges.map(({ node }) => ({
    id: node.id,
    inventoryPolicy: "CONTINUE",
    ...(price !== null && price !== undefined && !isNaN(price) ? { price: price.toFixed(2) } : {}),
  }));

  await admin.graphql(
    `#graphql
    mutation BulkUpdateVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`,
    { variables: { productId: gid, variants: variantsInput } }
  );

  // Disable inventory tracking so Shopify never marks the product sold out
  for (const { node } of edges) {
    if (node.inventoryItem?.id) {
      await admin.graphql(
        `#graphql
        mutation DisableInventoryTracking($id: ID!) {
          inventoryItemUpdate(id: $id, input: { tracked: false }) {
            userErrors { field message }
          }
        }`,
        { variables: { id: node.inventoryItem.id } }
      );
    }
  }
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
  try {
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
    if (fd.get("listingType") === 'property') {
      const maxA = fd.get("maxAdults") ? parseInt(fd.get("maxAdults")) : 0;
      const maxC = fd.get("maxChildren") ? parseInt(fd.get("maxChildren")) : 0;
      const maxG = fd.get("maxGuests") ? parseInt(fd.get("maxGuests")) : 0;
      if (maxG > 0 && (maxA + maxC) > maxG) {
        return { success: false, error: `Max Adults (${maxA}) + Max Children (${maxC}) cannot exceed Max Guests (${maxG}).` };
      }
    }

    const settings = {
      listingType: fd.get("listingType") || "property",
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
      // vehicle
      transmission: fd.get("transmission") || null,
      fuelPolicy: fd.get("fuelPolicy") || null,
      mileageLimit: fd.get("mileageLimit") ? parseInt(fd.get("mileageLimit")) : null,
      licenseRequired: fd.get("licenseRequired") === "true",
      // equipment
      condition: fd.get("condition") || null,
      inventoryUnits: fd.get("inventoryUnits") ? parseInt(fd.get("inventoryUnits")) : null,
      // amenities
      amenities: fd.getAll("amenities"),
      // additional fees
      additionalFees: JSON.parse(fd.get("additionalFees") || "[]"),
      // discounts
      discountedDates: JSON.parse(fd.get("discountedDates") || "[]"),
      conditionalDiscounts: JSON.parse(fd.get("conditionalDiscounts") || "[]"),
      // deposit
      depositEnabled: fd.get("depositEnabled") === "true",
      depositType: fd.get("depositType") || "percent",
      depositAmount: fd.get("depositAmount") ? parseFloat(fd.get("depositAmount")) : null,
      // balance collection
      balanceAutoInvoice: fd.get("balanceAutoInvoice") === "true",
      // photos
      images: JSON.parse(fd.get("images") || "[]"),
    };

    if (params.id === "new") {
      const created = await prisma.apartment.create({ data: { ...core, settings } });
      await syncVariantPrice(admin, core.productId, pricePerNight);
      await setRentficMetafields(admin, core.productId, settings);
      return redirect(`/app/apartments?saved=1`);
    }
    const { shop, ...updateCore } = core;
    await prisma.apartment.update({
      where: { id: params.id },
      data: { ...updateCore, settings },
    });
    await syncVariantPrice(admin, core.productId, pricePerNight);
    await setRentficMetafields(admin, core.productId, settings);
    return { success: true };
  } catch (err) {
    console.error("Action Error:", err);
    return { success: false, error: err.message || String(err) };
  }
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
        background: enabled ? "#202223" : "#c9cccf",
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

// ─── Date Picker Field ───────────────────────────────────────────────────────

function DatePickerField({ label, hint, value, onChange }) {
  const [popoverActive, setPopoverActive] = useState(false);
  const [{ month, year }, setDateState] = useState(() => {
    const d = value ? new Date(value + "T12:00:00") : new Date();
    return { month: d.getMonth(), year: d.getFullYear() };
  });
  const datePickerRef = useRef(null);
  const selectedDate = value ? new Date(value + "T12:00:00") : null;

  function nodeContainsDescendant(root, node) {
    if (root === node) return true;
    let parent = node.parentNode;
    while (parent) {
      if (parent === root) return true;
      parent = parent.parentNode;
    }
    return false;
  }

  const handlePopoverClose = useCallback(({ relatedTarget }) => {
    if (
      relatedTarget instanceof Node &&
      datePickerRef.current &&
      nodeContainsDescendant(datePickerRef.current, relatedTarget)
    ) return;
    setPopoverActive(false);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label && <label style={{ fontSize: 14, fontWeight: 500, color: "#202223" }}>{label}</label>}
      {hint && <span style={{ fontSize: 12, color: "#6d7175", marginTop: -2 }}>{hint}</span>}
      <Popover
        active={popoverActive}
        autofocusTarget="none"
        preferredAlignment="left"
        preferInputActivator={false}
        preferredPosition="below"
        preventCloseOnChildOverlayClick
        onClose={handlePopoverClose}
        activator={
          <TextField
            role="combobox"
            label=""
            labelHidden
            prefix={<Icon source={CalendarIcon} />}
            value={value || ""}
            onFocus={() => setPopoverActive(true)}
            onChange={() => {}}
            autoComplete="off"
            placeholder="YYYY-MM-DD"
          />
        }
      >
        <div style={{ width: 276, padding: 8 }} ref={datePickerRef}>
          <DatePicker
            month={month}
            year={year}
            selected={selectedDate}
            onMonthChange={(m, y) => setDateState({ month: m, year: y })}
            onChange={({ end }) => {
              const y = end.getFullYear();
              const m = String(end.getMonth() + 1).padStart(2, "0");
              const d = String(end.getDate()).padStart(2, "0");
              onChange(`${y}-${m}-${d}`);
              setPopoverActive(false);
            }}
          />
        </div>
      </Popover>
    </div>
  );
}

export default function ApartmentEditPage() {
  const { apartment } = useLoaderData();
  const key = apartment?.updatedAt || "new";
  return <ApartmentEditForm key={key} />;
}

// ─── Main Component ──────────────────────────────────────────────────────────

function ApartmentEditForm() {
  const { apartment, limitReached, currentCount, planLimit, productImage, productStoreUrl, defaultProductPrice, shop } = useLoaderData();
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
      pricePerNight: apartment?.pricePerNight?.toString() ?? defaultProductPrice?.toString() ?? "",
      // settings blob
      listingType: s.listingType ?? "property",
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
      depositEnabled: s.depositEnabled ?? false,
      depositType: s.depositType ?? "percent",
      depositAmount: s.depositAmount?.toString() ?? "",
      balanceAutoInvoice: s.balanceAutoInvoice ?? false,
      images: s.images ?? [],
    };
  }

  const o = orig.current;
  const [name, setName] = useState(o.name);
  const [listingType, setListingType] = useState(o.listingType);
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

  // equipment
  const [condition, setCondition] = useState(o.condition || "good");
  const [inventoryUnits, setInventoryUnits] = useState(o.inventoryUnits || "");

  // vehicle
  const [transmission, setTransmission] = useState(o.transmission || "automatic");
  const [fuelPolicy, setFuelPolicy] = useState(o.fuelPolicy || "full-to-full");
  const [mileageLimit, setMileageLimit] = useState(o.mileageLimit || "");
  const [licenseRequired, setLicenseRequired] = useState(o.licenseRequired || false);
  const [amenities, setAmenities] = useState(o.amenities);
  const [additionalFees, setAdditionalFees] = useState(o.additionalFees);
  const [discountedDates, setDiscountedDates] = useState(o.discountedDates);
  const [conditionalDiscounts, setConditionalDiscounts] = useState(o.conditionalDiscounts);
  const [depositEnabled, setDepositEnabled] = useState(o.depositEnabled);
  const [depositType, setDepositType] = useState(o.depositType);
  const [depositAmount, setDepositAmount] = useState(o.depositAmount);
  const [balanceAutoInvoice, setBalanceAutoInvoice] = useState(o.balanceAutoInvoice);
  const [images, setImages] = useState(o.images); // photo URLs stored in settings.images
  const [isDirty, setIsDirty] = useState(isNew);

  const [amenityInput, setAmenityInput] = useState("");
  const [blockDateInput, setBlockDateInput] = useState("");
  const [editingDiscount, setEditingDiscount] = useState(null);
  const [discountDateInput, setDiscountDateInput] = useState("");

  const mark = useCallback((setter) => (e) => { setter(e.target.value); setIsDirty(true); }, []);
  const touch = useCallback((setter) => (val) => { setter(val); setIsDirty(true); }, []);

  useEffect(() => {
    if (actionData) {
      if (actionData.success) {
        shopify.toast.show("Saved");
        setIsDirty(false);
      } else if (actionData.error) {
        shopify.toast.show("Error: " + actionData.error, { isError: true });
        console.error("Save Error:", actionData.error);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  useEffect(() => {
    if (searchParams.get("saved")) shopify.toast.show("Rental created");
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
    setConditionalDiscounts(o.conditionalDiscounts); setDepositEnabled(o.depositEnabled);
    setDepositType(o.depositType); setDepositAmount(o.depositAmount);
    setBalanceAutoInvoice(o.balanceAutoInvoice);
    setImages(o.images);
    setIsDirty(false);
  };

  const handleSave = () => {
    if (!name.trim()) {
      shopify.toast.show("Listing name is required", { isError: true });
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
    fd.append("listingType", listingType);
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
    
    // new fields
    fd.append("transmission", transmission);
    fd.append("fuelPolicy", fuelPolicy);
    fd.append("mileageLimit", mileageLimit);
    fd.append("licenseRequired", String(licenseRequired));
    fd.append("condition", condition);
    fd.append("inventoryUnits", inventoryUnits);
    amenities.forEach((a) => fd.append("amenities", a));
    fd.append("additionalFees", JSON.stringify(additionalFees));
    fd.append("discountedDates", JSON.stringify(discountedDates));
    fd.append("conditionalDiscounts", JSON.stringify(conditionalDiscounts));
    fd.append("depositEnabled", String(depositEnabled));
    fd.append("depositType", depositType);
    fd.append("depositAmount", depositAmount);
    fd.append("balanceAutoInvoice", String(balanceAutoInvoice));
    fd.append("images", JSON.stringify(images));
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
      <s-page heading="Add Rental">
        <s-section>
          <div style={{ padding: "24px 20px", background: "#fff4f4", border: "1px solid #fead9a", borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#202223", marginBottom: 8 }}>
              Rental listing limit reached
            </div>
            <div style={{ fontSize: 14, color: "#6d7175", lineHeight: 1.6, marginBottom: 16 }}>
              You are using {currentCount} of {planLimit} rental{planLimit !== 1 ? "s" : ""} allowed on the Free plan.
              Upgrade to Pro or Business to add unlimited rentals.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <a
                href="/app/subscribtion"
                style={{
                  display: "inline-block",
                  padding: "9px 20px",
                  background: "#202223",
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
                Back to Rentals
              </a>
            </div>
          </div>
        </s-section>
      </s-page>
    );
  }

  return (
    <>
      <SaveBar open={isDirty}>
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined}>Save</button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>

      <s-page heading={isNew ? "Add Rental" : `Edit: ${apartment.name}`}>

        {!isNew && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
            <a
              href={`/api/export/ical/${apartment.id}`}
              download
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "9px 18px", background: "#fff", color: "#202223", border: "1px solid #c9cccf",
                borderRadius: 8, fontSize: 14, fontWeight: 600,
                textDecoration: "none", whiteSpace: "nowrap",
              }}
            >
              🗓️ Export iCal
            </a>
          </div>
        )}

        {/* ── Linked Product ── */}
        <s-section heading="Linked Product">
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6d7175" }}>
            This Shopify product is used to handle customer checkout and payments. Its details are hidden on the booking widget.
          </p>
          <div style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 16px", background:"#f6f6f7", borderRadius:8, border:"1px solid #e1e3e5" }}>
            {productImage ? (
              <img
                src={productImage}
                alt={productTitle}
                style={{ width:48, height:48, borderRadius:8, objectFit:"cover", flexShrink:0, border:"1px solid #e1e3e5" }}
              />
            ) : (
              <div style={{ width:48, height:48, borderRadius:8, background:"#e1e3e5", flexShrink:0 }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize:14, fontWeight:600, color:"#202223" }}>{productTitle}</div>
              <div style={{ fontSize:12, color:"#6d7175", marginTop:2 }}>ID: {productId}</div>
            </div>
            {productStoreUrl && (
              <a
                href={productStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="View Live Product"
                style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"6px 12px", borderRadius:6, border:"1px solid var(--p-color-primary, #FD4A52)",
                  color:"var(--p-color-primary, #FD4A52)", fontSize:12, fontWeight:500, textDecoration:"none",
                  background:"#fff", flexShrink:0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
                  <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
                </svg>
                View Live
              </a>
            )}
          </div>
        </s-section>

        {/* ══════════════ BOOKING SETTINGS ══════════════ */}
        <s-section heading="Booking Settings">

          {/* ── Listing Category ── */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: "#202223", marginBottom: 4 }}>Rental Category</div>
            <div style={{ fontSize: 12, color: "#6d7175", marginBottom: 12 }}>Choose the type of rental this controls which fields are shown below.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              {LISTING_TYPES.map((lt) => {
                const isActive = listingType === lt.key;
                return (
                  <button
                    key={lt.key}
                    type="button"
                    onClick={() => { setListingType(lt.key); setIsDirty(true); }}
                    style={{
                      padding: "14px 12px",
                      textAlign: "center",
                      cursor: "pointer",
                      border: `1px solid ${isActive ? "var(--p-color-primary, #008060)" : "#e1e3e5"}`,
                      borderRadius: 12,
                      background: isActive ? "var(--p-color-primary-light, #e6f7f1)" : "#fff",
                      transition: "all 0.15s",
                      position: "relative",
                    }}
                  >
                    {isActive && (
                      <span style={{
                        position: "absolute", top: 8, right: 8,
                        width: 18, height: 18, borderRadius: "50%",
                        background: "var(--p-color-primary, #008060)", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <span style={{ width: 14, height: 14, display: "block", color: "#fff" }}>
                          <Icon source={CheckIcon} />
                        </span>
                      </span>
                    )}
                    <div style={{ marginBottom: 6, display: "flex", justifyContent: "center", color: isActive ? "var(--p-color-primary, #008060)" : "#5c5f62" }}>
                      <span style={{ width: 24, height: 24, display: "block" }}>
                        <Icon source={lt.icon} />
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#202223", marginBottom: 2 }}>{lt.label}</div>
                    <div style={{ fontSize: 11, color: "#6d7175", lineHeight: 1.4 }}>{lt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:500, color:"#202223", marginBottom:10 }}>Booking Type</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:12 }}>
              {[
                { value:"single",   title:"Single",  icon:CalendarIcon,      desc:"One fixed date per booking.",                            color:"var(--p-color-primary-light, #e6f7f1)", iconColor:"var(--p-color-primary, #008060)" },
                { value:"range",    title:"Range",   icon:CalendarTimeIcon,  desc:"Customer selects a date range (check-in → check-out).",  color:"var(--p-color-primary-light, #e6f7f1)", iconColor:"var(--p-color-primary, #008060)" },
                { value:"multiple", title:"Multiple",icon:CalendarCheckIcon, desc:"Customer picks multiple individual dates.",               color:"var(--p-color-primary-light, #e6f7f1)", iconColor:"var(--p-color-primary, #008060)" },
              ].map(({ value, title, icon, desc, color, iconColor }) => {
                const isActive = bookingType === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setBookingType(value); setIsDirty(true); }}
                    style={{
                      padding:"18px 16px", textAlign:"left", cursor:"pointer",
                      border:`2px solid ${isActive ? iconColor : "#e1e3e5"}`,
                      borderRadius:12,
                      background: isActive ? color : "#fff",
                      transition:"all 0.15s",
                      boxShadow: isActive ? `0 0 0 3px ${iconColor}22` : "none",
                      position:"relative",
                    }}
                  >
                    {isActive && (
                      <span style={{
                        position:"absolute", top:10, right:10,
                        width:18, height:18, borderRadius:"50%",
                        background: iconColor, display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                          <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                    )}
                    <div style={{
                      width:36, height:36, borderRadius:8, marginBottom:12,
                      background: isActive ? iconColor : "#f1f2f3",
                      display:"flex", alignItems:"center", justifyContent:"center",
                    }}>
                      <span style={{ color: isActive ? "#fff" : "#6d7175", display:"flex" }}>
                        <Icon source={icon} />
                      </span>
                    </div>
                    <div style={{ fontSize:14, fontWeight:700, color:"#202223", marginBottom:4 }}>{title}</div>
                    <div style={{ fontSize:12, color:"#6d7175", lineHeight:1.5 }}>{desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(250px, 1fr))", gap:16 }}>
            <Field label="Listing Name *" hint="The name shown to customers on the booking calendar.">
              <Inp type="text" value={name} onChange={mark(setName)} placeholder={listingType === 'property' ? 'e.g. Ocean View Suite' : listingType === 'equipment' ? 'e.g. Canon R5 Camera' : listingType === 'vehicle' ? 'e.g. Red Tesla Model 3' : 'e.g. Beach Chairs'} />
            </Field>
            <Field label="Status">
              <Sel value={status} onChange={mark(setStatus)}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="inactive">Inactive</option>
              </Sel>
            </Field>
            <Field label="Description" style={{ gridColumn:"1 / -1" }}>
              <textarea value={description} onChange={mark(setDescription)}
                placeholder={listingType === 'property' ? 'Describe the apartment...' : listingType === 'equipment' ? 'Describe the equipment, condition, specs...' : listingType === 'vehicle' ? 'Describe the vehicle, year, mileage...' : 'Describe this rental...'}
                rows={3} style={{ ...inputStyle, resize:"vertical" }} />
            </Field>
            {/* Guest fields - only shown for property & experience */}
            {(LISTING_TYPES.find(l => l.key === listingType)?.showGuestFields) && (<>
              <Field label="Maximum Adults ⓘ">
                <Inp type="number" min={0} value={maxAdults} onChange={mark(setMaxAdults)} placeholder="e.g. 5" />
              </Field>
              <Field label="Maximum Children ⓘ">
                <Inp type="number" min={0} value={maxChildren} onChange={mark(setMaxChildren)} placeholder="e.g. 5" />
              </Field>
              <Field label="Maximum Infants ⓘ">
                <Inp type="number" min={0} value={maxInfants} onChange={mark(setMaxInfants)} placeholder="e.g. 5" />
              </Field>
            </>)}
          </div>
        </s-section>

        {/* ══════════════ BLOCK DATES ══════════════ */}
        <s-section heading="Block Dates">
          <p style={{ margin:"0 0 14px", fontSize:13, color:"#6d7175" }}>
            Mark specific dates as unavailable. Blocked dates cannot be booked by customers.
          </p>
          <div style={{ display:"flex", gap:10, marginBottom:14, alignItems:"flex-end" }}>
            <div style={{ flex:1 }}>
              <DatePickerField
                value={blockDateInput}
                onChange={(val) => setBlockDateInput(val)}
              />
            </div>
            <button type="button" onClick={addBlockedDate} style={{ ...primaryBtn, height:36 }}>+ Block Date</button>
          </div>
          {blockedDates.length > 0 ? (
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {blockedDates.map((d) => (
                <span key={d} style={tagStyle}>
                  <Icon source={CalendarIcon} /> {fmtDate(d)}
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
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:16, marginBottom:20 }}>
            <DatePickerField
              label="Calendar Start"
              hint="Earliest bookable date"
              value={calendarStartDate}
              onChange={(val) => { setCalendarStartDate(val); setIsDirty(true); }}
            />
            <DatePickerField
              label="Calendar End"
              hint="Latest bookable date"
              value={calendarEndDate}
              onChange={(val) => { setCalendarEndDate(val); setIsDirty(true); }}
            />
            {/* Time fields (dynamically labeled) */}
            <Field label={LISTING_TYPES.find(l => l.key === listingType)?.showPropertyFields ? "Check-in Time" : "Pickup Time"}>
              <Inp type="time" value={checkInTime} onChange={mark(setCheckInTime)} />
            </Field>
            <Field label={LISTING_TYPES.find(l => l.key === listingType)?.showPropertyFields ? "Check-out Time" : "Return Time"}>
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

          {/* Quantity Selector — hide for property (it has its own toggle in Property Details) */}
          {listingType !== 'property' && (
            <ToggleRow
              label="Quantity Selector"
              hint="Let customers choose quantity when booking"
              enabled={quantityEnabled}
              onChange={touch(setQuantityEnabled)}
            />
          )}

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
                    <span style={{ fontSize:12, fontWeight:700, width:28, color: day.enabled ? "#202223" : "#adb5bd" }}>
                      {day.enabled ? "ON" : "OFF"}
                    </span>
                    {day.enabled && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
                        <Inp type="time" value={day.open} onChange={(e) => updateDay(key, "open", e.target.value)} style={{ padding: "4px 8px", width: 110 }} />
                        <span>-</span>
                        <Inp type="time" value={day.close} onChange={(e) => updateDay(key, "close", e.target.value)} style={{ padding: "4px 8px", width: 110 }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </s-section>

        {/* ══════════════ PROPERTY DETAILS (only for property type) ══════════════ */}
        {LISTING_TYPES.find(l => l.key === listingType)?.showPropertyFields && (
        <s-section heading="Property Details">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:16, marginBottom:16 }}>
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

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(250px, 1fr))", gap:16, marginTop:20 }}>
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
        )}

        {/* ══════════════ STOCK MANAGEMENT ══════════════ */}
        <s-section heading="Stock & Capacity">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:16, marginBottom:16 }}>
            {!LISTING_TYPES.find(l => l.key === listingType)?.showPropertyFields && (
              <Field label="Location / Address" hint="Where will the customer pick this up?" style={{ gridColumn:"1/-1" }}>
                <Inp type="text" value={address} onChange={mark(setAddress)} placeholder="Location or delivery address" />
              </Field>
            )}
            {listingType === 'vehicle' && (
              <>
                <Field label="Transmission">
                  <Sel value={transmission} onChange={mark(setTransmission)}>
                    <option value="automatic">Automatic</option>
                    <option value="manual">Manual</option>
                  </Sel>
                </Field>
                <Field label="Fuel Policy">
                  <Sel value={fuelPolicy} onChange={mark(setFuelPolicy)}>
                    <option value="full-to-full">Full-to-Full</option>
                    <option value="pre-paid">Pre-paid</option>
                    <option value="included">Included</option>
                  </Sel>
                </Field>
                <Field label="Mileage Limit (km/miles)" hint="Leave blank for unlimited">
                  <Inp type="number" min="0" value={mileageLimit} onChange={mark(setMileageLimit)} placeholder="Unlimited" />
                </Field>
                <Field label="Driver's License Required">
                  <div style={{ marginTop: 6 }}>
                    <Toggle enabled={licenseRequired} onChange={touch(setLicenseRequired)} />
                  </div>
                </Field>
                <Field label="Passenger Capacity (Seats)">
                  <Inp type="number" min={1} value={maxGuests} onChange={mark(setMaxGuests)} placeholder="e.g. 5" />
                </Field>
              </>
            )}
            {listingType === 'equipment' && (
              <>
                <Field label="Condition">
                  <Sel value={condition} onChange={mark(setCondition)}>
                    <option value="new">New</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="parts">For Parts</option>
                  </Sel>
                </Field>
                <Field label="Total Units in Inventory" hint="Total physical stock available">
                  <Inp type="number" min="1" value={inventoryUnits} onChange={mark(setInventoryUnits)} />
                </Field>
              </>
            )}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))", gap:16, marginBottom:24 }}>
            <Field label={LISTING_TYPES.find(l => l.key === listingType)?.priceLabel ?? "Price ($)"}>
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
                      {fee.applyPer === "booking" ? "per booking" : "per unit"}
                    </span>
                    <button type="button"
                      onClick={() => { setAdditionalFees((p) => p.filter((f) => f.id !== fee.id)); setIsDirty(true); }}
                      style={deleteBtn}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ ...editCardStyle, display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))", gap:12, alignItems:"end" }}>
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
                    <option value="night">Per Unit / Day</option>
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
              <div style={{ display:"flex", gap:10, marginBottom:12, alignItems:"flex-end" }}>
                <div style={{ flex:1 }}>
                  <DatePickerField
                    value={discountDateInput}
                    onChange={(val) => setDiscountDateInput(val)}
                  />
                </div>
                <button type="button" onClick={addDateToDiscount} style={{ ...primaryBtn, height:36 }}>+ Add Date</button>
              </div>
              {editingDiscount.dates.length > 0 && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:14 }}>
                  {editingDiscount.dates.map((d) => (
                    <span key={d} style={tagStyle}>
                      <Icon source={CalendarIcon} /> {fmtDate(d)}
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
                        <option value="once">Single time - applied once to total</option>
                        <option value="each">Per unit - multiplied per night / item</option>
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

              {/* Balance Collection */}
              <div style={{ marginTop:20, paddingTop:16, borderTop:"1px solid #f1f1f1" }}>
                <ToggleRow
                  label="Auto-create balance invoice"
                  hint="When the deposit order is confirmed, automatically create a Shopify draft order for the remaining balance so you can send a payment link to the customer"
                  enabled={balanceAutoInvoice}
                  onChange={touch(setBalanceAutoInvoice)}
                />
                {balanceAutoInvoice && (
                  <div style={{ marginTop:12, padding:"12px 14px", background:"#f6f6f7", borderRadius:8, fontSize:13, color:"#6d7175", lineHeight:1.6 }}>
                    <strong style={{ color:"#202223" }}>How it works:</strong><br />
                    1. Customer pays deposit at checkout<br />
                    2. App detects the order and creates a draft order in Shopify for the remaining balance<br />
                    3. A <strong style={{ color:"#202223" }}>Send Invoice</strong> button appears on the booking - click it to email the payment link to the customer<br />
                    4. Customer pays the balance via the link - booking is fully settled
                  </div>
                )}
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
                <span key={item} style={{ ...tagStyle, background:"#f6f6f7", border:"1px solid #202223", color:"#202223" }}>
                  {item}
                  <button type="button"
                    onClick={() => { setAmenities((p) => p.filter((a) => a !== item)); setIsDirty(true); }}
                    style={{ ...tagX, color:"#202223" }}>×</button>
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
          <div style={{ fontSize:12, color:"#6d7175", marginBottom:8 }}>Common suggestions - click to add:</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {(AMENITY_SUGGESTIONS[listingType] || AMENITY_SUGGESTIONS.property).filter((s) => !amenities.includes(s)).map((item) => (
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

        {/* ── Photos ── */}
        <s-section heading="Photos">
          <p style={{ fontSize: 13, color: "#6d7175", marginBottom: 14, marginTop: 0 }}>
            Upload photos of this rental. They will be displayed in the storefront booking widget.
          </p>

          {/* Upload input */}
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="apt-photo-upload"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "9px 18px", background: "#fff", border: "1px solid #c9cccf",
                borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#202223",
              }}
            >
              📷 Choose Photos
            </label>
            <input
              id="apt-photo-upload"
              type="file"
              accept="image/*"
              multiple
              style={{ display: "none" }}
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;

                // Convert each file to a base64 data-URL for instant preview,
                // then upload to Shopify Files API via the action
                const previews = await Promise.all(
                  files.map(
                    (f) =>
                      new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(f);
                      })
                  )
                );

                // Show previews immediately
                setImages((prev) => [...prev, ...previews]);
                setIsDirty(true);
                // Reset input so same file can be re-selected
                e.target.value = "";
              }}
            />
            <span style={{ fontSize: 12, color: "#6d7175", marginLeft: 12 }}>
              PNG, JPG, WEBP - up to 20 MB each
            </span>
          </div>

          {/* Photo grid */}
          {images.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {images.map((url, i) => (
                <div
                  key={i}
                  style={{ position: "relative", borderRadius: 8, overflow: "hidden", border: "1px solid #e1e3e5" }}
                >
                  <img
                    src={url}
                    alt={`Photo ${i + 1}`}
                    style={{ width: 120, height: 96, objectFit: "cover", display: "block" }}
                  />
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => { setImages((p) => p.filter((_, idx) => idx !== i)); setIsDirty(true); }}
                    title="Remove photo"
                    style={{
                      position: "absolute", top: 4, right: 4,
                      width: 22, height: 22, borderRadius: "50%",
                      background: "rgba(0,0,0,0.55)", color: "#fff",
                      border: "none", cursor: "pointer", fontSize: 13,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                  {/* Move left */}
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setImages((p) => {
                          const a = [...p];
                          [a[i - 1], a[i]] = [a[i], a[i - 1]];
                          return a;
                        });
                        setIsDirty(true);
                      }}
                      title="Move left"
                      style={{
                        position: "absolute", bottom: 4, left: 4,
                        width: 22, height: 22, borderRadius: "50%",
                        background: "rgba(0,0,0,0.45)", color: "#fff",
                        border: "none", cursor: "pointer", fontSize: 12,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >‹</button>
                  )}
                  {/* Move right */}
                  {i < images.length - 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setImages((p) => {
                          const a = [...p];
                          [a[i], a[i + 1]] = [a[i + 1], a[i]];
                          return a;
                        });
                        setIsDirty(true);
                      }}
                      title="Move right"
                      style={{
                        position: "absolute", bottom: 4, right: 4,
                        width: 22, height: 22, borderRadius: "50%",
                        background: "rgba(0,0,0,0.45)", color: "#fff",
                        border: "none", cursor: "pointer", fontSize: 12,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >›</button>
                  )}
                  {i === 0 && (
                    <div style={{
                      position: "absolute", bottom: 4, left: 4,
                      background: "rgba(0,0,0,0.55)", color: "#fff",
                      fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "1px 5px",
                    }}>COVER</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              border: "2px dashed #e1e3e5", borderRadius: 8, padding: "32px 0",
              textAlign: "center", color: "#6d7175", fontSize: 13,
            }}>
              No photos yet - click "Choose Photos" to add some.
            </div>
          )}
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
  padding:"8px 16px", background:"#202223", color:"#fff",
  border:"none", borderRadius:8, fontSize:14, fontWeight:600,
  cursor:"pointer", whiteSpace:"nowrap",
};

const outlineBtn = {
  padding:"8px 16px", background:"#fff", color:"#202223",
  border:"1px solid #202223", borderRadius:8, fontSize:14, fontWeight:600,
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
