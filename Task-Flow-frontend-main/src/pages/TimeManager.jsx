import { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { IconAlert } from "../components/common/Icons";
import Pagination from "../components/common/Pagination";
import ConfirmModal from "../components/common/ConfirmModal";
import { useTableSort, SortIndicator } from "../utils/tableSort";

// Clean SVG Icon Components
const ClockIcon = ({ size = 20, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const RefreshIcon = ({ size = 14, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2v6h-6" />
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
    <path d="M3 22v-6h6" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
  </svg>
);

const SearchIcon = ({ size = 15, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ShieldIcon = ({ size = 14, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const AlertTriangleIcon = ({ size = 14, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const AlertCircleIcon = ({ size = 14, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const CheckCircleIcon = ({ size = 14, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const EditIcon = ({ size = 13, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const RotateCcwIcon = ({ size = 13, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </svg>
);

const CloseIcon = ({ size = 16, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const formatRoleName = (role) => {
  if (!role) return "Staff";
  if (role === "role_developer" || role.toLowerCase() === "developer") return "Developer";
  if (role === "role_superadmin" || role.toLowerCase() === "super admin") return "Super Admin";
  if (role === "role_owner" || role.toLowerCase() === "company owner") return "Company Owner";
  if (role === "role_staff" || role.toLowerCase() === "staff") return "Staff";
  return role.replace(/^role_/i, "").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

export default function TimeManager() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [confirmConfig, setConfirmConfig] = useState({
    show: false,
    title: "Confirmation",
    message: "",
    onConfirm: () => {},
    confirmText: "Confirm",
    confirmColor: "var(--primary-color)"
  });

  const askConfirm = (title, message, onConfirm, confirmText = "Confirm", confirmColor = "var(--primary-color)") => {
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

  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    date: "",
    day_name: "",
    schedule: null,
    settings: null,
    summary: {
      total_staff: 0,
      present_count: 0,
      on_time_count: 0,
      late_instance_count: 0,
      direct_half_day_count: 0,
      official_duty_count: 0,
      not_clocked_in_count: 0
    },
    records: []
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Modal State for Time Adjustment
  const [editModal, setEditModal] = useState({
    isOpen: false,
    staffId: null,
    name: "",
    email: "",
    clockIn: "",
    clockOut: "",
    status: "Present",
    workMode: "Office",
    isOfficialDuty: false,
    waiveInstance: false,
    reason: ""
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchData = async (dateToFetch) => {
    setLoading(true);
    try {
      const res = await API.get(`/attendance/manager/daily?date=${dateToFetch || targetDate}`);
      if (res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error("Error loading time manager data:", err);
      showToast(err.response?.data?.error || "Failed to load timing data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(targetDate);
  }, [targetDate]);

  // Open Edit Modal for an employee
  const handleOpenEdit = (rec) => {
    const att = rec.attendance;
    let inTime = "";
    let outTime = "";
    if (att?.clock_in) {
      const d = new Date(att.clock_in);
      inTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    if (att?.clock_out) {
      const d = new Date(att.clock_out);
      outTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }

    setEditModal({
      isOpen: true,
      staffId: rec.staff_id,
      name: rec.name,
      email: rec.email,
      clockIn: inTime,
      clockOut: outTime,
      status: att?.status || "Present",
      workMode: att?.work_mode || "Office",
      isOfficialDuty: att?.is_official_duty === 1,
      waiveInstance: att?.waived_instance === 1,
      reason: att?.adjustment_reason || ""
    });
  };

  // Submit Edit Time Adjustment
  const handleSaveAdjustment = async (e) => {
    e.preventDefault();
    if (!editModal.reason || !editModal.reason.trim()) {
      showToast("Adjustment reason / approval note is required", "error");
      return;
    }
    setSavingEdit(true);
    try {
      await API.post("/attendance/manager/adjust-time", {
        userId: editModal.staffId,
        userName: editModal.name,
        userEmail: editModal.email,
        date: targetDate,
        clock_in: editModal.clockIn || null,
        clock_out: editModal.clockOut || null,
        status: editModal.status,
        work_mode: editModal.workMode,
        is_official_duty: editModal.isOfficialDuty,
        waived_instance: editModal.waiveInstance,
        adjustment_reason: editModal.reason
      });
      showToast("Timing & instance successfully updated!", "success");
      setEditModal(prev => ({ ...prev, isOpen: false }));
      fetchData(targetDate);
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update timing", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  // 1-Click Quick Waive Late Instance
  const handleQuickWaive = (attendanceId, staffName) => {
    askConfirm(
      "Waive Late Instance",
      `Waive late instance for ${staffName}? This will restore 1 monthly late instance and revert any Half Day penalty.`,
      async () => {
        try {
          await API.post("/attendance/manager/waive-instance", {
            attendanceId,
            reason: "Waived by Admin with Sir's approval"
          });
          showToast(`Late instance waived for ${staffName}!`, "success");
          fetchData(targetDate);
        } catch (err) {
          showToast(err.response?.data?.error || "Failed to waive instance", "error");
        }
      },
      "Waive Penalty",
      "var(--primary-color)"
    );
  };

  // 1-Click Quick Toggle Official Duty
  const handleToggleOfficialDuty = async (attendanceId, currentOD, staffName) => {
    const nextOD = !currentOD;
    try {
      await API.post("/attendance/manager/official-duty", {
        attendanceId,
        isOfficialDuty: nextOD,
        reason: nextOD ? "Marked as Official Duty (Company Work)" : "Official Duty removed"
      });
      showToast(nextOD ? `Marked ${staffName} as Official Duty (Late penalties waived)!` : `Removed Official Duty for ${staffName}.`, "success");
      fetchData(targetDate);
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update Official Duty", "error");
    }
  };

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, targetDate]);

  // Filtering records (activates only when 3 or more chars typed)
  const trimmedSearch = searchQuery.trim().toLowerCase();
  const isSearchActive = trimmedSearch.length >= 3;

  const filteredRecords = (data.records || []).filter(rec => {
    if (isSearchActive) {
      const matchesSearch =
        rec.name.toLowerCase().includes(trimmedSearch) ||
        rec.email.toLowerCase().includes(trimmedSearch) ||
        (rec.department && rec.department.toLowerCase().includes(trimmedSearch));

      if (!matchesSearch) return false;
    }

    if (statusFilter === "ALL") return true;
    if (statusFilter === "ON_TIME") return rec.timing_status === "On Time";
    if (statusFilter === "LATE_INSTANCE") return rec.timing_status === "Late Instance";
    if (statusFilter === "DIRECT_HALF_DAY") return rec.timing_status === "Direct Half Day";
    if (statusFilter === "OFFICIAL_DUTY") return rec.timing_status === "Official Duty";
    if (statusFilter === "NOT_CLOCKED_IN") return rec.timing_status === "Not Clocked In";
    return true;
  });

  const { sortedData: sortedRecords, sortConfig: tmSortConfig, requestSort: requestTmSort } = useTableSort(filteredRecords, "name", "asc");
  const paginatedRecords = sortedRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div style={{ padding: "24px", maxWidth: "1600px", margin: "0 auto" }}>
      {/* ── HEADER ── */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "16px",
        marginBottom: "24px"
      }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-main, #0f172a)", margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "var(--primary-color, #4f46e5)", display: "inline-flex" }}>
              <ClockIcon size={26} color="var(--primary-color, #4f46e5)" />
            </span>
            Time &amp; Instance Control Hub
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "var(--text-muted, #64748b)" }}>
            Centralized management for employee clock-in/out times, official duty approvals, and monthly late instances.
          </p>
        </div>

        {/* Date Selector & Refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--ui-surface, #ffffff)",
            border: "1.5px solid var(--ui-border, #e2e8f0)",
            padding: "8px 14px",
            borderRadius: "12px",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)"
          }}>
            <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-muted, #64748b)" }}>Date:</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              style={{
                border: "none",
                outline: "none",
                fontWeight: "700",
                fontSize: "14px",
                color: "var(--text-main, #0f172a)",
                background: "transparent",
                cursor: "pointer"
              }}
            />
            {targetDate !== new Date().toISOString().slice(0, 10) && (
              <button
                type="button"
                onClick={() => setTargetDate(new Date().toISOString().slice(0, 10))}
                style={{
                  background: "var(--ui-bg, #f1f5f9)",
                  border: "none",
                  borderRadius: "6px",
                  padding: "4px 8px",
                  fontSize: "11px",
                  fontWeight: "700",
                  color: "var(--primary-color, #4f46e5)",
                  cursor: "pointer"
                }}
              >
                Today
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => fetchData(targetDate)}
            disabled={loading}
            style={{
              padding: "10px 18px",
              background: "var(--primary-color, #4f46e5)",
              color: "#ffffff",
              border: "none",
              borderRadius: "12px",
              fontWeight: "700",
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <RefreshIcon size={14} color="#ffffff" />
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── METRICS SUMMARY CARDS ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "14px",
        marginBottom: "24px"
      }}>
        {/* Total Scheduled */}
        <div style={{
          background: "var(--ui-surface, #ffffff)",
          border: "1px solid var(--ui-border, #e2e8f0)",
          borderRadius: "14px",
          padding: "16px 20px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.02)"
        }}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Total Staff
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "var(--text-main, #0f172a)", marginTop: "4px" }}>
            {data.summary?.total_staff || 0}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)", marginTop: "4px" }}>
            Scheduled Shift: {data.schedule?.clock_in_time || "10:00"} – {data.schedule?.clock_out_time || "19:00"}
          </div>
        </div>

        {/* On Time / Present */}
        <div style={{
          background: "var(--ui-surface, #ffffff)",
          border: "1px solid var(--ui-border, #e2e8f0)",
          borderRadius: "14px",
          padding: "16px 20px",
          borderLeft: "4px solid #10b981"
        }}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "#10b981", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            On-Time Present
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#10b981", marginTop: "4px" }}>
            {data.summary?.on_time_count || 0}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "4px" }}>
            Within {data.settings?.late_grace_minutes || 30}m grace period
          </div>
        </div>

        {/* Late Instances Used */}
        <div style={{
          background: "var(--ui-surface, #ffffff)",
          border: "1px solid var(--ui-border, #e2e8f0)",
          borderRadius: "14px",
          padding: "16px 20px",
          borderLeft: "4px solid #f59e0b"
        }}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "#f59e0b", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Late Instances Today
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#f59e0b", marginTop: "4px" }}>
            {data.summary?.late_instance_count || 0}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "4px" }}>
            Monthly limit: {data.settings?.monthly_late_instances || 3} allowed
          </div>
        </div>

        {/* Direct Half Days */}
        <div style={{
          background: "var(--ui-surface, #ffffff)",
          border: "1px solid var(--ui-border, #e2e8f0)",
          borderRadius: "14px",
          padding: "16px 20px",
          borderLeft: "4px solid #ef4444"
        }}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Direct Half Days
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#ef4444", marginTop: "4px" }}>
            {data.summary?.direct_half_day_count || 0}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "4px" }}>
            Arrival &gt; {data.settings?.half_day_late_minutes || 120}m late cutoff
          </div>
        </div>

        {/* Official Duty / Exempted */}
        <div style={{
          background: "var(--ui-surface, #ffffff)",
          border: "1px solid var(--ui-border, #e2e8f0)",
          borderRadius: "14px",
          padding: "16px 20px",
          borderLeft: "4px solid #3b82f6"
        }}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Official Duty (OD)
          </div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#3b82f6", marginTop: "4px" }}>
            {data.summary?.official_duty_count || 0}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "4px" }}>
            Approved company business
          </div>
        </div>
      </div>

      {/* ── FILTER & SEARCH BAR ── */}
      <div style={{
        background: "var(--ui-surface, #ffffff)",
        border: "1px solid var(--ui-border, #e2e8f0)",
        borderRadius: "14px",
        padding: "14px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "14px",
        marginBottom: "18px"
      }}>
        <div style={{ flex: 1, minWidth: "260px", position: "relative" }}>
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted, #94a3b8)", display: "flex", alignItems: "center" }}>
            <SearchIcon size={15} color="var(--text-muted, #94a3b8)" />
          </span>
          <input
            type="text"
            placeholder="Search staff by name, email or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 14px 10px 36px",
              borderRadius: "10px",
              border: "1.5px solid var(--ui-border, #cbd5e1)",
              fontSize: "13px",
              background: "var(--ui-bg, #f8fafc)",
              color: "var(--text-main, #0f172a)",
              outline: "none",
              boxSizing: "border-box"
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted, #64748b)" }}>Filter:</span>
          {[
            { id: "ALL", label: "All Staff" },
            { id: "ON_TIME", label: "On Time" },
            { id: "LATE_INSTANCE", label: "Late Instances" },
            { id: "DIRECT_HALF_DAY", label: "Direct Half Day" },
            { id: "OFFICIAL_DUTY", label: "Official Duty" },
            { id: "NOT_CLOCKED_IN", label: "Not Clocked In" }
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer",
                border: statusFilter === f.id ? "1.5px solid var(--primary-color, #4f46e5)" : "1px solid var(--ui-border, #cbd5e1)",
                background: statusFilter === f.id ? "rgba(79, 70, 229, 0.1)" : "var(--ui-bg, #f8fafc)",
                color: statusFilter === f.id ? "var(--primary-color, #4f46e5)" : "var(--text-muted, #64748b)"
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── STAFF TIMING & INSTANCE TABLE ── */}
      <div style={{
        background: "var(--ui-surface, #ffffff)",
        border: "1px solid var(--ui-border, #e2e8f0)",
        borderRadius: "16px",
        overflow: "hidden",
        boxShadow: "0 4px 14px rgba(0,0,0,0.03)"
      }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1.5px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)", fontSize: "11px", fontWeight: "800", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                <th onClick={() => requestTmSort("name")} style={{ padding: "14px 18px", minWidth: "210px", cursor: "pointer", userSelect: "none" }}>
                  Employee <SortIndicator sortKey="name" currentKey={tmSortConfig.key} direction={tmSortConfig.direction} />
                </th>
                <th onClick={() => requestTmSort("shift.clock_in_time")} style={{ padding: "14px 14px", cursor: "pointer", userSelect: "none" }}>
                  Shift Timing <SortIndicator sortKey="shift.clock_in_time" currentKey={tmSortConfig.key} direction={tmSortConfig.direction} />
                </th>
                <th onClick={() => requestTmSort("attendance.clock_in")} style={{ padding: "14px 14px", cursor: "pointer", userSelect: "none" }}>
                  Actual In / Out <SortIndicator sortKey="attendance.clock_in" currentKey={tmSortConfig.key} direction={tmSortConfig.direction} />
                </th>
                <th onClick={() => requestTmSort("attendance.total_hours")} style={{ padding: "14px 14px", cursor: "pointer", userSelect: "none" }}>
                  Worked &amp; Breaks <SortIndicator sortKey="attendance.total_hours" currentKey={tmSortConfig.key} direction={tmSortConfig.direction} />
                </th>
                <th onClick={() => requestTmSort("timing_status")} style={{ padding: "14px 14px", cursor: "pointer", userSelect: "none" }}>
                  Timing Status <SortIndicator sortKey="timing_status" currentKey={tmSortConfig.key} direction={tmSortConfig.direction} />
                </th>
                <th style={{ padding: "14px 14px" }}>Monthly Instance Ledger</th>
                <th style={{ padding: "14px 18px", textAlign: "right" }}>Management Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.length > 0 ? (
                paginatedRecords.map((rec) => {
                  const att = rec.attendance;
                  const inst = rec.monthly_instances;

                  // Format clock in / out
                  const clockInDisplay = att?.clock_in
                    ? new Date(att.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : "—";
                  const clockOutDisplay = att?.clock_out
                    ? new Date(att.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : "Active";

                  return (
                    <tr
                      key={rec.staff_id}
                      style={{
                        borderBottom: "1px solid var(--ui-border, #f1f5f9)",
                        transition: "all 0.15s ease"
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--ui-bg, #f8fafc)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      {/* Employee Column */}
                      <td style={{ padding: "16px 18px", minWidth: "210px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{
                            width: "38px",
                            height: "38px",
                            borderRadius: "50%",
                            background: "linear-gradient(135deg, #4f46e5, #06b6d4)",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: "800",
                            fontSize: "14px",
                            boxShadow: "0 2px 6px rgba(79, 70, 229, 0.25)",
                            flexShrink: 0
                          }}>
                            {rec.name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            <div style={{ fontWeight: "700", fontSize: "13.5px", color: "var(--text-main, #0f172a)", letterSpacing: "-0.2px", whiteSpace: "nowrap" }}>
                              {rec.name}
                            </div>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "1px 7px",
                                borderRadius: "6px",
                                fontSize: "10.5px",
                                fontWeight: "700",
                                background: "rgba(79, 70, 229, 0.08)",
                                color: "#4f46e5",
                                textTransform: "uppercase",
                                letterSpacing: "0.3px",
                                whiteSpace: "nowrap"
                              }}>
                                {formatRoleName(rec.role)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Shift Timing Column */}
                      <td style={{ padding: "16px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <div style={{ fontWeight: "700", color: "var(--text-main, #1e293b)", display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px" }}>
                            <ClockIcon size={13} color="#64748b" />
                            <span>{data.schedule?.clock_in_time || "09:30"} – {data.schedule?.clock_out_time || "18:30"}</span>
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)", paddingLeft: "19px" }}>
                            Standard 9 hrs shift
                          </div>
                        </div>
                      </td>

                      {/* Actual In / Out Column */}
                      <td style={{ padding: "16px 14px" }}>
                        {att?.clock_in ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "1px 6px",
                                borderRadius: "4px",
                                background: "rgba(16, 185, 129, 0.12)",
                                color: "#059669",
                                fontSize: "10px",
                                fontWeight: "800"
                              }}>
                                IN
                              </span>
                              <span style={{ fontWeight: "700", fontSize: "12.5px", color: "var(--text-main, #0f172a)" }}>
                                {clockInDisplay}
                              </span>
                              {att?.clock_out && (
                                <>
                                  <span style={{ color: "#cbd5e1", fontSize: "11px" }}>→</span>
                                  <span style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    background: "rgba(239, 68, 68, 0.12)",
                                    color: "#dc2626",
                                    fontSize: "10px",
                                    fontWeight: "800"
                                  }}>
                                    OUT
                                  </span>
                                  <span style={{ fontWeight: "700", fontSize: "12.5px", color: "var(--text-main, #0f172a)" }}>
                                    {clockOutDisplay}
                                  </span>
                                </>
                              )}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                              Mode: <span style={{ fontWeight: "600", color: "var(--text-main, #334155)" }}>{att.work_mode || "Office"}</span>
                            </div>
                          </div>
                        ) : (
                          <div style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 10px",
                            borderRadius: "8px",
                            background: "#f8fafc",
                            border: "1px dashed #cbd5e1",
                            color: "#64748b",
                            fontSize: "11.5px",
                            fontWeight: "500",
                            whiteSpace: "nowrap"
                          }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#94a3b8" }}></span>
                            Not Clocked In
                          </div>
                        )}
                      </td>

                      {/* Worked & Breaks Column */}
                      <td style={{ padding: "16px 14px" }}>
                        {att?.clock_in ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ fontWeight: "700", color: "var(--text-main, #0f172a)", fontSize: "12.5px" }}>
                              {att.total_hours ? `${att.total_hours} hrs` : "In Progress"}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                              Break: {rec.break_minutes ? `${rec.break_minutes} mins` : "0 mins"}
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontWeight: "600", color: "#94a3b8", fontSize: "12px" }}>0h 00m</span>
                            <span style={{ fontSize: "11px", color: "#cbd5e1" }}>Break: 0 mins</span>
                          </div>
                        )}
                      </td>

                      {/* Timing Status Pill Column */}
                      <td style={{ padding: "16px 14px" }}>
                        {rec.timing_status === "Official Duty" && (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "4px 10px",
                            borderRadius: "14px",
                            fontSize: "11px",
                            fontWeight: "800",
                            background: "rgba(59, 130, 246, 0.12)",
                            color: "#2563eb",
                            border: "1px solid rgba(59, 130, 246, 0.3)",
                            whiteSpace: "nowrap"
                          }}>
                            <ShieldIcon size={12} color="#2563eb" /> Official Duty (Exempt)
                          </span>
                        )}

                        {rec.timing_status === "Direct Half Day" && (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "4px 10px",
                            borderRadius: "14px",
                            fontSize: "11px",
                            fontWeight: "800",
                            background: "rgba(239, 68, 68, 0.12)",
                            color: "#dc2626",
                            border: "1px solid rgba(239, 68, 68, 0.3)",
                            whiteSpace: "nowrap"
                          }}>
                            <AlertCircleIcon size={12} color="#dc2626" /> Direct Half Day ({att.late_minutes}m Late)
                          </span>
                        )}

                        {rec.timing_status === "Late Instance" && (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "4px 10px",
                            borderRadius: "14px",
                            fontSize: "11px",
                            fontWeight: "800",
                            background: "rgba(245, 158, 11, 0.12)",
                            color: "#d97706",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                            whiteSpace: "nowrap"
                          }}>
                            <AlertTriangleIcon size={12} color="#d97706" /> Late Instance ({att.late_minutes}m Late)
                          </span>
                        )}

                        {rec.timing_status === "On Time" && (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "4px 10px",
                            borderRadius: "14px",
                            fontSize: "11px",
                            fontWeight: "800",
                            background: "rgba(16, 185, 129, 0.12)",
                            color: "#059669",
                            border: "1px solid rgba(16, 185, 129, 0.3)",
                            whiteSpace: "nowrap"
                          }}>
                            <CheckCircleIcon size={12} color="#059669" /> On Time
                          </span>
                        )}

                        {rec.timing_status === "Not Clocked In" && (
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 11px",
                            borderRadius: "14px",
                            fontSize: "11px",
                            fontWeight: "700",
                            background: "var(--ui-bg, #f1f5f9)",
                            color: "var(--text-muted, #64748b)",
                            border: "1px solid var(--ui-border, #e2e8f0)",
                            whiteSpace: "nowrap"
                          }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#94a3b8" }}></span>
                            Not Clocked In
                          </span>
                        )}

                        {att?.waived_instance === 1 && (
                          <div style={{ fontSize: "10px", fontWeight: "700", color: "#10b981", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap" }}>
                            <RotateCcwIcon size={11} color="#10b981" /> Instance Waived by Admin
                          </div>
                        )}
                        {att?.adjustment_reason && (
                          <div style={{ fontSize: "10px", color: "var(--text-muted, #64748b)", marginTop: "3px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={att.adjustment_reason}>
                            Note: {att.adjustment_reason}
                          </div>
                        )}
                      </td>

                      {/* Monthly Instance Ledger Column */}
                      <td style={{ padding: "16px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <span style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              padding: "3px 9px",
                              borderRadius: "8px",
                              fontSize: "11.5px",
                              fontWeight: "800",
                              background: inst.used >= inst.limit ? "rgba(239, 68, 68, 0.1)" : inst.used > 0 ? "rgba(245, 158, 11, 0.1)" : "rgba(16, 185, 129, 0.08)",
                              color: inst.used >= inst.limit ? "#dc2626" : inst.used > 0 ? "#d97706" : "#059669",
                              border: `1px solid ${inst.used >= inst.limit ? "rgba(239, 68, 68, 0.25)" : inst.used > 0 ? "rgba(245, 158, 11, 0.25)" : "rgba(16, 185, 129, 0.2)"}`,
                              whiteSpace: "nowrap"
                            }}>
                              <span style={{
                                width: "6px",
                                height: "6px",
                                borderRadius: "50%",
                                background: inst.used >= inst.limit ? "#dc2626" : inst.used > 0 ? "#d97706" : "#10b981"
                              }}></span>
                              {inst.used} / {inst.limit} Used
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: "600", color: "var(--text-muted, #64748b)", whiteSpace: "nowrap" }}>
                              ({inst.remaining} left)
                            </span>
                          </div>
                          {inst.half_days_deducted > 0 && (
                            <div style={{ fontSize: "10.5px", fontWeight: "700", color: "#ef4444", marginTop: "2px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                              <IconAlert size={12} color="#ef4444" /> {inst.half_days_deducted} Half Day(s) deducted
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Management Action Buttons */}
                      <td style={{ padding: "16px 18px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px", alignItems: "center", justifyContent: "flex-end" }}>
                          {/* 1-Click Waive Button if late instance present */}
                          {att && att.is_late_instance === 1 && att.waived_instance !== 1 && (
                            <button
                              type="button"
                              onClick={() => handleQuickWaive(att.id, rec.name)}
                              style={{
                                background: "#fef3c7",
                                color: "#b45309",
                                border: "1px solid #fde68a",
                                padding: "6px 10px",
                                borderRadius: "8px",
                                fontSize: "11px",
                                fontWeight: "700",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                transition: "all 0.15s ease",
                                whiteSpace: "nowrap"
                              }}
                              title="Waive late instance & restore monthly balance"
                            >
                              <RotateCcwIcon size={12} color="#b45309" />
                              Waive
                            </button>
                          )}

                          {/* 1-Click Official Duty Button */}
                          {att && (
                            <button
                              type="button"
                              onClick={() => handleToggleOfficialDuty(att.id, att.is_official_duty === 1, rec.name)}
                              style={{
                                background: att.is_official_duty === 1 ? "rgba(59, 130, 246, 0.15)" : "var(--ui-bg, #f1f5f9)",
                                color: att.is_official_duty === 1 ? "#2563eb" : "var(--text-main, #334155)",
                                border: "1px solid var(--ui-border, #cbd5e1)",
                                padding: "6px 10px",
                                borderRadius: "8px",
                                fontSize: "11px",
                                fontWeight: "700",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                transition: "all 0.15s ease",
                                whiteSpace: "nowrap"
                              }}
                              title={att.is_official_duty === 1 ? "Remove Official Duty status" : "Mark as Official Duty (Company Work)"}
                            >
                              <ShieldIcon size={12} color={att.is_official_duty === 1 ? "#2563eb" : "var(--text-main, #334155)"} />
                              {att.is_official_duty === 1 ? "OD Active" : "OD"}
                            </button>
                          )}

                          {/* Edit Time & Details */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(rec)}
                            style={{
                              background: "var(--primary-color, #4f46e5)",
                              color: "#fff",
                              border: "none",
                              padding: "7px 12px",
                              borderRadius: "8px",
                              fontSize: "11.5px",
                              fontWeight: "700",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              boxShadow: "0 2px 6px rgba(79, 70, 229, 0.25)",
                              transition: "all 0.15s ease",
                              whiteSpace: "nowrap"
                            }}
                          >
                            <EditIcon size={12} color="#ffffff" />
                            Edit Time
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: "center", padding: "50px 20px" }}>
                    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
                        <ClockIcon size={22} color="#94a3b8" />
                      </div>
                      <div style={{ fontWeight: "700", fontSize: "14px", color: "var(--text-main, #1e293b)" }}>
                        No staff records found
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)" }}>
                        No employee records match the active search filter.
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={currentPage}
            totalRecords={filteredRecords.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
          />
        </div>
      </div>

      {/* ── MODAL: EDIT TIME & INSTANCES ── */}
      {editModal.isOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000,
          padding: "16px"
        }}>
          <div style={{
            background: "var(--ui-surface, #ffffff)",
            border: "1px solid var(--ui-border, #e2e8f0)",
            borderRadius: "16px",
            width: "100%",
            maxWidth: "520px",
            padding: "24px",
            boxShadow: "0 25px 50px rgba(0,0,0,0.25)"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "var(--text-main, #0f172a)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <EditIcon size={18} color="var(--primary-color, #4f46e5)" />
                  Adjust Timing &amp; Instance
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                  Employee: <strong style={{ color: "var(--primary-color, #4f46e5)" }}>{editModal.name}</strong> • Date: <strong>{targetDate}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: "4px",
                  color: "var(--text-muted, #94a3b8)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <CloseIcon size={18} color="var(--text-muted, #94a3b8)" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment}>
              {/* Clock In & Clock Out Inputs */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #334155)", marginBottom: "5px" }}>
                    Clock In Time
                  </label>
                  <input
                    type="time"
                    value={editModal.clockIn}
                    onChange={(e) => setEditModal({ ...editModal, clockIn: e.target.value })}
                    className="form-control"
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1.5px solid var(--ui-border, #cbd5e1)",
                      fontWeight: "700",
                      background: "var(--ui-bg, #f8fafc)",
                      boxSizing: "border-box"
                    }}
                  />
                  <span style={{ fontSize: "10px", color: "var(--text-muted, #94a3b8)", marginTop: "2px", display: "block" }}>
                    e.g. Set 10:00 AM if approved
                  </span>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #334155)", marginBottom: "5px" }}>
                    Clock Out Time
                  </label>
                  <input
                    type="time"
                    value={editModal.clockOut}
                    onChange={(e) => setEditModal({ ...editModal, clockOut: e.target.value })}
                    className="form-control"
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1.5px solid var(--ui-border, #cbd5e1)",
                      fontWeight: "700",
                      background: "var(--ui-bg, #f8fafc)",
                      boxSizing: "border-box"
                    }}
                  />
                  <span style={{ fontSize: "10px", color: "var(--text-muted, #94a3b8)", marginTop: "2px", display: "block" }}>
                    e.g. 19:00 PM
                  </span>
                </div>
              </div>

              {/* Status & Work Mode */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #334155)", marginBottom: "5px" }}>
                    Attendance Status
                  </label>
                  <select
                    value={editModal.status}
                    onChange={(e) => setEditModal({ ...editModal, status: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1.5px solid var(--ui-border, #cbd5e1)",
                      fontWeight: "700",
                      background: "var(--ui-bg, #f8fafc)",
                      boxSizing: "border-box"
                    }}
                  >
                    <option value="Present">Present (Full Day)</option>
                    <option value="Half Day">Half Day</option>
                    <option value="Absent">Absent</option>
                    <option value="On Leave">On Leave</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #334155)", marginBottom: "5px" }}>
                    Work Mode
                  </label>
                  <select
                    value={editModal.workMode}
                    onChange={(e) => setEditModal({ ...editModal, workMode: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1.5px solid var(--ui-border, #cbd5e1)",
                      fontWeight: "700",
                      background: "var(--ui-bg, #f8fafc)",
                      boxSizing: "border-box"
                    }}
                  >
                    <option value="Office">Office</option>
                    <option value="Work From Home">Work From Home</option>
                    <option value="On-site (Official Duty)">On-site (Official Duty)</option>
                    <option value="On-site (Client)">On-site (Client)</option>
                  </select>
                </div>
              </div>

              {/* Official Duty & Waive Checkboxes */}
              <div style={{
                background: "var(--ui-bg, #f8fafc)",
                border: "1px solid var(--ui-border, #e2e8f0)",
                borderRadius: "10px",
                padding: "12px 14px",
                marginBottom: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "700", color: "var(--text-main, #0f172a)" }}>
                  <input
                    type="checkbox"
                    checked={editModal.isOfficialDuty}
                    onChange={(e) => setEditModal({ ...editModal, isOfficialDuty: e.target.checked })}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <ShieldIcon size={14} color="#2563eb" />
                    Official Duty (Exempt from late penalties &amp; half day)
                  </span>
                </label>

                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "700", color: "var(--text-main, #0f172a)" }}>
                  <input
                    type="checkbox"
                    checked={editModal.waiveInstance}
                    onChange={(e) => setEditModal({ ...editModal, waiveInstance: e.target.checked })}
                    style={{ width: "16px", height: "16px", cursor: "pointer" }}
                  />
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <RotateCcwIcon size={13} color="#10b981" />
                    Waive Late Instance (Restore employee's monthly instance count)
                  </span>
                </label>
              </div>

              {/* Reason / Audit Note */}
              <div style={{ marginBottom: "20px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #334155)", marginBottom: "5px" }}>
                  Adjustment Reason / Sir's Approval Note <span style={{ color: "red" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Employee went for client meeting with Sir's approval"
                  value={editModal.reason}
                  onChange={(e) => setEditModal({ ...editModal, reason: e.target.value })}
                  required
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1.5px solid var(--ui-border, #cbd5e1)",
                    fontSize: "13px",
                    boxSizing: "border-box"
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
                  style={{
                    padding: "9px 18px",
                    background: "var(--ui-bg, #f1f5f9)",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "8px",
                    fontWeight: "700",
                    color: "var(--text-main, #334155)",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingEdit}
                  style={{
                    padding: "9px 22px",
                    background: "var(--primary-color, #4f46e5)",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    fontWeight: "700",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(79, 70, 229, 0.25)"
                  }}
                >
                  {savingEdit ? "Saving..." : "Save Adjustments"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
