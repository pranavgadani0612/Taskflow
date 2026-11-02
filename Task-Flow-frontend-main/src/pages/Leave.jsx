import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import API from "../api/api";
import { formatDuration } from "../utils/formatDuration";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { EditIcon, TrashIcon, TimerIcon, ShieldIcon, CheckIcon, CloseIcon, IconAlertTriangle, IconInfo, DownloadIcon } from "../components/common/Icons";
import html2pdf from "html2pdf.js";
import ConfirmModal from "../components/common/ConfirmModal";
import FormModal from "../components/common/FormModal";
import TimeSelect12h from "../components/common/TimeSelect12h";
import Pagination from "../components/common/Pagination";
import { useTableSort, SortIndicator } from "../utils/tableSort";
import "../style/main.css";
import "../style/table.css";

export default function LeaveManagement() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isCompanyOwner = user?.role?.name === "Company Owner";

  // Role & Permission based capabilities
  const canRead = isSuperAdmin || isCompanyOwner || hasPermission("leave_management", "read");
  const canCreate = isSuperAdmin || isCompanyOwner || hasPermission("leave_management", "create");
  const canUpdate = isSuperAdmin || isCompanyOwner || hasPermission("leave_management", "update");
  const canDelete = isSuperAdmin || isCompanyOwner || hasPermission("leave_management", "delete");
  // Only Super Admin (or Company Owner) can see and perform Leave Approvals
  const canApprove = isSuperAdmin || isCompanyOwner;
  const canManagePolicy = isSuperAdmin || isCompanyOwner;

  // Initial tab based on role & permissions
  const [activeTab, setActiveTab] = useState(
    isSuperAdmin
      ? "approvals"
      : isCompanyOwner
      ? "approvals"
      : "apply"
  );
  const [balance, setBalance] = useState({ cl_balance: 12, sl_balance: 8, pl_balance: 15, comp_off: 0 });
  const [adminSummary, setAdminSummary] = useState({ pendingCount: 0, approvedThisMonth: 0, rejectedCount: 0, onLeaveToday: 0 });
  const [myLeaves, setMyLeaves] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);
  const [allBalances, setAllBalances] = useState([]);
  const [myShortLeaves, setMyShortLeaves] = useState([]);
  const [allShortLeaves, setAllShortLeaves] = useState([]);
  const [staffList, setStaffList] = useState([]);

  // Date, Employee & Status filters for Leave Approvals (default status: "Pending")
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveStatusFilter, setLeaveStatusFilter] = useState("Pending");
  const [leaveEmployeeFilter, setLeaveEmployeeFilter] = useState("");

  // Date, Employee & Status filters for Short Leave Approvals (default status: "Pending")
  const [shortLeaveStartDate, setShortLeaveStartDate] = useState("");
  const [shortLeaveEndDate, setShortLeaveEndDate] = useState("");
  const [shortLeaveStatusFilter, setShortLeaveStatusFilter] = useState("Pending");
  const [shortLeaveEmployeeFilter, setShortLeaveEmployeeFilter] = useState("");

  // Confirmation modal for approving / rejecting leaves
  const [actionConfirm, setActionConfirm] = useState({
    show: false,
    id: null,
    type: "leave", // "leave" | "shortleave"
    action: "Approved", // "Approved" | "Rejected"
    userName: ""
  });

  const filteredAllLeaves = allLeaves.filter(l => {
    // Status filter
    if (leaveStatusFilter && leaveStatusFilter !== "All" && l.status !== leaveStatusFilter) return false;
    // Employee filter
    if (leaveEmployeeFilter) {
      const matchEmp = (l.user_id && String(l.user_id) === String(leaveEmployeeFilter)) ||
                       (l.user_email && l.user_email.toLowerCase() === leaveEmployeeFilter.toLowerCase());
      if (!matchEmp) return false;
    }
    // Date filter
    if (!leaveStartDate && !leaveEndDate) return true;
    const lStart = l.from_date ? new Date(l.from_date).toISOString().slice(0, 10) : "";
    const lEnd = l.to_date ? new Date(l.to_date).toISOString().slice(0, 10) : lStart;
    if (leaveStartDate && lEnd < leaveStartDate) return false;
    if (leaveEndDate && lStart > leaveEndDate) return false;
    return true;
  });

  const filteredAllShortLeaves = allShortLeaves.filter(sl => {
    // Status filter
    if (shortLeaveStatusFilter && shortLeaveStatusFilter !== "All" && (sl.status || "Pending") !== shortLeaveStatusFilter) return false;
    // Employee filter
    if (shortLeaveEmployeeFilter) {
      const matchEmp = (sl.user_id && String(sl.user_id) === String(shortLeaveEmployeeFilter)) ||
                       (sl.user_email && sl.user_email.toLowerCase() === shortLeaveEmployeeFilter.toLowerCase());
      if (!matchEmp) return false;
    }
    // Date filter
    if (!shortLeaveStartDate && !shortLeaveEndDate) return true;
    const slDate = sl.date ? new Date(sl.date).toISOString().slice(0, 10) : "";
    if (shortLeaveStartDate && slDate < shortLeaveStartDate) return false;
    if (shortLeaveEndDate && slDate > shortLeaveEndDate) return false;
    return true;
  });

  const [myLeavesPage, setMyLeavesPage] = useState(1);
  const [myLeavesPageSize, setMyLeavesPageSize] = useState(10);
  const paginatedMyLeaves = myLeaves.slice((myLeavesPage - 1) * myLeavesPageSize, myLeavesPage * myLeavesPageSize);
  const [allLeavesPage, setAllLeavesPage] = useState(1);
  const [allLeavesPageSize, setAllLeavesPageSize] = useState(10);
  const { sortedData: sortedAllLeaves, sortConfig: leaveSortConfig, requestSort: requestLeaveSort } = useTableSort(filteredAllLeaves, "from_date", "desc");
  const paginatedAllLeaves = sortedAllLeaves.slice((allLeavesPage - 1) * allLeavesPageSize, allLeavesPage * allLeavesPageSize);
  const [shortLeavePage, setShortLeavePage] = useState(1);
  const shortLeavePageSize = 10;
  const [allShortLeavesPage, setAllShortLeavesPage] = useState(1);
  const allShortLeavesPageSize = 10;
  const [balancePage, setBalancePage] = useState(1);
  const balancePageSize = 10;
  const [balanceYear, setBalanceYear] = useState(new Date().getFullYear());
  const [policyForm, setPolicyForm] = useState({ 
    cl_default: 12, 
    sl_default: 8, 
    pl_default: 15, 
    comp_off_default: 2, 
    max_cl_per_month: 1, 
    max_pl_per_month: 5, 
    applyToExisting: false 
  });
  const [policyLoading, setPolicyLoading] = useState(false);
  const [, setLoading] = useState(false);

  // Leave Form State
  const [leaveForm, setLeaveForm] = useState({
    leave_type: "Casual Leave",
    from_date: new Date().toISOString().slice(0, 10),
    to_date: new Date().toISOString().slice(0, 10),
    day_type: "Full Day",
    reason: ""
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [editingLeaveId, setEditingLeaveId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState({ show: false, id: null, status: null });
  // Low balance approval confirmation modal state
  const [lowBalanceConfirm, setLowBalanceConfirm] = useState({ show: false, id: null, message: "" });
  // Super Admin edit of any employee's leave (from Leave Approvals tab)
  const [adminEdit, setAdminEdit] = useState({ show: false, leave: null, form: null, error: "", saving: false });

  // Admin Edit Employee Leave Balance Modal State
  const [editingBalance, setEditingBalance] = useState(null); // { id, user_name, user_email, cl_balance, sl_balance, pl_balance, comp_off }
  const [saveBalanceLoading, setSaveBalanceLoading] = useState(false);

  // Short Leave Form State
  const [shortLeaveForm, setShortLeaveForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    from_time: "14:00",
    to_time: "16:00",
    hours: 2,
    reason: ""
  });
  const [shortLeaveFieldErrors, setShortLeaveFieldErrors] = useState({});
  const [editingShortLeaveId, setEditingShortLeaveId] = useState(null);
  const [deleteShortConfirm, setDeleteShortConfirm] = useState({ show: false, id: null });
  // Super Admin: edit any employee's short leave from the approvals table
  const [adminEditShort, setAdminEditShort] = useState(null); // { id, user_name, date, from_time, to_time, reason }
  const [adminEditShortError, setAdminEditShortError] = useState("");
  const [savingAdminShort, setSavingAdminShort] = useState(false);

  const [searchParams] = useSearchParams();

  // Auto pre-fill if redirected from missed clock-out notice
  useEffect(() => {
    const qDate = searchParams.get("date");
    const qType = searchParams.get("type");
    if (qDate) {
      setActiveTab("apply");
      setLeaveForm(prev => ({
        ...prev,
        from_date: qDate,
        to_date: qDate,
        day_type: qType || "Second Half",
        reason: `Auto Clock Out on ${qDate} - Applied for Second Half Leave`
      }));
    }
  }, [searchParams]);

  const fetchBalance = async () => {
    try {
      const res = await API.get("/leave/balance");
      if (res.data) setBalance(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAdminSummary = async () => {
    try {
      const res = await API.get("/leave/admin-summary");
      if (res.data) setAdminSummary(res.data);
    } catch (err) {
      console.error("Admin summary load error:", err);
    }
  };

  const fetchMyLeaves = async () => {
    try {
      setLoading(true);
      const res = await API.get("/leave/my-leaves");
      setMyLeaves(res.data || []);
    } catch {
      showToast("Error loading my leaves", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllLeaves = async () => {
    try {
      setLoading(true);
      const res = await API.get("/leave/all");
      setAllLeaves(res.data || []);
    } catch {
      showToast("Error loading leave requests", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllShortLeaves = async () => {
    try {
      const res = await API.get("/leave/short-leaves/all");
      setAllShortLeaves(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMyShortLeaves = async () => {
    try {
      const res = await API.get("/leave/my-short-leaves");
      setMyShortLeaves(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCompanyPolicy = async () => {
    try {
      const res = await API.get("/leave/company-policy");
      if (res.data) {
        setPolicyForm(prev => ({
          ...prev,
          cl_default: res.data.cl_default ?? 12,
          sl_default: res.data.sl_default ?? 8,
          pl_default: res.data.pl_default ?? 15,
          comp_off_default: res.data.comp_off_default ?? 2,
          max_cl_per_month: res.data.max_cl_per_month ?? 1,
          max_pl_per_month: res.data.max_pl_per_month ?? 5
        }));
      }
    } catch (err) {
      console.error("Policy load error:", err);
    }
  };

  const handleSavePolicy = async (e) => {
    e.preventDefault();
    try {
      setPolicyLoading(true);
      const res = await API.put("/leave/company-policy", { ...policyForm, year: balanceYear });
      showToast(res.data?.message || "Company Leave Policy saved!");
      fetchAllBalances(balanceYear);
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to save company policy", "error");
    } finally {
      setPolicyLoading(false);
    }
  };

  const fetchAllBalances = async (yr = balanceYear) => {
    try {
      const res = await API.get(`/leave/admin/balances?year=${yr}`);
      setAllBalances(res.data || []);
    } catch {
      showToast("Error loading balances", "error");
    }
  };

  const handleUpdateEmployeeBalance = async (e) => {
    e.preventDefault();
    if (!editingBalance || !editingBalance.id) return;
    try {
      setSaveBalanceLoading(true);
      const res = await API.put(`/leave/admin/balances/${editingBalance.id}`, {
        cl_balance: Number(editingBalance.cl_balance),
        sl_balance: Number(editingBalance.sl_balance),
        pl_balance: Number(editingBalance.pl_balance),
        comp_off: Number(editingBalance.comp_off)
      });
      showToast(res.data?.message || "Leave balance updated successfully!");
      setEditingBalance(null);
      fetchAllBalances(balanceYear);
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update employee balance", "error");
    } finally {
      setSaveBalanceLoading(false);
    }
  };

  // Max short leave duration (minutes) & monthly count - configured by Super Admin
  const [maxShortMins, setMaxShortMins] = useState(120);
  const [shortHoursInput, setShortHoursInput] = useState("2");
  const [maxMonthlyShortCount, setMaxMonthlyShortCount] = useState(2);
  const [shortMonthlyCountInput, setShortMonthlyCountInput] = useState("2");
  const [savingShortLimit, setSavingShortLimit] = useState(false);

  // 90 -> "1 h 30 min", 120 -> "2 h"
  const formatShortLimit = (mins) => formatDuration(mins / 60);

  const fetchShortLeaveSettings = async () => {
    try {
      const res = await API.get("/leave/short-leave-settings");
      const mins = Number(res.data?.max_short_leave_minutes) || 120;
      const count = Number(res.data?.max_short_leaves_per_month) || 2;
      setMaxShortMins(mins);
      setShortHoursInput(String(mins / 60));
      setMaxMonthlyShortCount(count);
      setShortMonthlyCountInput(String(count));
    } catch (err) {
      console.error("Error loading short leave settings:", err);
    }
  };

  const handleSaveShortLimit = async () => {
    const hours = parseFloat(shortHoursInput);
    const count = parseInt(shortMonthlyCountInput);
    if (isNaN(hours) || hours <= 0 || hours > 12) {
      showToast("Please enter valid hours (between 0.5 and 12)", "error");
      return;
    }
    if (isNaN(count) || count < 1 || count > 31) {
      showToast("Please enter a valid monthly leave count (between 1 and 31)", "error");
      return;
    }
    setSavingShortLimit(true);
    try {
      const res = await API.put("/leave/short-leave-settings", {
        max_short_leave_hours: hours,
        max_short_leaves_per_month: count
      });
      setMaxShortMins(res.data.max_short_leave_minutes);
      setMaxMonthlyShortCount(res.data.max_short_leaves_per_month);
      showToast(res.data.message || "Short leave settings updated!");
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update short leave limit", "error");
    } finally {
      setSavingShortLimit(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const res = await API.get("/staff");
      setStaffList(res.data || []);
    } catch (err) {
      console.error("Error loading staff for filter:", err);
    }
  };

  useEffect(() => {
    if (!canRead) return;

    fetchShortLeaveSettings();

    // Load employee personal data
    fetchBalance();
    fetchMyLeaves();
    fetchMyShortLeaves();

    // Load admin approvals & balances only if user has approval/update permission
    if (canApprove) {
      fetchStaff();
      fetchAllLeaves();
      fetchAllShortLeaves();
      fetchAdminSummary();
      fetchAllBalances();
    }

    // Load company policy only if superadmin or company owner
    if (canManagePolicy) {
      fetchCompanyPolicy();
    }
  }, [canRead, canApprove, canManagePolicy]);

  // Submit Leave (Create or Update)
  const handleApplyLeave = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!leaveForm.from_date) errs.from_date = "From Date is required";
    if (!leaveForm.to_date) errs.to_date = "To Date is required";
    if (!leaveForm.reason || !leaveForm.reason.trim()) errs.reason = "Reason is required";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      showToast("Please fill all required fields", "error");
      return;
    }
    setFieldErrors({});

    if (new Date(leaveForm.to_date) < new Date(leaveForm.from_date)) {
      showToast("'To Date' cannot be earlier than 'From Date'!", "error");
      return;
    }


    // Client-side Overlap Check with existing pending/approved leaves
    const reqFrom = leaveForm.from_date;
    const reqTo = leaveForm.to_date;
    const hasOverlap = myLeaves.some(l => {
      if (editingLeaveId && l.id === editingLeaveId) return false;
      if (l.status !== "Pending" && l.status !== "Approved") return false;
      const exFrom = l.from_date ? new Date(l.from_date).toISOString().slice(0, 10) : "";
      const exTo = l.to_date ? new Date(l.to_date).toISOString().slice(0, 10) : exFrom;
      return !(reqTo < exFrom || reqFrom > exTo);
    });

    if (hasOverlap) {
      showToast("You already have an active/pending leave request for this date range!", "error");
      return;
    }

    try {
      setFieldErrors({});
      if (editingLeaveId) {
        const res = await API.put(`/leave/${editingLeaveId}`, leaveForm);
        showToast(res.data.message || "Leave updated successfully!");
        setEditingLeaveId(null);
      } else {
        const res = await API.post("/leave/apply", leaveForm);
        showToast(res.data.message || "Leave applied!");
      }
      setFieldErrors({});
      setLeaveForm({
        leave_type: "Casual Leave",
        from_date: new Date().toISOString().slice(0, 10),
        to_date: new Date().toISOString().slice(0, 10),
        day_type: "Full Day",
        reason: ""
      });
      fetchBalance();
      fetchMyLeaves();
      if (isSuperAdmin) {
        fetchAllLeaves();
        fetchAdminSummary();
      }
    } catch (err) {
      const serverErr = err.response?.data?.error;
      const serverField = err.response?.data?.field;
      if (serverField) {
        setFieldErrors({ [serverField]: serverErr });
      } else if (serverErr) {
        showToast(serverErr, "error");
      } else {
        showToast("Failed to save leave", "error");
      }
    }
  };

  const handleEditLeave = (l) => {
    setEditingLeaveId(l.id);
    setLeaveForm({
      leave_type: l.leave_type || "Casual Leave",
      from_date: l.from_date ? new Date(l.from_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      to_date: l.to_date ? new Date(l.to_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      day_type: l.day_type || "Full Day",
      reason: l.reason || ""
    });
    window.scrollTo({ top: 300, behavior: "smooth" });
  };

  const handleCancelEdit = () => {
    setEditingLeaveId(null);
    setLeaveForm({
      leave_type: "Casual Leave",
      from_date: new Date().toISOString().slice(0, 10),
      to_date: new Date().toISOString().slice(0, 10),
      day_type: "Full Day",
      reason: ""
    });
  };

  const handleDeleteLeave = async () => {
    if (!deleteConfirm.id) return;
    try {
      const res = await API.delete(`/leave/${deleteConfirm.id}`);
      showToast(res.data.message || "Leave application deleted!");
      setDeleteConfirm({ show: false, id: null, status: null });
      fetchBalance();
      fetchMyLeaves();
      if (isSuperAdmin) {
        fetchAllLeaves();
        fetchAdminSummary();
      }
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to delete leave", "error");
    }
  };

  // ── Export Leave Records to CSV / Excel ──
  const handleExportLeavesExcel = () => {
    if (!filteredAllLeaves || filteredAllLeaves.length === 0) {
      showToast("No leave records to export!", "error");
      return;
    }
    const headers = ["Employee Name", "Employee Email", "Leave Type", "From Date", "To Date", "Days", "Day Type", "Reason", "Status", "Applied On"];
    const rows = filteredAllLeaves.map(l => [
      `"${(l.user_name || "").replace(/"/g, '""')}"`,
      `"${(l.user_email || "").replace(/"/g, '""')}"`,
      `"${(l.leave_type || "").replace(/"/g, '""')}"`,
      `"${l.from_date ? new Date(l.from_date).toLocaleDateString() : ""}"`,
      `"${l.to_date ? new Date(l.to_date).toLocaleDateString() : ""}"`,
      `"${l.total_days || 1}"`,
      `"${(l.day_type || "Full Day").replace(/"/g, '""')}"`,
      `"${(l.reason || "").replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`,
      `"${(l.status || "").replace(/"/g, '""')}"`,
      `"${l.created_at ? new Date(l.created_at).toLocaleDateString() : ""}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const selectedEmp = staffList.find(s => String(s._id || s.id) === String(leaveEmployeeFilter) || s.email === leaveEmployeeFilter);
    const empNameSlug = selectedEmp ? `_${(selectedEmp.name || selectedEmp.email).replace(/[^a-zA-Z0-9]/g, '_')}` : "";
    link.setAttribute("href", url);
    link.setAttribute("download", `Leave_Report${empNameSlug}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Leave report downloaded as Excel/CSV successfully!", "success");
  };

  // ── Export Leave Records to PDF ──
  const handleExportLeavesPdf = () => {
    if (!filteredAllLeaves || filteredAllLeaves.length === 0) {
      showToast("No leave records to export!", "error");
      return;
    }

    const selectedEmp = staffList.find(s => String(s._id || s.id) === String(leaveEmployeeFilter) || s.email === leaveEmployeeFilter);
    const filterTitle = selectedEmp ? `Leave History for ${selectedEmp.name || selectedEmp.email}` : "All Employee Leave Requests Report";
    const empNameSlug = selectedEmp ? `_${(selectedEmp.name || selectedEmp.email).replace(/[^a-zA-Z0-9]/g, '_')}` : "";

    const container = document.createElement("div");
    container.style.padding = "24px";
    container.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    container.style.color = "#1e293b";
    container.style.background = "#ffffff";

    const tableRows = filteredAllLeaves.map((l, index) => {
      const statusColor = l.status === "Approved" ? "#16a34a" : l.status === "Rejected" ? "#dc2626" : "#d97706";
      const statusBg = l.status === "Approved" ? "#dcfce7" : l.status === "Rejected" ? "#fee2e2" : "#fef3c7";
      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <td style="padding: 8px 6px;">${index + 1}</td>
          <td style="padding: 8px 6px; font-weight: 600;">
            ${l.user_name || "—"}<br/>
            <span style="font-size: 10px; color: #64748b; font-weight: 400;">${l.user_email || ""}</span>
          </td>
          <td style="padding: 8px 6px;">${l.leave_type || "Leave"}</td>
          <td style="padding: 8px 6px; white-space: nowrap;">
            ${l.from_date ? new Date(l.from_date).toLocaleDateString() : ""}
            ${l.to_date && l.to_date !== l.from_date ? ` to ${new Date(l.to_date).toLocaleDateString()}` : ""}
          </td>
          <td style="padding: 8px 6px; text-align: center; font-weight: 600;">${l.total_days || 1}</td>
          <td style="padding: 8px 6px; max-width: 200px;">${(l.reason || "").replace(/</g, "&lt;")}</td>
          <td style="padding: 8px 6px; text-align: center;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; color: ${statusColor}; background: ${statusBg};">
              ${l.status}
            </span>
          </td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div style="margin-bottom: 20px; border-bottom: 2px solid #3b82f6; padding-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <h2 style="margin: 0 0 6px 0; font-size: 20px; color: #0f172a; font-weight: 800;">Padya Soft — Leave Records</h2>
          <div style="font-size: 13px; color: #475569; font-weight: 600;">${filterTitle}</div>
        </div>
        <div style="text-align: right; font-size: 11px; color: #64748b;">
          <div>Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
          <div>Total Records: ${filteredAllLeaves.length}</div>
          ${leaveStatusFilter ? `<div>Status Filter: <strong>${leaveStatusFilter}</strong></div>` : ""}
        </div>
      </div>
      <table style="width: 100%; border-collapse: collapse; text-align: left; margin-top: 10px;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155; font-size: 11px; font-weight: 700; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 8px 6px; width: 30px;">#</th>
            <th style="padding: 8px 6px;">Employee</th>
            <th style="padding: 8px 6px;">Leave Type</th>
            <th style="padding: 8px 6px;">Duration</th>
            <th style="padding: 8px 6px; text-align: center;">Days</th>
            <th style="padding: 8px 6px;">Reason</th>
            <th style="padding: 8px 6px; text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `Leave_Report${empNameSlug}_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "landscape" }
    };

    html2pdf().set(opt).from(container).save().then(() => {
      showToast("Leave report downloaded as PDF successfully!", "success");
    }).catch(err => {
      console.error("PDF generation failed:", err);
      showToast("Failed to generate PDF. Please try again.", "error");
    });
  };

  // ── Export Short Leave Records to CSV / Excel ──
  const handleExportShortLeavesExcel = () => {
    if (!filteredAllShortLeaves || filteredAllShortLeaves.length === 0) {
      showToast("No short leave records to export!", "error");
      return;
    }
    const headers = ["Employee Name", "Employee Email", "Date", "From Time", "To Time", "Duration (Hours)", "Reason", "Status", "Applied On"];
    const rows = filteredAllShortLeaves.map(sl => [
      `"${(sl.user_name || "").replace(/"/g, '""')}"`,
      `"${(sl.user_email || "").replace(/"/g, '""')}"`,
      `"${sl.date ? new Date(sl.date).toLocaleDateString() : ""}"`,
      `"${sl.from_time || ""}"`,
      `"${sl.to_time || ""}"`,
      `"${sl.hours || (sl.duration_minutes ? (sl.duration_minutes / 60).toFixed(1) : "") || ""}"`,
      `"${(sl.reason || "").replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`,
      `"${(sl.status || "Pending").replace(/"/g, '""')}"`,
      `"${sl.created_at ? new Date(sl.created_at).toLocaleDateString() : ""}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const selectedEmp = staffList.find(s => String(s._id || s.id) === String(shortLeaveEmployeeFilter) || s.email === shortLeaveEmployeeFilter);
    const empNameSlug = selectedEmp ? `_${(selectedEmp.name || selectedEmp.email).replace(/[^a-zA-Z0-9]/g, '_')}` : "";
    link.setAttribute("href", url);
    link.setAttribute("download", `Short_Leave_Report${empNameSlug}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Short leave report downloaded as Excel/CSV successfully!", "success");
  };

  // ── Export Short Leave Records to PDF ──
  const handleExportShortLeavesPdf = () => {
    if (!filteredAllShortLeaves || filteredAllShortLeaves.length === 0) {
      showToast("No short leave records to export!", "error");
      return;
    }

    const selectedEmp = staffList.find(s => String(s._id || s.id) === String(shortLeaveEmployeeFilter) || s.email === shortLeaveEmployeeFilter);
    const filterTitle = selectedEmp ? `Short Leave History for ${selectedEmp.name || selectedEmp.email}` : "All Employee Short Leave Requests Report";
    const empNameSlug = selectedEmp ? `_${(selectedEmp.name || selectedEmp.email).replace(/[^a-zA-Z0-9]/g, '_')}` : "";

    const container = document.createElement("div");
    container.style.padding = "24px";
    container.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    container.style.color = "#1e293b";
    container.style.background = "#ffffff";

    const tableRows = filteredAllShortLeaves.map((sl, index) => {
      const statusColor = sl.status === "Approved" ? "#16a34a" : sl.status === "Rejected" ? "#dc2626" : "#d97706";
      const statusBg = sl.status === "Approved" ? "#dcfce7" : sl.status === "Rejected" ? "#fee2e2" : "#fef3c7";
      const durText = sl.duration_minutes ? formatDuration(sl.duration_minutes) : `${sl.hours || 0} hrs`;
      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <td style="padding: 8px 6px;">${index + 1}</td>
          <td style="padding: 8px 6px; font-weight: 600;">
            ${sl.user_name || "—"}<br/>
            <span style="font-size: 10px; color: #64748b; font-weight: 400;">${sl.user_email || ""}</span>
          </td>
          <td style="padding: 8px 6px; white-space: nowrap;">
            ${sl.date ? new Date(sl.date).toLocaleDateString() : ""}
          </td>
          <td style="padding: 8px 6px; white-space: nowrap;">
            ${sl.from_time || ""} - ${sl.to_time || ""}
          </td>
          <td style="padding: 8px 6px; text-align: center; font-weight: 600;">${durText}</td>
          <td style="padding: 8px 6px; max-width: 220px;">${(sl.reason || "").replace(/</g, "&lt;")}</td>
          <td style="padding: 8px 6px; text-align: center;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; color: ${statusColor}; background: ${statusBg};">
              ${sl.status || "Pending"}
            </span>
          </td>
        </tr>
      `;
    }).join("");

    container.innerHTML = `
      <div style="margin-bottom: 20px; border-bottom: 2px solid #8b5cf6; padding-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <h2 style="margin: 0 0 6px 0; font-size: 20px; color: #0f172a; font-weight: 800;">Padya Soft — Short Leave Records</h2>
          <div style="font-size: 13px; color: #475569; font-weight: 600;">${filterTitle}</div>
        </div>
        <div style="text-align: right; font-size: 11px; color: #64748b;">
          <div>Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
          <div>Total Records: ${filteredAllShortLeaves.length}</div>
          ${shortLeaveStatusFilter ? `<div>Status Filter: <strong>${shortLeaveStatusFilter}</strong></div>` : ""}
        </div>
      </div>
      <table style="width: 100%; border-collapse: collapse; text-align: left; margin-top: 10px;">
        <thead>
          <tr style="background: #f1f5f9; color: #334155; font-size: 11px; font-weight: 700; border-bottom: 2px solid #cbd5e1;">
            <th style="padding: 8px 6px; width: 30px;">#</th>
            <th style="padding: 8px 6px;">Employee</th>
            <th style="padding: 8px 6px;">Date</th>
            <th style="padding: 8px 6px;">Time Window</th>
            <th style="padding: 8px 6px; text-align: center;">Duration</th>
            <th style="padding: 8px 6px;">Reason</th>
            <th style="padding: 8px 6px; text-align: center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `Short_Leave_Report${empNameSlug}_${new Date().toISOString().slice(0, 10)}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "a4", orientation: "landscape" }
    };

    html2pdf().set(opt).from(container).save().then(() => {
      showToast("Short leave report downloaded as PDF successfully!", "success");
    }).catch(err => {
      console.error("PDF generation failed:", err);
      showToast("Failed to generate PDF. Please try again.", "error");
    });
  };

  const openAdminEdit = (l) => {
    setAdminEdit({
      show: true,
      leave: l,
      form: {
        leave_type: l.leave_type || "Casual Leave",
        from_date: String(l.from_date || "").slice(0, 10),
        to_date: String(l.to_date || "").slice(0, 10),
        day_type: l.day_type || "Full Day",
        reason: l.reason || ""
      },
      error: "",
      saving: false
    });
  };

  const handleAdminSaveLeave = async () => {
    const { leave, form } = adminEdit;
    if (!form.from_date || !form.to_date || !form.reason.trim()) {
      setAdminEdit((prev) => ({ ...prev, error: "From Date, To Date and Reason are required." }));
      return;
    }
    if (form.to_date < form.from_date) {
      setAdminEdit((prev) => ({ ...prev, error: "'To Date' cannot be earlier than 'From Date'!" }));
      return;
    }
    setAdminEdit((prev) => ({ ...prev, saving: true, error: "" }));
    try {
      const res = await API.put(`/leave/${leave.id}`, form);
      showToast(res.data.message || "Leave updated successfully!");
      setAdminEdit({ show: false, leave: null, form: null, error: "", saving: false });
      fetchAllLeaves();
      fetchAdminSummary();
      fetchBalance();
      fetchMyLeaves();
    } catch (err) {
      setAdminEdit((prev) => ({ ...prev, saving: false, error: err.response?.data?.error || "Failed to update leave" }));
    }
  };

  // Submit Short Leave (Create or Update — directly approved!)
  const handleApplyShortLeave = async (e) => {
    e.preventDefault();
    if (!shortLeaveForm.date || !shortLeaveForm.from_time || !shortLeaveForm.to_time) {
      showToast("Date, From Time and To Time are required", "error");
      return;
    }
    if (!shortLeaveForm.reason || !shortLeaveForm.reason.trim()) {
      showToast("Reason is required", "error");
      return;
    }
    const sErrs = {};
    if (!shortLeaveForm.date) sErrs.date = "Plese enter date";
    if (!shortLeaveForm.from_time) sErrs.from_time = "Plese enter from time";
    if (!shortLeaveForm.to_time) sErrs.to_time = "Plese enter to time";
    if (!shortLeaveForm.reason || !shortLeaveForm.reason.trim()) sErrs.reason = "Plese enter reason";
    if (Object.keys(sErrs).length > 0) {
      setShortLeaveFieldErrors(sErrs);
      return;
    }

    const [fH, fM] = shortLeaveForm.from_time.split(":").map(Number);
    const [tH, tM] = shortLeaveForm.to_time.split(":").map(Number);
    const startMins = fH * 60 + fM;
    const endMins = tH * 60 + tM;

    if (endMins <= startMins) {
      showToast("To Time must be later than From Time", "error");
      return;
    }

    const diffMins = endMins - startMins;
    if (diffMins > maxShortMins) {
      showToast(`Short leave cannot exceed ${formatShortLimit(maxShortMins)}!`, "error");
      return;
    }

    try {
      if (editingShortLeaveId) {
        await API.put(`/leave/short-leave/${editingShortLeaveId}`, shortLeaveForm);
        showToast("Short Leave updated successfully!");
        setEditingShortLeaveId(null);
      } else {
        await API.post("/leave/short-leave", shortLeaveForm);
        showToast("Short Leave applied! Awaiting Super Admin approval.");
      }
      setShortLeaveForm({
        date: new Date().toISOString().slice(0, 10),
        from_time: "14:00",
        to_time: "16:00",
        hours: 2,
        reason: ""
      });
      fetchMyShortLeaves();
      if (canApprove) {
        fetchAllShortLeaves();
        fetchAdminSummary();
      }
      setShortLeaveFieldErrors({});
    } catch (err) {
      const serverErr = err.response?.data?.error;
      const serverField = err.response?.data?.field;
      if (serverField) {
        setShortLeaveFieldErrors({ [serverField]: serverErr });
      } else if (serverErr) {
        showToast(serverErr, "error");
      } else {
        showToast("Failed to save short leave", "error");
      }
    }
  };

  const handleEditShortLeave = (sl) => {
    setEditingShortLeaveId(sl.id);
    setShortLeaveForm({
      date: sl.date ? new Date(sl.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      from_time: sl.from_time || "14:00",
      to_time: sl.to_time || "16:00",
      hours: sl.hours || 2,
      reason: sl.reason || ""
    });
    window.scrollTo({ top: 300, behavior: "smooth" });
  };

  const handleCancelEditShortLeave = () => {
    setEditingShortLeaveId(null);
    setShortLeaveForm({
      date: new Date().toISOString().slice(0, 10),
      from_time: "14:00",
      to_time: "16:00",
      hours: 2,
      reason: ""
    });
  };

  const handleDeleteShortLeave = async () => {
    if (!deleteShortConfirm.id) return;
    try {
      await API.delete(`/leave/short-leave/${deleteShortConfirm.id}`);
      showToast("Short Leave deleted successfully!");
      setDeleteShortConfirm({ show: false, id: null });
      fetchMyShortLeaves();
      if (canApprove) fetchAllShortLeaves();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to delete short leave", "error");
    }
  };

  // Super Admin: open edit popup for any employee's short leave
  const openAdminEditShort = (sl) => {
    setAdminEditShortError("");
    setAdminEditShort({
      id: sl.id,
      user_name: sl.user_name || "Employee",
      status: sl.status,
      date: sl.date ? String(sl.date).slice(0, 10) : "",
      from_time: String(sl.from_time || "").slice(0, 5),
      to_time: String(sl.to_time || "").slice(0, 5),
      reason: sl.reason || ""
    });
  };

  const handleSaveAdminShort = async () => {
    if (!adminEditShort) return;
    const { id, date, from_time, to_time, reason } = adminEditShort;
    if (!date || !from_time || !to_time || !reason.trim()) {
      setAdminEditShortError("Plese fill date, from time, to time and reason");
      return;
    }
    setSavingAdminShort(true);
    try {
      const res = await API.put(`/leave/short-leave/${id}`, { date, from_time, to_time, reason: reason.trim() });
      showToast(res.data?.message || "Short leave updated successfully!");
      setAdminEditShort(null);
      setAdminEditShortError("");
      fetchAllShortLeaves();
      fetchMyShortLeaves();
    } catch (err) {
      setAdminEditShortError(err.response?.data?.error || "Failed to update short leave");
    } finally {
      setSavingAdminShort(false);
    }
  };

  // Super Admin Action: Trigger confirmation popup for Approve / Reject
  const triggerLeaveActionConfirm = (id, action, userName) => {
    setActionConfirm({
      show: true,
      id,
      type: "leave",
      action,
      userName: userName || "this employee"
    });
  };

  const triggerShortLeaveActionConfirm = (id, action, userName) => {
    setActionConfirm({
      show: true,
      id,
      type: "shortleave",
      action,
      userName: userName || "this employee"
    });
  };

  const handleConfirmAction = async () => {
    const { id, type, action } = actionConfirm;
    setActionConfirm(prev => ({ ...prev, show: false }));
    if (!id) return;
    if (type === "leave") {
      await handleLeaveAction(id, action);
    } else {
      await handleShortLeaveAction(id, action);
    }
  };

  // Super Admin Action: Approve / Reject Full Leave
  const handleLeaveAction = async (id, action, force = false) => {
    try {
      await API.patch(`/leave/${id}/action`, { action, force });
      showToast(`Leave request ${action}!`);
      fetchAllLeaves();
      fetchAdminSummary();
      fetchMyLeaves();
      fetchBalance();
      if (canApprove) fetchAllBalances();
    } catch (err) {
      // Balance is lower than the leave -> let Admin decide
      if (err?.response?.status === 409 && err.response.data?.insufficientBalance) {
        setLowBalanceConfirm({ show: true, id, message: err.response.data.message });
        return;
      }
      showToast(err?.response?.data?.error || "Action failed", "error");
    }
  };

  // Super Admin Action: Approve / Reject Short Leave
  const handleShortLeaveAction = async (id, action) => {
    try {
      await API.patch(`/leave/short-leave/${id}/action`, { action });
      showToast(`Short leave request ${action}!`);
      fetchAllShortLeaves();
      fetchAdminSummary();
      fetchMyShortLeaves();
    } catch (err) {
      showToast(err?.response?.data?.error || "Action failed", "error");
    }
  };

  if (!canRead) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p>You do not have permission to view Leave Management.</p>
      </div>
    );
  }

  return (
    <div className="task-page" style={{ padding: "24px" }}>
      {/* HEADER */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#1e293b", margin: 0 }}>
          Leave & Absence Management
        </h1>
        <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px" }}>
          {canApprove
            ? "Manager / Admin Portal: Review, approve, or reject employee leave applications and monitor company absences."
            : "Employee Portal: Apply for Casual, Sick, Privilege Leave or Short Leaves with automated attendance integration."}
        </p>
      </div>

      {/* TOP SUMMARY CARDS */}
      {(isSuperAdmin || isCompanyOwner) ? (
        /* SUPER ADMIN / OWNER OVERVIEW CARDS */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "28px" }}>
          <div style={{ background: "var(--ui-surface, #ffffff)", padding: "18px 20px", borderRadius: "12px", border: "1px solid var(--ui-border, #fed7aa)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#f97316", textTransform: "uppercase" }}>Pending Approval</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#fb923c", marginTop: "4px" }}>
              {adminSummary.pendingCount} <span style={{ fontSize: "14px", color: "var(--text-muted, #64748b)", fontWeight: "500" }}>Requests</span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted, #9a3412)", marginTop: "4px" }}>Requires your review & decision</div>
          </div>

          <div style={{ background: "var(--ui-surface, #ffffff)", padding: "18px 20px", borderRadius: "12px", border: "1px solid var(--ui-border, #bbf7d0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#10b981", textTransform: "uppercase" }}>Approved (This Month)</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#34d399", marginTop: "4px" }}>
              {adminSummary.approvedThisMonth} <span style={{ fontSize: "14px", color: "var(--text-muted, #64748b)", fontWeight: "500" }}>Leaves</span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted, #166534)", marginTop: "4px" }}>Current calendar month</div>
          </div>

          <div style={{ background: "var(--ui-surface, #ffffff)", padding: "18px 20px", borderRadius: "12px", border: "1px solid var(--ui-border, #bae6fd)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#0ea5e9", textTransform: "uppercase" }}>On Leave Today</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#38bdf8", marginTop: "4px" }}>
              {adminSummary.onLeaveToday} <span style={{ fontSize: "14px", color: "var(--text-muted, #64748b)", fontWeight: "500" }}>Staff</span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted, #075985)", marginTop: "4px" }}>Active on-leave employees today</div>
          </div>

          <div style={{ background: "var(--ui-surface, #ffffff)", padding: "18px 20px", borderRadius: "12px", border: "1px solid var(--ui-border, #fecaca)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#ef4444", textTransform: "uppercase" }}>Rejected Leaves</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: "#f87171", marginTop: "4px" }}>
              {adminSummary.rejectedCount} <span style={{ fontSize: "14px", color: "var(--text-muted, #64748b)", fontWeight: "500" }}>Requests</span>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted, #991b1b)", marginTop: "4px" }}>Disapproved requests</div>
          </div>
        </div>
      ) : (
        /* ALL EMPLOYEES & DEVELOPERS: PERSONAL LEAVE BALANCES (CL, SL, PL, Comp-Off) */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "28px" }}>
          <div style={{ background: "var(--ui-surface, #ffffff)", padding: "18px 20px", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#4f46e5", textTransform: "uppercase" }}>Casual Leave (CL)</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: balance.cl_balance < 0 ? "#dc2626" : "var(--text-main, #1e293b)", marginTop: "4px" }}>{balance.cl_balance} <span style={{ fontSize: "14px", color: "var(--text-muted, #64748b)", fontWeight: "500" }}>Days</span></div>
            <div style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)", marginTop: "4px" }}>Annual quota balance</div>
          </div>

          <div style={{ background: "var(--ui-surface, #ffffff)", padding: "18px 20px", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#16a34a", textTransform: "uppercase" }}>Sick Leave (SL)</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: balance.sl_balance < 0 ? "#dc2626" : "var(--text-main, #1e293b)", marginTop: "4px" }}>{balance.sl_balance} <span style={{ fontSize: "14px", color: "var(--text-muted, #64748b)", fontWeight: "500" }}>Days</span></div>
            <div style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)", marginTop: "4px" }}>Medical certificate if &gt; 2 days</div>
          </div>

          <div style={{ background: "var(--ui-surface, #ffffff)", padding: "18px 20px", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#f97316", textTransform: "uppercase" }}>Privilege Leave (PL)</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: balance.pl_balance < 0 ? "#dc2626" : "var(--text-main, #1e293b)", marginTop: "4px" }}>{balance.pl_balance} <span style={{ fontSize: "14px", color: "var(--text-muted, #64748b)", fontWeight: "500" }}>Days</span></div>
            <div style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)", marginTop: "4px" }}>Earned & Planned leaves</div>
          </div>

          <div style={{ background: "var(--ui-surface, #ffffff)", padding: "18px 20px", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: "12px", fontWeight: "700", color: "#06b6d4", textTransform: "uppercase" }}>Comp-Off</div>
            <div style={{ fontSize: "28px", fontWeight: "800", color: balance.comp_off < 0 ? "#dc2626" : "var(--text-main, #1e293b)", marginTop: "4px" }}>{balance.comp_off} <span style={{ fontSize: "14px", color: "var(--text-muted, #64748b)", fontWeight: "500" }}>Days</span></div>
            <div style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)", marginTop: "4px" }}>Against weekend work</div>
          </div>
        </div>
      )}

      {/* TABS */}
      <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid var(--ui-border, #e2e8f0)", marginBottom: "20px", flexWrap: "wrap" }}>
        {/* TAB 1: Apply Leave (Employees/Managers only — Super Admin does not apply leave) */}
        {!isSuperAdmin && canCreate && (
          <button
            onClick={() => setActiveTab("apply")}
            style={{
              padding: "10px 20px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "apply" ? "3px solid #4f46e5" : "none",
              fontWeight: activeTab === "apply" ? "700" : "500",
              color: activeTab === "apply" ? "#818cf8" : "var(--text-muted, #64748b)",
              cursor: "pointer",
              fontSize: "15px"
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <EditIcon size={15} /> Apply Leave & History
            </span>
          </button>
        )}

        {/* TAB 2: Short Leave (Employees/Managers only — Super Admin does not apply leave) */}
        {!isSuperAdmin && canCreate && (
          <button
            onClick={() => setActiveTab("shortleave")}
            style={{
              padding: "10px 20px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "shortleave" ? "3px solid #06b6d4" : "none",
              fontWeight: activeTab === "shortleave" ? "700" : "500",
              color: activeTab === "shortleave" ? "#22d3ee" : "var(--text-muted, #64748b)",
              cursor: "pointer",
              fontSize: "15px"
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <TimerIcon size={16} /> Short Leave ({formatShortLimit(maxShortMins)})
            </span>
          </button>
        )}

        {/* TAB 3: Leave Approvals (Requires Update/Approval Permission) */}
        {canApprove && (
          <button
            onClick={() => setActiveTab("approvals")}
            style={{
              padding: "10px 20px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "approvals" ? "3px solid #16a34a" : "none",
              fontWeight: activeTab === "approvals" ? "700" : "500",
              color: activeTab === "approvals" ? "#34d399" : "var(--text-muted, #64748b)",
              cursor: "pointer",
              fontSize: "15px"
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <ShieldIcon size={16} /> Pending Leave Approvals ({allLeaves.filter(l => l.status === "Pending").length})
            </span>
          </button>
        )}

        {/* TAB 3.5: Short Leave Approvals (Next to Leave Approvals for Super Admin) */}
        {canApprove && (
          <button
            onClick={() => setActiveTab("shortleave-approvals")}
            style={{
              padding: "10px 20px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "shortleave-approvals" ? "3px solid #06b6d4" : "none",
              fontWeight: activeTab === "shortleave-approvals" ? "700" : "500",
              color: activeTab === "shortleave-approvals" ? "#22d3ee" : "var(--text-muted, #64748b)",
              cursor: "pointer",
              fontSize: "15px"
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <TimerIcon size={16} /> Pending Short Leave Approvals ({allShortLeaves.filter(sl => sl.status === "Pending").length})
            </span>
          </button>
        )}

        {/* TAB 4: Company Leave Policy (Requires Admin/Owner) */}
        {canManagePolicy && (
          <button
            onClick={() => setActiveTab("manage-balances")}
            style={{
              padding: "10px 20px",
              background: "none",
              border: "none",
              borderBottom: activeTab === "manage-balances" ? "3px solid #4f46e5" : "none",
              fontWeight: activeTab === "manage-balances" ? "700" : "500",
              color: activeTab === "manage-balances" ? "#818cf8" : "var(--text-muted, #64748b)",
              cursor: "pointer",
              fontSize: "15px"
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <EditIcon size={15} /> Company Leave Policy (Global Rule)
            </span>
          </button>
        )}
      </div>

      {/* TAB 1: APPLY LEAVE */}
      {activeTab === "apply" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
          {/* FORM */}
          <div style={{ background: "var(--ui-surface, #fff)", padding: "24px", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "17px", fontWeight: "700", color: "var(--text-main, #1e293b)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{editingLeaveId ? "Edit Leave Application" : "Apply for Leave"}</span>
              {editingLeaveId && (
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  style={{
                    fontSize: "12px",
                    color: "#dc2626",
                    background: "rgba(220, 38, 38, 0.1)",
                    border: "none",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: "600"
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </h3>
            <form noValidate onSubmit={handleApplyLeave} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)" }}>Leave Type</label>
                <select
                  value={leaveForm.leave_type}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", marginTop: "4px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                >
                  <option value="Casual Leave">Casual Leave (CL)</option>
                  <option value="Sick Leave">Sick Leave (SL)</option>
                  <option value="Privilege Leave">Privilege Leave (PL)</option>
                  <option value="Comp-Off">Comp-Off</option>
                  <option value="Unpaid Leave">Unpaid Leave (LOP)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)" }}>Day Type</label>
                <select
                  value={leaveForm.day_type}
                  onChange={(e) => setLeaveForm({ ...leaveForm, day_type: e.target.value })}
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", marginTop: "4px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                >
                  <option value="Full Day">Full Day</option>
                  <option value="First Half">First Half (Half Day)</option>
                  <option value="Second Half">Second Half (Half Day)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)" }}>
                  From Date <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
                </label>
                <input
                  type="date"
                  required
                  value={leaveForm.from_date}
                  onChange={(e) => {
                    const newFrom = e.target.value;
                    setLeaveForm(prev => ({
                      ...prev,
                      from_date: newFrom,
                      to_date: prev.to_date < newFrom ? newFrom : prev.to_date
                    }));
                    if (fieldErrors.from_date) setFieldErrors({ ...fieldErrors, from_date: null });
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: fieldErrors.from_date ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    marginTop: "4px",
                    background: fieldErrors.from_date ? "#fff5f5" : "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                />
                {fieldErrors.from_date && (
                  <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                    {fieldErrors.from_date}
                  </span>
                )}
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)" }}>
                  To Date <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
                </label>
                <input
                  type="date"
                  required
                  value={leaveForm.to_date}
                  onChange={(e) => {
                    setLeaveForm({ ...leaveForm, to_date: e.target.value });
                    if (fieldErrors.to_date) setFieldErrors({ ...fieldErrors, to_date: null });
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: fieldErrors.to_date ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    marginTop: "4px",
                    background: fieldErrors.to_date ? "#fff5f5" : "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                />
                {fieldErrors.to_date && (
                  <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                    {fieldErrors.to_date}
                  </span>
                )}
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)" }}>
                  Reason <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
                </label>
                <textarea
                  rows="3"
                  placeholder="State the reason for leave..."
                  required
                  value={leaveForm.reason}
                  onChange={(e) => {
                    setLeaveForm({ ...leaveForm, reason: e.target.value });
                    if (fieldErrors.reason) setFieldErrors({ ...fieldErrors, reason: null });
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: fieldErrors.reason ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    marginTop: "4px",
                    background: fieldErrors.reason ? "#fff5f5" : "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                />
                {fieldErrors.reason && (
                  <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                    {fieldErrors.reason}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    background: editingLeaveId ? "#0284c7" : "#4f46e5",
                    color: "#fff",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "none",
                    fontWeight: "700",
                    cursor: "pointer"
                  }}
                >
                  {editingLeaveId ? "Update Application" : "Submit Application"}
                </button>
                {editingLeaveId && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    style={{
                      background: "#f1f5f9",
                      color: "#475569",
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontWeight: "600",
                      cursor: "pointer"
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* MY LEAVES TABLE */}
          <div className="table-container" style={{ background: "var(--ui-surface, #fff)", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", overflowX: "auto", WebkitOverflowScrolling: "touch", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", width: "100%" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ui-border, #e2e8f0)", fontWeight: "700", color: "var(--text-main, #1e293b)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <span>My Leave History</span>
            </div>
            <table style={{ width: "100%", minWidth: "650px", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #475569)", fontSize: "13px" }}>
                  <th style={{ padding: "12px 16px" }}>Leave Type</th>
                  <th style={{ padding: "12px 16px" }}>Dates</th>
                  <th style={{ padding: "12px 16px" }}>Days</th>
                  <th style={{ padding: "12px 16px" }}>Reason</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  {(canUpdate || canDelete) && (
                    <th style={{ padding: "12px 16px", textAlign: "center" }}>Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {myLeaves.length === 0 ? (
                  <tr><td colSpan={(canUpdate || canDelete) ? 6 : 5} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>No leaves applied yet.</td></tr>
                ) : (
                  paginatedMyLeaves.map(l => (
                    <tr key={l.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)", fontSize: "13px" }}>
                      <td style={{ padding: "12px 16px", fontWeight: "600", color: "var(--text-main, #1e293b)" }}>{l.leave_type}</td>
                      <td style={{ padding: "12px 16px", color: "var(--text-main, #334155)" }}>
                        {new Date(l.from_date).toLocaleDateString()} - {new Date(l.to_date).toLocaleDateString()}
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: "600", color: "var(--text-main, #1e293b)" }}>{l.total_days} day(s)</td>
                      <td style={{ padding: "12px 16px", color: "var(--text-muted, #94a3b8)" }}>{l.reason}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "700",
                          background: l.status === "Approved" ? "rgba(16, 185, 129, 0.15)" : l.status === "Pending" ? "rgba(245, 158, 11, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: l.status === "Approved" ? "#10b981" : l.status === "Pending" ? "#f59e0b" : "#ef4444"
                        }}>
                          {l.status}
                        </span>
                      </td>
                      {(canUpdate || canDelete) && (
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          {l.status === "Pending" ? (
                            <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                              {canUpdate && (
                                <button
                                  type="button"
                                  onClick={() => handleEditLeave(l)}
                                  title="Edit Application"
                                  className="action-btn"
                                >
                                  <EditIcon size={14} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirm({ show: true, id: l.id })}
                                  title="Delete / Cancel Application"
                                  className="action-btn delete"
                                >
                                  <TrashIcon size={14} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)" }}>
                              {l.status === "Approved" ? "Approved" : "Rejected"}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={myLeavesPage}
              totalRecords={myLeaves.length}
              pageSize={myLeavesPageSize}
              onPageChange={setMyLeavesPage}
            />
          </div>
        </div>
      )}

      {/* TAB 2: SHORT LEAVE */}
      {activeTab === "shortleave" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
          <div style={{ background: "var(--ui-surface, #fff)", padding: "24px", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "17px", fontWeight: "700", color: "var(--text-main, #1e293b)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{editingShortLeaveId ? "Edit Short Leave" : "Log Short Leave (Max 2 Hrs)"}</span>
              {editingShortLeaveId && (
                <button
                  type="button"
                  onClick={handleCancelEditShortLeave}
                  style={{
                    fontSize: "12px",
                    color: "#dc2626",
                    background: "rgba(220, 38, 38, 0.1)",
                    border: "none",
                    padding: "4px 8px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: "600"
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </h3>
            <form noValidate onSubmit={handleApplyShortLeave} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)" }}>
                  Date <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
                </label>
                <input
                  type="date"
                  required
                  value={shortLeaveForm.date}
                  onChange={(e) => {
                    setShortLeaveForm({ ...shortLeaveForm, date: e.target.value });
                    if (shortLeaveFieldErrors.date) setShortLeaveFieldErrors(prev => ({ ...prev, date: null }));
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: shortLeaveFieldErrors.date ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    marginTop: "4px",
                    background: shortLeaveFieldErrors.date ? "#fff5f5" : "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                />
                {shortLeaveFieldErrors.date && (
                  <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                    {shortLeaveFieldErrors.date}
                  </span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)" }}>
                    From Time <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={shortLeaveForm.from_time}
                    onChange={(e) => {
                      setShortLeaveForm({ ...shortLeaveForm, from_time: e.target.value });
                      if (shortLeaveFieldErrors.from_time) setShortLeaveFieldErrors(prev => ({ ...prev, from_time: null }));
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: shortLeaveFieldErrors.from_time ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                      borderRadius: "6px",
                      marginTop: "4px",
                      background: shortLeaveFieldErrors.from_time ? "#fff5f5" : "var(--ui-surface, #fff)",
                      color: "var(--text-main, #1e293b)"
                    }}
                  />
                  {shortLeaveFieldErrors.from_time && (
                    <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                      {shortLeaveFieldErrors.from_time}
                    </span>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)" }}>
                    To Time <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
                  </label>
                  <input
                    type="time"
                    required
                    value={shortLeaveForm.to_time}
                    onChange={(e) => {
                      setShortLeaveForm({ ...shortLeaveForm, to_time: e.target.value });
                      if (shortLeaveFieldErrors.to_time) setShortLeaveFieldErrors(prev => ({ ...prev, to_time: null }));
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: shortLeaveFieldErrors.to_time ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                      borderRadius: "6px",
                      marginTop: "4px",
                      background: shortLeaveFieldErrors.to_time ? "#fff5f5" : "var(--ui-surface, #fff)",
                      color: "var(--text-main, #1e293b)"
                    }}
                  />
                  {shortLeaveFieldErrors.to_time && (
                    <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                      {shortLeaveFieldErrors.to_time}
                    </span>
                  )}
                </div>
              </div>

              {/* Real-time duration helper */}
              {shortLeaveForm.from_time && shortLeaveForm.to_time && (() => {
                const [fH, fM] = shortLeaveForm.from_time.split(":").map(Number);
                const [tH, tM] = shortLeaveForm.to_time.split(":").map(Number);
                const startM = fH * 60 + fM;
                const endM = tH * 60 + tM;
                const diffM = endM - startM;

                if (diffM <= 0) {
                  return (
                    <div style={{ fontSize: "12px", color: "#dc2626", fontWeight: "500", marginTop: "-4px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <IconAlertTriangle size={14} color="#dc2626" />
                      <span>"To Time" must be after "From Time"</span>
                    </div>
                  );
                }
                if (diffM > maxShortMins) {
                  return (
                    <div style={{ fontSize: "12px", color: "#dc2626", fontWeight: "600", marginTop: "-4px", background: "rgba(220, 38, 38, 0.08)", padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(220, 38, 38, 0.2)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <IconAlertTriangle size={14} color="#dc2626" />
                      <span>Selected duration: {formatDuration(diffM / 60)}. Short leave cannot exceed {formatShortLimit(maxShortMins)}!</span>
                    </div>
                  );
                }
                return (
                  <div style={{ fontSize: "12px", color: "#0284c7", fontWeight: "500", marginTop: "-4px", display: "flex", alignItems: "center", gap: "6px" }}>
                    <IconInfo size={14} color="#0284c7" />
                    <span>Duration: {formatDuration(diffM / 60)} — valid (max {formatShortLimit(maxShortMins)} allowed)</span>
                  </div>
                );
              })()}

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)" }}>
                  Reason <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
                </label>
                <textarea
                  rows="2"
                  placeholder="Doctor, Bank, Personal errand..."
                  required
                  value={shortLeaveForm.reason}
                  onChange={(e) => {
                    setShortLeaveForm({ ...shortLeaveForm, reason: e.target.value });
                    if (shortLeaveFieldErrors.reason) setShortLeaveFieldErrors(prev => ({ ...prev, reason: null }));
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: shortLeaveFieldErrors.reason ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    marginTop: "4px",
                    background: shortLeaveFieldErrors.reason ? "#fff5f5" : "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                />
                {shortLeaveFieldErrors.reason && (
                  <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                    {shortLeaveFieldErrors.reason}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "6px" }}>
                <button
                  type="submit"
                  style={{
                    flex: 1,
                    background: "#06b6d4",
                    color: "#fff",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "none",
                    fontWeight: "700",
                    cursor: "pointer"
                  }}
                >
                  {editingShortLeaveId ? "Update Short Leave" : "Log Short Leave"}
                </button>
                {editingShortLeaveId && (
                  <button
                    type="button"
                    onClick={handleCancelEditShortLeave}
                    style={{
                      background: "#f1f5f9",
                      color: "#475569",
                      padding: "10px 16px",
                      borderRadius: "8px",
                      border: "1px solid #cbd5e1",
                      fontWeight: "600",
                      cursor: "pointer"
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="table-container" style={{ background: "var(--ui-surface, #fff)", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", width: "100%", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ui-border, #e2e8f0)", fontWeight: "700", color: "var(--text-main, #1e293b)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <span>My Short Leave History</span>
            </div>
            <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", minWidth: "650px", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #475569)", fontSize: "13px" }}>
                  <th style={{ padding: "12px 16px" }}>Date</th>
                  <th style={{ padding: "12px 16px" }}>Time Window</th>
                  <th style={{ padding: "12px 16px" }}>Duration</th>
                  <th style={{ padding: "12px 16px" }}>Reason</th>
                  <th style={{ padding: "12px 16px" }}>Status</th>
                  {(canUpdate || canDelete) && (
                    <th style={{ padding: "12px 16px", textAlign: "center" }}>Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {myShortLeaves.length === 0 ? (
                  <tr><td colSpan={(canUpdate || canDelete) ? 6 : 5} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>No short leaves taken.</td></tr>
                ) : (
                  myShortLeaves
                    .slice((shortLeavePage - 1) * shortLeavePageSize, shortLeavePage * shortLeavePageSize)
                    .map(sl => (
                    <tr key={sl.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)", fontSize: "13px" }}>
                      <td style={{ padding: "12px 16px", fontWeight: "600", color: "var(--text-main, #1e293b)" }}>{new Date(sl.date).toLocaleDateString()}</td>
                      <td style={{ padding: "12px 16px", color: "var(--text-main, #334155)" }}>{sl.from_time} - {sl.to_time}</td>
                      <td style={{ padding: "12px 16px", fontWeight: "600", color: "var(--text-main, #1e293b)" }}>{formatDuration(sl.hours)}</td>
                      <td style={{ padding: "12px 16px", color: "var(--text-muted, #94a3b8)" }}>{sl.reason}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "12px",
                          fontSize: "11px",
                          fontWeight: "700",
                          background: sl.status === "Approved" ? "rgba(16, 185, 129, 0.15)" : sl.status === "Pending" ? "rgba(245, 158, 11, 0.15)" : "rgba(239, 68, 68, 0.15)",
                          color: sl.status === "Approved" ? "#10b981" : sl.status === "Pending" ? "#f59e0b" : "#ef4444"
                        }}>
                          {sl.status || "Pending"}
                        </span>
                      </td>
                      {(canUpdate || canDelete) && (
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          {sl.status === "Pending" ? (
                            <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                              {canUpdate && (
                                <button
                                  type="button"
                                  onClick={() => handleEditShortLeave(sl)}
                                  title="Edit Short Leave"
                                  className="action-btn"
                                >
                                  <EditIcon size={14} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteShortConfirm({ show: true, id: sl.id })}
                                  title="Delete Short Leave"
                                  className="action-btn delete"
                                >
                                  <TrashIcon size={14} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)" }}>
                              {sl.status === "Approved" ? "Approved" : "Rejected"}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              </table>
            </div>
            <Pagination
              currentPage={shortLeavePage}
              totalRecords={myShortLeaves.length}
              pageSize={shortLeavePageSize}
              onPageChange={setShortLeavePage}
            />
          </div>
        </div>
      )}

      {/* TAB 3: ADMIN APPROVALS */}
      {activeTab === "approvals" && canApprove && (
        <div className="table-container" style={{ background: "var(--ui-surface, #fff)", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ui-border, #e2e8f0)", fontWeight: "700", color: "var(--text-main, #1e293b)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <span>All Employee Leave Requests (Approvals & Decision)</span>
            
            {/* Employee, Status, Start Date & End Date Filter */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {/* Employee Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Employee:</span>
                <select
                  value={leaveEmployeeFilter}
                  onChange={(e) => {
                    const newEmp = e.target.value;
                    setLeaveEmployeeFilter(newEmp);
                    // If a specific employee is chosen and status is currently Pending, automatically set to All so their entire leave history is visible
                    if (newEmp && leaveStatusFilter === "Pending") {
                      setLeaveStatusFilter("All");
                    }
                    setAllLeavesPage(1);
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "12px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    background: "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                >
                  <option value="">All Employees</option>
                  {staffList.map(s => (
                    <option key={s._id || s.id} value={s.email || s._id || s.id}>
                      {s.name || s.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Status:</span>
                <select
                  value={leaveStatusFilter}
                  onChange={(e) => {
                    setLeaveStatusFilter(e.target.value);
                    setAllLeavesPage(1);
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "12px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    background: "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)",
                    fontWeight: "600"
                  }}
                >
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="All">All Statuses</option>
                </select>
              </div>

              {/* Date Filters */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>From:</span>
                <input
                  type="date"
                  value={leaveStartDate}
                  onChange={(e) => {
                    setLeaveStartDate(e.target.value);
                    setAllLeavesPage(1);
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "12px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    background: "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>To:</span>
                <input
                  type="date"
                  value={leaveEndDate}
                  onChange={(e) => {
                    setLeaveEndDate(e.target.value);
                    setAllLeavesPage(1);
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "12px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    background: "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                />
              </div>
              {(leaveStartDate || leaveEndDate || leaveEmployeeFilter || leaveStatusFilter !== "Pending") && (
                <button
                  type="button"
                  onClick={() => {
                    setLeaveStartDate("");
                    setLeaveEndDate("");
                    setLeaveEmployeeFilter("");
                    setLeaveStatusFilter("Pending");
                    setAllLeavesPage(1);
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "11px",
                    border: "none",
                    borderRadius: "6px",
                    background: "#fee2e2",
                    color: "#dc2626",
                    cursor: "pointer",
                    fontWeight: "600"
                  }}
                >
                  Clear Filter
                </button>
              )}

              {/* Download Buttons: PDF & Excel (CSV) */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
                <button
                  type="button"
                  onClick={handleExportLeavesPdf}
                  title="Download Leave Records as PDF"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 12px",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#dc2626",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = "#fee2e2"; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "#fef2f2"; }}
                >
                  <DownloadIcon size={14} color="#dc2626" />
                  <span>PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportLeavesExcel}
                  title="Download Leave Records as Excel / CSV"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 12px",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#16a34a",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = "#dcfce7"; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "#f0fdf4"; }}
                >
                  <DownloadIcon size={14} color="#16a34a" />
                  <span>Excel</span>
                </button>
              </div>
            </div>
          </div>
          <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: "750px", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #475569)", fontSize: "13px" }}>
                <th onClick={() => requestLeaveSort("user_name")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Employee <SortIndicator sortKey="user_name" currentKey={leaveSortConfig.key} direction={leaveSortConfig.direction} />
                </th>
                <th onClick={() => requestLeaveSort("leave_type")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Type <SortIndicator sortKey="leave_type" currentKey={leaveSortConfig.key} direction={leaveSortConfig.direction} />
                </th>
                <th onClick={() => requestLeaveSort("from_date")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Duration <SortIndicator sortKey="from_date" currentKey={leaveSortConfig.key} direction={leaveSortConfig.direction} />
                </th>
                <th onClick={() => requestLeaveSort("days_count")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Days <SortIndicator sortKey="days_count" currentKey={leaveSortConfig.key} direction={leaveSortConfig.direction} />
                </th>
                <th onClick={() => requestLeaveSort("reason")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Reason <SortIndicator sortKey="reason" currentKey={leaveSortConfig.key} direction={leaveSortConfig.direction} />
                </th>
                <th onClick={() => requestLeaveSort("status")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Status <SortIndicator sortKey="status" currentKey={leaveSortConfig.key} direction={leaveSortConfig.direction} />
                </th>
                <th style={{ padding: "14px 16px", textAlign: "center" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAllLeaves.length === 0 ? (
                <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No leave requests found.</td></tr>
              ) : (
                paginatedAllLeaves.map(l => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)", fontSize: "14px" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <strong style={{ color: "var(--text-main, #1e293b)" }}>{l.user_name}</strong>
                      <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted, #64748b)" }}>{l.user_email}</span>
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: "600", color: "var(--text-main, #1e293b)" }}>{l.leave_type}</td>
                    <td style={{ padding: "14px 16px", color: "var(--text-main, #334155)" }}>
                      {new Date(l.from_date).toLocaleDateString()} to {new Date(l.to_date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: "700", color: "var(--text-main, #1e293b)" }}>{l.total_days}</td>
                    <td style={{ padding: "14px 16px", color: "var(--text-muted, #475569)" }}>{l.reason}</td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        padding: "4px 10px", borderRadius: "14px", fontSize: "12px", fontWeight: "700",
                        background: l.status === "Approved" ? "rgba(16, 185, 129, 0.2)" : l.status === "Pending" ? "rgba(245, 158, 11, 0.2)" : "rgba(239, 68, 68, 0.2)",
                        color: l.status === "Approved" ? "#10b981" : l.status === "Pending" ? "#f59e0b" : "#ef4444"
                      }}>
                        {l.status}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", textAlign: "center" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                      {l.status === "Pending" ? (
                        <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                          <button
                            type="button"
                            onClick={() => triggerLeaveActionConfirm(l.id, "Approved", l.user_name)}
                            title="Approve Leave"
                            style={{
                              width: "32px",
                              height: "32px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(22, 163, 74, 0.12)",
                              border: "1px solid rgba(22, 163, 74, 0.3)",
                              color: "#16a34a",
                              borderRadius: "6px",
                              cursor: "pointer",
                              transition: "all 0.15s ease"
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.color = "#fff"; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = "rgba(22, 163, 74, 0.12)"; e.currentTarget.style.color = "#16a34a"; }}
                          >
                            <CheckIcon size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerLeaveActionConfirm(l.id, "Rejected", l.user_name)}
                            title="Reject Leave"
                            style={{
                              width: "32px",
                              height: "32px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "rgba(220, 38, 38, 0.12)",
                              border: "1px solid rgba(220, 38, 38, 0.3)",
                              color: "#dc2626",
                              borderRadius: "6px",
                              cursor: "pointer",
                              transition: "all 0.15s ease"
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = "#dc2626"; e.currentTarget.style.color = "#fff"; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = "rgba(220, 38, 38, 0.12)"; e.currentTarget.style.color = "#dc2626"; }}
                          >
                            <CloseIcon size={16} />
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted, #64748b)", fontSize: "12px" }}>Decided by {l.approved_by || "Admin"}</span>
                      )}
                        <div className="action-buttons" style={{ display: "inline-flex", gap: "6px" }}>
                          <button className="action-btn" type="button" title="Edit Leave" onClick={() => openAdminEdit(l)}>
                            <EditIcon size={15} />
                          </button>
                          <button className="action-btn delete" type="button" title="Delete Leave" onClick={() => setDeleteConfirm({ show: true, id: l.id, status: l.status })}>
                            <TrashIcon size={15} />
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={allLeavesPage}
            totalRecords={filteredAllLeaves.length}
            pageSize={allLeavesPageSize}
            onPageChange={setAllLeavesPage}
          />
          </div>
        </div>
      )}

      {/* TAB 3.5: SHORT LEAVE APPROVALS (Next to Leave Approvals) */}
      {activeTab === "shortleave-approvals" && canApprove && canManagePolicy && (
        <div style={{ background: "rgba(6, 182, 212, 0.06)", border: "1px solid rgba(6, 182, 212, 0.3)", borderRadius: "12px", padding: "16px 20px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--text-main, #1e293b)" }}>Short Leave Policy Limits</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", marginTop: "2px" }}>
              Current Limits: <strong>{formatShortLimit(maxShortMins)}</strong> per short leave | <strong>{maxMonthlyShortCount}</strong> leave(s) per month
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            {/* Hours Limit Box */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-main, #334155)" }}>Duration:</span>
              <input
                type="number"
                min="0.5"
                max="12"
                step="0.5"
                value={shortHoursInput}
                onChange={(e) => setShortHoursInput(e.target.value)}
                style={{ width: "80px", padding: "8px 10px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", fontSize: "14px", fontWeight: "700", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              />
              <span style={{ fontSize: "13px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Hours</span>
            </div>

            {/* Monthly Leave Count Limit Box */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-main, #334155)" }}>Monthly Quota:</span>
              <input
                type="number"
                min="1"
                max="31"
                step="1"
                value={shortMonthlyCountInput}
                onChange={(e) => setShortMonthlyCountInput(e.target.value)}
                style={{ width: "80px", padding: "8px 10px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", fontSize: "14px", fontWeight: "700", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              />
              <span style={{ fontSize: "13px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Leaves/Month</span>
            </div>

            <button
              type="button"
              onClick={handleSaveShortLimit}
              disabled={savingShortLimit}
              style={{ background: "#0891b2", color: "#fff", border: "none", borderRadius: "6px", padding: "9px 18px", fontWeight: "600", fontSize: "13px", cursor: "pointer", opacity: savingShortLimit ? 0.6 : 1 }}
            >
              {savingShortLimit ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      {activeTab === "shortleave-approvals" && canApprove && (
        <div className="table-container" style={{ background: "var(--ui-surface, #fff)", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ui-border, #e2e8f0)", fontWeight: "700", color: "var(--text-main, #1e293b)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <span>All Employee Short Leave Requests (Approvals & Decision)</span>

            {/* Employee, Status, Start Date & End Date Filter for Short Leave */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              {/* Employee Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Employee:</span>
                <select
                  value={shortLeaveEmployeeFilter}
                  onChange={(e) => {
                    const newEmp = e.target.value;
                    setShortLeaveEmployeeFilter(newEmp);
                    // Automatically show All statuses if a specific employee is chosen
                    if (newEmp && shortLeaveStatusFilter === "Pending") {
                      setShortLeaveStatusFilter("All");
                    }
                    setAllShortLeavesPage(1);
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "12px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    background: "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                >
                  <option value="">All Employees</option>
                  {staffList.map(s => (
                    <option key={s._id || s.id} value={s.email || s._id || s.id}>
                      {s.name || s.email}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Status:</span>
                <select
                  value={shortLeaveStatusFilter}
                  onChange={(e) => {
                    setShortLeaveStatusFilter(e.target.value);
                    setAllShortLeavesPage(1);
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "12px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    background: "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)",
                    fontWeight: "600"
                  }}
                >
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="All">All Statuses</option>
                </select>
              </div>

              {/* Date Filters */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>From:</span>
                <input
                  type="date"
                  value={shortLeaveStartDate}
                  onChange={(e) => {
                    setShortLeaveStartDate(e.target.value);
                    setAllShortLeavesPage(1);
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "12px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    background: "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>To:</span>
                <input
                  type="date"
                  value={shortLeaveEndDate}
                  onChange={(e) => {
                    setShortLeaveEndDate(e.target.value);
                    setAllShortLeavesPage(1);
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "12px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    borderRadius: "6px",
                    background: "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                />
              </div>
              {(shortLeaveStartDate || shortLeaveEndDate || shortLeaveEmployeeFilter || shortLeaveStatusFilter !== "Pending") && (
                <button
                  type="button"
                  onClick={() => {
                    setShortLeaveStartDate("");
                    setShortLeaveEndDate("");
                    setShortLeaveEmployeeFilter("");
                    setShortLeaveStatusFilter("Pending");
                    setAllShortLeavesPage(1);
                  }}
                  style={{
                    padding: "5px 10px",
                    fontSize: "11px",
                    border: "none",
                    borderRadius: "6px",
                    background: "#fee2e2",
                    color: "#dc2626",
                    cursor: "pointer",
                    fontWeight: "600"
                  }}
                >
                  Clear Filter
                </button>
              )}

              {/* Download Buttons: PDF & Excel (CSV) for Short Leaves */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
                <button
                  type="button"
                  onClick={handleExportShortLeavesPdf}
                  title="Download Short Leave Records as PDF"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 12px",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#dc2626",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = "#fee2e2"; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "#fef2f2"; }}
                >
                  <DownloadIcon size={14} color="#dc2626" />
                  <span>PDF</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportShortLeavesExcel}
                  title="Download Short Leave Records as Excel / CSV"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 12px",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#16a34a",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.background = "#dcfce7"; }}
                  onMouseOut={(e) => { e.currentTarget.style.background = "#f0fdf4"; }}
                >
                  <DownloadIcon size={14} color="#16a34a" />
                  <span>Excel</span>
                </button>
              </div>
            </div>
          </div>
          <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: "750px", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #475569)", fontSize: "13px" }}>
                  <th style={{ padding: "14px 16px" }}>Employee</th>
                  <th style={{ padding: "14px 16px" }}>Date</th>
                  <th style={{ padding: "14px 16px" }}>Time Window</th>
                  <th style={{ padding: "14px 16px" }}>Duration</th>
                  <th style={{ padding: "14px 16px" }}>Reason</th>
                  <th style={{ padding: "14px 16px" }}>Status</th>
                  <th style={{ padding: "14px 16px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredAllShortLeaves.length === 0 ? (
                  <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No short leave requests found.</td></tr>
                ) : (
                  filteredAllShortLeaves
                    .slice((allShortLeavesPage - 1) * allShortLeavesPageSize, allShortLeavesPage * allShortLeavesPageSize)
                    .map(sl => (
                      <tr key={sl.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)", fontSize: "14px" }}>
                        <td style={{ padding: "14px 16px" }}>
                          <strong style={{ color: "var(--text-main, #1e293b)" }}>{sl.user_name || "Employee"}</strong>
                        </td>
                        <td style={{ padding: "14px 16px", color: "var(--text-main, #334155)" }}>{new Date(sl.date).toLocaleDateString()}</td>
                        <td style={{ padding: "14px 16px", color: "var(--text-main, #334155)" }}>{sl.from_time} - {sl.to_time}</td>
                        <td style={{ padding: "14px 16px", fontWeight: "700", color: "var(--text-main, #1e293b)" }}>{formatDuration(sl.hours)}</td>
                        <td style={{ padding: "14px 16px", color: "var(--text-muted, #475569)" }}>{sl.reason}</td>
                        <td style={{ padding: "14px 16px" }}>
                          <span style={{
                            padding: "4px 10px", borderRadius: "14px", fontSize: "12px", fontWeight: "700",
                            background: sl.status === "Approved" ? "rgba(16, 185, 129, 0.2)" : sl.status === "Pending" ? "rgba(245, 158, 11, 0.2)" : "rgba(239, 68, 68, 0.2)",
                            color: sl.status === "Approved" ? "#10b981" : sl.status === "Pending" ? "#f59e0b" : "#ef4444"
                          }}>
                            {sl.status || "Pending"}
                          </span>
                        </td>
                        <td style={{ padding: "14px 16px", textAlign: "center" }}>
                          {sl.status === "Pending" ? (
                            <div style={{ display: "inline-flex", gap: "8px", alignItems: "center" }}>
                              <button
                                type="button"
                                onClick={() => triggerShortLeaveActionConfirm(sl.id, "Approved", sl.user_name)}
                                title="Approve Short Leave"
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(22, 163, 74, 0.12)",
                                  border: "1px solid rgba(22, 163, 74, 0.3)",
                                  color: "#16a34a",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  transition: "all 0.15s ease"
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.color = "#fff"; }}
                                onMouseOut={(e) => { e.currentTarget.style.background = "rgba(22, 163, 74, 0.12)"; e.currentTarget.style.color = "#16a34a"; }}
                              >
                                <CheckIcon size={16} />
                              </button>
                              <button
                                type="button"
                                onClick={() => triggerShortLeaveActionConfirm(sl.id, "Rejected", sl.user_name)}
                                title="Reject Short Leave"
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  background: "rgba(220, 38, 38, 0.12)",
                                  border: "1px solid rgba(220, 38, 38, 0.3)",
                                  color: "#dc2626",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  transition: "all 0.15s ease"
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.background = "#dc2626"; e.currentTarget.style.color = "#fff"; }}
                                onMouseOut={(e) => { e.currentTarget.style.background = "rgba(220, 38, 38, 0.12)"; e.currentTarget.style.color = "#dc2626"; }}
                              >
                                <CloseIcon size={16} />
                              </button>
                            </div>
                          ) : (
                            <span style={{ color: "var(--text-muted, #64748b)", fontSize: "12px" }}>Decided by {sl.approved_by || "Admin"}</span>
                          )}
                          {canManagePolicy && (
                            <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginTop: "6px" }}>
                              <button
                                type="button"
                                onClick={() => openAdminEditShort(sl)}
                                title="Edit Short Leave"
                                style={{ width: "28px", height: "28px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(79, 70, 229, 0.1)", border: "1px solid rgba(79, 70, 229, 0.3)", color: "#4f46e5", borderRadius: "6px", cursor: "pointer" }}
                              >
                                <EditIcon size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteShortConfirm({ show: true, id: sl.id })}
                                title="Delete Short Leave"
                                style={{ width: "28px", height: "28px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "rgba(220, 38, 38, 0.1)", border: "1px solid rgba(220, 38, 38, 0.3)", color: "#dc2626", borderRadius: "6px", cursor: "pointer" }}
                              >
                                <TrashIcon size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={allShortLeavesPage}
            totalRecords={filteredAllShortLeaves.length}
            pageSize={allShortLeavesPageSize}
            onPageChange={setAllShortLeavesPage}
          />
        </div>
      )}

      {/* TAB 4: COMPANY-WIDE GLOBAL LEAVE POLICY (OPTION 1) */}
      {activeTab === "manage-balances" && canManagePolicy && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* 1. Global Policy Configuration Card */}
          <div style={{ background: "var(--ui-surface, #ffffff)", borderRadius: "14px", border: "1px solid var(--ui-border, #e2e8f0)", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-main, #1e293b)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                  <ShieldIcon size={20} color="var(--primary-color, #4f46e5)" /> Company-Wide Leave Policy
                </h2>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--text-muted, #64748b)" }}>
                  Define global annual leave quotas for all company employees from a single place.
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {/* Year Type Input */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--ui-bg, #f8fafc)", padding: "4px 10px", borderRadius: "8px", border: "1px solid var(--ui-border, #cbd5e1)" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted, #475569)" }}>Policy & Balance Year:</span>
                  <input
                    type="number"
                    min="2020"
                    max="2100"
                    value={balanceYear}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setBalanceYear(val || "");
                      if (val && val >= 2020 && val <= 2100) {
                        fetchAllBalances(val);
                      }
                    }}
                    onBlur={() => {
                      if (!balanceYear || balanceYear < 2020) {
                        const fallbackYr = new Date().getFullYear();
                        setBalanceYear(fallbackYr);
                        fetchAllBalances(fallbackYr);
                      }
                    }}
                    placeholder="YYYY"
                    style={{
                      width: "68px",
                      padding: "2px 6px",
                      border: "1px solid var(--ui-border, #cbd5e1)",
                      borderRadius: "6px",
                      background: "var(--ui-surface, #fff)",
                      fontSize: "13px",
                      fontWeight: "800",
                      color: "#4f46e5",
                      outline: "none",
                      textAlign: "center"
                    }}
                  />
                </div>
                <span style={{ fontSize: "12px", background: "rgba(16, 185, 129, 0.15)", color: "#10b981", padding: "4px 10px", borderRadius: "12px", fontWeight: "700" }}>
                  Active Company Policy
                </span>
              </div>
            </div>

            <form onSubmit={handleSavePolicy}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "20px" }}>
                {/* CL */}
                <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "16px", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
                  <label style={{ fontSize: "13px", fontWeight: "700", color: "#6366f1", display: "block", marginBottom: "6px" }}>
                    Casual Leave (CL)
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      required
                      value={policyForm.cl_default}
                      onChange={(e) => setPolicyForm({ ...policyForm, cl_default: parseInt(e.target.value, 10) || 0 })}
                      style={{ width: "90px", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", fontSize: "15px", fontWeight: "700", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                    />
                    <span style={{ fontSize: "13px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Days / Year</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)", marginTop: "6px" }}>Annual unplanned / personal leaves</div>
                </div>

                {/* SL */}
                <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "16px", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
                  <label style={{ fontSize: "13px", fontWeight: "700", color: "#10b981", display: "block", marginBottom: "6px" }}>
                    Sick Leave (SL)
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      required
                      value={policyForm.sl_default}
                      onChange={(e) => setPolicyForm({ ...policyForm, sl_default: parseInt(e.target.value, 10) || 0 })}
                      style={{ width: "90px", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", fontSize: "15px", fontWeight: "700", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                    />
                    <span style={{ fontSize: "13px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Days / Year</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)", marginTop: "6px" }}>Medical & health recovery leaves</div>
                </div>

                {/* PL */}
                <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "16px", borderRadius: "10px", border: "1px solid #f97316", borderLeftWidth: "4px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "700", color: "#f97316", display: "block", marginBottom: "6px" }}>
                    Privilege Leave (PL)
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      required
                      value={policyForm.pl_default}
                      onChange={(e) => setPolicyForm({ ...policyForm, pl_default: parseInt(e.target.value, 10) || 0 })}
                      style={{ width: "90px", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", fontSize: "15px", fontWeight: "700", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                    />
                    <span style={{ fontSize: "13px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Days / Year</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)", marginTop: "6px" }}>Planned vacations & earned leaves</div>
                </div>

                {/* Comp-Off */}
                <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "16px", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
                  <label style={{ fontSize: "13px", fontWeight: "700", color: "#0ea5e9", display: "block", marginBottom: "6px" }}>
                    Comp-Off
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      required
                      value={policyForm.comp_off_default}
                      onChange={(e) => setPolicyForm({ ...policyForm, comp_off_default: parseInt(e.target.value, 10) || 0 })}
                      style={{ width: "90px", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", fontSize: "15px", fontWeight: "700", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                    />
                    <span style={{ fontSize: "13px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Days Base</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)", marginTop: "6px" }}>Granted for extra weekend shifts</div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--ui-border, #f1f5f9)", paddingTop: "16px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text-main, #475569)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={policyForm.applyToExisting}
                    onChange={(e) => setPolicyForm({ ...policyForm, applyToExisting: e.target.checked })}
                    style={{ width: "16px", height: "16px", accentColor: "#4f46e5" }}
                  />
                  <span>Apply updated policy quotas to all existing employees</span>
                </label>

                <button
                  type="submit"
                  disabled={policyLoading}
                  style={{
                    padding: "10px 24px",
                    background: "#4f46e5",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontWeight: "700",
                    fontSize: "14px",
                    boxShadow: "0 2px 4px rgba(79, 70, 229, 0.2)"
                  }}
                >
                  {policyLoading ? "Saving..." : "Save Company Policy"}
                </button>
              </div>
            </form>
          </div>

          {/* 2. Overview of Employees & Balances */}
          <div className="table-container" style={{ background: "var(--ui-surface, #ffffff)", borderRadius: "14px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--ui-border, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <strong style={{ fontSize: "16px", color: "var(--text-main, #1e293b)" }}>
                  Current Staff Leave Overview ({balanceYear})
                </strong>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                  Employee leave balances allocated for {balanceYear}. Deducted automatically upon approved leaves.
                </p>
              </div>
            </div>

            <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", minWidth: "650px", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #475569)", fontSize: "13px" }}>
                  <th style={{ padding: "14px 16px" }}>Employee</th>
                  <th style={{ padding: "14px 16px" }}>Casual (CL)</th>
                  <th style={{ padding: "14px 16px" }}>Sick (SL)</th>
                  <th style={{ padding: "14px 16px" }}>Privilege (PL)</th>
                  <th style={{ padding: "14px 16px" }}>Comp-Off</th>
                  <th style={{ padding: "14px 16px" }}>Status</th>
                  <th style={{ padding: "14px 16px", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Deduplicate staff records by email/user_id so each employee displays exactly once
                  const uniqueBalances = Array.from(
                    new Map(allBalances.map(b => [b.user_email || b.user_id || b.id, b])).values()
                  );
                  if (uniqueBalances.length === 0) {
                    return <tr><td colSpan="7" style={{ padding: "30px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>No staff records.</td></tr>;
                  }
                  return uniqueBalances
                    .slice((balancePage - 1) * balancePageSize, balancePage * balancePageSize)
                    .map(b => (
                    <tr key={b.id || b.user_id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)", fontSize: "14px" }}>
                      <td style={{ padding: "14px 16px" }}>
                        <strong style={{ color: "var(--text-main, #1e293b)" }}>{b.user_name}</strong>
                        <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted, #64748b)" }}>{b.user_email || "Company Staff"}</span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontWeight: "700", color: b.cl_balance < 0 ? "#dc2626" : "#6366f1", background: b.cl_balance < 0 ? "rgba(220, 38, 38, 0.15)" : "rgba(99, 102, 241, 0.15)", padding: "3px 10px", borderRadius: "8px" }}>
                          {b.cl_balance} Days
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontWeight: "700", color: b.sl_balance < 0 ? "#dc2626" : "#10b981", background: b.sl_balance < 0 ? "rgba(220, 38, 38, 0.15)" : "rgba(16, 185, 129, 0.15)", padding: "3px 10px", borderRadius: "8px" }}>
                          {b.sl_balance} Days
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontWeight: "700", color: b.pl_balance < 0 ? "#dc2626" : "#f97316", background: b.pl_balance < 0 ? "rgba(220, 38, 38, 0.15)" : "rgba(249, 115, 22, 0.15)", padding: "3px 10px", borderRadius: "8px" }}>
                          {b.pl_balance} Days
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ fontWeight: "700", color: b.comp_off < 0 ? "#dc2626" : "#0ea5e9", background: b.comp_off < 0 ? "rgba(220, 38, 38, 0.15)" : "rgba(14, 165, 233, 0.15)", padding: "3px 10px", borderRadius: "8px" }}>
                          {b.comp_off} Days
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{ padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: "700", background: "rgba(16, 185, 129, 0.15)", color: "#10b981" }}>
                          Active
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => setEditingBalance({
                            id: b.id,
                            user_name: b.user_name,
                            user_email: b.user_email,
                            cl_balance: b.cl_balance,
                            sl_balance: b.sl_balance,
                            pl_balance: b.pl_balance,
                            comp_off: b.comp_off
                          })}
                          title="Edit employee leave quota (Extend or Deduct)"
                          style={{
                            padding: "6px 12px",
                            background: "rgba(79, 70, 229, 0.1)",
                            color: "#4f46e5",
                            border: "1px solid rgba(79, 70, 229, 0.25)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            fontSize: "12px",
                            fontWeight: "700",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px"
                          }}
                        >
                          <EditIcon size={14} color="#4f46e5" /> Edit Balance
                        </button>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
            </div>
            <Pagination
              currentPage={balancePage}
              totalRecords={Array.from(new Map(allBalances.map(b => [b.user_email || b.user_id || b.id, b])).values()).length}
              pageSize={balancePageSize}
              onPageChange={setBalancePage}
            />
          </div>

          {/* Edit Employee Leave Balance Modal */}
          {editingBalance && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(15, 23, 42, 0.6)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: "16px"
              }}
              onClick={() => setEditingBalance(null)}
            >
              <div
                style={{
                  backgroundColor: "var(--ui-surface, #ffffff)",
                  borderRadius: "16px",
                  padding: "24px",
                  width: "100%",
                  maxWidth: "520px",
                  boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
                  border: "1px solid var(--ui-border, #e2e8f0)"
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "var(--text-main, #1e293b)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <EditIcon size={20} color="#4f46e5" /> Edit Employee Leave Balance
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--text-muted, #64748b)" }}>
                      Extend or deduct remaining leaves for <strong>{editingBalance.user_name}</strong> ({editingBalance.user_email}).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingBalance(null)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted, #94a3b8)", padding: "4px" }}
                  >
                    <CloseIcon size={20} />
                  </button>
                </div>

                <form onSubmit={handleUpdateEmployeeBalance}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
                    {/* CL */}
                    <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "12px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
                      <label style={{ fontSize: "12px", fontWeight: "700", color: "#6366f1", display: "block", marginBottom: "6px" }}>
                        Casual Leave (CL)
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="365"
                          required
                          value={editingBalance.cl_balance}
                          onChange={(e) => setEditingBalance({ ...editingBalance, cl_balance: parseFloat(e.target.value) || 0 })}
                          style={{ width: "100%", padding: "8px 10px", fontSize: "15px", fontWeight: "700", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                        />
                        <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Days</span>
                      </div>
                    </div>

                    {/* SL */}
                    <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "12px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
                      <label style={{ fontSize: "12px", fontWeight: "700", color: "#10b981", display: "block", marginBottom: "6px" }}>
                        Sick Leave (SL)
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="365"
                          required
                          value={editingBalance.sl_balance}
                          onChange={(e) => setEditingBalance({ ...editingBalance, sl_balance: parseFloat(e.target.value) || 0 })}
                          style={{ width: "100%", padding: "8px 10px", fontSize: "15px", fontWeight: "700", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                        />
                        <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Days</span>
                      </div>
                    </div>

                    {/* PL */}
                    <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "12px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
                      <label style={{ fontSize: "12px", fontWeight: "700", color: "#ea580c", display: "block", marginBottom: "6px" }}>
                        Privilege Leave (PL)
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="365"
                          required
                          value={editingBalance.pl_balance}
                          onChange={(e) => setEditingBalance({ ...editingBalance, pl_balance: parseFloat(e.target.value) || 0 })}
                          style={{ width: "100%", padding: "8px 10px", fontSize: "15px", fontWeight: "700", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                        />
                        <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Days</span>
                      </div>
                    </div>

                    {/* Comp-Off */}
                    <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "12px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
                      <label style={{ fontSize: "12px", fontWeight: "700", color: "#0ea5e9", display: "block", marginBottom: "6px" }}>
                        Comp-Off
                      </label>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="365"
                          required
                          value={editingBalance.comp_off}
                          onChange={(e) => setEditingBalance({ ...editingBalance, comp_off: parseFloat(e.target.value) || 0 })}
                          style={{ width: "100%", padding: "8px 10px", fontSize: "15px", fontWeight: "700", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                        />
                        <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Days</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--ui-border, #f1f5f9)", paddingTop: "14px" }}>
                    <button
                      type="button"
                      onClick={() => setEditingBalance(null)}
                      style={{
                        padding: "8px 16px",
                        background: "var(--ui-bg, #f1f5f9)",
                        color: "var(--text-main, #475569)",
                        border: "1px solid var(--ui-border, #cbd5e1)",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontWeight: "600",
                        fontSize: "13px"
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saveBalanceLoading}
                      style={{
                        padding: "8px 20px",
                        background: "#4f46e5",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: "8px",
                        cursor: "pointer",
                        fontWeight: "700",
                        fontSize: "13px",
                        boxShadow: "0 2px 4px rgba(79, 70, 229, 0.2)"
                      }}
                    >
                      {saveBalanceLoading ? "Saving..." : "Update Balance"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmModal
        show={deleteConfirm.show}
        title={deleteConfirm.status && deleteConfirm.status !== "Pending" ? "Delete Leave" : "Cancel Leave Application"}
        message={
          deleteConfirm.status === "Approved"
            ? "This leave is already approved. Deleting it will refund the leave balance and remove the 'On Leave' attendance for these days. Continue?"
            : deleteConfirm.status === "Rejected"
              ? "Are you sure you want to delete this rejected leave application?"
              : "Are you sure you want to cancel and delete this pending leave application?"
        }
        confirmText="Yes, Delete"
        confirmColor="#dc2626"
        onConfirm={handleDeleteLeave}
        onClose={() => setDeleteConfirm({ show: false, id: null, status: null })}
      />

      {/* SUPER ADMIN: EDIT EMPLOYEE LEAVE */}
      <FormModal
        isOpen={adminEdit.show}
        onClose={() => setAdminEdit({ show: false, leave: null, form: null, error: "", saving: false })}
        title="Edit Leave"
        onSubmit={handleAdminSaveLeave}
        loading={adminEdit.saving}
      >
        {adminEdit.form && (() => {
          const f = adminEdit.form;
          const setF = (patch) => setAdminEdit((prev) => ({ ...prev, error: "", form: { ...prev.form, ...patch } }));
          const fieldStyle = { width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" };
          const labelStyle = { display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" };
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)", fontSize: "13px" }}>
                <div><strong>Employee:</strong> {adminEdit.leave.user_name} ({adminEdit.leave.user_email})</div>
                <div><strong>Status:</strong> {adminEdit.leave.status}</div>
                {adminEdit.leave.status === "Approved" && (
                  <div style={{ color: "#b45309", fontWeight: "600", marginTop: "4px" }}>
                    This leave is approved — balance and "On Leave" attendance will be recalculated for the new dates.
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Leave Type</label>
                  <select value={f.leave_type} onChange={(e) => setF({ leave_type: e.target.value })} style={fieldStyle}>
                    <option value="Casual Leave">Casual Leave (CL)</option>
                    <option value="Sick Leave">Sick Leave (SL)</option>
                    <option value="Privilege Leave">Privilege Leave (PL)</option>
                    <option value="Comp-Off">Comp-Off</option>
                    <option value="Unpaid Leave">Unpaid Leave (LOP)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Day Type</label>
                  <select value={f.day_type} onChange={(e) => setF({ day_type: e.target.value })} style={fieldStyle}>
                    <option value="Full Day">Full Day</option>
                    <option value="First Half">First Half (Half Day)</option>
                    <option value="Second Half">Second Half (Half Day)</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>From Date *</label>
                  <input type="date" value={f.from_date} onChange={(e) => setF({ from_date: e.target.value })} style={fieldStyle} />
                </div>
                <div>
                  <label style={labelStyle}>To Date *</label>
                  <input type="date" value={f.to_date} onChange={(e) => setF({ to_date: e.target.value })} style={fieldStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Reason *</label>
                <textarea rows={3} value={f.reason} onChange={(e) => setF({ reason: e.target.value })} style={{ ...fieldStyle, resize: "vertical" }} />
              </div>
              {adminEdit.error && <div style={{ color: "#dc2626", fontSize: "12px", fontWeight: "600" }}>{adminEdit.error}</div>}
            </div>
          );
        })()}
      </FormModal>

      {/* LOW BALANCE APPROVAL WARNING */}
      <ConfirmModal
        show={lowBalanceConfirm.show}
        title="Insufficient Leave Balance"
        message={lowBalanceConfirm.message}
        confirmText="Yes, Approve"
        confirmColor="#d97706"
        onConfirm={() => {
          const leaveId = lowBalanceConfirm.id;
          setLowBalanceConfirm({ show: false, id: null, message: "" });
          handleLeaveAction(leaveId, "Approved", true);
        }}
        onClose={() => setLowBalanceConfirm({ show: false, id: null, message: "" })}
      />

      {/* SUPER ADMIN: EDIT SHORT LEAVE */}
      <FormModal
        isOpen={Boolean(adminEditShort)}
        onClose={() => { setAdminEditShort(null); setAdminEditShortError(""); }}
        title="Edit Short Leave"
        onSubmit={handleSaveAdminShort}
        loading={savingAdminShort}
      >
        {adminEditShort && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)", fontSize: "13px", color: "var(--text-main, #1e293b)" }}>
              <strong>Employee:</strong> {adminEditShort.user_name}
              {adminEditShort.status === "Approved" && (
                <div style={{ color: "#b45309", fontWeight: "600", marginTop: "4px" }}>This short leave is already approved.</div>
              )}
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>Date *</label>
              <input
                type="date"
                value={adminEditShort.date}
                onChange={(e) => { setAdminEditShort({ ...adminEditShort, date: e.target.value }); setAdminEditShortError(""); }}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              />
            </div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>From Time *</label>
                <TimeSelect12h
                  value={adminEditShort.from_time}
                  onChange={(v) => { setAdminEditShort((prev) => ({ ...prev, from_time: v })); setAdminEditShortError(""); }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>To Time *</label>
                <TimeSelect12h
                  value={adminEditShort.to_time}
                  onChange={(v) => { setAdminEditShort((prev) => ({ ...prev, to_time: v })); setAdminEditShortError(""); }}
                />
              </div>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>Max allowed: {formatShortLimit(maxShortMins)}</div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>Reason *</label>
              <input
                type="text"
                value={adminEditShort.reason}
                onChange={(e) => { setAdminEditShort({ ...adminEditShort, reason: e.target.value }); setAdminEditShortError(""); }}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              />
            </div>
            {adminEditShortError && <div style={{ color: "#dc2626", fontSize: "12px", fontWeight: "600" }}>{adminEditShortError}</div>}
          </div>
        )}
      </FormModal>

      {/* DELETE SHORT LEAVE CONFIRMATION MODAL */}
      <ConfirmModal
        show={deleteShortConfirm.show}
        title="Delete Short Leave"
        message="Are you sure you want to delete this short leave entry?"
        confirmText="Yes, Delete"
        confirmColor="#dc2626"
        onConfirm={handleDeleteShortLeave}
        onClose={() => setDeleteShortConfirm({ show: false, id: null })}
      />

      {/* APPROVE / REJECT CONFIRMATION MODAL */}
      <ConfirmModal
        show={actionConfirm.show}
        title={actionConfirm.action === "Approved" ? "Confirm Approval" : "Confirm Rejection"}
        message={`Are you sure you want to ${actionConfirm.action === "Approved" ? "approve" : "reject"} this ${actionConfirm.type === "shortleave" ? "short leave" : "leave"} request for ${actionConfirm.userName}?`}
        confirmText={actionConfirm.action === "Approved" ? "Yes, Approve" : "Yes, Reject"}
        confirmColor={actionConfirm.action === "Approved" ? "#16a34a" : "#dc2626"}
        onConfirm={handleConfirmAction}
        onClose={() => setActionConfirm(prev => ({ ...prev, show: false }))}
      />
    </div>
  );
}
