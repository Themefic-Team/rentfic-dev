import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import { useAppBridge, SaveBar } from "@shopify/app-bridge-react";
import { Popover, DatePicker, TextField, Icon, Card, Button, Box, InlineStack } from "@shopify/polaris";
import { CalendarIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { PlanCard } from "../components/PlanCard";
import { TimezoneSelect } from "../components/TimezoneSelect";

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
    displayCalendar: formData.get("displayCalendar"),
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
  const submittedRef = useRef(false);
  useEffect(() => {
    if (navigation.state === "submitting") {
      submittedRef.current = true;
    } else if (navigation.state === "idle" && submittedRef.current) {
      submittedRef.current = false;
      shopify.toast.show("Settings saved");
    }
  }, [navigation.state, shopify]);

  const [timezone, setTimezone] = useState(settings?.timezone ?? "Asia/Dhaka");
  const [timeFormat, setTimeFormat] = useState(settings?.timeFormat ?? "12");
  const [translate, setTranslate] = useState(settings?.translate ?? "automatic");
  const [redirectAfterCart, setRedirectAfterCart] = useState(settings?.redirectAfterCart ?? "automatic");
  const [displayCalendar, setDisplayCalendar] = useState(settings?.displayCalendar ?? "always_open");
  const [blockedDates, setBlockedDates] = useState(settings?.blockedDates ?? []);
  const [depositType, setDepositType] = useState(settings?.depositType ?? "percent");
  const [depositValue, setDepositValue] = useState(settings?.depositValue?.toString() ?? "");

  const isDirty = useMemo(() => {
    const s = settings ?? {};
    if (timezone           !== (s.timezone           ?? "Asia/Dhaka"))                return true;
    if (timeFormat         !== (s.timeFormat          ?? "12"))                        return true;
    if (translate          !== (s.translate           ?? "automatic"))                 return true;
    if (redirectAfterCart  !== (s.redirectAfterCart   ?? "automatic"))                 return true;
    if (displayCalendar    !== (s.displayCalendar     ?? "always_open"))               return true;
    if (depositType        !== (s.depositType         ?? "percent"))                   return true;
    if (depositValue       !== (s.depositValue?.toString() ?? ""))                     return true;
    if (JSON.stringify(blockedDates) !== JSON.stringify(s.blockedDates ?? []))         return true;
    return false;
  }, [settings, timezone, timeFormat, translate, redirectAfterCart,
      displayCalendar, depositType, depositValue, blockedDates]);

  function handleDiscard() {
    const s = settings ?? {};
    setTimezone(s.timezone ?? "Asia/Dhaka");
    setTimeFormat(s.timeFormat ?? "12");
    setTranslate(s.translate ?? "automatic");
    setRedirectAfterCart(s.redirectAfterCart ?? "automatic");
    setDisplayCalendar(s.displayCalendar ?? "always_open");
    setDepositType(s.depositType ?? "percent");
    setDepositValue(s.depositValue?.toString() ?? "");
    setBlockedDates(s.blockedDates ?? []);
  }

  const [popoverActive, setPopoverActive] = useState(false);
  const [selectedDate, setSelectedDate]   = useState(null);
  const [{ month, year }, setDateState]   = useState({
    month: new Date().getMonth(),
    year:  new Date().getFullYear(),
  });
  const datePickerRef = useRef(null);

  function toLocalDateString(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const formattedPickerValue = selectedDate ? toLocalDateString(selectedDate) : "";

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

  function handleMonthChange(m, y) {
    setDateState({ month: m, year: y });
  }

  function handleDateSelection({ end }) {
    setSelectedDate(end);
    setPopoverActive(false);
  }

  function addBlockedDate() {
    if (!selectedDate) return;
    const dateStr = toLocalDateString(selectedDate);
    if (blockedDates.includes(dateStr)) return;
    setBlockedDates((prev) => [...prev, dateStr].sort());
    setSelectedDate(null);
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
    formData.append("displayCalendar", displayCalendar);
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
      <SaveBar open={isDirty}>
        <button variant="primary" onClick={handleSave} loading={isSaving ? "" : undefined}>
          Save
        </button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>
      <PlanCard />

      {/* General */}
      <s-section heading="General">
        <s-paragraph>
          Basic information about your rental store shown to customers.
        </s-paragraph>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <label style={{ fontSize: "14px", fontWeight: 500 }}>Timezone</label>
            <TimezoneSelect value={timezone} onChange={setTimezone} />
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
              <option value="automatic">Automatic (detect from browser)</option>
              <option value="en">English</option>
              <option value="fr">French — Français</option>
              <option value="de">German — Deutsch</option>
              <option value="es">Spanish — Español</option>
              <option value="ar">Arabic — العربية</option>
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
            <label htmlFor="display-calendar" style={{ fontSize: "14px", fontWeight: 500 }}>Display Calendar</label>
            <select id="display-calendar" value={displayCalendar} onChange={(e) => setDisplayCalendar(e.target.value)} style={selectStyle}>
              <option value="default">Default</option>
              <option value="always_open">Always Open</option>
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
          <InlineStack gap="200" blockAlign="end" wrap={false}>
            <Box minWidth="276px">
              <Popover
                active={popoverActive}
                autofocusTarget="none"
                preferredAlignment="left"
                fullWidth
                preferInputActivator={false}
                preferredPosition="below"
                preventCloseOnChildOverlayClick
                onClose={handlePopoverClose}
                activator={
                  <TextField
                    role="combobox"
                    label="Select date"
                    prefix={<Icon source={CalendarIcon} />}
                    value={formattedPickerValue}
                    onFocus={() => setPopoverActive(true)}
                    onChange={() => {}}
                    autoComplete="off"
                    placeholder="YYYY-MM-DD"
                  />
                }
              >
                <Card ref={datePickerRef}>
                  <DatePicker
                    month={month}
                    year={year}
                    selected={selectedDate}
                    onMonthChange={handleMonthChange}
                    onChange={handleDateSelection}
                    disableDatesBefore={new Date()}
                  />
                </Card>
              </Popover>
            </Box>
            <Button onClick={addBlockedDate} disabled={!selectedDate}>
              Add date
            </Button>
          </InlineStack>
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
