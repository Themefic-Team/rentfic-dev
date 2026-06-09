import { useState, useEffect, useRef } from "react";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shop: session.shop },
    select: { settings: true },
  });
  return { settings: shop?.settings ?? {} };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const settings = {
    timezone: formData.get("timezone"),
    timeFormat: formData.get("timeFormat"),
    translate: formData.get("translate"),
    redirectAfterCart: formData.get("redirectAfterCart"),
    fromPrice: formData.get("fromPrice"),
    displayCalendar: formData.get("displayCalendar"),
    quantityPosition: formData.get("quantityPosition"),
    startCalendar: formData.get("startCalendar"),
    depositType: formData.get("depositType"),
    depositValue: formData.get("depositValue")
      ? parseFloat(formData.get("depositValue"))
      : null,
    blockedDates: formData.getAll("blockedDates"),
  };

  await prisma.shop.upsert({
    where: { shop: session.shop },
    update: { settings },
    create: { shop: session.shop, settings },
  });

  return { success: true };
};

export default function SettingsPage() {
  const { settings } = useLoaderData();
  const submit = useSubmit();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const isSaving = navigation.state === "submitting";
  const prevState = useRef(navigation.state);
  useEffect(() => {
    if (prevState.current === "submitting" && navigation.state === "idle") {
      shopify.toast.show("Settings saved");
    }
    prevState.current = navigation.state;
  }, [navigation.state, shopify]);

  const [timezone, setTimezone] = useState(settings?.timezone ?? "Asia/Dhaka");
  const [timeFormat, setTimeFormat] = useState(settings?.timeFormat ?? "12");
  const [translate, setTranslate] = useState(settings?.translate ?? "automatic");
  const [redirectAfterCart, setRedirectAfterCart] = useState(settings?.redirectAfterCart ?? "automatic");
  const [fromPrice, setFromPrice] = useState(settings?.fromPrice ?? "automatic");
  const [displayCalendar, setDisplayCalendar] = useState(settings?.displayCalendar ?? "always_open");
  const [quantityPosition, setQuantityPosition] = useState(settings?.quantityPosition ?? "product_and_calendar");
  const [startCalendar, setStartCalendar] = useState(settings?.startCalendar ?? "current_date");
  const [blockedDates, setBlockedDates] = useState(settings?.blockedDates ?? []);
  const [datePickerValue, setDatePickerValue] = useState("");
  const [depositType, setDepositType] = useState(settings?.depositType ?? "percent");
  const [depositValue, setDepositValue] = useState(settings?.depositValue?.toString() ?? "");

  function addBlockedDate() {
    if (!datePickerValue || blockedDates.includes(datePickerValue)) return;
    setBlockedDates([...blockedDates, datePickerValue].sort());
    setDatePickerValue("");
  }

  function removeBlockedDate(date) {
    setBlockedDates(blockedDates.filter((d) => d !== date));
  }

  function handleSave() {
    const formData = new FormData();
    formData.append("timezone", timezone);
    formData.append("timeFormat", timeFormat);
    formData.append("translate", translate);
    formData.append("redirectAfterCart", redirectAfterCart);
    formData.append("fromPrice", fromPrice);
    formData.append("displayCalendar", displayCalendar);
    formData.append("quantityPosition", quantityPosition);
    formData.append("startCalendar", startCalendar);
    formData.append("depositType", depositType);
    formData.append("depositValue", depositValue);
    blockedDates.forEach((d) => formData.append("blockedDates", d));
    submit(formData, { method: "POST" });
  }

  const selectStyle = {
    padding: "8px 12px",
    border: "1px solid #c9cccf",
    borderRadius: "8px",
    fontSize: "14px",
    background: "#fff",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <s-page heading="Settings">
      <s-button slot="primary-action" onClick={handleSave} loading={isSaving}>
        Save
      </s-button>

      {/* General */}
      <s-section heading="General">
        <s-paragraph>
          Basic information about your rental store shown to customers.
        </s-paragraph>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor="timezone" style={{ fontSize: "14px", fontWeight: 500 }}>Timezone</label>
            <select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} style={selectStyle}>
              <option value="Asia/Dhaka">Asia/Dhaka</option>
              <option value="Asia/Kolkata">Asia/Kolkata</option>
              <option value="Asia/Dubai">Asia/Dubai</option>
              <option value="Europe/London">Europe/London</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor="time-format" style={{ fontSize: "14px", fontWeight: 500 }}>Time Format</label>
            <select id="time-format" value={timeFormat} onChange={(e) => setTimeFormat(e.target.value)} style={selectStyle}>
              <option value="12">12-hours</option>
              <option value="24">24-hours</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor="translate" style={{ fontSize: "14px", fontWeight: 500 }}>Translate</label>
            <select id="translate" value={translate} onChange={(e) => setTranslate(e.target.value)} style={selectStyle}>
              <option value="automatic">Automatic</option>
              <option value="english">English</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor="redirect-after-cart" style={{ fontSize: "14px", fontWeight: 500 }}>Redirect after add to cart</label>
            <select id="redirect-after-cart" value={redirectAfterCart} onChange={(e) => setRedirectAfterCart(e.target.value)} style={selectStyle}>
              <option value="automatic">Automatic</option>
              <option value="redirect_to_cart">Redirect to cart</option>
              <option value="redirect_to_checkout">Redirect to checkout</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor="from-price" style={{ fontSize: "14px", fontWeight: 500 }}>From Price</label>
            <select id="from-price" value={fromPrice} onChange={(e) => setFromPrice(e.target.value)} style={selectStyle}>
              <option value="automatic">Automatic</option>
              <option value="minimum">Minimum</option>
              <option value="minimum_per_day">Minimum / day</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor="display-calendar" style={{ fontSize: "14px", fontWeight: 500 }}>Display Calendar</label>
            <select id="display-calendar" value={displayCalendar} onChange={(e) => setDisplayCalendar(e.target.value)} style={selectStyle}>
              <option value="default">Default</option>
              <option value="always_open">Always Open</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor="quantity-position" style={{ fontSize: "14px", fontWeight: 500 }}>Quantity position</label>
            <select id="quantity-position" value={quantityPosition} onChange={(e) => setQuantityPosition(e.target.value)} style={selectStyle}>
              <option value="product_and_calendar">On product page and calendar</option>
              <option value="product_page">On product page</option>
              <option value="calendar">On calendar</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor="start-calendar" style={{ fontSize: "14px", fontWeight: 500 }}>Start Calendar</label>
            <select id="start-calendar" value={startCalendar} onChange={(e) => setStartCalendar(e.target.value)} style={selectStyle}>
              <option value="current_date">On current date</option>
              <option value="first_available">First available date</option>
            </select>
          </div>
        </div>
      </s-section>

      {/* Block dates on store */}
      <s-section heading="Block dates on store">
        <s-paragraph>
          Select dates when your store is unavailable. Customers will not be
          able to book rentals on these dates.
        </s-paragraph>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
              <label htmlFor="block-date" style={{ fontSize: "14px", fontWeight: 500 }}>
                Select date
              </label>
              <input
                id="block-date"
                type="date"
                value={datePickerValue}
                onChange={(e) => setDatePickerValue(e.target.value)}
                style={{
                  padding: "8px 12px",
                  border: "1px solid #c9cccf",
                  borderRadius: "8px",
                  fontSize: "14px",
                  width: "100%",
                  boxSizing: "border-box",
                  background: "#fff",
                }}
              />
            </div>
            <button
              onClick={addBlockedDate}
              style={{
                padding: "8px 16px",
                background: "#008060",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Add date
            </button>
          </div>
          {blockedDates.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {blockedDates.map((date) => (
                <div
                  key={date}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 10px",
                    background: "#f1f2f3",
                    border: "1px solid #c9cccf",
                    borderRadius: "20px",
                    fontSize: "13px",
                  }}
                >
                  <span>{date}</span>
                  <button
                    onClick={() => removeBlockedDate(date)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0",
                      lineHeight: 1,
                      color: "#6d7175",
                      fontSize: "16px",
                    }}
                    aria-label={`Remove ${date}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: "13px", color: "#6d7175" }}>
              No dates blocked yet.
            </span>
          )}
        </div>
      </s-section>

      {/* Order deposit */}
      <s-section heading="Order deposit">
        <s-paragraph>
          Charge a deposit when customers place a rental order.
        </s-paragraph>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor="deposit-type" style={{ fontSize: "14px", fontWeight: 500 }}>
              Deposit type
            </label>
            <select id="deposit-type" value={depositType} onChange={(e) => setDepositType(e.target.value)} style={selectStyle}>
              <option value="percent">Percent (%)</option>
              <option value="amount">Fixed amount</option>
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label htmlFor="deposit-value" style={{ fontSize: "14px", fontWeight: 500 }}>
              {depositType === "percent" ? "Deposit (%)" : "Deposit amount"}
            </label>
            <input
              id="deposit-value"
              type="number"
              min={0}
              max={depositType === "percent" ? 100 : undefined}
              value={depositValue}
              onChange={(e) => setDepositValue(e.target.value)}
              placeholder={depositType === "percent" ? "e.g. 20" : "e.g. 50.00"}
              style={{
                padding: "8px 12px",
                border: "1px solid #c9cccf",
                borderRadius: "8px",
                fontSize: "14px",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <span style={{ fontSize: "12px", color: "#6d7175" }}>
              {depositType === "percent"
                ? "Percentage of the order total charged as deposit."
                : "Fixed amount charged as deposit per order."}
            </span>
          </div>
        </div>
      </s-section>
    </s-page>
  );
}
