import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import PageHeader from "../components/common/PageHeader";
import DataTable from "../components/common/DataTable";
import Pagination from "../components/common/Pagination";
import FormModal from "../components/common/FormModal";
import ConfirmModal from "../components/common/ConfirmModal";
import { SelectField, TextInput } from "../components/common/FormFields";
import { CoffeeIcon, ClockIcon, PlayIcon, StopIcon, TrashIcon, EditIcon, CheckIcon, ZapIcon } from "../components/common/Icons";
import "../style/main.css";
import "../style/table.css";

export default function BreakManagement() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isCompanyOwner = user?.role?.name === "Company Owner";
  const isAdminOrOwner = isSuperAdmin || isCompanyOwner || user?.role?.name?.toLowerCase().includes("admin");

  const [confirmConfig, setConfirmConfig] = useState({
    show: false,
    title: "Confirmation",
    message: "",
    onConfirm: () => {},
    confirmText: "Confirm",
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

  // Active view tab for Admin
  const [activeTab, setActiveTab] = useState("mybreaks"); // "mybreaks" | "monitoring" | "configure"

  // Employee My Breaks Date Filter
  const [myBreakDate, setMyBreakDate] = useState(new Date().toISOString().slice(0, 10));
  const [myBreaksPage, setMyBreaksPage] = useState(1);
  const myBreaksPageSize = 10;

  // Break Status State
  const [breakStatus, setBreakStatus] = useState({
    isOnBreak: false,
    activeBreak: null,
    todayBreaks: [],
    todayCompletedBreaks: [],
    totalBreakMinutes: 0
  });

  // Configured Break Types (e.g. Tea Break 15m, Lunch Break 45m)
  const [breakTypes, setBreakTypes] = useState([]);
  const [allBreaks, setAllBreaks] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters (Admin Monitoring)
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterUser, setFilterUser] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Employee Break Selection Modal
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedBreakType, setSelectedBreakType] = useState("");

  // Admin Edit Break Record Modal
  const [showEditBreakModal, setShowEditBreakModal] = useState(false);
  const [editingBreak, setEditingBreak] = useState(null);
  const [editBreakForm, setEditBreakForm] = useState({
    reason: "",
    duration_minutes: 0,
    status: "Completed",
    start_time: "",
    end_time: "",
  });

  // Admin Configure Break Type Modal
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editTypeId, setEditTypeId] = useState(null);
  const [typeFieldErrors, setTypeFieldErrors] = useState({});
  const [typeForm, setTypeForm] = useState({
    name: "",
    duration_minutes: 15,
    window_start: "10:00",
    window_end: "11:00",
  });

  // Live Timer for active break
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Helper: Convert "13:00" to "01:00 PM"
  const format12Hour = (timeStr) => {
    if (!timeStr || typeof timeStr !== "string" || !timeStr.includes(":")) return timeStr || "Anytime";
    const parts = timeStr.split(":");
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1] || "00";
    if (isNaN(hours)) return timeStr;
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 hour is 12 AM
    const formattedHours = hours < 10 ? `0${hours}` : hours;
    return `${formattedHours}:${minutes} ${ampm}`;
  };

  // Helper: Calculate End Time given startTime ("HH:mm") and duration in minutes
  const calculateEndTime = (startTime, durationMins) => {
    if (!startTime || !startTime.includes(":")) return "11:00";
    const [h, m] = startTime.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) return startTime;
    const totalMins = h * 60 + m + (parseInt(durationMins, 10) || 0);
    const endH = Math.floor(totalMins / 60) % 24;
    const endM = totalMins % 60;
    return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  };
  // Helper: Check if current time is within break type window
  const isWithinWindow = (windowStart, windowEnd) => {
    if (!windowStart || !windowEnd) return true;
    const nowIST = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Kolkata", hour12: false });
    const currentHHMM = nowIST.slice(0, 5);
    return currentHHMM >= windowStart && currentHHMM <= windowEnd;
  };

  // Handlers for dynamic auto-calculation in break policy modal
  const handleDurationChange = (val) => {
    const mins = parseInt(val, 10) || 0;
    const newEnd = calculateEndTime(typeForm.window_start || "10:00", mins);
    setTypeForm((prev) => ({
      ...prev,
      duration_minutes: val,
      window_end: newEnd,
    }));
  };

  const handleStartTimeChange = (val) => {
    const newEnd = calculateEndTime(val, typeForm.duration_minutes || 15);
    setTypeForm((prev) => ({
      ...prev,
      window_start: val,
      window_end: newEnd,
    }));
  };

  // Fetch current user's break status
  const fetchMyBreakStatus = async (targetDate = myBreakDate) => {
    try {
      const res = await API.get(`/breaks/status?date=${targetDate}`);
      setBreakStatus(res.data);
      if (res.data.activeBreak?.start_time) {
        const start = new Date(res.data.activeBreak.start_time).getTime();
        const now = Date.now();
        setElapsedSeconds(Math.max(0, Math.floor((now - start) / 1000)));
      } else {
        setElapsedSeconds(0);
      }
    } catch (err) {
      console.error("Error fetching break status:", err);
    }
  };

  // Fetch Configured Break Types
  const fetchBreakTypes = async () => {
    try {
      const res = await API.get("/breaks/types");
      const list = Array.isArray(res.data) ? res.data : [];
      setBreakTypes(list);
      if (list.length > 0 && !selectedBreakType) {
        setSelectedBreakType(list[0].name);
      }
    } catch (err) {
      console.error("Error fetching break types:", err);
    }
  };

  // Fetch All Breaks (Admin Monitoring)
  const fetchAllBreaks = async () => {
    try {
      setLoading(true);
      let url = "/breaks/all?";
      if (filterDate) url += `date=${filterDate}&`;
      if (filterUser) url += `userId=${filterUser}&`;
      if (filterStatus) url += `status=${filterStatus}&`;

      const res = await API.get(url);
      setAllBreaks(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error loading breaks list:", err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Staff list for dropdown
  const fetchStaff = async () => {
    try {
      const res = await API.get("/staff");
      const list = res.data.staff || res.data;
      setStaffList(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Error loading staff:", err);
    }
  };

  useEffect(() => {
    fetchMyBreakStatus(myBreakDate);
  }, [myBreakDate]);

  useEffect(() => {
    fetchBreakTypes();
    if (isAdminOrOwner) {
      fetchAllBreaks();
      fetchStaff();
    }
  }, [filterDate, filterUser, filterStatus, isAdminOrOwner]);

  // Timer Tick
  useEffect(() => {
    let interval = null;
    if (breakStatus.isOnBreak) {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [breakStatus.isOnBreak]);

  // Employee: Start Specific Break directly from card
  const handleDirectStartBreak = async (typeName) => {
    try {
      setActionLoading(true);
      await API.post("/breaks/start", { reason: typeName });
      showToast(`${typeName} started. Enjoy your break!`);
      setShowStartModal(false);
      fetchMyBreakStatus();
      if (isAdminOrOwner) fetchAllBreaks();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to start break", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Employee: Start Break (Modal fallback)
  const handleStartBreak = async () => {
    if (!selectedBreakType) {
      showToast("Please choose a break type", "error");
      return;
    }
    await handleDirectStartBreak(selectedBreakType);
  };

  // Employee: End Break
  const handleEndBreak = () => {
    askConfirm(
      "End Break Confirmation",
      "Are you sure you want to end your current break and resume work?",
      async () => {
        try {
          setActionLoading(true);
          const res = await API.post("/breaks/end");
          setBreakStatus((prev) => ({
            ...prev,
            isOnBreak: false,
            activeBreak: null,
          }));
          setElapsedSeconds(0);
          showToast(`Break completed! Duration: ${res.data.durationMinutes} minutes`);
          await fetchMyBreakStatus();
          if (isAdminOrOwner) fetchAllBreaks();
        } catch (err) {
          showToast(err.response?.data?.error || "Failed to end break", "error");
        } finally {
          setActionLoading(false);
        }
      },
      "End Break",
      "#dc2626"
    );
  };

  // Admin: Save or Update Break Type
  const handleSaveBreakType = async () => {
    setTypeFieldErrors({});
    try {
      setActionLoading(true);
      if (editTypeId) {
        await API.put(`/breaks/types/${editTypeId}`, typeForm);
        showToast("Break type updated successfully!");
      } else {
        await API.post("/breaks/types", typeForm);
        showToast("New break type configured successfully!");
      }
      setShowTypeModal(false);
      setEditTypeId(null);
      setTypeFieldErrors({});
      setTypeForm({ name: "", duration_minutes: 15, window_start: "10:00", window_end: "11:00" });
      fetchBreakTypes();
    } catch (err) {
      const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || "Failed to save break type";
      if (errMsg.toLowerCase().includes("break name") || errMsg.toLowerCase().includes("name")) {
        setTypeFieldErrors(prev => ({ ...prev, name: "Plese enter break name" }));
      }
      if (errMsg.toLowerCase().includes("duration")) {
        setTypeFieldErrors(prev => ({ ...prev, duration_minutes: "Plese enter duration" }));
      }
      showToast(errMsg, "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Admin: Delete Break Type
  const handleDeleteBreakType = (id) => {
    askConfirm("Delete Break Type", "Are you sure you want to delete this break type?", async () => {
      try {
        await API.delete(`/breaks/types/${id}`);
        showToast("Break type removed.");
        fetchBreakTypes();
      } catch (err) {
        showToast(err.response?.data?.error || "Delete failed", "error");
      }
    });
  };

  // Admin: Force End an Employee's Break
  const handleForceEnd = (id, empName) => {
    askConfirm("Force End Break", `Force end break for ${empName}?`, async () => {
      try {
        await API.put(`/breaks/${id}/force-end`);
        showToast("Break ended by admin.");
        fetchAllBreaks();
        fetchMyBreakStatus();
      } catch (err) {
        showToast(err.response?.data?.error || "Failed to close break", "error");
      }
    }, "End Break", "var(--primary-color)");
  };

  // Helpers for formatting Date/Time inputs
  const extractTimeHM = (dateVal) => {
    if (!dateVal) return "";
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const extractDateYMD = (dateVal) => {
    if (!dateVal) return "";
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // Admin: Open Edit Break Log Modal
  const handleOpenEditBreak = (breakItem) => {
    setEditingBreak(breakItem);
    const dateStr = extractDateYMD(breakItem.date || breakItem.start_time);
    const startStr = extractTimeHM(breakItem.start_time);
    const endStr = extractTimeHM(breakItem.end_time);

    let initialDuration = breakItem.duration_minutes || 0;
    if (!initialDuration && startStr && endStr) {
      const [sh, sm] = startStr.split(":").map(Number);
      const [eh, em] = endStr.split(":").map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      initialDuration = diff;
    }

    setEditBreakForm({
      reason: breakItem.reason || "",
      date: dateStr,
      start_time: startStr,
      end_time: endStr,
      duration_minutes: initialDuration,
      status: breakItem.status || "Completed",
    });
    setShowEditBreakModal(true);
  };

  // Handle Start Time or End Time Change -> Auto-calc Duration
  const handleEditTimeChange = (field, newTime) => {
    setEditBreakForm((prev) => {
      const updated = { ...prev, [field]: newTime };
      if (updated.start_time && updated.end_time) {
        const [sh, sm] = updated.start_time.split(":").map(Number);
        const [eh, em] = updated.end_time.split(":").map(Number);
        let diffMins = (eh * 60 + em) - (sh * 60 + sm);
        if (diffMins < 0) diffMins += 24 * 60;
        updated.duration_minutes = diffMins;
      }
      return updated;
    });
  };

  // Handle Duration Change -> Auto-adjust End Time
  const handleEditDurationChange = (val) => {
    const mins = Math.max(0, parseInt(val, 10) || 0);
    setEditBreakForm((prev) => {
      const updated = { ...prev, duration_minutes: mins };
      if (updated.start_time && mins > 0) {
        const [sh, sm] = updated.start_time.split(":").map(Number);
        const totalMins = sh * 60 + sm + mins;
        const endH = Math.floor(totalMins / 60) % 24;
        const endM = totalMins % 60;
        const pad = (n) => String(n).padStart(2, "0");
        updated.end_time = `${pad(endH)}:${pad(endM)}`;
      }
      return updated;
    });
  };

  // Admin: Save Edited Break Log
  const handleSaveEditBreak = async () => {
    if (!editingBreak) return;
    try {
      setActionLoading(true);
      const targetDate = editBreakForm.date || new Date().toISOString().slice(0, 10);
      const payload = {
        reason: editBreakForm.reason,
        status: editBreakForm.status,
        duration_minutes: editBreakForm.duration_minutes,
        date: targetDate,
        start_time: editBreakForm.start_time ? `${targetDate} ${editBreakForm.start_time}:00` : null,
        end_time: editBreakForm.end_time ? `${targetDate} ${editBreakForm.end_time}:00` : null,
      };

      await API.put(`/breaks/${editingBreak.id}`, payload);
      showToast("Break record updated successfully!");
      setShowEditBreakModal(false);
      setEditingBreak(null);
      fetchAllBreaks();
      fetchMyBreakStatus();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update break record", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // Admin: Delete Break Log
  const handleDeleteBreakLog = (id, empName) => {
    askConfirm("Delete Break Record", `Are you sure you want to delete this break record for ${empName || "this employee"}?`, async () => {
      try {
        setActionLoading(true);
        await API.delete(`/breaks/${id}`);
        showToast("Break record deleted successfully.");
        fetchAllBreaks();
        fetchMyBreakStatus();
      } catch (err) {
        showToast(err.response?.data?.error || "Failed to delete break record", "error");
      } finally {
        setActionLoading(false);
      }
    });
  };

  // Format Elapsed Time
  const formatTimer = (totalSeconds) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs > 0 ? `${hrs}h ` : ""}${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  };

  // Admin Monitoring Table Columns
  const monitoringColumns = [
    {
      header: "Employee",
      key: "user_name",
      render: (_, row) => (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #f59e0b, #ef4444)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "bold",
              fontSize: "13px"
            }}
          >
            {row.user_name ? row.user_name.charAt(0).toUpperCase() : "U"}
          </div>
          <div>
            <div style={{ fontWeight: "600", color: "var(--text-main)" }}>
              {row.user_name || "Employee"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {row.user_email}
            </div>
          </div>
        </div>
      )
    },
    {
      header: "Break Type",
      key: "reason",
      render: (r) => (
        <span style={{ fontWeight: "600", color: "var(--text-main)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
          <CoffeeIcon size={14} color="#f59e0b" /> {r || "Break"}
        </span>
      )
    },
    {
      header: "Date",
      key: "date",
      render: (d) => (d ? new Date(d).toLocaleDateString() : "-")
    },
    {
      header: "Start Time",
      key: "start_time",
      render: (t) => (t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-")
    },
    {
      header: "End Time",
      key: "end_time",
      render: (t, row) => {
        if (!t && row.status === "On Break") {
          return (
            <span style={{ color: "#d97706", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <ClockIcon size={14} color="#d97706" /> In Progress
            </span>
          );
        }
        return t ? new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";
      }
    },
    {
      header: "Duration",
      key: "duration_minutes",
      render: (mins, row) => {
        if (row.status === "On Break") {
          return <span style={{ color: "#d97706", fontWeight: "600" }}>Active</span>;
        }
        return `${mins || 0} mins`;
      }
    },
    {
      header: "Status",
      key: "status",
      render: (s) => (
        <span
          style={{
            padding: "4px 10px",
            borderRadius: "20px",
            fontSize: "12px",
            fontWeight: "700",
            background: s === "On Break" ? "#fef3c7" : "#dcfce7",
            color: s === "On Break" ? "#b45309" : "#15803d"
          }}
        >
          {s}
        </span>
      )
    },
    {
      header: "Actions",
      key: "id",
      render: (id, row) => (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {row.status === "On Break" && (
            <button
              onClick={() => handleForceEnd(id, row.user_name)}
              title="Force End Break"
              style={{
                background: "#fef3c7",
                border: "1px solid #fde68a",
                color: "#b45309",
                borderRadius: "6px",
                padding: "5px 10px",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <StopIcon size={12} color="#b45309" /> End
            </button>
          )}

          {/* Edit Button for Super Admin / Admin */}
          {isAdminOrOwner && (
            <button
              className="action-btn"
              onClick={() => handleOpenEditBreak(row)}
              title="Edit Break Record"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}

          {/* Delete Button for Super Admin / Admin */}
          {isAdminOrOwner && (
            <button
              className="action-btn delete"
              onClick={() => handleDeleteBreakLog(id, row.user_name)}
              title="Delete Break Record"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="page" style={{ padding: "24px" }}>
      <PageHeader
        title="Break Management"
      />

      {/* TOP BREAK STATUS CARD */}
      <div
        style={{
          background: breakStatus.isOnBreak
            ? "rgba(245, 158, 11, 0.1)"
            : "var(--card-bg, #ffffff)",
          border: breakStatus.isOnBreak
            ? "1.5px solid rgba(245, 158, 11, 0.4)"
            : "1px solid var(--border-color, #e5e7eb)",
          borderRadius: "16px",
          padding: "24px",
          marginBottom: "28px",
          boxShadow: breakStatus.isOnBreak
            ? "0 6px 20px rgba(245, 158, 11, 0.15)"
            : "0 6px 20px rgba(0,0,0,0.04)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "20px"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "14px",
              background: breakStatus.isOnBreak ? "#f59e0b" : "#6366f1",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: breakStatus.isOnBreak
                ? "0 4px 14px rgba(245, 158, 11, 0.4)"
                : "0 4px 14px rgba(99, 102, 241, 0.4)"
            }}
          >
            <CoffeeIcon size={24} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: "12px", fontWeight: "700", color: breakStatus.isOnBreak ? "#f59e0b" : "var(--text-muted)", letterSpacing: "0.5px" }}>
              CURRENT BREAK STATUS
            </div>
            <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--text-main)", marginTop: "2px" }}>
              {breakStatus.isOnBreak ? (
                <span style={{ color: "#f59e0b" }}>
                  On Break: {breakStatus.activeBreak?.reason || "Break"}
                </span>
              ) : (
                <span style={{ color: "#10b981", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <CheckIcon size={18} color="#10b981" /> Available & Working
                </span>
              )}
            </div>
            {breakStatus.isOnBreak && (
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                Started at:{" "}
                <strong style={{ color: "var(--text-main)" }}>
                  {new Date(breakStatus.activeBreak.start_time).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* Live Timer or Total Break Counter */}
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          {breakStatus.isOnBreak ? (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#f59e0b", letterSpacing: "0.5px" }}>
                TIME ELAPSED
              </div>
              <div style={{ fontSize: "28px", fontWeight: "900", color: "#f59e0b", fontFamily: "monospace" }}>
                {formatTimer(elapsedSeconds)}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted)" }}>
                Today's Total Breaks
              </div>
              <div style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-main)" }}>
                {breakStatus.totalBreakMinutes} mins
              </div>
            </div>
          )}

          {/* Action Button: Show only End Break when on break */}
          {breakStatus.isOnBreak && (
            <button
              onClick={handleEndBreak}
              disabled={actionLoading}
              style={{
                background: "#dc2626",
                color: "#fff",
                border: "none",
                padding: "12px 24px",
                borderRadius: "10px",
                fontWeight: "700",
                fontSize: "14px",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 4px 14px rgba(220, 38, 38, 0.3)"
              }}
            >
              <StopIcon size={14} color="#fff" /> {actionLoading ? "Ending..." : "End Break"}
            </button>
          )}
        </div>
      </div>

      {/* AVAILABLE BREAK TYPES (LUNCH, TEA, PERSONAL - DIRECT ONE-CLICK START/END) */}
      <div style={{ marginBottom: "32px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)", marginBottom: "14px", display: "flex", alignItems: "center", gap: "8px" }}>
          <CoffeeIcon size={18} color="#6366f1" /> Available Break Options
        </h3>
        {breakTypes.length === 0 ? (
          <div
            style={{
              background: "var(--card-bg, #fff)",
              padding: "20px",
              borderRadius: "12px",
              border: "1px solid var(--border-color, #e5e7eb)",
              color: "var(--text-muted)",
              fontSize: "14px",
              textAlign: "center"
            }}
          >
            No break policies configured by admin yet.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            {breakTypes.map((type) => {
              const isCurrentActiveBreak = breakStatus.isOnBreak && breakStatus.activeBreak?.reason === type.name;

              return (
                <div
                  key={type.id}
                  style={{
                    background: isCurrentActiveBreak ? "rgba(245, 158, 11, 0.1)" : "var(--card-bg, #fff)",
                    borderRadius: "14px",
                    padding: "20px",
                    border: isCurrentActiveBreak ? "2px solid #f59e0b" : "1px solid var(--border-color, #e5e7eb)",
                    boxShadow: isCurrentActiveBreak ? "0 4px 18px rgba(245, 158, 11, 0.2)" : "0 4px 12px rgba(0,0,0,0.03)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          background: isCurrentActiveBreak ? "rgba(245, 158, 11, 0.25)" : "rgba(99, 102, 241, 0.1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center"
                        }}>
                          <CoffeeIcon size={16} color={isCurrentActiveBreak ? "#f59e0b" : "#6366f1"} />
                        </div>
                        {type.name}
                      </h4>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
                        <ClockIcon size={13} color="var(--text-muted)" />
                        Window: <strong style={{ color: "var(--text-main)" }}>{format12Hour(type.window_start)} – {format12Hour(type.window_end)}</strong>
                      </div>
                    </div>
                    <span
                      style={{
                        background: isCurrentActiveBreak ? "rgba(245, 158, 11, 0.2)" : "rgba(99, 102, 241, 0.1)",
                        color: isCurrentActiveBreak ? "#f59e0b" : "#6366f1",
                        padding: "5px 12px",
                        borderRadius: "20px",
                        fontWeight: "700",
                        fontSize: "12px",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {type.duration_minutes} mins
                    </span>
                  </div>

                  {/* Actions for this specific break */}
                  <div style={{ marginTop: "auto", paddingTop: "12px" }}>
                    {isCurrentActiveBreak ? (
                      <button
                        onClick={handleEndBreak}
                        disabled={actionLoading}
                        style={{
                          width: "100%",
                          background: "#dc2626",
                          color: "#fff",
                          border: "none",
                          padding: "10px 16px",
                          borderRadius: "10px",
                          fontWeight: "700",
                          fontSize: "13px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          boxShadow: "0 3px 10px rgba(220, 38, 38, 0.3)"
                        }}
                      >
                        <StopIcon size={14} color="#fff" /> End {type.name}
                      </button>
                    ) : (breakStatus.todayCompletedBreaks || breakStatus.todayBreaks)?.some((b) => b.reason === type.name && b.status !== "On Break") ? (
                      <div
                        style={{
                          width: "100%",
                          background: "#f0fdf4",
                          color: "#16a34a",
                          border: "1px solid #bbf7d0",
                          padding: "10px 16px",
                          borderRadius: "10px",
                          fontWeight: "700",
                          fontSize: "13px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px"
                        }}
                      >
                        <CheckIcon size={15} color="#16a34a" /> Completed for Today
                      </div>
                    ) : breakStatus.isOnBreak ? (
                      <button
                        disabled
                        style={{
                          width: "100%",
                          background: "#f1f5f9",
                          color: "#94a3b8",
                          border: "none",
                          padding: "10px 16px",
                          borderRadius: "10px",
                          fontWeight: "600",
                          fontSize: "13px",
                          cursor: "not-allowed"
                        }}
                      >
                        Another Break Active
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDirectStartBreak(type.name)}
                        disabled={actionLoading}
                        style={{
                          width: "100%",
                          background: "var(--primary, #6366f1)",
                          color: "#fff",
                          border: "none",
                          padding: "10px 16px",
                          borderRadius: "10px",
                          fontWeight: "700",
                          fontSize: "13px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "6px",
                          boxShadow: "0 3px 10px rgba(99, 102, 241, 0.25)"
                        }}
                      >
                        <PlayIcon size={14} color="#fff" /> Start {type.name}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* TABS FOR ADMIN (My Breaks vs Staff Supervision vs Set Break Times) */}
      {isAdminOrOwner && (
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          <button
            onClick={() => setActiveTab("mybreaks")}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
              background: activeTab === "mybreaks" ? "var(--primary, #6366f1)" : "var(--neu-bg, #f3f4f6)",
              color: activeTab === "mybreaks" ? "#fff" : "var(--text-main)",
              transition: "0.2s"
            }}
          >
            My Breaks Today
          </button>
          <button
            onClick={() => setActiveTab("monitoring")}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
              background: activeTab === "monitoring" ? "var(--primary, #6366f1)" : "var(--neu-bg, #f3f4f6)",
              color: activeTab === "monitoring" ? "#fff" : "var(--text-main)",
              transition: "0.2s"
            }}
          >
            Staff Break Monitoring
          </button>
          <button
            onClick={() => setActiveTab("configure")}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
              background: activeTab === "configure" ? "var(--primary, #6366f1)" : "var(--neu-bg, #f3f4f6)",
              color: activeTab === "configure" ? "#fff" : "var(--text-main)",
              transition: "0.2s"
            }}
          >
            Set Break Policies
          </button>
        </div>
      )}

      {/* TAB 1: MY BREAKS ACTIVITY TABLE */}
      {(!isAdminOrOwner || activeTab === "mybreaks") && (
        <div style={{ marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <ClockIcon size={16} color="var(--primary, #6366f1)" /> My Break Activity
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted)" }}>Date:</span>
                <input
                  type="date"
                  value={myBreakDate}
                  onChange={(e) => setMyBreakDate(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-color, #cbd5e1)",
                    fontSize: "13px",
                    background: "var(--card-bg, #fff)",
                    color: "var(--text-main)",
                    cursor: "pointer",
                    outline: "none"
                  }}
                />
                {myBreakDate !== new Date().toISOString().slice(0, 10) && (
                  <button
                    onClick={() => setMyBreakDate(new Date().toISOString().slice(0, 10))}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "none",
                      background: "var(--neu-bg, #f1f5f9)",
                      color: "var(--primary, #6366f1)",
                      fontSize: "12px",
                      fontWeight: "600",
                      cursor: "pointer"
                    }}
                  >
                    Today
                  </button>
                )}
              </div>
              <span style={{ fontSize: "13px", color: "var(--text-muted)", marginLeft: "4px" }}>
                {breakStatus.todayBreaks.length} {breakStatus.todayBreaks.length === 1 ? "break" : "breaks"} logged
              </span>
            </div>
          </div>

          {breakStatus.todayBreaks.length === 0 ? (
            <div
              style={{
                background: "var(--card-bg, #fff)",
                padding: "36px 20px",
                borderRadius: "14px",
                border: "1px dashed var(--border-color, #cbd5e1)",
                color: "var(--text-muted)",
                fontSize: "14px",
                textAlign: "center"
              }}
            >
              No breaks recorded for {myBreakDate === new Date().toISOString().slice(0, 10) ? "today" : myBreakDate}.
            </div>
          ) : (
            <div className="table-container" style={{ background: "var(--card-bg, #fff)", borderRadius: "14px", overflow: "hidden", border: "1px solid var(--border-color, #e5e7eb)", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
              <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table style={{ width: "100%", minWidth: "600px", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "var(--neu-bg, #f8fafc)", borderBottom: "1px solid var(--border-color, #e2e8f0)", color: "var(--text-muted)" }}>
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>Break Type</th>
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>Start Time</th>
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>End Time</th>
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>Duration</th>
                    <th style={{ padding: "12px 18px", fontWeight: "600" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(breakStatus.todayBreaks || [])
                    .slice((myBreaksPage - 1) * myBreaksPageSize, myBreaksPage * myBreaksPageSize)
                    .map((b) => (
                    <tr key={b.id} style={{ borderBottom: "1px solid var(--border-color, #f1f5f9)" }}>
                      <td style={{ padding: "14px 18px", fontWeight: "600", color: "var(--text-main)" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                          <CoffeeIcon size={14} color="#f59e0b" /> {b.reason}
                        </span>
                      </td>
                      <td style={{ padding: "14px 18px", color: "var(--text-muted)" }}>
                        {new Date(b.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td style={{ padding: "14px 18px", color: "var(--text-muted)" }}>
                        {b.end_time ? new Date(b.end_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : (
                          <span style={{ color: "#d97706", fontWeight: "600" }}>In Progress</span>
                        )}
                      </td>
                      <td style={{ padding: "14px 18px", fontWeight: "700", color: "var(--text-main)" }}>
                        {b.status === "On Break" ? (
                          <span style={{ color: "#d97706" }}>Active</span>
                        ) : (
                          `${b.duration_minutes || 0} mins`
                        )}
                      </td>
                      <td style={{ padding: "14px 18px" }}>
                        <span style={{
                          padding: "4px 10px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: "600",
                          background: b.status === "On Break" ? "#fef3c7" : "#dcfce7",
                          color: b.status === "On Break" ? "#b45309" : "#15803d"
                        }}>
                          {b.status === "On Break" ? "Active" : "Completed"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              <Pagination
                currentPage={myBreaksPage}
                totalRecords={(breakStatus.todayBreaks || []).length}
                pageSize={myBreaksPageSize}
                onPageChange={setMyBreaksPage}
              />
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STAFF BREAK MONITORING (Admin) */}
      {isAdminOrOwner && activeTab === "monitoring" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
              Live Staff Breaks
            </h3>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "var(--input-bg, #fff)",
                  color: "var(--text-main)",
                  fontSize: "14px"
                }}
              />
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "var(--input-bg, #fff)",
                  color: "var(--text-main)",
                  fontSize: "14px"
                }}
              >
                <option value="">All Employees</option>
                {staffList.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "var(--input-bg, #fff)",
                  color: "var(--text-main)",
                  fontSize: "14px"
                }}
              >
                <option value="">All Statuses</option>
                <option value="On Break">On Break (Active)</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>
          <DataTable
            data={allBreaks}
            columns={monitoringColumns}
            emptyText="No break records match the selected filters."
          />
        </div>
      )}

      {/* TAB 3: ADMIN SET BREAK TIMES / POLICIES */}
      {isAdminOrOwner && activeTab === "configure" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                Admin Configured Break Policies
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "4px 0 0" }}>
                Define allowed break types, time limits, and schedule windows for all employees.
              </p>
            </div>
            <button
              onClick={() => {
                setEditTypeId(null);
                setTypeForm({ name: "", duration_minutes: 15, window_start: "10:00", window_end: "11:00" });
                setShowTypeModal(true);
              }}
              style={{
                background: "var(--primary, #6366f1)",
                color: "#fff",
                border: "none",
                padding: "10px 18px",
                borderRadius: "8px",
                fontWeight: "600",
                fontSize: "14px",
                cursor: "pointer"
              }}
            >
              + Add Break Type
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            {breakTypes.map((type) => (
              <div
                key={type.id}
                style={{
                  background: "var(--card-bg, #fff)",
                  borderRadius: "14px",
                  padding: "20px",
                  border: "1px solid var(--border-color, #e5e7eb)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "16px", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <CoffeeIcon size={16} color="#6366f1" /> {type.name}
                    </h4>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Allowed Window: {format12Hour(type.window_start)} - {format12Hour(type.window_end)}
                    </span>
                  </div>
                  <span
                    style={{
                      background: "rgba(99, 102, 241, 0.1)",
                      color: "#6366f1",
                      padding: "4px 10px",
                      borderRadius: "6px",
                      fontWeight: "700",
                      fontSize: "13px"
                    }}
                  >
                    {type.duration_minutes} mins
                  </span>
                </div>

                <div style={{ display: "flex", gap: "8px", marginTop: "auto", borderTop: "1px solid var(--border-color, #f1f5f9)", paddingTop: "12px", justifyContent: "flex-end" }}>
                  <button
                    className="action-btn"
                    onClick={() => {
                      setEditTypeId(type.id);
                      setTypeForm({
                        name: type.name,
                        duration_minutes: type.duration_minutes,
                        window_start: type.window_start || "10:00",
                        window_end: type.window_end || "11:00",
                      });
                      setShowTypeModal(true);
                    }}
                    title="Edit Break Policy"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button
                    className="action-btn delete"
                    onClick={() => handleDeleteBreakType(type.id)}
                    title="Delete Break Policy"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: EMPLOYEE START BREAK (Select from Admin Set Types) */}
      <FormModal
        show={showStartModal}
        onClose={() => setShowStartModal(false)}
        title="Choose Break to Start"
        onSave={handleStartBreak}
        saveText={actionLoading ? "Starting..." : "Start Break"}
      >
        <form onSubmit={(e) => { e.preventDefault(); handleStartBreak(); }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "10px", color: "var(--text-main)" }}>
            Select Configured Break
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
            {breakTypes.map((t) => (
              <label
                key={t.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: selectedBreakType === t.name ? "2px solid #6366f1" : "1px solid var(--border-color, #e5e7eb)",
                  background: selectedBreakType === t.name ? "rgba(99, 102, 241, 0.05)" : "var(--card-bg, #fff)",
                  cursor: "pointer"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <input
                    type="radio"
                    name="breakSelection"
                    value={t.name}
                    checked={selectedBreakType === t.name}
                    onChange={(e) => setSelectedBreakType(e.target.value)}
                  />
                  <div>
                    <div style={{ fontWeight: "700", color: "var(--text-main)", fontSize: "14px" }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Allowed Window: {format12Hour(t.window_start)} - {format12Hour(t.window_end)}
                    </div>
                  </div>
                </div>
                <div style={{ fontWeight: "700", color: "#6366f1", fontSize: "13px" }}>
                  {t.duration_minutes} min
                </div>
              </label>
            ))}
          </div>

          <div
            style={{
              padding: "12px",
              borderRadius: "8px",
              background: "rgba(99, 102, 241, 0.08)",
              fontSize: "12px",
              color: "#4f46e5"
            }}
          >
            Clicking <strong>Start Break</strong> will begin your break session. When finished, return here to click <strong>End Break</strong>.
          </div>
        </form>
      </FormModal>

      {/* MODAL 2: ADMIN CONFIGURE BREAK TYPE (Tea break, lunch break, duration) */}
      <FormModal
        show={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        title={editTypeId ? "Edit Break Policy" : "Set New Break Policy"}
        onSave={handleSaveBreakType}
        saveText={actionLoading ? "Saving..." : "Save Policy"}
      >
        <form noValidate onSubmit={(e) => { e.preventDefault(); handleSaveBreakType(); }}>
          <TextInput
            label="Break Name"
            placeholder="e.g. Tea Break, Lunch Break, Smoke Break"
            value={typeForm.name}
            onChange={(e) => {
              setTypeForm({ ...typeForm, name: e.target.value });
              if (typeFieldErrors.name) setTypeFieldErrors(prev => ({ ...prev, name: null }));
            }}
            required
            error={typeFieldErrors.name}
          />

          <TextInput
            label="Duration Limit (Minutes)"
            type="number"
            placeholder="e.g. 15, 30, 45"
            value={typeForm.duration_minutes}
            onChange={(e) => {
              handleDurationChange(e.target.value);
              if (typeFieldErrors.duration_minutes) setTypeFieldErrors(prev => ({ ...prev, duration_minutes: null }));
            }}
            required
            error={typeFieldErrors.duration_minutes}
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "var(--text-main)" }}>
                Allowed Window Start
              </label>
              <input
                type="time"
                value={typeForm.window_start}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "var(--input-bg, #fff)",
                  color: "var(--text-main)",
                  fontSize: "14px"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "var(--text-main)" }}>
                Allowed Window End
              </label>
              <input
                type="time"
                value={typeForm.window_end}
                readOnly
                disabled
                tabIndex="-1"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--ui-border, #e2e8f0)",
                  background: "var(--ui-bg, #f1f5f9)",
                  color: "var(--text-muted, #64748b)",
                  fontSize: "14px",
                  fontWeight: "600",
                  cursor: "not-allowed",
                  pointerEvents: "none",
                  userSelect: "none"
                }}
              />
            </div>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: "8px",
              background: "rgba(99, 102, 241, 0.12)",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              fontSize: "13px",
              color: "var(--primary-color, #4f46e5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}
          >
            <span style={{ color: "var(--text-muted, #94a3b8)" }}>Effective Break Window:</span>
            <strong style={{ color: "var(--primary-color, #818cf8)" }}>
              {format12Hour(typeForm.window_start)} – {format12Hour(typeForm.window_end)} ({typeForm.duration_minutes || 0} mins)
            </strong>
          </div>
        </form>
      </FormModal>

      {/* MODAL 3: EDIT BREAK RECORD (Admin / Super Admin) */}
      <FormModal
        isOpen={showEditBreakModal}
        onClose={() => {
          setShowEditBreakModal(false);
          setEditingBreak(null);
        }}
        title={`Edit Break Record: ${editingBreak?.user_name || "Employee"}`}
        onSubmit={handleSaveEditBreak}
        submitText={actionLoading ? "Saving..." : "Save Changes"}
        isSubmitting={actionLoading}
      >
        <form onSubmit={(e) => { e.preventDefault(); handleSaveEditBreak(); }} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "var(--text-main)" }}>
              Employee Name
            </label>
            <input
              type="text"
              value={editingBreak?.user_name || ""}
              readOnly
              disabled
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #e2e8f0)",
                background: "#f1f5f9",
                color: "#64748b",
                fontSize: "14px"
              }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "var(--text-main)" }}>
                Break Type / Reason
              </label>
              <input
                type="text"
                value={editBreakForm.reason}
                onChange={(e) => setEditBreakForm({ ...editBreakForm, reason: e.target.value })}
                required
                placeholder="e.g. Lunch Break"
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "var(--input-bg, #fff)",
                  color: "var(--text-main)",
                  fontSize: "14px"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "var(--text-main)" }}>
                Break Date
              </label>
              <input
                type="date"
                value={editBreakForm.date}
                onChange={(e) => setEditBreakForm({ ...editBreakForm, date: e.target.value })}
                required
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "var(--input-bg, #fff)",
                  color: "var(--text-main)",
                  fontSize: "14px"
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "var(--text-main)" }}>
                Start Time
              </label>
              <input
                type="time"
                value={editBreakForm.start_time}
                onChange={(e) => handleEditTimeChange("start_time", e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "var(--input-bg, #fff)",
                  color: "var(--text-main)",
                  fontSize: "14px",
                  fontWeight: "600"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "var(--text-main)" }}>
                End Time
              </label>
              <input
                type="time"
                value={editBreakForm.end_time}
                onChange={(e) => handleEditTimeChange("end_time", e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "var(--input-bg, #fff)",
                  color: "var(--text-main)",
                  fontSize: "14px",
                  fontWeight: "600"
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "var(--text-main)" }}>
                Duration (minutes) <span style={{ fontSize: "11px", fontWeight: "normal", color: "#64748b" }}>(Auto-calculated)</span>
              </label>
              <input
                type="number"
                min="0"
                value={editBreakForm.duration_minutes}
                onChange={(e) => handleEditDurationChange(e.target.value)}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "var(--input-bg, #fff)",
                  color: "var(--text-main)",
                  fontSize: "14px",
                  fontWeight: "700"
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "6px", color: "var(--text-main)" }}>
                Status
              </label>
              <select
                value={editBreakForm.status}
                onChange={(e) => setEditBreakForm({ ...editBreakForm, status: e.target.value })}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color, #d1d5db)",
                  background: "var(--input-bg, #fff)",
                  color: "var(--text-main)",
                  fontSize: "14px"
                }}
              >
                <option value="Completed">Completed</option>
                <option value="On Break">On Break (Active)</option>
                <option value="Completed (Admin Closed)">Completed (Admin Closed)</option>
              </select>
            </div>
          </div>

          <div style={{
            padding: "10px 14px",
            background: "rgba(99, 102, 241, 0.08)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            borderRadius: "8px",
            fontSize: "12.5px",
            color: "var(--text-main)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            lineHeight: "1.4"
          }}>
            <ZapIcon size={16} color="#6366f1" />
            <span>
              <strong>Smart Auto-Sync:</strong> Changing Start Time or End Time will automatically recalculate Duration in minutes. Adjusting Duration will automatically update End Time.
            </span>
          </div>
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
