import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useProject } from "../contexts/ProjectContext";
import { ChevronLeftIcon, ChevronRightIcon, SheetIcon, CheckIcon, SaveIcon, CloseIcon } from "../components/common/Icons";
import Pagination from "../components/common/Pagination";
import ConfirmModal from "../components/common/ConfirmModal";
import { useTableSort, SortIndicator } from "../utils/tableSort";
import "../style/main.css";
import "../style/table.css";

export default function Timesheet() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { selectedProject } = useProject();

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

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isManager = user?.position?.includes("Manager") || user?.role?.name?.includes("Manager");
  const canReview = isSuperAdmin || isManager;

  const [activeTab, setActiveTab] = useState("my-excel"); // "my-excel" | "all-logs" | "summary"
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dailyEntries, setDailyEntries] = useState([]);
  const [rowErrors, setRowErrors] = useState({});
  const [allTimesheets, setAllTimesheets] = useState([]);
  const [summary, setSummary] = useState({ projectSummary: [], todayHours: 0, weekHours: 0 });
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Filters for review tab
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [rejectModal, setRejectModal] = useState({ show: false, id: null, reason: "" });
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPageSize, setReviewPageSize] = useState(10);
  const { sortedData: sortedTimesheets, sortConfig: tsSortConfig, requestSort: requestTsSort } = useTableSort(allTimesheets, "date", "desc");

  // Load initial projects & tasks
  useEffect(() => {
    fetchMeta();
  }, []);

  useEffect(() => {
    if (activeTab === "my-excel") {
      fetchDailyTimesheets(selectedDate);
    } else if (activeTab === "all-logs") {
      fetchAllTimesheets();
    } else if (activeTab === "summary") {
      fetchSummary();
    }
  }, [activeTab, selectedDate, filterProject, filterStatus, filterDate, filterUser]);

  useEffect(() => {
    setReviewPage(1);
  }, [filterProject, filterStatus, filterDate, filterUser]);

  const fetchMeta = async () => {
    try {
      const [pRes, tRes] = await Promise.all([
        API.get("/projects"),
        API.get("/tasks")
      ]);
      setProjects(pRes.data || []);
      const rawTasks = Array.isArray(tRes.data) ? tRes.data : (tRes.data?.tasks || []);
      setTasks(rawTasks);
    } catch (e) {
      console.error(e);
    }
  };

  // Filter projects to only those assigned to current user (unless SuperAdmin)
  const myAssignedProjects = projects.filter(p => {
    if (isSuperAdmin || isManager) return true;
    return (p.assignedTo || []).some(m => {
      const memberId = (m?._id || m?.id || m)?.toString();
      const currentUserId = (user?._id || user?.id)?.toString();
      return memberId === currentUserId || (m?.email && m.email === user?.email);
    });
  });

  const fetchDailyTimesheets = async (dateStr) => {
    setLoading(true);
    try {
      const res = await API.get(`/timesheets/my-timesheets?date=${dateStr}`);
      const data = res.data || [];
      if (data.length > 0) {
        setDailyEntries(data.map(item => ({ ...item, isSaved: true })));
      } else {
        // Provide 1 initial blank Excel row with empty selections so employee enters manually
        setDailyEntries([{
          id: `temp_${Date.now()}`,
          hours: "",
          project_id: "",
          project_name: "",
          task_id: "",
          task_title: "",
          subtask_id: "",
          subtask_title: "",
          description: "",
          task_status: "In Process",
          status: "Draft",
          isSaved: false
        }]);
      }
    } catch (err) {
      showToast("Failed to load daily timesheet", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllTimesheets = async () => {
    setLoading(true);
    try {
      let url = `/timesheets/all?`;
      if (filterProject) url += `projectId=${filterProject}&`;
      if (filterStatus) url += `status=${filterStatus}&`;
      if (filterDate) url += `date=${filterDate}&`;
      if (filterUser) url += `userId=${filterUser}&`;
      const res = await API.get(url);
      setAllTimesheets(res.data || []);
    } catch (err) {
      showToast("Failed to load timesheets", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await API.get("/timesheets/summary");
      setSummary(res.data || { projectSummary: [], todayHours: 0, weekHours: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Date Navigation Helpers
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleSetToday = () => {
    setSelectedDate(new Date().toISOString().slice(0, 10));
  };

  // Excel Row Add & Field Changes
  const handleAddExcelRow = () => {
    const defProj = myAssignedProjects[0] || projects[0];
    const projId = defProj?._id || defProj?.id || "";
    const projTasks = tasks.filter(t => (t.project?._id || t.project?.id || t.project)?.toString() === projId?.toString());
    const defTask = projTasks[0];
    const defSub = defTask?.subtasks?.[0];

    setDailyEntries(prev => [
      ...prev,
      {
        id: `temp_${Date.now()}_${Math.random()}`,
        hours: "",
        project_id: projId,
        project_name: defProj?.name || "",
        task_id: (defTask?._id || defTask?.id)?.toString() || "",
        task_title: defTask?.title || "",
        subtask_id: (defSub?._id || defSub?.id)?.toString() || "",
        subtask_title: defSub?.title || "",
        description: "",
        task_status: defSub?.status || "In Process",
        status: "Draft",
        isSaved: false
      }
    ]);
  };

  const handleRowFieldChange = (index, field, value) => {
    setDailyEntries(prev => {
      const updated = [...prev];
      const row = { ...updated[index], [field]: value };

      if (field === "project_id") {
        const proj = projects.find(p => (p._id || p.id)?.toString() === value?.toString());
        row.project_name = proj ? proj.name : "";
        const projTasks = tasks.filter(t => (t.project?._id || t.project?.id || t.project)?.toString() === value?.toString());
        const firstT = projTasks[0];
        row.task_id = (firstT?._id || firstT?.id)?.toString() || "";
        row.task_title = firstT?.title || "";
        const firstS = firstT?.subtasks?.[0];
        row.subtask_id = (firstS?._id || firstS?.id)?.toString() || "";
        row.subtask_title = firstS?.title || "";
        row.task_status = firstS?.status || "In Process";
      } else if (field === "task_id") {
        const t = tasks.find(item => (item._id || item.id)?.toString() === value?.toString());
        row.task_title = t ? t.title : "";
        const firstS = t?.subtasks?.[0];
        row.subtask_id = (firstS?._id || firstS?.id)?.toString() || "";
        row.subtask_title = firstS?.title || "";
        row.task_status = firstS?.status || "In Process";
      } else if (field === "subtask_id") {
        const t = tasks.find(item => (item._id || item.id)?.toString() === row.task_id?.toString());
        const s = t?.subtasks?.find(sub => (sub._id || sub.id)?.toString() === value?.toString());
        row.subtask_title = s ? s.title : "";
        if (s?.status) row.task_status = s.status;
      }

      updated[index] = row;
      return updated;
    });
  };

  // Save single Excel row
  const handleSaveRow = async (index) => {
    const row = dailyEntries[index];
    const errors = {};
    if (!row.hours || parseFloat(row.hours) <= 0) {
      errors.hours = "Plese enter hours";
    }
    if (!row.project_id) {
      errors.project_id = "Plese enter project";
    }
    if (!row.description || !row.description.trim()) {
      errors.description = "Plese enter description";
    }

    if (Object.keys(errors).length > 0) {
      setRowErrors(prev => ({ ...prev, [index]: errors }));
      return;
    }

    // Clear error for this row
    setRowErrors(prev => {
      const copy = { ...prev };
      delete copy[index];
      return copy;
    });

    const numH = parseFloat(row.hours);

    try {
      const payload = {
        project_id: row.project_id,
        project_name: row.project_name,
        task_id: row.task_id || null,
        task_title: row.task_title || "",
        subtask_id: row.subtask_id || null,
        subtask_title: row.subtask_title || "",
        date: selectedDate,
        hours: numH,
        description: row.description.trim(),
        task_status: row.task_status || "In Process",
        is_billable: true
      };

      if (row.isSaved && row.id && !row.id.startsWith("temp_")) {
        await API.put(`/timesheets/${row.id}`, payload);
        showToast("Line updated successfully!");
      } else {
        await API.post("/timesheets", payload);
        showToast("Line saved to daily report!");
      }

      fetchDailyTimesheets(selectedDate);
      fetchSummary();
    } catch (e) {
      const errMsg = e.response?.data?.error || e.message || "Save failed";
      let matchedField = false;
      if (errMsg.toLowerCase().includes("project")) {
        setRowErrors(prev => ({ ...prev, [index]: { ...prev[index], project_id: "Plese enter project" } }));
        matchedField = true;
      }
      if (errMsg.toLowerCase().includes("hours")) {
        setRowErrors(prev => ({ ...prev, [index]: { ...prev[index], hours: "Plese enter hours" } }));
        matchedField = true;
      }
      if (errMsg.toLowerCase().includes("description")) {
        setRowErrors(prev => ({ ...prev, [index]: { ...prev[index], description: "Plese enter description" } }));
        matchedField = true;
      }
      if (!matchedField) {
        showToast(errMsg, "error");
      }
    }
  };

  // Delete row
  const handleDeleteRow = (index) => {
    const row = dailyEntries[index];
    if (!row.isSaved || row.id.startsWith("temp_")) {
      setDailyEntries(prev => prev.filter((_, i) => i !== index));
      return;
    }
    askConfirm("Delete Timesheet Entry", "Delete this timesheet entry?", async () => {
      try {
        await API.delete(`/timesheets/${row.id}`);
        showToast("Line deleted successfully!");
        fetchDailyTimesheets(selectedDate);
        fetchSummary();
      } catch (e) {
        showToast(e.response?.data?.error || "Delete failed", "error");
      }
    });
  };

  // Submit whole day's report for approval
  const handleSubmitDayReport = async () => {
    if (isSubmittingReport) return;

    if (dailyEntries.length === 0) {
      showToast("No timesheet entries to submit!", "warning");
      return;
    }

    const unsaved = dailyEntries.some(r => !r.isSaved || r.id.startsWith("temp_"));
    if (unsaved) {
      showToast("Please save all rows before submitting for approval!", "error");
      return;
    }

    const allSubmittedOrApproved = dailyEntries.every(r => r.status === "Submitted" || r.status === "Approved");
    if (allSubmittedOrApproved) {
      showToast("Today's report has already been submitted for approval!", "info");
      return;
    }

    try {
      setIsSubmittingReport(true);
      await API.post("/timesheets/submit-day", { date: selectedDate });
      showToast("Daily report submitted to Admin for approval!", "success");
      await fetchDailyTimesheets(selectedDate);
    } catch (e) {
      showToast(e.response?.data?.error || "Submission failed", "error");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Admin action (Approve / Reject)
  const handleAction = async (id, action, reason = null) => {
    try {
      await API.patch(`/timesheets/${id}/action`, { action, reason });
      showToast(`Timesheet ${action}!`);
      fetchAllTimesheets();
      fetchSummary();
    } catch (err) {
      showToast(err.response?.data?.error || "Action failed", "error");
    }
  };

  // Calculate day total
  const dayTotalHours = dailyEntries.reduce((sum, r) => sum + (parseFloat(r.hours) || 0), 0);

  // Status badge helpers
  const renderTaskStatusBadge = (status) => {
    let bg = "#fef3c7", color = "#b45309", border = "#fde68a"; // Pending
    if (status === "In Process" || status === "In Progress") {
      bg = "#dbeafe"; color = "#1d4ed8"; border = "#bfdbfe";
    } else if (status === "Complete" || status === "Completed") {
      bg = "#dcfce7"; color = "#15803d"; border = "#bbf7d0";
    }
    return (
      <span style={{
        padding: "3px 8px", borderRadius: "8px", fontSize: "11px", fontWeight: "700",
        background: bg, color: color, border: `1px solid ${border}`, textTransform: "uppercase",
        display: "inline-flex", alignItems: "center", gap: "4px"
      }}>
        <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: color }} />
        {status || "In Process"}
      </span>
    );
  };

  const renderApprovalBadge = (status) => {
    let bg = "#f1f5f9", color = "#475569", border = "#cbd5e1";
    if (status === "Submitted") { bg = "#e0e7ff"; color = "#4338ca"; border = "#c7d2fe"; }
    else if (status === "Approved") { bg = "#dcfce7"; color = "#15803d"; border = "#bbf7d0"; }
    else if (status === "Rejected") { bg = "#fee2e2"; color = "#b91c1c"; border = "#fecaca"; }
    return (
      <span style={{
        padding: "4px 9px", borderRadius: "10px", fontSize: "11px", fontWeight: "700",
        background: bg, color: color, border: `1px solid ${border}`, textTransform: "uppercase"
      }}>
        {status || "Draft"}
      </span>
    );
  };

  return (
    <div className="task-page" style={{ padding: "20px 24px" }}>
      {/* ─── TOP HEADER ────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "20px", flexWrap: "wrap", gap: "16px"
      }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "800", color: "#1e293b", margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ background: "linear-gradient(135deg, #4f46e5, #0ea5e9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Daily Timesheet Report
            </span>
            <span style={{ fontSize: "12px", background: "#f0fdf4", color: "#16a34a", padding: "3px 9px", borderRadius: "6px", fontWeight: "700" }}>
              Excel Grid View
            </span>
          </h1>
          <p style={{ color: "#64748b", fontSize: "13px", margin: "4px 0 0 0" }}>
            {user?.name} ({
              user?.role?.name ||
              (user?.position && user?.position !== "role_staff" && user?.position !== "role_developer"
                ? user.position.replace(/^role_/i, "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
                : (user?.role === "role_owner" || user?.role?.id === "role_owner" ? "Project Manager" : "Staff"))
            }) — Log your daily task & subtask hours below.
          </p>
        </div>

        {/* ─── DATE FILTER (Responsive toolbar with wrap) ───────────── */}
        <div style={{
          display: "flex", alignItems: "center", gap: "8px", background: "var(--ui-surface, #fff)",
          padding: "8px 12px", borderRadius: "12px", border: "1.5px solid var(--ui-border, #e2e8f0)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.03)", flexWrap: "wrap", maxWidth: "100%"
        }}>
          <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-muted, #475569)", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            Date Filter:
          </span>

          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
            <button
              onClick={handlePrevDay}
              style={{ background: "var(--ui-bg, #f1f5f9)", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", padding: "6px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              title="Previous Day"
            >
              <ChevronLeftIcon size={12} color="var(--text-muted, #475569)" />
            </button>

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={{
                padding: "5px 8px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px",
                fontWeight: "700", fontSize: "12px", color: "var(--text-main, #1e293b)", outline: "none",
                background: "var(--ui-surface, #fff)",
                maxWidth: "135px"
              }}
            />

            <button
              onClick={handleNextDay}
              style={{ background: "var(--ui-bg, #f1f5f9)", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", padding: "6px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              title="Next Day"
            >
              <ChevronRightIcon size={12} color="var(--text-muted, #475569)" />
            </button>
          </div>

          <button
            onClick={handleSetToday}
            style={{
              background: "var(--primary-light, #eef2ff)", color: "var(--primary-color, #4f46e5)", border: "1px solid var(--ui-border, #c7d2fe)",
              borderRadius: "6px", padding: "5px 10px", cursor: "pointer", fontWeight: "700", fontSize: "11px"
            }}
          >
            Today
          </button>

          <div style={{
            background: dayTotalHours >= 8.0 ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
            color: dayTotalHours >= 8.0 ? "#10b981" : "#f59e0b",
            border: `1px solid ${dayTotalHours >= 8.0 ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)"}`,
            padding: "5px 9px", borderRadius: "8px", fontWeight: "800", fontSize: "11px",
            whiteSpace: "nowrap"
          }}>
            Total: {dayTotalHours.toFixed(2)} hrs
          </div>

          <button
            onClick={handleAddExcelRow}
            style={{
              background: "linear-gradient(135deg, #4f46e5, #6366f1)",
              color: "#fff", border: "none", padding: "7px 14px", borderRadius: "8px",
              fontWeight: "700", fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px",
              whiteSpace: "nowrap"
            }}
          >
            + Add Row
          </button>
        </div>
      </div>

      {/* ─── TABS ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "10px", borderBottom: "2px solid #e2e8f0", marginBottom: "20px", overflowX: "auto", WebkitOverflowScrolling: "touch", whiteSpace: "nowrap" }}>
        <button
          onClick={() => setActiveTab("my-excel")}
          style={{
            padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
            fontWeight: "700", fontSize: "14px",
            color: activeTab === "my-excel" ? "#4f46e5" : "#64748b",
            borderBottom: activeTab === "my-excel" ? "3px solid #4f46e5" : "3px solid transparent",
            marginBottom: "-2px"
          }}
        >
          Daily Sheet ({new Date(selectedDate).toLocaleDateString('en-GB')})
        </button>

        {canReview && (
          <button
            onClick={() => setActiveTab("all-logs")}
            style={{
              padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
              fontWeight: "700", fontSize: "14px",
              color: activeTab === "all-logs" ? "#4f46e5" : "#64748b",
              borderBottom: activeTab === "all-logs" ? "3px solid #4f46e5" : "3px solid transparent",
              marginBottom: "-2px"
            }}
          >
            Review All Staff Logs ({allTimesheets.length})
          </button>
        )}

        <button
          onClick={() => setActiveTab("summary")}
          style={{
            padding: "10px 18px", border: "none", background: "none", cursor: "pointer",
            fontWeight: "700", fontSize: "14px",
            color: activeTab === "summary" ? "#4f46e5" : "#64748b",
            borderBottom: activeTab === "summary" ? "3px solid #4f46e5" : "3px solid transparent",
            marginBottom: "-2px"
          }}
        >
          Project Hours Burned
        </button>
      </div>

      {/* ─── TAB 1: EXCEL-SHEET DAILY REPORT ───────────────────────────── */}
      {activeTab === "my-excel" && (
        <div>
          <div style={{
            background: "var(--ui-surface, #ffffff)", borderRadius: "12px", border: "1.5px solid var(--ui-border, #cbd5e1)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.04)", overflow: "hidden"
          }}>
            {/* Sheet Banner */}
            <div style={{
              background: "var(--ui-bg, #f8fafc)", padding: "12px 18px", borderBottom: "1px solid var(--ui-border, #e2e8f0)",
              display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ fontWeight: "800", color: "var(--text-main, #1e293b)", fontSize: "14px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <SheetIcon size={16} color="var(--primary-color, #4f46e5)" /> Daily Timesheet Entries for {new Date(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                  (Showing projects assigned to {user?.name})
                </span>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                {(() => {
                  const hasRows = dailyEntries.length > 0 && !dailyEntries.some(r => r.id.startsWith("temp_"));
                  const isAlreadySubmitted = hasRows && dailyEntries.every(r => r.status === "Submitted" || r.status === "Approved");
                  const isApproved = hasRows && dailyEntries.every(r => r.status === "Approved");

                  if (isApproved) {
                    return (
                      <span
                        style={{
                          background: "#ecfdf5",
                          color: "#059669",
                          border: "1px solid #a7f3d0",
                          padding: "7px 18px",
                          borderRadius: "8px",
                          fontWeight: "800",
                          fontSize: "12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px"
                        }}
                      >
                        <CheckIcon size={15} color="#059669" /> Report Approved by Admin
                      </span>
                    );
                  }

                  if (isAlreadySubmitted) {
                    return (
                      <span
                        style={{
                          background: "#eff6ff",
                          color: "#2563eb",
                          border: "1px solid #bfdbfe",
                          padding: "7px 18px",
                          borderRadius: "8px",
                          fontWeight: "800",
                          fontSize: "12px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px"
                        }}
                      >
                        <CheckIcon size={15} color="#2563eb" /> Submitted for Approval
                      </span>
                    );
                  }

                  return (
                    <button
                      type="button"
                      disabled={isSubmittingReport}
                      onClick={handleSubmitDayReport}
                      style={{
                        background: isSubmittingReport ? "#94a3b8" : "linear-gradient(135deg, #10b981, #059669)",
                        color: "#fff",
                        border: "none",
                        padding: "7px 18px",
                        borderRadius: "8px",
                        fontWeight: "800",
                        fontSize: "12px",
                        cursor: isSubmittingReport ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        opacity: isSubmittingReport ? 0.7 : 1
                      }}
                    >
                      <CheckIcon size={15} color="#fff" />
                      {isSubmittingReport ? "Submitting..." : "Submit Day's Report to Admin for Approval"}
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* Excel Table Grid */}
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: "1080px" }}>
                <thead>
                  <tr style={{ background: "var(--ui-bg, #f8fafc)", textAlign: "left", borderBottom: "1.5px solid var(--ui-border, #e2e8f0)" }}>
                    <th style={{ padding: "12px 10px", fontSize: "11px", fontWeight: "700", color: "#64748b", width: "100px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      1. Hours <span style={{ color: "#ef4444" }}>*</span>
                    </th>
                    <th style={{ padding: "12px 10px", fontSize: "11px", fontWeight: "700", color: "#64748b", width: "190px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      2. Project <span style={{ color: "#ef4444" }}>*</span>
                    </th>
                    <th style={{ padding: "12px 10px", fontSize: "11px", fontWeight: "700", color: "#64748b", width: "180px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      3. Task
                    </th>
                    <th style={{ padding: "12px 10px", fontSize: "11px", fontWeight: "700", color: "#64748b", width: "170px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      4. Sub Task
                    </th>
                    <th style={{ padding: "12px 10px", fontSize: "11px", fontWeight: "700", color: "#64748b", minWidth: "200px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      5. Description <span style={{ color: "#ef4444" }}>*</span>
                    </th>
                    <th style={{ padding: "12px 10px", fontSize: "11px", fontWeight: "700", color: "#64748b", width: "135px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      6. Status
                    </th>
                    <th style={{ padding: "12px 10px", fontSize: "11px", fontWeight: "700", color: "#64748b", width: "110px", textAlign: "center", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      Approval
                    </th>
                    <th style={{ padding: "12px 10px", fontSize: "11px", fontWeight: "700", color: "#64748b", width: "110px", textAlign: "center", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dailyEntries.map((row, idx) => {
                    const rowTasks = tasks.filter(t => {
                      if (!row.project_id) return true;
                      const pId = (t.project?._id || t.project?.id || t.project)?.toString();
                      return pId === row.project_id?.toString();
                    });
                    const selectedTaskObj = tasks.find(t => (t._id || t.id)?.toString() === row.task_id?.toString());
                    const rowSubtasks = selectedTaskObj?.subtasks || [];
                    const isLocked = row.status === "Approved";
                    const err = rowErrors[idx] || {};

                    return (
                      <tr 
                        key={row.id || idx} 
                        style={{ 
                          borderBottom: "1px solid var(--ui-border, #e2e8f0)", 
                          background: idx % 2 === 0 ? "var(--ui-surface, #ffffff)" : "#fafbfc",
                          transition: "background 0.15s ease"
                        }}
                      >
                        {/* 1. Hours */}
                        <td style={{ padding: "10px", verticalAlign: "middle" }}>
                          <input
                            type="number"
                            step="0.25"
                            min="0.25"
                            max="24"
                            disabled={isLocked}
                            value={row.hours}
                            onChange={(e) => {
                              handleRowFieldChange(idx, "hours", e.target.value);
                              if (err.hours) {
                                setRowErrors(prev => ({ ...prev, [idx]: { ...prev[idx], hours: null } }));
                              }
                            }}
                            style={{
                              width: "100%", 
                              height: "38px",
                              padding: "0 10px", 
                              border: err.hours ? "1.5px solid #ef4444" : "1px solid #d1d5db", 
                              borderRadius: "7px",
                              fontWeight: "700", 
                              fontSize: "13px", 
                              color: "#1e293b", 
                              background: isLocked ? "#f1f5f9" : "#fff",
                              boxSizing: "border-box",
                              outline: "none"
                            }}
                            placeholder="0.00"
                          />
                          {err.hours && (
                            <div style={{ color: "#ef4444", fontSize: "11px", marginTop: "3px", fontWeight: "600" }}>
                              {err.hours}
                            </div>
                          )}
                        </td>

                        {/* 2. Project */}
                        <td style={{ padding: "10px", verticalAlign: "middle" }}>
                          <select
                            disabled={isLocked}
                            value={row.project_id}
                            onChange={(e) => {
                              handleRowFieldChange(idx, "project_id", e.target.value);
                              if (err.project_id) {
                                setRowErrors(prev => ({ ...prev, [idx]: { ...prev[idx], project_id: null } }));
                              }
                            }}
                            style={{
                              width: "100%", 
                              height: "38px",
                              padding: "0 10px", 
                              border: err.project_id ? "1.5px solid #ef4444" : "1px solid #d1d5db", 
                              borderRadius: "7px",
                              fontSize: "12.5px", 
                              fontWeight: "600", 
                              color: "#1e293b", 
                              background: isLocked ? "#f1f5f9" : "#fff",
                              boxSizing: "border-box",
                              outline: "none"
                            }}
                          >
                            <option value="">Select Project...</option>
                            {myAssignedProjects.map(p => (
                              <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>
                            ))}
                          </select>
                          {err.project_id && (
                            <div style={{ color: "#ef4444", fontSize: "11px", marginTop: "3px", fontWeight: "600" }}>
                              {err.project_id}
                            </div>
                          )}
                        </td>

                        {/* 3. Task */}
                        <td style={{ padding: "10px", verticalAlign: "middle" }}>
                          <select
                            disabled={isLocked}
                            value={row.task_id}
                            onChange={(e) => handleRowFieldChange(idx, "task_id", e.target.value)}
                            style={{
                              width: "100%", 
                              height: "38px",
                              padding: "0 10px", 
                              border: "1px solid #d1d5db", 
                              borderRadius: "7px",
                              fontSize: "12.5px", 
                              color: "#1e293b", 
                              background: isLocked ? "#f1f5f9" : "#fff",
                              boxSizing: "border-box",
                              outline: "none"
                            }}
                          >
                            <option value="">Select Task...</option>
                            {rowTasks.map(t => (
                              <option key={t._id} value={t._id}>{t.title}</option>
                            ))}
                          </select>
                        </td>

                        {/* 4. Sub Task */}
                        <td style={{ padding: "10px", verticalAlign: "middle" }}>
                          <select
                            disabled={isLocked}
                            value={row.subtask_id}
                            onChange={(e) => handleRowFieldChange(idx, "subtask_id", e.target.value)}
                            style={{
                              width: "100%", 
                              height: "38px",
                              padding: "0 10px", 
                              border: "1px solid #d1d5db", 
                              borderRadius: "7px",
                              fontSize: "12.5px", 
                              color: "#334155", 
                              background: isLocked ? "#f1f5f9" : "#fff",
                              boxSizing: "border-box",
                              outline: "none"
                            }}
                          >
                            <option value="">Select Sub Task...</option>
                            {rowSubtasks.map(s => (
                              <option key={s._id} value={s._id}>{s.title}</option>
                            ))}
                          </select>
                        </td>

                        {/* 5. Description */}
                        <td style={{ padding: "10px", verticalAlign: "middle" }}>
                          <input
                            type="text"
                            disabled={isLocked}
                            value={row.description}
                            onChange={(e) => {
                              handleRowFieldChange(idx, "description", e.target.value);
                              if (err.description) {
                                setRowErrors(prev => ({ ...prev, [idx]: { ...prev[idx], description: null } }));
                              }
                            }}
                            placeholder="Detail work performed..."
                            style={{
                              width: "100%", 
                              height: "38px",
                              padding: "0 12px", 
                              border: err.description ? "1.5px solid #ef4444" : "1px solid #d1d5db", 
                              borderRadius: "7px",
                              fontSize: "12.5px", 
                              color: "#334155", 
                              background: isLocked ? "#f1f5f9" : "#fff",
                              boxSizing: "border-box",
                              outline: "none"
                            }}
                          />
                          {err.description && (
                            <div style={{ color: "#ef4444", fontSize: "11px", marginTop: "3px", fontWeight: "600" }}>
                              {err.description}
                            </div>
                          )}
                        </td>

                        {/* 6. Status */}
                        <td style={{ padding: "10px", verticalAlign: "middle" }}>
                          <select
                            disabled={isLocked}
                            value={row.task_status}
                            onChange={(e) => handleRowFieldChange(idx, "task_status", e.target.value)}
                            style={{
                              width: "100%", 
                              height: "38px",
                              padding: "0 8px", 
                              border: "1px solid #d1d5db", 
                              borderRadius: "7px",
                              fontSize: "12px", 
                              fontWeight: "700",
                              background: row.task_status === "Complete" ? "#ecfdf5" : row.task_status === "In Process" ? "#eff6ff" : "#fffbeb",
                              color: row.task_status === "Complete" ? "#15803d" : row.task_status === "In Process" ? "#1d4ed8" : "#b45309",
                              boxSizing: "border-box",
                              outline: "none"
                            }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Process">In Process</option>
                            <option value="Complete">Complete</option>
                          </select>
                        </td>

                        {/* Approval */}
                        <td style={{ padding: "10px", textAlign: "center", verticalAlign: "middle" }}>
                          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                            {renderApprovalBadge(row.status)}
                            {row.approved_by && (
                              <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>by {row.approved_by}</div>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td style={{ padding: "10px", textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                          {!isLocked && (
                            <div style={{ display: "inline-flex", gap: "6px", alignItems: "center", justifyContent: "center" }}>
                              <button
                                type="button"
                                onClick={() => handleSaveRow(idx)}
                                style={{
                                  background: "#4f46e5", 
                                  color: "#fff", 
                                  border: "none", 
                                  borderRadius: "7px",
                                  height: "34px",
                                  padding: "0 12px", 
                                  cursor: "pointer", 
                                  fontWeight: "700", 
                                  fontSize: "12px",
                                  display: "inline-flex", 
                                  alignItems: "center", 
                                  gap: "5px",
                                  boxShadow: "0 1px 2px rgba(79, 70, 229, 0.2)"
                                }}
                                title="Save line"
                              >
                                <SaveIcon size={13} color="#fff" /> Save
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRow(idx)}
                                title="Delete line"
                                style={{
                                  background: "#fff",
                                  border: "1px solid #fee2e2",
                                  color: "#ef4444",
                                  borderRadius: "7px",
                                  height: "34px",
                                  width: "34px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  cursor: "pointer",
                                  padding: 0
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "#fef2f2"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18" />
                                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer Totals */}
                <tfoot>
                  <tr style={{ background: "var(--ui-bg, #f8fafc)", borderTop: "2px solid var(--ui-border, #e2e8f0)" }}>
                    <td style={{ padding: "14px 12px", verticalAlign: "middle" }}>
                      <div style={{ display: "inline-flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "14px", fontWeight: "800", color: "#1e293b", lineHeight: 1.2 }}>
                          {dayTotalHours.toFixed(2)} hrs
                        </span>
                        <span style={{ fontSize: "11px", fontWeight: "600", color: "#64748b" }}>
                          Total Logged
                        </span>
                      </div>
                    </td>
                    <td colSpan="5" style={{ padding: "14px 12px" }}></td>
                    <td colSpan="2" style={{ padding: "14px 12px", textAlign: "right", verticalAlign: "middle" }}>
                      <button
                        type="button"
                        onClick={handleAddExcelRow}
                        style={{
                          background: "#fff", 
                          color: "#4f46e5", 
                          border: "1.5px dashed #818cf8",
                          borderRadius: "7px", 
                          padding: "8px 16px", 
                          fontWeight: "700", 
                          fontSize: "12.5px", 
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          boxShadow: "0 1px 2px rgba(0,0,0,0.02)"
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#eef2ff"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                      >
                        <span style={{ fontSize: "15px", lineHeight: "1" }}>+</span> Add Another Task Line
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: REVIEW ALL STAFF LOGS (FOR ADMIN / MANAGER) ────────── */}
      {activeTab === "all-logs" && canReview && (
        <div>
          {/* Filters Bar */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="form-control"
              style={{ width: "200px" }}
            >
              <option value="">All Projects</option>
              {projects.map(p => (
                <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="form-control"
              style={{ width: "160px" }}
            >
              <option value="">All Statuses</option>
              <option value="Submitted">Submitted (Needs Approval)</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>

            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="form-control"
              style={{ width: "160px" }}
            />

            {(filterProject || filterStatus || filterDate) && (
              <button
                onClick={() => { setFilterProject(""); setFilterStatus(""); setFilterDate(""); }}
                style={{ padding: "8px 14px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer", fontSize: "13px" }}
              >
                Reset Filters
              </button>
            )}
          </div>

          <div style={{ background: "#ffffff", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table className="custom-table" style={{ width: "100%", minWidth: "900px", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                    <th onClick={() => requestTsSort("user_name")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                      EMPLOYEE <SortIndicator sortKey="user_name" currentKey={tsSortConfig.key} direction={tsSortConfig.direction} />
                    </th>
                    <th onClick={() => requestTsSort("date")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                      DATE <SortIndicator sortKey="date" currentKey={tsSortConfig.key} direction={tsSortConfig.direction} />
                    </th>
                    <th onClick={() => requestTsSort("hours")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                      HOURS <SortIndicator sortKey="hours" currentKey={tsSortConfig.key} direction={tsSortConfig.direction} />
                    </th>
                    <th onClick={() => requestTsSort("project_name")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                      PROJECT <SortIndicator sortKey="project_name" currentKey={tsSortConfig.key} direction={tsSortConfig.direction} />
                    </th>
                    <th onClick={() => requestTsSort("task_title")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                      TASK & SUBTASK <SortIndicator sortKey="task_title" currentKey={tsSortConfig.key} direction={tsSortConfig.direction} />
                    </th>
                    <th onClick={() => requestTsSort("description")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                      DESCRIPTION <SortIndicator sortKey="description" currentKey={tsSortConfig.key} direction={tsSortConfig.direction} />
                    </th>
                    <th onClick={() => requestTsSort("task_status")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                      STATUS <SortIndicator sortKey="task_status" currentKey={tsSortConfig.key} direction={tsSortConfig.direction} />
                    </th>
                    <th onClick={() => requestTsSort("status")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                      APPROVAL <SortIndicator sortKey="status" currentKey={tsSortConfig.key} direction={tsSortConfig.direction} />
                    </th>
                    <th style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", textAlign: "right" }}>ADMIN ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTimesheets.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                        No staff timesheets found matching filters.
                      </td>
                    </tr>
                  ) : (
                    sortedTimesheets
                      .slice((reviewPage - 1) * reviewPageSize, reviewPage * reviewPageSize)
                      .map(ts => (
                      <tr key={ts.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ fontWeight: "700", color: "#1e293b", fontSize: "14px" }}>{ts.user_name}</div>
                          <div style={{ fontSize: "11px", color: "#94a3b8" }}>{ts.user_email}</div>
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: "600", color: "#334155", whiteSpace: "nowrap" }}>
                          {ts.date ? new Date(ts.date).toLocaleDateString('en-GB') : "—"}
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: "800", color: "#0f172a" }}>
                          <span style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: "6px" }}>{ts.hours} hrs</span>
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: "700", color: "#4f46e5" }}>
                          {ts.project_name}
                        </td>
                        <td style={{ padding: "12px 16px", maxWidth: "240px" }}>
                          <div style={{ fontWeight: "700", color: "#1e293b", fontSize: "13px" }}>{ts.task_title || "General Task"}</div>
                          {ts.subtask_title && (
                            <div style={{ marginTop: "3px", display: "inline-block", background: "#f1f5f9", padding: "2px 8px", borderRadius: "6px", fontSize: "11px", color: "#475569", fontWeight: "600" }}>
                              ↳ {ts.subtask_title}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", maxWidth: "250px" }}>
                          <div style={{ color: "#334155", fontSize: "12px" }}>{ts.description}</div>
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {renderTaskStatusBadge(ts.task_status)}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {renderApprovalBadge(ts.status)}
                          {ts.approved_by && (
                            <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "4px" }}>by {ts.approved_by}</div>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {ts.status === "Submitted" ? (
                            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                              <button
                                onClick={() => handleAction(ts.id, "Approved")}
                                style={{
                                  padding: "6px 14px", background: "#10b981", color: "#fff", border: "none",
                                  borderRadius: "6px", fontWeight: "700", fontSize: "12px", cursor: "pointer"
                                }}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectModal({ show: true, id: ts.id, reason: "" })}
                                style={{
                                  padding: "6px 14px", background: "#ef4444", color: "#fff", border: "none",
                                  borderRadius: "6px", fontWeight: "700", fontSize: "12px", cursor: "pointer"
                                }}
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Processed</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={reviewPage}
              totalRecords={allTimesheets.length}
              pageSize={reviewPageSize}
              onPageChange={setReviewPage}
              onPageSizeChange={(newSize) => { setReviewPageSize(newSize); setReviewPage(1); }}
            />
          </div>
        </div>
      )}

      {/* ─── TAB 3: PROJECT HOURS ANALYTICS ──────────────────────────── */}
      {activeTab === "summary" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
          {summary.projectSummary?.map((p, idx) => (
            <div key={idx} style={{ background: "#ffffff", padding: "20px", borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 2px 6px rgba(0,0,0,0.03)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: "800", color: "#1e293b" }}>{p.project_name}</div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{p.log_count} Timesheet Entries Submitted</div>
                </div>
                <div style={{ background: "#eef2ff", color: "#4f46e5", padding: "6px 12px", borderRadius: "8px", fontWeight: "800", fontSize: "15px" }}>
                  {p.total_hours} hrs
                </div>
              </div>

              {/* Visual progress bar */}
              <div style={{ width: "100%", height: "8px", background: "#f1f5f9", borderRadius: "10px", marginTop: "16px", overflow: "hidden" }}>
                <div style={{
                  width: `${Math.min((parseFloat(p.total_hours) / 100) * 100, 100)}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #4f46e5, #06b6d4)",
                  borderRadius: "10px"
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#94a3b8", marginTop: "6px" }}>
                <span>Burned: {p.total_hours} hrs</span>
                <span>Budget: 100 hrs</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── MODAL: REJECT TIMESHEET REASON ────────────────────────────── */}
      {rejectModal.show && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(15, 23, 42, 0.6)", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 1000, padding: "20px"
        }}>
          <div style={{ background: "var(--ui-surface, #fff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "16px", width: "100%", maxWidth: "460px", padding: "24px", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "800", color: "#ef4444", margin: "0 0 12px 0" }}>
              Reject Timesheet Entry
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted, #64748b)", marginBottom: "16px" }}>
              Please state why this timesheet cannot be approved (e.g. incorrect hours, insufficient detail).
            </p>
            <textarea
              rows="3"
              className="form-control"
              placeholder="Rejection note..."
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              style={{ marginBottom: "18px" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button
                onClick={() => setRejectModal({ show: false, id: null, reason: "" })}
                style={{ padding: "8px 16px", background: "var(--ui-bg, #f1f5f9)", color: "var(--text-main, #334155)", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleAction(rejectModal.id, "Rejected", rejectModal.reason);
                  setRejectModal({ show: false, id: null, reason: "" });
                }}
                style={{ padding: "8px 18px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "8px", fontWeight: "700", cursor: "pointer" }}
              >
                Confirm Rejection
              </button>
            </div>
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
