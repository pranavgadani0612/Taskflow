import React from "react";

// 12-hour time picker (Hour / Minute / AM-PM) that looks the same on every device.
// The native <input type="time"> follows the OS clock setting, so some laptops show 24-hour without AM/PM.
// value / onChange use 24-hour "HH:MM" (same as <input type="time">), or "" when not chosen.
const HOURS = ["12", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"];
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const split = (value) => {
  if (!value || !/^\d{2}:\d{2}/.test(value)) return { hour: "", minute: "", period: "PM" };
  const h = parseInt(value.slice(0, 2), 10);
  return {
    hour: String(h % 12 === 0 ? 12 : h % 12).padStart(2, "0"),
    minute: value.slice(3, 5),
    period: h >= 12 ? "PM" : "AM"
  };
};

const join = (hour, minute, period) => {
  if (!hour || !minute) return "";
  let h = parseInt(hour, 10) % 12;
  if (period === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
};

export default function TimeSelect12h({ value, onChange, hasError = false, style = {} }) {
  const parts = split(value);
  const [draft, setDraft] = React.useState(parts);

  // Keep local selection in sync when the value is changed from outside (e.g. form reset / edit modal)
  React.useEffect(() => {
    if (value) setDraft(split(value));
    else setDraft((d) => (d.hour && d.minute ? { hour: "", minute: "", period: d.period } : d));
  }, [value]);

  const update = (patch) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(join(next.hour, next.minute, next.period));
  };

  const selectStyle = {
    padding: "7px 6px",
    border: `1px solid ${hasError ? "#dc2626" : "var(--ui-border, #cbd5e1)"}`,
    borderRadius: "6px",
    background: "var(--ui-surface, #fff)",
    color: "var(--text-main, #1e293b)",
    fontSize: "13px",
    cursor: "pointer"
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", ...style }}>
      <select aria-label="Hour" value={draft.hour} onChange={(e) => update({ hour: e.target.value })} style={selectStyle}>
        <option value="">hh</option>
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span style={{ fontWeight: "700", color: "var(--text-muted, #64748b)" }}>:</span>
      <select aria-label="Minute" value={draft.minute} onChange={(e) => update({ minute: e.target.value })} style={selectStyle}>
        <option value="">mm</option>
        {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select aria-label="AM or PM" value={draft.period} onChange={(e) => update({ period: e.target.value })} style={{ ...selectStyle, fontWeight: "700" }}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}
