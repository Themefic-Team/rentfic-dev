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

const AMENITIES = [
  "WiFi",
  "Air Conditioning",
  "Heating",
  "Kitchen",
  "Washing Machine",
  "TV",
  "Free Parking",
  "Pool",
  "Gym",
  "Elevator",
  "Balcony",
  "Sea View",
  "Pet Friendly",
  "Smoking Allowed",
];

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  if (params.id === "new") {
    return { apartment: null };
  }
  const apartment = await prisma.apartment.findFirst({
    where: { id: params.id, shop: session.shop },
  });
  if (!apartment) throw new Response("Not Found", { status: 404 });
  return { apartment };
};

export const action = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const data = {
    shop: session.shop,
    productId: formData.get("productId"),
    productTitle: formData.get("productTitle"),
    name: formData.get("name") || "",
    description: formData.get("description") || null,
    pricePerNight: formData.get("pricePerNight")
      ? parseFloat(formData.get("pricePerNight"))
      : null,
    bedrooms: formData.get("bedrooms") ? parseInt(formData.get("bedrooms")) : null,
    bathrooms: formData.get("bathrooms") ? parseInt(formData.get("bathrooms")) : null,
    maxGuests: formData.get("maxGuests") ? parseInt(formData.get("maxGuests")) : null,
    amenities: formData.getAll("amenities"),
    address: formData.get("address") || null,
    city: formData.get("city") || null,
    country: formData.get("country") || null,
    checkInTime: formData.get("checkInTime") || null,
    checkOutTime: formData.get("checkOutTime") || null,
    minNights: formData.get("minNights") ? parseInt(formData.get("minNights")) : 1,
    maxNights: formData.get("maxNights") ? parseInt(formData.get("maxNights")) : null,
    status: formData.get("status") || "active",
  };

  if (params.id === "new") {
    const created = await prisma.apartment.create({ data });
    return redirect(`/app/apartments/${created.id}?saved=1`);
  } else {
    const { shop, ...updateData } = data;
    await prisma.apartment.update({
      where: { id: params.id },
      data: updateData,
    });
    return { success: true };
  }
};

