import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../contexts/PermissionContext";
import FormModal from "../components/common/FormModal";
import ConfirmModal from "../components/common/ConfirmModal";
import { IconCalendar } from "../components/common/Icons";
import "../style/main.css";

export default function HolidayCalendar() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { hasPermission: ctxHasPermission } = usePermissions();

  const [confirmConfig, setConfirmConfig] = useState({
    show: false,
    title: "Confirmation",
    message: "",
    onConfirm: () => {},
    confirmText: "Delete",
    confirmColor: "var(--danger-color)"
  });

  const askConfirm = (title, message, onConfirm, confirmText = "Delete", confirmColor = "var(--danger-color)") => {
    setConfirmConfig({
      show: true,
      title,
      message,
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, show: false }));
        await onConfirm();
      },
      confirmText,
      confirmColor
    });
  };

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isOwner = isSuperAdmin || user?.role?.name === "Company Owner";
  const hasPermission = (action = "read") => {
    if (isOwner) return true;
    return ctxHasPermission("holiday_calendar", action);
  };

  const [activeTab, setActiveTab] = useState("holidays"); // "holidays" | "team_calendar"
  const [holidays, setHolidays] = useState([]);
  const [loadingHolidays, setLoadingHolidays] = useState(true);

  // Team calendar state
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [teamCalendar, setTeamCalendar] = useState({ leaves: [], holidays: [] });
  const [loadingTeam, setLoadingTeam] = useState(false);

  // Add / Edit holiday modal
  const [showModal, setShowModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    name: "",
    holiday_date: "",
    description: "",
    is_optional: false
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const fetchHolidays = async () => {
    try {
      setLoadingHolidays(true);
      const res = await API.get(`/holidays?year=${selectedYear}`);
      setHolidays(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error loading holidays:", err);
    } finally {
      setLoadingHolidays(false);
    }
  };

  const fetchTeamCalendar = async () => {
    try {
      setLoadingTeam(true);
      const res = await API.get(`/holidays/team-calendar?month=${selectedMonth}&year=${selectedYear}`);
      setTeamCalendar(res.data || { leaves: [], holidays: [] });
    } catch (err) {
      console.error("Error loading team calendar:", err);
    } finally {
      setLoadingTeam(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, [selectedYear]);

  useEffect(() => {
    if (activeTab === "team_calendar") {
      fetchTeamCalendar();
    }
  }, [activeTab, selectedMonth, selectedYear]);

  const handleOpenAdd = () => {
    setEditingHoliday(null);
    setFieldErrors({});
    setHolidayForm({ name: "", holiday_date: "", description: "", is_optional: false });
    setShowModal(true);
  };

  const handleOpenEdit = (h) => {
    setEditingHoliday(h);
    setFieldErrors({});
    setHolidayForm({
      name: h.name || "",
      holiday_date: h.holiday_date ? h.holiday_date.slice(0, 10) : "",
      description: h.description || "",
      is_optional: Boolean(h.is_optional)
    });
    setShowModal(true);
  };

  const handleSaveHoliday = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!holidayForm.name || !holidayForm.name.trim()) {
      showToast("Holiday name is required", "error");
      return;
    }
    if (!holidayForm.holiday_date) {
      showToast("Holiday date is required", "error");
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    try {
      if (editingHoliday) {
        await API.put(`/holidays/${editingHoliday.id}`, holidayForm);
        showToast("Holiday updated successfully!", "success");
      } else {
        await API.post("/holidays", holidayForm);
        showToast("Holiday added successfully!", "success");
      }
      setShowModal(false);
      setEditingHoliday(null);
      setFieldErrors({});
      setHolidayForm({ name: "", holiday_date: "", description: "", is_optional: false });
      fetchHolidays();
    } catch (err) {
      const serverMsg = err.response?.data?.error || err.response?.data?.message;
      const field = err.response?.data?.field;
      if (field && serverMsg) {
        setFieldErrors({ [field]: serverMsg });
      } else if (serverMsg && serverMsg.toLowerCase().includes("name")) {
        setFieldErrors({ name: serverMsg });
      } else if (serverMsg && (serverMsg.toLowerCase().includes("date"))) {
        setFieldErrors({ holiday_date: serverMsg });
      } else {
        showToast(serverMsg || "Failed to save holiday", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteHoliday = (id) => {
    askConfirm("Delete Holiday", "Are you sure you want to delete this holiday?", async () => {
      try {
        await API.delete(`/holidays/${id}`);
        showToast("Holiday deleted", "info");
        fetchHolidays();
      } catch (err) {
        showToast(err.response?.data?.error || "Delete failed", "error");
      }
    });
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div style={{ padding: "clamp(16px, 3vw, 28px)", maxWidth: "1200px", margin: "0 auto" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <IconCalendar size={26} color="#4f46e5" />
            <h1 style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-main, #1e293b)", margin: 0 }}>
              Holidays & Team Leave Calendar
            </h1>
          </div>
          <p style={{ color: "var(--text-muted, #64748b)", margin: "6px 0 0", fontSize: "14px" }}>
            Plan sprints, track official public holidays, and visualize team absence to maintain coverage.
          </p>
        </div>

        {hasPermission("create") && activeTab === "holidays" && (
          <button
            onClick={handleOpenAdd}
            style={{
              background: "linear-gradient(135deg, #4f46e5, #6366f1)",
              color: "#fff",
              border: "none",
              padding: "10px 18px",
              borderRadius: "10px",
              fontWeight: "700",
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)"
            }}
          >
            + Add Company Holiday
          </button>
        )}
      </div>

      {/* TOP TABS */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", borderBottom: "1px solid var(--ui-border, #e2e8f0)", paddingBottom: "10px", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setActiveTab("holidays")}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              border: "none",
              fontWeight: "700",
              fontSize: "14px",
              background: activeTab === "holidays" ? "#4f46e5" : "transparent",
              color: activeTab === "holidays" ? "#fff" : "var(--text-muted, #64748b)",
              cursor: "pointer",
              transition: "0.2s"
            }}
          >
            {selectedYear} Company Holidays ({holidays.length})
          </button>
          <button
            onClick={() => setActiveTab("team_calendar")}
            style={{
              padding: "8px 20px",
              borderRadius: "8px",
              border: "none",
              fontWeight: "700",
              fontSize: "14px",
              background: activeTab === "team_calendar" ? "#4f46e5" : "transparent",
              color: activeTab === "team_calendar" ? "#fff" : "var(--text-muted, #64748b)",
              cursor: "pointer",
              transition: "0.2s"
            }}
          >
            Team Absence & Coverage Calendar
          </button>
        </div>

        {/* YEAR SELECTOR */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-muted, #64748b)" }}>Year:</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid var(--ui-border, #cbd5e1)",
              background: "var(--ui-surface, #fff)",
              color: "var(--text-main, #1e293b)",
              fontWeight: "700",
              fontSize: "14px",
              cursor: "pointer"
            }}
          >
            {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* TAB 1: COMPANY HOLIDAYS */}
      {activeTab === "holidays" && (
        <div>
          {loadingHolidays ? (
            <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted, #94a3b8)" }}>
              Loading company holidays...
            </div>
          ) : holidays.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px", background: "var(--ui-surface, #fff)", borderRadius: "16px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
              No holidays configured for {selectedYear}.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
              {holidays.map((h) => {
                const hDate = new Date(h.holiday_date);
                const dayName = hDate.toLocaleDateString(undefined, { weekday: "long" });
                const monthName = hDate.toLocaleDateString(undefined, { month: "short" });
                const dayNum = hDate.getDate();

                return (
                  <div
                    key={h.id}
                    style={{
                      background: "var(--ui-surface, #ffffff)",
                      borderRadius: "14px",
                      padding: "18px",
                      border: "1px solid var(--ui-border, #e2e8f0)",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                      display: "flex",
                      gap: "16px",
                      alignItems: "center",
                      position: "relative"
                    }}
                  >
                    {/* DATE BADGE */}
                    <div style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                      color: "#fff",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0
                    }}>
                      <span style={{ fontSize: "11px", fontWeight: "700", textTransform: "uppercase" }}>{monthName}</span>
                      <span style={{ fontSize: "20px", fontWeight: "900", lineHeight: "1" }}>{dayNum}</span>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>
                        {dayName}
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: "700", color: "var(--text-main, #0f172a)", marginTop: "2px" }}>
                        {h.name}
                      </div>
                      {h.description && (
                        <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", marginTop: "2px" }}>
                          {h.description}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      {hasPermission("update") && (
                        <button
                          onClick={() => handleOpenEdit(h)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--primary-color, #4f46e5)",
                            cursor: "pointer",
                            padding: "6px"
                          }}
                          title="Edit Holiday"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                      )}

                      {hasPermission("delete") && (
                        <button
                          onClick={() => handleDeleteHoliday(h.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#ef4444",
                            cursor: "pointer",
                            padding: "6px"
                          }}
                          title="Delete Holiday"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: TEAM LEAVE & COVERAGE CALENDAR */}
      {activeTab === "team_calendar" && (
        <div>
          {/* MONTH SELECTOR */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", background: "var(--ui-surface, #fff)", padding: "14px 18px", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button
                onClick={() => setSelectedMonth(prev => prev === 1 ? 12 : prev - 1)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", background: "var(--ui-bg, #f8fafc)", cursor: "pointer", fontWeight: "700" }}
              >
                ← Prev
              </button>
              <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>
                {monthNames[selectedMonth - 1]} {selectedYear}
              </h2>
              <button
                onClick={() => setSelectedMonth(prev => prev === 12 ? 1 : prev + 1)}
                style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", background: "var(--ui-bg, #f8fafc)", cursor: "pointer", fontWeight: "700" }}
              >
                Next →
              </button>
            </div>

            <div style={{ display: "flex", gap: "16px", fontSize: "12px", fontWeight: "600" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "12px", height: "12px", borderRadius: "4px", background: "#f59e0b" }} />
                Public Holiday ({teamCalendar.holidays?.length || 0})
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "12px", height: "12px", borderRadius: "4px", background: "#3b82f6" }} />
                Approved Leave ({teamCalendar.leaves?.length || 0})
              </span>
            </div>
          </div>

          {/* TEAM ABSENCE LIST FOR MONTH */}
          {loadingTeam ? (
            <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted, #94a3b8)" }}>
              Loading team coverage...
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Holidays this month */}
              {teamCalendar.holidays?.length > 0 && (
                <div style={{ background: "rgba(245, 158, 11, 0.08)", border: "1px solid rgba(245, 158, 11, 0.3)", borderRadius: "12px", padding: "16px" }}>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#d97706", marginBottom: "8px", textTransform: "uppercase" }}>
                    Company Holidays this Month
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {teamCalendar.holidays.map(h => (
                      <span key={h.id} style={{ background: "var(--ui-surface, #fff)", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(245, 158, 11, 0.3)", fontSize: "13px", fontWeight: "700", color: "#b45309", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                        <IconCalendar size={14} color="#b45309" /> {new Date(h.holiday_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })} — {h.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Leaves this month */}
              <div style={{ background: "var(--ui-surface, #fff)", borderRadius: "14px", border: "1px solid var(--ui-border, #e2e8f0)", padding: "20px" }}>
                <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "700", color: "var(--text-main, #1e293b)" }}>
                  Scheduled Team Leaves ({teamCalendar.leaves?.length || 0})
                </h3>

                {teamCalendar.leaves?.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px", color: "var(--text-muted, #94a3b8)", fontSize: "13px" }}>
                    No team members on leave in {monthNames[selectedMonth - 1]}. Full team available!
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {teamCalendar.leaves.map(l => (
                      <div
                        key={l.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "12px 14px",
                          borderRadius: "10px",
                          background: "var(--ui-bg, #f8fafc)",
                          border: "1px solid var(--ui-border, #e2e8f0)",
                          flexWrap: "wrap",
                          gap: "10px"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{
                            width: "34px",
                            height: "34px",
                            borderRadius: "50%",
                            background: "#6366f1",
                            color: "#fff",
                            fontWeight: "700",
                            fontSize: "13px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}>
                            {l.user_name?.charAt(0) || "U"}
                          </div>
                          <div>
                            <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-main, #1e293b)" }}>
                              {l.user_name}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                              {l.department || "Engineering"} • {l.leave_type} ({l.days} {l.days === 1 ? "day" : "days"})
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: "13px", fontWeight: "700", color: "#3b82f6" }}>
                            {new Date(l.from_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            {l.to_date !== l.from_date && ` → ${new Date(l.to_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
                          </div>
                          {l.reason && (
                            <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", fontStyle: "italic", marginTop: "2px" }}>
                              "{l.reason}"
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ADD / EDIT HOLIDAY MODAL */}
      <FormModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingHoliday(null);
        }}
        title={editingHoliday ? "Edit Company Holiday" : "Add Company Holiday"}
        onSubmit={handleSaveHoliday}
        submitText={editingHoliday ? "Update Holiday" : "Add Holiday"}
        loading={submitting}
      >
        <form onSubmit={handleSaveHoliday} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Holiday Name <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
            </label>
            <input
              type="text"
              required
              value={holidayForm.name}
              onChange={(e) => {
                setHolidayForm({ ...holidayForm, name: e.target.value });
                if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: "" }));
              }}
              placeholder="e.g. Diwali (Festival of Lights)"
              style={{
                width: "100%", padding: "10px 12px",
                border: "1px solid var(--ui-border, #cbd5e1)",
                borderRadius: "6px",
                background: "var(--ui-surface, #fff)",
                color: "var(--text-main, #1e293b)",
                ...(fieldErrors.name ? { borderColor: "#ef4444", background: "#fff5f5" } : {})
              }}
            />
            {fieldErrors.name && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {fieldErrors.name}
              </span>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Holiday Date <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
            </label>
            <input
              type="date"
              required
              value={holidayForm.holiday_date}
              onChange={(e) => {
                setHolidayForm({ ...holidayForm, holiday_date: e.target.value });
                if (fieldErrors.holiday_date) setFieldErrors(prev => ({ ...prev, holiday_date: "" }));
              }}
              style={{
                width: "100%", padding: "10px 12px",
                border: "1px solid var(--ui-border, #cbd5e1)",
                borderRadius: "6px",
                background: "var(--ui-surface, #fff)",
                color: "var(--text-main, #1e293b)",
                ...(fieldErrors.holiday_date ? { borderColor: "#ef4444", background: "#fff5f5" } : {})
              }}
            />
            {fieldErrors.holiday_date && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {fieldErrors.holiday_date}
              </span>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Description / Notes (Optional)
            </label>
            <input
              type="text"
              value={holidayForm.description}
              onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })}
              placeholder="e.g. National holiday, office closed"
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", color: "var(--text-main, #1e293b)", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={holidayForm.is_optional}
              onChange={(e) => setHolidayForm({ ...holidayForm, is_optional: e.target.checked })}
            />
            Optional / Restricted Holiday
          </label>
        </form>
      </FormModal>

      <ConfirmModal
        show={confirmConfig.show}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, show: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        confirmColor={confirmConfig.confirmColor}
      />
    </div>
  );
}
