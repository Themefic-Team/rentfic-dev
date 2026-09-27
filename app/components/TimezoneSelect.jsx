import { useState, useRef, useEffect, useMemo } from "react";

const ALL_TIMEZONES = Intl.supportedValuesOf("timeZone");

export function TimezoneSelect({ value, onChange }) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState(null);
  const containerRef = useRef(null);
  const inputRef     = useRef(null);
  const listRef      = useRef(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().replace(/\s+/g, "");
    if (!q) return ALL_TIMEZONES;
    return ALL_TIMEZONES.filter((tz) =>
      tz.toLowerCase().replace(/[/_]/g, "").includes(q) ||
      tz.toLowerCase().includes(q)
    );
  }, [search]);

  useEffect(() => {
    function onMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function openDropdown() {
    setOpen(true);
    setSearch("");
    setHovered(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function closeDropdown() {
    setOpen(false);
    setSearch("");
    setHovered(null);
  }

  function select(tz) {
    onChange(tz);
    closeDropdown();
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") { closeDropdown(); return; }
    if (e.key === "Enter" && hovered !== null) { select(filtered[hovered]); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHovered((h) => {
        const next = h === null ? 0 : Math.min(h + 1, filtered.length - 1);
        scrollIntoView(next);
        return next;
      });
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHovered((h) => {
        const next = h === null ? 0 : Math.max(h - 1, 0);
        scrollIntoView(next);
        return next;
      });
    }
  }

  function scrollIntoView(index) {
    if (!listRef.current) return;
    const item = listRef.current.children[index];
    item?.scrollIntoView({ block: "nearest" });
  }

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      {/* Trigger button */}
      {!open && (
        <button
          type="button"
          onClick={openDropdown}
          style={{
            padding: "8px 12px",
            border: "1px solid #c9cccf",
            borderRadius: "8px",
            fontSize: "14px",
            background: "#fff",
            width: "100%",
            textAlign: "left",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            boxSizing: "border-box",
            color: "#202223",
          }}
        >
          <span>{value || "Select timezone…"}</span>
          <span style={{ color: "#6d7175", fontSize: "11px", flexShrink: 0 }}>▾</span>
        </button>
      )}

      {/* Search input (replaces button when open) */}
      {open && (
        <input
          ref={inputRef}
          type="text"
          placeholder={`Search "${value}"…`}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setHovered(0); }}
          onKeyDown={handleKeyDown}
          style={{
            padding: "8px 12px",
            border: "1px solid #458fff",
            borderRadius: "8px",
            fontSize: "14px",
            background: "#fff",
            width: "100%",
            boxSizing: "border-box",
            outline: "none",
            boxShadow: "0 0 0 2px rgba(0,128,255,0.12)",
          }}
        />
      )}

      {/* Dropdown list */}
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#fff",
            border: "1px solid #c9cccf",
            borderRadius: "8px",
            boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
            zIndex: 200,
            maxHeight: "260px",
            overflowY: "auto",
          }}
          ref={listRef}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: "14px", color: "#6d7175" }}>
              No timezones found
            </div>
          ) : (
            filtered.map((tz, i) => {
              const isSelected = tz === value;
              const isHovered  = i === hovered;
              return (
                <div
                  key={tz}
                  onMouseDown={() => select(tz)}
                  onMouseEnter={() => setHovered(i)}
                  style={{
                    padding: "8px 14px",
                    fontSize: "14px",
                    cursor: "pointer",
                    color: isSelected ? "var(--p-color-primary, #FD4A52)" : "#202223",
                    fontWeight: isSelected ? 600 : 400,
                    background: isSelected
                      ? "#f0faf6"
                      : isHovered
                      ? "#f6f6f7"
                      : "transparent",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{tz}</span>
                  {isSelected && (
                    <span style={{ fontSize: "12px", color: "var(--p-color-primary, #008060)" }}>✓</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