export default function ApartmentEditPage() {
  const { apartment } = useLoaderData();
  const actionData = useActionData();
  const [searchParams] = useSearchParams();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const isNew = !apartment;
  const isSaving = navigation.state === "submitting";

  const productId = apartment?.productId ?? searchParams.get("productId") ?? "";
  const productTitle = apartment?.productTitle ?? searchParams.get("productTitle") ?? "";

  // Original values for discard
  const orig = useRef({
    name: apartment?.name ?? productTitle,
    description: apartment?.description ?? "",
    pricePerNight: apartment?.pricePerNight?.toString() ?? "",
    bedrooms: apartment?.bedrooms?.toString() ?? "",
    bathrooms: apartment?.bathrooms?.toString() ?? "",
    maxGuests: apartment?.maxGuests?.toString() ?? "",
    amenities: apartment?.amenities ?? [],
    address: apartment?.address ?? "",
    city: apartment?.city ?? "",
    country: apartment?.country ?? "",
    checkInTime: apartment?.checkInTime ?? "14:00",
    checkOutTime: apartment?.checkOutTime ?? "11:00",
    minNights: apartment?.minNights?.toString() ?? "1",
    maxNights: apartment?.maxNights?.toString() ?? "",
    status: apartment?.status ?? "active",
  });

  const [name, setName] = useState(orig.current.name);
  const [description, setDescription] = useState(orig.current.description);
  const [pricePerNight, setPricePerNight] = useState(orig.current.pricePerNight);
  const [bedrooms, setBedrooms] = useState(orig.current.bedrooms);
  const [bathrooms, setBathrooms] = useState(orig.current.bathrooms);
  const [maxGuests, setMaxGuests] = useState(orig.current.maxGuests);
  const [amenities, setAmenities] = useState(orig.current.amenities);
  const [address, setAddress] = useState(orig.current.address);
  const [city, setCity] = useState(orig.current.city);
  const [country, setCountry] = useState(orig.current.country);
  const [checkInTime, setCheckInTime] = useState(orig.current.checkInTime);
  const [checkOutTime, setCheckOutTime] = useState(orig.current.checkOutTime);
  const [minNights, setMinNights] = useState(orig.current.minNights);
  const [maxNights, setMaxNights] = useState(orig.current.maxNights);
  const [status, setStatus] = useState(orig.current.status);
  const [isDirty, setIsDirty] = useState(false);

  const mark = useCallback((setter) => (e) => {
    setter(e.target.value);
    setIsDirty(true);
  }, []);

  const toggleAmenity = (item) => {
    setAmenities((prev) =>
      prev.includes(item) ? prev.filter((a) => a !== item) : [...prev, item]
    );
    setIsDirty(true);
  };

  // Show / hide the save bar whenever dirty state changes
  useEffect(() => {
    if (isDirty) {
      shopify.saveBar.show("apartment-save-bar");
    } else {
      shopify.saveBar.hide("apartment-save-bar");
    }
  }, [isDirty, shopify]);

  // Toast on successful update (action returned {success:true})
  useEffect(() => {
    if (actionData?.success) {
      shopify.toast.show("Saved");
      setIsDirty(false);
      // Update orig so discard works against the new saved values
      orig.current = {
        name, description, pricePerNight, bedrooms, bathrooms,
        maxGuests, amenities, address, city, country,
        checkInTime, checkOutTime, minNights, maxNights, status,
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  // Toast when redirected here after creating a new apartment (?saved=1)
  useEffect(() => {
    if (searchParams.get("saved")) {
      shopify.toast.show("Apartment created");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDiscard = () => {
    const o = orig.current;
    setName(o.name);
    setDescription(o.description);
    setPricePerNight(o.pricePerNight);
    setBedrooms(o.bedrooms);
    setBathrooms(o.bathrooms);
    setMaxGuests(o.maxGuests);
    setAmenities(o.amenities);
    setAddress(o.address);
    setCity(o.city);
    setCountry(o.country);
    setCheckInTime(o.checkInTime);
    setCheckOutTime(o.checkOutTime);
    setMinNights(o.minNights);
    setMaxNights(o.maxNights);
    setStatus(o.status);
    setIsDirty(false);
  };

  const handleSave = () => {
    if (!name.trim()) {
      shopify.toast.show("Apartment name is required", { isError: true });
      return;
    }
    const formData = new FormData();
    formData.append("productId", productId);
    formData.append("productTitle", productTitle);
    formData.append("name", name);
    formData.append("description", description);
    formData.append("pricePerNight", pricePerNight);
    formData.append("bedrooms", bedrooms);
    formData.append("bathrooms", bathrooms);
    formData.append("maxGuests", maxGuests);
    amenities.forEach((a) => formData.append("amenities", a));
    formData.append("address", address);
    formData.append("city", city);
    formData.append("country", country);
    formData.append("checkInTime", checkInTime);
    formData.append("checkOutTime", checkOutTime);
    formData.append("minNights", minNights);
    formData.append("maxNights", maxNights);
    formData.append("status", status);
    submit(formData, { method: "POST" });
  };

  return (
    <>
      <SaveBar id="apartment-save-bar">
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined}>
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>

      <s-page heading={isNew ? "Create Apartment" : `Edit: ${apartment.name}`}>
        {/* Linked product */}
        <s-section heading="Linked Product">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              background: "#f6f6f7",
              borderRadius: "8px",
              border: "1px solid #e1e3e5",
            }}
          >
            <div>
              <div style={{ fontSize: "13px", color: "#6d7175" }}>Product</div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>{productTitle}</div>
              <div style={{ fontSize: "12px", color: "#6d7175", marginTop: 2 }}>
                ID: {productId}
              </div>
            </div>
          </div>
        </s-section>

        {/* Basic details */}
        <s-section heading="Basic Details">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ gridColumn: "1 / -1", ...fieldWrapStyle }}>
              <label style={labelStyle}>Apartment Name *</label>
              <input
                type="text"
                value={name}
                onChange={mark(setName)}
                placeholder="e.g. Ocean View Suite"
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: "1 / -1", ...fieldWrapStyle }}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={description}
                onChange={mark(setDescription)}
                placeholder="Describe the apartment..."
                rows={4}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Price per Night ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={pricePerNight}
                onChange={mark(setPricePerNight)}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Status</label>
              <select value={status} onChange={mark(setStatus)} style={inputStyle}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </s-section>

        {/* Capacity */}
        <s-section heading="Capacity">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Bedrooms</label>
              <input
                type="number"
                min={0}
                value={bedrooms}
                onChange={mark(setBedrooms)}
                placeholder="0"
                style={inputStyle}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Bathrooms</label>
              <input
                type="number"
                min={0}
                value={bathrooms}
                onChange={mark(setBathrooms)}
                placeholder="0"
                style={inputStyle}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Max Guests</label>
              <input
                type="number"
                min={1}
                value={maxGuests}
                onChange={mark(setMaxGuests)}
                placeholder="1"
                style={inputStyle}
              />
            </div>
          </div>
        </s-section>

        {/* Location */}
        <s-section heading="Location">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ gridColumn: "1 / -1", ...fieldWrapStyle }}>
              <label style={labelStyle}>Address</label>
              <input
                type="text"
                value={address}
                onChange={mark(setAddress)}
                placeholder="123 Beach Road"
                style={inputStyle}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>City</label>
              <input
                type="text"
                value={city}
                onChange={mark(setCity)}
                placeholder="Miami"
                style={inputStyle}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Country</label>
              <input
                type="text"
                value={country}
                onChange={mark(setCountry)}
                placeholder="United States"
                style={inputStyle}
              />
            </div>
          </div>
        </s-section>

        {/* Booking Rules */}
        <s-section heading="Booking Rules">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: "16px",
            }}
          >
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Check-in Time</label>
              <input
                type="time"
                value={checkInTime}
                onChange={mark(setCheckInTime)}
                style={inputStyle}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Check-out Time</label>
              <input
                type="time"
                value={checkOutTime}
                onChange={mark(setCheckOutTime)}
                style={inputStyle}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Min Nights</label>
              <input
                type="number"
                min={1}
                value={minNights}
                onChange={mark(setMinNights)}
                placeholder="1"
                style={inputStyle}
              />
            </div>
            <div style={fieldWrapStyle}>
              <label style={labelStyle}>Max Nights</label>
              <input
                type="number"
                min={1}
                value={maxNights}
                onChange={mark(setMaxNights)}
                placeholder="No limit"
                style={inputStyle}
              />
            </div>
          </div>
        </s-section>

        {/* Amenities */}
        <s-section heading="Amenities">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "10px",
            }}
          >
            {AMENITIES.map((item) => (
              <label
                key={item}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  fontSize: "14px",
                  padding: "8px 12px",
                  border: `1px solid ${amenities.includes(item) ? "#008060" : "#e1e3e5"}`,
                  borderRadius: "8px",
                  background: amenities.includes(item) ? "#f0faf6" : "#fff",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={amenities.includes(item)}
                  onChange={() => toggleAmenity(item)}
                  style={{ accentColor: "#008060" }}
                />
                {item}
              </label>
            ))}
          </div>
        </s-section>
      </s-page>
    </>
  );
}

const fieldWrapStyle = { display: "flex", flexDirection: "column", gap: "4px" };
const labelStyle = { fontSize: "14px", fontWeight: 500, color: "#202223" };
const inputStyle = {
  padding: "8px 12px",
  border: "1px solid #c9cccf",
  borderRadius: "8px",
  fontSize: "14px",
  background: "#fff",
  width: "100%",
  boxSizing: "border-box",
};
