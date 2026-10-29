import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import API from "../api/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import FormModal from "../components/common/FormModal";
import ConfirmModal from "../components/common/ConfirmModal";
import { IconClock, IconPlus, IconCheck, IconX, IconMoney, IconCalendar, IconFileText } from "../components/common/Icons";
import Pagination from "../components/common/Pagination";
import ForgotPunchOutTab from "../components/attendance/ForgotPunchOutTab";
import { useTableSort, SortIndicator } from "../utils/tableSort";
import "../style/main.css";
import "../style/table.css";

export default function Attendance() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();

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
  const isCompanyOwner = user?.role?.name === "Company Owner";
  const isManager = isSuperAdmin || isCompanyOwner || user?.position?.includes("Manager") || user?.role?.name?.includes("Manager");

  const canRead = isSuperAdmin || isCompanyOwner || hasPermission("attendance_management", "read");
  const canCreate = isSuperAdmin || isCompanyOwner || hasPermission("attendance_management", "create");
  const canUpdate = isSuperAdmin || isCompanyOwner || hasPermission("attendance_management", "update");
  const canDelete = isSuperAdmin || isCompanyOwner || hasPermission("attendance_management", "delete");

  const [attendanceList, setAttendanceList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterEndDate, setFilterEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [filterStatus, setFilterStatus] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("");
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendancePageSize, setAttendancePageSize] = useState(10);
  
  // Dashboard "Not Punch Out" alert links here with ?tab=forgot-punch-out&att=<attendanceId>
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") === "forgot-punch-out" ? "forgotPunchOut" : "attendance"); // "attendance" | "regularizations" | "forgotPunchOut" | "overtime" | "schedules"
  const [filterPendingClockOut, setFilterPendingClockOut] = useState(false);

  // Punch Regularization states
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthStr = String(now.getMonth() + 1).padStart(2, "0");
  const defaultRegStartDate = `${currentYear}-${currentMonthStr}-01`;
  const defaultRegEndDate = `${currentYear}-${currentMonthStr}-${String(now.getDate()).padStart(2, "0")}`;

  const [regularizations, setRegularizations] = useState([]);
  const [regStats, setRegStats] = useState({ total_records: 0, not_punch_out: 0, completed_punch: 0, punched_in: 0 });
  const [regLoading, setRegLoading] = useState(false);
  const [regStatusFilter, setRegStatusFilter] = useState("All");
  const [regStartDate, setRegStartDate] = useState(defaultRegStartDate);
  const [regEndDate, setRegEndDate] = useState(defaultRegEndDate);
  const [regUser, setRegUser] = useState("");
  const [regPage, setRegPage] = useState(1);
  const [regPageSize, setRegPageSize] = useState(10);
  const [showRegModal, setShowRegModal] = useState(false);
  const [submittingReg, setSubmittingReg] = useState(false);
  const [regForm, setRegForm] = useState({
    target_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    requested_clock_in: "09:30",
    requested_clock_out: "18:30",
    reason: ""
  });
  const [regFieldErrors, setRegFieldErrors] = useState({});
  const [reviewModal, setReviewModal] = useState({
    show: false,
    reg: null,
    action: "approve",
    comment: ""
  });
  const [processingReview, setProcessingReview] = useState(false);

  useEffect(() => {
    setAttendancePage(1);
  }, [filterDate, filterEndDate, filterStatus, filterEmployee, filterPendingClockOut]);

  useEffect(() => {
    setRegPage(1);
  }, [regStatusFilter, regStartDate, regEndDate, regUser]);

  const { sortedData: sortedAttendance, sortConfig: attSortConfig, requestSort: requestAttSort } = useTableSort(attendanceList, "date", "desc");
  const paginatedAttendance = sortedAttendance.slice((attendancePage - 1) * attendancePageSize, attendancePage * attendancePageSize);
  const paginatedRegs = regularizations.slice((regPage - 1) * regPageSize, regPage * regPageSize);

  // Overtime Management states
  const [overtimeList, setOvertimeList] = useState([]);
  const [otLoading, setOtLoading] = useState(false);
  const [otPage, setOtPage] = useState(1);
  const [otPageSize, setOtPageSize] = useState(10);
  const paginatedOt = overtimeList.slice((otPage - 1) * otPageSize, otPage * otPageSize);
  const [showOtModal, setShowOtModal] = useState(false);
  const [submittingOt, setSubmittingOt] = useState(false);
  const [otForm, setOtForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    ot_hours: "2.0",
    reason: "",
    action_type: "Pay Overtime"
  });
  const [otFieldErrors, setOtFieldErrors] = useState({});
  const [otReviewModal, setOtReviewModal] = useState({
    show: false,
    item: null,
    action: "approve",
    comment: ""
  });
  const [processingOtReview, setProcessingOtReview] = useState(false);

  // Work Schedules (Monday - Sunday)
  const [schedules, setSchedules] = useState([]);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [scheduleForm, setScheduleForm] = useState({
    is_working_day: true,
    clock_in_time: "09:30",
    clock_out_time: "18:30",
    first_half_hours: "4.75",
    second_half_hours: "4.75",
    saturday_rule: "2nd_4th_off"
  });

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  const [editRecord, setEditRecord] = useState(null);
  const [staffList, setStaffList] = useState([]);
  
  const [formData, setFormData] = useState({
    user_id: "",
    user_name: "",
    user_email: "",
    date: new Date().toISOString().slice(0, 10),
    status: "Present",
    clock_in: "",
    clock_out: "",
    total_hours: "",
    work_mode: "Office",
    notes: "",
    only_admin_clock_out: false
  });
  const [fieldErrors, setFieldErrors] = useState({});

  // Load Attendance
  const fetchAttendance = async () => {
    try {
      setLoading(true);
      let url = "/attendance/all?";
      if (filterDate && filterEndDate) {
        url += `startDate=${filterDate}&endDate=${filterEndDate}&`;
      } else if (filterDate) {
        url += `date=${filterDate}&`;
      } else if (filterEndDate) {
        url += `endDate=${filterEndDate}&`;
      }
      if (filterStatus) url += `status=${filterStatus}&`;
      if (filterEmployee) url += `employee=${filterEmployee}&`;
      if (filterPendingClockOut && isSuperAdmin) url += `pendingClockOut=true&`;
      
      const res = await API.get(url);
      let data = Array.isArray(res.data) ? res.data : [];
      // Safety filter: if not super admin, strictly filter records by current user
      if (!isSuperAdmin) {
        const myEmail = user?.email?.toLowerCase() || "";
        const myId = user?._id || user?.id || "";
        data = data.filter((item) => {
          const itemEmail = item.user_email?.toLowerCase() || "";
          const itemId = item.user_id ? String(item.user_id) : "";
          return (myEmail && itemEmail === myEmail) || (myId && itemId === String(myId));
        });
      }
      setAttendanceList(data);
    } catch (err) {
      showToast(err.response?.data?.error || "Error loading attendance", "error");
    } finally {
      setLoading(false);
    }
  };

  // Load Work Schedules
  const fetchSchedules = async () => {
    try {
      const res = await API.get("/attendance/schedules");
      setSchedules(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error loading schedules:", err);
    }
  };

  // Late Instance Policy Settings
  const [attSettings, setAttSettings] = useState({
    monthly_late_instances: 3,
    late_grace_minutes: 30,
    half_day_late_minutes: 120
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchAttSettings = async () => {
    try {
      const res = await API.get("/attendance/settings");
      if (res.data) {
        setAttSettings({
          monthly_late_instances: res.data.monthly_late_instances ?? 3,
          late_grace_minutes: res.data.late_grace_minutes ?? 30,
          half_day_late_minutes: res.data.half_day_late_minutes ?? 120
        });
      }
    } catch (err) {
      console.error("Error loading attendance settings:", err);
    }
  };

  const handleSaveAttSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await API.put("/attendance/settings", attSettings);
      showToast("Late Instances Policy updated successfully!", "success");
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update settings", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  // Load Staff for dropdown
  const fetchStaff = async () => {
    try {
      const res = await API.get("/staff");
      setStaffList(res.data || []);
    } catch (err) {
      console.error("Staff loading error:", err);
    }
  };

  // Fetch Regularizations
  const fetchRegularizations = async () => {
    try {
      setRegLoading(true);
      let url = "/attendance/regularizations?";
      if (regStatusFilter && regStatusFilter !== "All") url += `status=${regStatusFilter}&`;
      if (regStartDate && regEndDate) {
        url += `startDate=${regStartDate}&endDate=${regEndDate}&`;
      } else if (regStartDate) {
        url += `startDate=${regStartDate}&`;
      } else if (regEndDate) {
        url += `endDate=${regEndDate}&`;
      }
      if (regUser) url += `employee=${regUser}&`;
      const res = await API.get(url);
      setRegularizations(res.data.regularizations || []);
      if (res.data.stats) {
        setRegStats(res.data.stats);
      }
    } catch (err) {
      console.error("Error loading regularizations:", err);
    } finally {
      setRegLoading(false);
    }
  };

  // Create Regularization Request
  const handleCreateRegularization = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!regForm.target_date) errs.target_date = "Plese enter target date";
    if (!regForm.requested_clock_in) errs.requested_clock_in = "Plese enter clock in";
    if (!regForm.requested_clock_out) errs.requested_clock_out = "Plese enter clock out";
    if (!regForm.reason || !regForm.reason.trim()) errs.reason = "Plese enter reason";
    if (Object.keys(errs).length > 0) {
      setRegFieldErrors(errs);
      return;
    }
    setSubmittingReg(true);
    try {
      setRegFieldErrors({});
      const inIso = `${regForm.target_date}T${regForm.requested_clock_in}:00.000Z`;
      const outIso = `${regForm.target_date}T${regForm.requested_clock_out}:00.000Z`;
      await API.post("/attendance/regularize", {
        target_date: regForm.target_date,
        requested_clock_in: inIso,
        requested_clock_out: outIso,
        reason: regForm.reason
      });
      showToast("Punch Regularization request submitted successfully!", "success");
      setShowRegModal(false);
      setRegFieldErrors({});
      setRegForm({
        target_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
        requested_clock_in: "09:30",
        requested_clock_out: "18:30",
        reason: ""
      });
      fetchRegularizations();
    } catch (err) {
      const serverErr = err.response?.data?.error;
      const serverField = err.response?.data?.field;
      if (serverField) {
        setRegFieldErrors({ [serverField]: serverErr });
      } else {
        showToast(serverErr || "Failed to submit request", "error");
      }
    } finally {
      setSubmittingReg(false);
    }
  };

  // Review Regularization Action (Approve / Reject)
  const handleReviewAction = async () => {
    if (!reviewModal.reg) return;
    setProcessingReview(true);
    try {
      if (reviewModal.action === "approve") {
        await API.post(`/attendance/regularize/${reviewModal.reg.id}/approve`, {
          comment: reviewModal.comment || "Approved by Manager"
        });
        showToast("Regularization request approved and attendance record updated!", "success");
      } else {
        if (!reviewModal.comment.trim()) {
          showToast("A rejection comment/reason is required", "error");
          setProcessingReview(false);
          return;
        }
        await API.post(`/attendance/regularize/${reviewModal.reg.id}/reject`, {
          comment: reviewModal.comment.trim()
        });
        showToast("Regularization request rejected", "info");
      }
      setReviewModal({ show: false, reg: null, action: "approve", comment: "" });
      fetchRegularizations();
      fetchAttendance();
    } catch (err) {
      showToast(err.response?.data?.error || "Review action failed", "error");
    } finally {
      setProcessingReview(false);
    }
  };

  const fetchOvertime = async () => {
    try {
      setOtLoading(true);
      const res = await API.get("/overtime");
      setOvertimeList(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error loading overtime:", err);
    } finally {
      setOtLoading(false);
    }
  };

  const handleClaimOt = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!otForm.date) errs.date = "Plese enter date";
    if (!otForm.ot_hours) errs.ot_hours = "Plese enter overtime hours";
    if (!otForm.reason || !otForm.reason.trim()) errs.reason = "Plese enter reason";
    if (Object.keys(errs).length > 0) {
      setOtFieldErrors(errs);
      return;
    }
    setSubmittingOt(true);
    try {
      setOtFieldErrors({});
      await API.post("/overtime/claim", {
        ...otForm,
        ot_hours: parseFloat(otForm.ot_hours)
      });
      showToast("Overtime claim submitted for manager approval!", "success");
      setShowOtModal(false);
      setOtFieldErrors({});
      setOtForm({
        date: new Date().toISOString().slice(0, 10),
        ot_hours: "2.0",
        reason: "",
        action_type: "Pay Overtime"
      });
      fetchOvertime();
    } catch (err) {
      const serverErr = err.response?.data?.error;
      const serverField = err.response?.data?.field;
      if (serverField) {
        setOtFieldErrors({ [serverField]: serverErr });
      } else {
        showToast(serverErr || "Failed to submit overtime claim", "error");
      }
    } finally {
      setSubmittingOt(false);
    }
  };

  const handleReviewOtAction = async () => {
    if (!otReviewModal.item) return;
    setProcessingOtReview(true);
    try {
      if (otReviewModal.action === "approve") {
        const res = await API.post(`/overtime/${otReviewModal.item.id}/approve`, {
          comment: otReviewModal.comment || "Approved"
        });
        showToast(res.data?.message || "Overtime claim approved!", "success");
      } else {
        await API.post(`/overtime/${otReviewModal.item.id}/reject`, {
          comment: otReviewModal.comment || "Rejected"
        });
        showToast("Overtime claim rejected", "info");
      }
      setOtReviewModal({ show: false, item: null, action: "approve", comment: "" });
      fetchOvertime();
    } catch (err) {
      showToast(err.response?.data?.error || "Review failed", "error");
    } finally {
      setProcessingOtReview(false);
    }
  };

  // Initial data load on mount or permission change
  useEffect(() => {
    if (canRead) {
      fetchStaff();
      if (isSuperAdmin) {
        fetchSchedules();
        fetchAttSettings();
      }
    }
  }, [canRead, isSuperAdmin]);

  // Tab 1 Attendance filters
  useEffect(() => {
    if (canRead) {
      fetchAttendance();
    }
  }, [filterDate, filterEndDate, filterStatus, filterEmployee, filterPendingClockOut, canRead]);

  // Tab 2 Punch Regularization filters
  useEffect(() => {
    if (canRead) {
      fetchRegularizations();
    }
  }, [regStatusFilter, regStartDate, regEndDate, regUser, canRead]);

  // Tab 3 Overtime
  useEffect(() => {
    if (canRead && activeTab === "overtime") {
      fetchOvertime();
    }
  }, [activeTab, canRead]);


  const handleEdit = (record) => {
    setEditRecord(record);
    const parseTime = (iso) => {
      if (!iso) return "";
      try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return "";
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${hh}:${mm}`;
      } catch {
        return "";
      }
    };
    setFormData({
      user_id: record.user_id,
      user_name: record.user_name,
      user_email: record.user_email,
      date: record.date ? record.date.slice(0, 10) : "",
      clock_in: parseTime(record.clock_in),
      clock_out: parseTime(record.clock_out),
      status: record.status || "Present",
      total_hours: record.total_hours !== null && record.total_hours !== undefined ? record.total_hours : "",
      work_mode: record.work_mode || "Office",
      notes: record.notes || "",
      only_admin_clock_out: Boolean(record.only_admin_clock_out)
    });
    setShowModal(true);
  };

  // Super Admin: Force Clock Out an Employee
  const handleAdminClockOut = (id, empName) => {
    askConfirm("Clock Out Employee", `Clock out employee ${empName || ""}?`, async () => {
      try {
        const res = await API.put(`/attendance/${id}/clock-out`);
        showToast(res.data.message || "Clocked out successfully!");
        fetchAttendance();
      } catch (err) {
        showToast(err.response?.data?.error || "Failed to clock out", "error");
      }
    }, "Clock Out", "var(--primary-color)");
  };

  // Super Admin: Save Schedule
  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    if (!editingSchedule) return;
    try {
      await API.put(`/attendance/schedules/${editingSchedule.id}`, scheduleForm);
      showToast(`Work schedule for ${editingSchedule.day_of_week} updated!`);
      setShowScheduleModal(false);
      setEditingSchedule(null);
      fetchSchedules();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update schedule", "error");
    }
  };

  const handleDelete = (id) => {
    askConfirm("Delete Attendance Record", "Are you sure you want to delete this attendance record?", async () => {
      try {
        await API.delete(`/attendance/${id}`);
        showToast("Attendance record deleted");
        fetchAttendance();
      } catch (err) {
        showToast(err.response?.data?.error || "Delete failed", "error");
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editRecord && !formData.user_id) {
      setFieldErrors({ user_id: "Plese enter employee" });
      return;
    }
    try {
      setFieldErrors({});
      const effectiveDate = formData.date || new Date().toISOString().slice(0, 10);
      const fullClockIn = formData.clock_in ? `${effectiveDate} ${formData.clock_in}:00` : null;
      const fullClockOut = formData.clock_out ? `${effectiveDate} ${formData.clock_out}:00` : null;

      let effectiveHours = formData.total_hours !== undefined && formData.total_hours !== null && formData.total_hours !== ""
        ? Number(formData.total_hours)
        : null;

      if (effectiveHours === null || isNaN(effectiveHours)) {
        if (formData.clock_in && formData.clock_out) {
          const [inH, inM] = formData.clock_in.split(":").map(Number);
          const [outH, outM] = formData.clock_out.split(":").map(Number);
          const diffMinutes = (outH * 60 + outM) - (inH * 60 + inM);
          effectiveHours = diffMinutes > 0 ? parseFloat((diffMinutes / 60).toFixed(2)) : 0.00;
        } else if (formData.clock_in && !formData.clock_out) {
          effectiveHours = 0.00;
        } else {
          effectiveHours = 0.00;
        }
      }

      if (editRecord) {
        await API.put(`/attendance/${editRecord.id}`, {
          status: formData.status,
          total_hours: effectiveHours,
          clock_in: fullClockIn,
          clock_out: fullClockOut,
          work_mode: formData.work_mode,
          notes: formData.notes,
          only_admin_clock_out: formData.only_admin_clock_out ? 1 : 0,
          is_regularized: 1
        });
        showToast("Attendance updated successfully!");
      } else {
        await API.post("/attendance/manual", {
          ...formData,
          date: effectiveDate,
          clock_in: fullClockIn,
          clock_out: fullClockOut,
          total_hours: effectiveHours,
          only_admin_clock_out: formData.only_admin_clock_out ? 1 : 0
        });
        showToast("Attendance added successfully!");
      }
      setShowModal(false);
      setEditRecord(null);
      setFieldErrors({});
      fetchAttendance();
    } catch (err) {
      const serverErr = err.response?.data?.error;
      const serverField = err.response?.data?.field;
      if (serverField) {
        setFieldErrors({ [serverField]: serverErr });
      } else {
        showToast(serverErr || "Action failed", "error");
      }
    }
  };

  // Helper: Convert "18:30" to "06:30 PM"
  const format12Hour = (timeStr) => {
    if (!timeStr || typeof timeStr !== "string" || !timeStr.includes(":")) return timeStr || "-";
    const parts = timeStr.split(":");
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1] || "00";
    if (isNaN(hours)) return timeStr;
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = hours < 10 ? `0${hours}` : hours;
    return `${formattedHours}:${minutes} ${ampm}`;
  };

  // Helper: Calculate duration between two time strings like "09:30" and "18:30"
  const calculateShiftHours = (inTime, outTime) => {
    if (!inTime || !outTime) return "0 hrs";
    const [h1, m1] = inTime.split(":").map(Number);
    const [h2, m2] = outTime.split(":").map(Number);
    let diffMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // overnight shift
    const hrs = (diffMinutes / 60).toFixed(1);
    return `${hrs.endsWith(".0") ? parseInt(hrs, 10) : hrs} hrs`;
  };

  // Helper: Format decimal hours (e.g. 9.62) to human-readable format "9h 37m" (or "9 hrs 37 mins")
  const formatHoursToHM = (decimalHours) => {
    if (decimalHours === null || decimalHours === undefined || decimalHours === "" || isNaN(decimalHours)) {
      return "0h 0m";
    }
    const totalMinutes = Math.round(parseFloat(decimalHours) * 60);
    if (totalMinutes <= 0) return "0h 0m";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  };

  // Helper: Get exact time after X hours from clock_in_time (e.g. 09:30 + 4.75 hrs = 14:15 / 02:15 PM)
  const getTimeAfterHours = (inTime, hoursDecimal) => {
    if (!inTime) return "-";
    const [h, m] = inTime.split(":").map(Number);
    const totalMinutes = h * 60 + m + Math.round(parseFloat(hoursDecimal || 0) * 60);
    const finalHours = Math.floor(totalMinutes / 60) % 24;
    const finalMins = totalMinutes % 60;
    const timeStr = `${finalHours < 10 ? `0${finalHours}` : finalHours}:${finalMins < 10 ? `0${finalMins}` : finalMins}`;
    return format12Hour(timeStr);
  };

  // Helper: Detect if a date string is a Saturday and which Saturday of the month it is
  const getSaturdayBadge = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (d.getDay() !== 6) return null; // Not a Saturday
    const satIndex = Math.ceil(d.getDate() / 7);
    const isHoliday = (satIndex === 2 || satIndex === 4);
    return {
      satIndex,
      isHoliday,
      label: isHoliday ? `${satIndex === 2 ? "2nd" : "4th"} Sat (Holiday)` : `${satIndex === 1 ? "1st" : satIndex === 3 ? "3rd" : "5th"} Sat (Working)`
    };
  };

  if (!canRead) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <h2>Access Denied</h2>
        <p>You do not have permission to view Attendance Management.</p>
      </div>
    );
  }

  return (
    <div className="task-page" style={{ padding: "24px" }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "700", color: "#1e293b", margin: 0 }}>Attendance Management</h1>
          <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px" }}>
            Real-time Clock In / Clock Out tracking, weekday shift schedules & manual regularization.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {activeTab === "attendance" && canCreate && (
            <button 
              className="primary-button"
              onClick={() => {
                setEditRecord(null);
                setFormData({
                  user_id: staffList[0]?._id || "",
                  user_name: staffList[0]?.name || "",
                  user_email: staffList[0]?.email || "",
                  date: new Date().toISOString().slice(0, 10),
                  status: "Present",
                  total_hours: "",
                  work_mode: "Office",
                  notes: ""
                });
                setShowModal(true);
              }}
              style={{ background: "#4f46e5", color: "#fff", padding: "10px 18px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "600" }}
            >
              + Add Attendance Entry
            </button>
          )}
        </div>
      </div>

      {/* TOP TABS: ATTENDANCE RECORDS | PUNCH REGULARIZATION | WEEKDAY SCHEDULES */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", borderBottom: "1px solid var(--border-color, #e2e8f0)", paddingBottom: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={() => setActiveTab("attendance")}
          style={{
            padding: "8px 18px",
            borderRadius: "8px",
            border: "none",
            fontWeight: "700",
            fontSize: "14px",
            background: activeTab === "attendance" ? "#4f46e5" : "transparent",
            color: activeTab === "attendance" ? "#fff" : "var(--text-muted, #64748b)",
            cursor: "pointer",
            transition: "0.2s"
          }}
        >
          Attendance Records
        </button>
        <button
          onClick={() => { setActiveTab("regularizations"); fetchRegularizations(); }}
          style={{
            padding: "8px 18px",
            borderRadius: "8px",
            border: "none",
            fontWeight: "700",
            fontSize: "14px",
            background: activeTab === "regularizations" ? "#4f46e5" : "transparent",
            color: activeTab === "regularizations" ? "#fff" : "var(--text-muted, #64748b)",
            cursor: "pointer",
            transition: "0.2s",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          Punch Regularization
          {regularizations.filter(r => r.status === "Pending").length > 0 && (
            <span style={{
              background: activeTab === "regularizations" ? "#ef4444" : "#fee2e2",
              color: activeTab === "regularizations" ? "#fff" : "#b91c1c",
              padding: "2px 7px",
              borderRadius: "10px",
              fontSize: "11px",
              fontWeight: "700"
            }}>
              {regularizations.filter(r => r.status === "Pending").length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("forgotPunchOut")}
          style={{
            padding: "8px 18px",
            borderRadius: "8px",
            border: "none",
            fontWeight: "700",
            fontSize: "14px",
            background: activeTab === "forgotPunchOut" ? "#4f46e5" : "transparent",
            color: activeTab === "forgotPunchOut" ? "#fff" : "var(--text-muted, #64748b)",
            cursor: "pointer",
            transition: "0.2s"
          }}
        >
          Forgot Punch Out
        </button>
        <button
          onClick={() => { setActiveTab("overtime"); fetchOvertime(); }}
          style={{
            padding: "8px 18px",
            borderRadius: "8px",
            border: "none",
            fontWeight: "700",
            fontSize: "14px",
            background: activeTab === "overtime" ? "#4f46e5" : "transparent",
            color: activeTab === "overtime" ? "#fff" : "var(--text-muted, #64748b)",
            cursor: "pointer",
            transition: "0.2s",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
        >
          Overtime (OT) Claims & Comp-Off
          {overtimeList.filter(o => o.status === "Pending").length > 0 && (
            <span style={{
              background: activeTab === "overtime" ? "#ef4444" : "#fee2e2",
              color: activeTab === "overtime" ? "#fff" : "#b91c1c",
              padding: "2px 7px",
              borderRadius: "10px",
              fontSize: "11px",
              fontWeight: "700"
            }}>
              {overtimeList.filter(o => o.status === "Pending").length}
            </span>
          )}
        </button>
        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab("schedules")}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              border: "none",
              fontWeight: "700",
              fontSize: "14px",
              background: activeTab === "schedules" ? "#4f46e5" : "transparent",
              color: activeTab === "schedules" ? "#fff" : "var(--text-muted, #64748b)",
              cursor: "pointer",
              transition: "0.2s"
            }}
          >
            Weekday Work Shifts & Schedules
          </button>
        )}
      </div>


      {activeTab === "attendance" && (
        <>
          {/* FILTER BAR */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "20px", background: "var(--ui-surface, #fff)", padding: "16px", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #64748b)", display: "block", marginBottom: "4px" }}>Start Date</label>
              <input 
                type="date" 
                value={filterDate} 
                onChange={(e) => setFilterDate(e.target.value)}
                style={{ padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #64748b)", display: "block", marginBottom: "4px" }}>End Date</label>
              <input 
                type="date" 
                value={filterEndDate} 
                onChange={(e) => setFilterEndDate(e.target.value)}
                style={{ padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #64748b)", display: "block", marginBottom: "4px" }}>Status</label>
              <select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{ padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", minWidth: "150px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              >
                <option value="">All Statuses</option>
                <option value="Present">Present</option>
                <option value="Half Day">Half Day</option>
                <option value="Not Punch Out">Not Punch Out</option>
                <option value="Absent">Absent</option>
                <option value="On Leave">On Leave</option>
              </select>
            </div>
            {isManager && (
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #64748b)", display: "block", marginBottom: "4px" }}>Employee</label>
                <select 
                  value={filterEmployee} 
                  onChange={(e) => setFilterEmployee(e.target.value)}
                  style={{ padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", minWidth: "160px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                >
                  <option value="">All Employees</option>
                  {staffList.map((st) => (
                    <option key={st.id || st._id} value={st.id || st._id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {isSuperAdmin && (
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #64748b)", display: "block", marginBottom: "4px" }}>Admin Clock Out Action</label>
                <button
                  type="button"
                  onClick={() => setFilterPendingClockOut(!filterPendingClockOut)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "6px",
                    border: filterPendingClockOut ? "1px solid #dc2626" : "1px solid var(--ui-border, #cbd5e1)",
                    background: filterPendingClockOut ? "rgba(220, 38, 38, 0.15)" : "var(--ui-bg, #f8fafc)",
                    color: filterPendingClockOut ? "#ef4444" : "var(--text-main, #475569)",
                    fontWeight: "600",
                    fontSize: "13px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: filterPendingClockOut ? "#dc2626" : "#94a3b8" }} />
                  Pending Clock Out Only
                </button>
              </div>
            )}
            <div>
              <button 
                onClick={() => { setFilterDate(""); setFilterEndDate(""); setFilterStatus(""); setFilterEmployee(""); setFilterPendingClockOut(false); }}
                style={{ padding: "8px 16px", border: "1px solid var(--ui-border, #e2e8f0)", background: "var(--ui-bg, #f8fafc)", color: "var(--text-main, #1e293b)", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}
              >
                Clear Filters
              </button>
            </div>
          </div>

      {/* ATTENDANCE TABLE */}
      <div className="table-container" style={{ background: "var(--ui-surface, #fff)", borderRadius: "10px", overflowX: "auto", WebkitOverflowScrolling: "touch", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", width: "100%", border: "1px solid var(--ui-border, #e2e8f0)" }}>
        <table style={{ width: "100%", minWidth: "850px", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #475569)", fontSize: "13px" }}>
              <th onClick={() => requestAttSort("user_name")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                Employee <SortIndicator sortKey="user_name" currentKey={attSortConfig.key} direction={attSortConfig.direction} />
              </th>
              <th onClick={() => requestAttSort("date")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                Date <SortIndicator sortKey="date" currentKey={attSortConfig.key} direction={attSortConfig.direction} />
              </th>
              <th onClick={() => requestAttSort("clock_in")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                Punch In <SortIndicator sortKey="clock_in" currentKey={attSortConfig.key} direction={attSortConfig.direction} />
              </th>
              <th onClick={() => requestAttSort("clock_out")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                Punch Out <SortIndicator sortKey="clock_out" currentKey={attSortConfig.key} direction={attSortConfig.direction} />
              </th>
              <th onClick={() => requestAttSort("work_mode")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                Work Mode <SortIndicator sortKey="work_mode" currentKey={attSortConfig.key} direction={attSortConfig.direction} />
              </th>
              <th onClick={() => requestAttSort("total_hours")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                Total Hours <SortIndicator sortKey="total_hours" currentKey={attSortConfig.key} direction={attSortConfig.direction} />
              </th>
              <th onClick={() => requestAttSort("status")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                Status <SortIndicator sortKey="status" currentKey={attSortConfig.key} direction={attSortConfig.direction} />
              </th>
              {(canUpdate || canDelete || isSuperAdmin || isCompanyOwner) && (
                <th style={{ padding: "14px 16px" }}>Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading attendance...</td>
              </tr>
            ) : attendanceList.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No attendance records found.</td>
              </tr>
            ) : (
              paginatedAttendance.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)", fontSize: "14px" }}>
                  <td style={{ padding: "14px 16px", fontWeight: "600", color: "var(--text-main, #1e293b)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{ color: "var(--text-main, #1e293b)" }}>{row.user_name || "Employee"}</span>
                      {Boolean(row.is_regularized) && (
                        <span style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          background: "#e0e7ff",
                          color: "#4338ca",
                          border: "1px solid #c7d2fe",
                          padding: "2px 6px",
                          borderRadius: "4px"
                        }}>
                          Edited
                        </span>
                      )}
                      {Boolean(row.only_admin_clock_out) && (
                        <span style={{
                          fontSize: "10px",
                          fontWeight: "700",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                          background: "#fef3c7",
                          color: "#b45309",
                          border: "1px solid #fde68a",
                          padding: "2px 6px",
                          borderRadius: "4px"
                        }}>
                          Admin Clock-Out Only
                        </span>
                      )}
                    </div>
                    <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "400" }}>{row.user_email}</span>
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--text-main, #334155)" }}>
                    <div>
                      {row.date ? new Date(row.date).toLocaleDateString() : "-"}
                      {(() => {
                        const sat = getSaturdayBadge(row.date);
                        if (!sat) return null;
                        return (
                          <span style={{
                            display: "inline-block",
                            marginLeft: "6px",
                            fontSize: "10px",
                            fontWeight: "700",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: sat.isHoliday ? "rgba(239, 68, 68, 0.12)" : "rgba(34, 197, 94, 0.12)",
                            color: sat.isHoliday ? "#ef4444" : "#22c55e",
                            border: sat.isHoliday ? "1px solid rgba(239, 68, 68, 0.25)" : "1px solid rgba(34, 197, 94, 0.25)"
                          }}>
                            {sat.label}
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px", color: "#16a34a", fontWeight: "500" }}>
                    {row.clock_in ? new Date(row.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-"}
                  </td>
                  <td style={{ padding: "14px 16px", color: "#dc2626", fontWeight: "500" }}>
                    {row.clock_out ? new Date(row.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{ padding: "4px 8px", background: "var(--ui-bg, #f1f5f9)", color: "var(--text-main, #1e293b)", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "4px", fontSize: "12px" }}>
                      {row.work_mode || "Office"}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", fontWeight: "600", color: "var(--text-main, #1e293b)" }}>
                    {row.total_hours ? (
                      <span>{formatHoursToHM(row.total_hours)}</span>
                    ) : "0h 0m"}
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{
                      padding: "4px 10px",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: "600",
                      background: row.status === "Present" ? "#dcfce7" : row.status === "Half Day" ? "#fef3c7" : "#fee2e2",
                      color: row.status === "Present" ? "#15803d" : row.status === "Half Day" ? "#b45309" : "#b91c1c"
                    }}>
                      {row.status}
                    </span>
                  </td>
                  {(canUpdate || canDelete || isSuperAdmin || isCompanyOwner) && (
                    <td style={{ padding: "14px 16px" }}>
                      <div className="action-buttons" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {/* Clock Out by Admin button if employee clocked in but not clocked out (Admin only) */}
                        {(isSuperAdmin || isCompanyOwner) && row.clock_in && !row.clock_out && (
                          <button
                            onClick={() => handleAdminClockOut(row.id, row.user_name)}
                            title="Punch Out for Staff"
                            style={{
                              background: "#fee2e2",
                              border: "1px solid #fecaca",
                              color: "#dc2626",
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
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Punch Out
                          </button>
                        )}

                        {canUpdate && (
                          <button 
                            className="action-btn"
                            onClick={() => handleEdit(row)} 
                            title="Edit Attendance"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                        )}
                        {canDelete && (
                          <button 
                            className="action-btn delete"
                            onClick={() => handleDelete(row.id)} 
                            title="Delete Attendance"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination
          currentPage={attendancePage}
          totalRecords={attendanceList.length}
          pageSize={attendancePageSize}
          onPageChange={setAttendancePage}
          onPageSizeChange={(newSize) => { setAttendancePageSize(newSize); setAttendancePage(1); }}
        />
      </div>
      </>
      )}

      {/* TAB 2: PUNCH REGULARIZATION */}
      {activeTab === "regularizations" && (
        <div>
          {/* STATS OVERVIEW CARDS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
            <div style={{ background: "var(--ui-surface, #fff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #64748b)", textTransform: "uppercase" }}>Total Records</div>
              <div style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-main, #1e293b)", marginTop: "4px" }}>
                {regStats.total_records || regularizations.length}
              </div>
            </div>
            <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "12px", padding: "16px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#dc2626", textTransform: "uppercase" }}>Not Punch Out</div>
              <div style={{ fontSize: "24px", fontWeight: "800", color: "#b91c1c", marginTop: "4px" }}>
                {regStats.not_punch_out || regularizations.filter(r => r.clock_in && !r.clock_out).length}
              </div>
            </div>
            <div style={{ background: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "12px", padding: "16px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#16a34a", textTransform: "uppercase" }}>Punch Out (Completed)</div>
              <div style={{ fontSize: "24px", fontWeight: "800", color: "#15803d", marginTop: "4px" }}>
                {regStats.completed_punch || regularizations.filter(r => r.clock_in && r.clock_out).length}
              </div>
            </div>
            <div style={{ background: "rgba(79, 70, 229, 0.08)", border: "1px solid rgba(79, 70, 229, 0.3)", borderRadius: "12px", padding: "16px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: "#4f46e5", textTransform: "uppercase" }}>Punch In (Total Active)</div>
              <div style={{ fontSize: "24px", fontWeight: "800", color: "#4338ca", marginTop: "4px" }}>
                {regStats.punched_in || regularizations.filter(r => r.clock_in).length}
              </div>
            </div>
          </div>

          {/* FILTER BAR: Start Date, End Date, Employee Dropdown, Status */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "16px", marginBottom: "20px", background: "var(--ui-surface, #fff)", padding: "16px", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)", flexWrap: "wrap", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #64748b)", display: "block", marginBottom: "4px" }}>Start Date</label>
                <input 
                  type="date" 
                  value={regStartDate} 
                  onChange={(e) => setRegStartDate(e.target.value)}
                  style={{ padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                />
              </div>

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #64748b)", display: "block", marginBottom: "4px" }}>End Date</label>
                <input 
                  type="date" 
                  value={regEndDate} 
                  onChange={(e) => setRegEndDate(e.target.value)}
                  style={{ padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                />
              </div>

              {isManager && (
                <div>
                  <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #64748b)", display: "block", marginBottom: "4px" }}>Employee</label>
                  <select 
                    value={regUser} 
                    onChange={(e) => setRegUser(e.target.value)}
                    style={{ padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", minWidth: "160px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                  >
                    <option value="">All Employees</option>
                    {staffList.map((st) => (
                      <option key={st.id || st._id} value={st.id || st._id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #64748b)", display: "block", marginBottom: "4px" }}>Status</label>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  {["All", "Not Punch Out", "Punch Out", "Present", "On Leave", "Absent"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setRegStatusFilter(st)}
                      style={{
                        padding: "7px 14px",
                        borderRadius: "6px",
                        border: regStatusFilter === st ? "1px solid #4f46e5" : "1px solid var(--ui-border, #cbd5e1)",
                        background: regStatusFilter === st 
                          ? (st === "Not Punch Out" ? "#dc2626" : "#4f46e5") 
                          : "var(--ui-bg, #f8fafc)",
                        color: regStatusFilter === st ? "#fff" : "var(--text-main, #475569)",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                        transition: "0.15s"
                      }}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <button 
                  type="button"
                  onClick={() => { setRegStartDate(defaultRegStartDate); setRegEndDate(defaultRegEndDate); setRegUser(""); setRegStatusFilter("All"); }}
                  style={{ padding: "8px 16px", border: "1px solid var(--ui-border, #e2e8f0)", background: "var(--ui-bg, #f8fafc)", color: "var(--text-main, #1e293b)", borderRadius: "6px", cursor: "pointer", fontSize: "13px", fontWeight: "600" }}
                >
                  Clear Filters
                </button>
              </div>
            </div>

            <button
              onClick={fetchRegularizations}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: "1px solid var(--ui-border, #cbd5e1)",
                background: "transparent",
                color: "var(--text-main, #475569)",
                fontSize: "13px",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              Refresh
            </button>
          </div>

          {/* PUNCH REGULARIZATION TABLE (1 Punch In, 2 Punch Out, Employee, Date, Status, Actions) */}
          <div style={{ overflowX: "auto", background: "var(--ui-surface, #fff)", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)" }}>
                  <th style={{ padding: "12px 16px", fontWeight: "700" }}>Employee</th>
                  <th style={{ padding: "12px 16px", fontWeight: "700" }}>Date</th>
                  <th style={{ padding: "12px 16px", fontWeight: "700" }}>1. Punch In</th>
                  <th style={{ padding: "12px 16px", fontWeight: "700" }}>2. Punch Out</th>
                  <th style={{ padding: "12px 16px", fontWeight: "700" }}>Total Hours</th>
                  <th style={{ padding: "12px 16px", fontWeight: "700" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {regLoading && regularizations.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>
                      Loading punch records...
                    </td>
                  </tr>
                ) : regularizations.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
                        <IconFileText size={32} color="#94a3b8" />
                      </div>
                      <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-main, #334155)" }}>No punch records found</div>
                      <div style={{ fontSize: "12px", marginTop: "4px" }}>No attendance records match the selected filters.</div>
                    </td>
                  </tr>
                ) : (
                  paginatedRegs.map((r) => {
                    const punchInTime = r.clock_in ? new Date(r.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-";
                    const punchOutTime = r.clock_out ? new Date(r.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-";
                    const isMissingPunchOut = Boolean(r.clock_in && !r.clock_out);

                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)" }}>
                        <td style={{ padding: "14px 16px" }}>
                          <div style={{ fontWeight: "700", color: "var(--text-main, #1e293b)" }}>{r.user_name || "Employee"}</div>
                          <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>{r.user_email}</div>
                        </td>
                        <td style={{ padding: "14px 16px", color: "var(--text-main, #334155)", fontWeight: "600" }}>
                          {r.date ? new Date(r.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : "-"}
                        </td>
                        <td style={{ padding: "14px 16px", color: "#16a34a", fontWeight: "700" }}>
                          {punchInTime}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {r.clock_out ? (
                            <span style={{ color: "#dc2626", fontWeight: "700" }}>{punchOutTime}</span>
                          ) : isMissingPunchOut ? (
                            <span style={{ color: "#dc2626", fontWeight: "700", background: "#fee2e2", padding: "3px 8px", borderRadius: "4px", fontSize: "12px" }}>
                              Not Punch Out
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td style={{ padding: "14px 16px", fontWeight: "600", color: "var(--text-main, #1e293b)" }}>
                          {r.total_hours ? (
                            <span>{formatHoursToHM(r.total_hours)}</span>
                          ) : (
                            "0h 0m"
                          )}
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {isMissingPunchOut ? (
                            <span style={{
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "11px",
                              fontWeight: "700",
                              background: "#fee2e2",
                              color: "#b91c1c"
                            }}>
                              ● Not Punch Out
                            </span>
                          ) : (
                            <span style={{
                              padding: "4px 10px",
                              borderRadius: "12px",
                              fontSize: "11px",
                              fontWeight: "700",
                              background: r.status === "Present" ? "#dcfce7" : r.status === "Half Day" ? "#fef3c7" : "#fee2e2",
                              color: r.status === "Present" ? "#15803d" : r.status === "Half Day" ? "#b45309" : "#b91c1c"
                            }}>
                              {r.status || "Present"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={regPage}
              totalRecords={regularizations.length}
              pageSize={regPageSize}
              onPageChange={setRegPage}
              onPageSizeChange={(newSize) => { setRegPageSize(newSize); setRegPage(1); }}
            />
          </div>
        </div>
      )}

      {/* TAB: FORGOT PUNCH OUT (employee request -> admin approval) */}
      {activeTab === "forgotPunchOut" && (
        <ForgotPunchOutTab
          isAdmin={isSuperAdmin || isCompanyOwner}
          highlightId={searchParams.get("att")}
          onChanged={() => { fetchAttendance(); fetchRegularizations(); }}
        />
      )}

      {/* TAB 3: OVERTIME (OT) & COMP-OFF CLAIMS */}
      {activeTab === "overtime" && (
        <div style={{ background: "var(--ui-surface, #fff)", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", padding: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main, #0f172a)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <IconClock size={18} color="#4f46e5" /> Overtime (OT) Claims & Compensatory Off
              </h3>
              <p style={{ fontSize: "13px", color: "var(--text-muted, #64748b)", margin: "4px 0 0" }}>
                Claim extra hours worked beyond standard shift (&gt;9 hours). Choose between Overtime Payout or Comp-Off leave balance credit.
              </p>
            </div>
            <button
              onClick={() => setShowOtModal(true)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "none",
                background: "linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)",
                color: "#fff",
                fontWeight: "700",
                fontSize: "13px",
                cursor: "pointer",
                boxShadow: "0 2px 6px rgba(79,70,229,0.3)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <IconPlus size={14} color="#fff" /> Claim Overtime
            </button>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)", fontWeight: "700" }}>
                  <th style={{ padding: "10px 14px" }}>Date</th>
                  <th style={{ padding: "10px" }}>Employee</th>
                  <th style={{ padding: "10px" }}>OT Hours</th>
                  <th style={{ padding: "10px" }}>Claim Preference</th>
                  <th style={{ padding: "10px" }}>Reason / Project Deliverable</th>
                  <th style={{ padding: "10px" }}>Status</th>
                  <th style={{ padding: "10px 14px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {otLoading ? (
                  <tr><td colSpan="7" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>Loading overtime requests...</td></tr>
                ) : overtimeList.length === 0 ? (
                  <tr><td colSpan="7" style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>No overtime claims submitted yet.</td></tr>
                ) : (
                  paginatedOt.map(ot => {
                    const statusColors = {
                      Pending: { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
                      Approved: { bg: "#ecfdf5", text: "#047857", border: "#a7f3d0" },
                      Rejected: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" }
                    };
                    const col = statusColors[ot.status] || statusColors.Pending;

                    return (
                      <tr key={ot.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)" }}>
                        <td style={{ padding: "10px 14px", fontWeight: "700", color: "#1e293b" }}>{ot.date}</td>
                        <td style={{ padding: "10px", fontWeight: "600" }}>{ot.user_name}</td>
                        <td style={{ padding: "10px", fontWeight: "800", color: "#4f46e5" }}>+{ot.ot_hours} hrs</td>
                        <td style={{ padding: "10px" }}>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: "700",
                            background: ot.action_type === "Credit Comp-Off" ? "#f5f3ff" : "#eff6ff",
                            color: ot.action_type === "Credit Comp-Off" ? "#6d28d9" : "#1d4ed8"
                          }}>
                            {ot.action_type}
                          </span>
                        </td>
                        <td style={{ padding: "10px", color: "#334155" }}>{ot.reason}</td>
                        <td style={{ padding: "10px" }}>
                          <span style={{
                            padding: "2px 8px",
                            borderRadius: "9999px",
                            fontSize: "11px",
                            fontWeight: "700",
                            background: col.bg,
                            color: col.text,
                            border: `1px solid ${col.border}`
                          }}>
                            {ot.status}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "right" }}>
                          {isSuperAdmin && ot.status === "Pending" ? (
                            <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                              <button
                                onClick={() => setOtReviewModal({ show: true, item: ot, action: "approve", comment: "Approved" })}
                                style={{ padding: "4px 8px", borderRadius: "6px", border: "none", background: "#10b981", color: "#fff", fontSize: "11px", fontWeight: "700", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              >
                                <IconCheck size={12} color="#fff" /> Approve
                              </button>
                              <button
                                onClick={() => setOtReviewModal({ show: true, item: ot, action: "reject", comment: "" })}
                                style={{ padding: "4px 8px", borderRadius: "6px", border: "none", background: "#ef4444", color: "#fff", fontSize: "11px", fontWeight: "700", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              >
                                <IconX size={12} color="#fff" /> Reject
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              {ot.approver_name ? `Reviewed by ${ot.approver_name}` : "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            <Pagination
              currentPage={otPage}
              totalRecords={overtimeList.length}
              pageSize={otPageSize}
              onPageChange={setOtPage}
              onPageSizeChange={(newSize) => { setOtPageSize(newSize); setOtPage(1); }}
            />
          </div>
        </div>
      )}

      {/* ─── CLAIM OVERTIME MODAL ─── */}
      <FormModal
        isOpen={showOtModal}
        onClose={() => setShowOtModal(false)}
        title="Submit Overtime (OT) Claim"
        onSubmit={handleClaimOt}
        submitText={submittingOt ? "Submitting..." : "Submit Claim"}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px" }}>
              Date Worked <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="date"
              value={otForm.date}
              onChange={(e) => {
                setOtForm({ ...otForm, date: e.target.value });
                if (otFieldErrors.date) setOtFieldErrors(prev => ({ ...prev, date: null }));
              }}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "6px",
                border: otFieldErrors.date ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                background: otFieldErrors.date ? "#fff5f5" : "var(--ui-surface, #fff)"
              }}
            />
            {otFieldErrors.date && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {otFieldErrors.date}
              </span>
            )}
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px" }}>
              Overtime Hours <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="12"
              value={otForm.ot_hours}
              onChange={(e) => {
                setOtForm({ ...otForm, ot_hours: e.target.value });
                if (otFieldErrors.ot_hours) setOtFieldErrors(prev => ({ ...prev, ot_hours: null }));
              }}
              style={{
                width: "100%",
                padding: "8px",
                borderRadius: "6px",
                border: otFieldErrors.ot_hours ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                background: otFieldErrors.ot_hours ? "#fff5f5" : "var(--ui-surface, #fff)"
              }}
            />
            {otFieldErrors.ot_hours && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {otFieldErrors.ot_hours}
              </span>
            )}
          </div>
        </div>

        <div style={{ marginTop: "12px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "6px" }}>Compensation Preference</label>
          <div style={{ display: "flex", gap: "16px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="radio"
                name="ot_action"
                value="Pay Overtime"
                checked={otForm.action_type === "Pay Overtime"}
                onChange={(e) => setOtForm({ ...otForm, action_type: e.target.value })}
              />
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: "700" }}>
                <IconMoney size={15} color="#1d4ed8" /> Pay Overtime Payout
              </span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }}>
              <input
                type="radio"
                name="ot_action"
                value="Credit Comp-Off"
                checked={otForm.action_type === "Credit Comp-Off"}
                onChange={(e) => setOtForm({ ...otForm, action_type: e.target.value })}
              />
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: "700" }}>
                <IconCalendar size={15} color="#6d28d9" /> Credit Compensatory Off Leave
              </span>
            </label>
          </div>
        </div>

        <div style={{ marginTop: "12px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px" }}>
            Reason / Project Deliverable <span style={{ color: "#ef4444" }}>*</span>
          </label>
          <textarea
            rows="3"
            placeholder="e.g. Critical production release deployment and post-release monitoring until 11 PM."
            value={otForm.reason}
            onChange={(e) => {
              setOtForm({ ...otForm, reason: e.target.value });
              if (otFieldErrors.reason) setOtFieldErrors(prev => ({ ...prev, reason: null }));
            }}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "6px",
              border: otFieldErrors.reason ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
              background: otFieldErrors.reason ? "#fff5f5" : "var(--ui-surface, #fff)"
            }}
          />
          {otFieldErrors.reason && (
            <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
              {otFieldErrors.reason}
            </span>
          )}
        </div>
      </FormModal>

      {/* ─── REVIEW OVERTIME MODAL ─── */}
      <FormModal
        isOpen={otReviewModal.show}
        onClose={() => setOtReviewModal({ ...otReviewModal, show: false })}
        title={`${otReviewModal.action === "approve" ? "Approve" : "Reject"} Overtime Claim`}
        onSubmit={(e) => { e.preventDefault(); handleReviewOtAction(); }}
        submitText={processingOtReview ? "Processing..." : (otReviewModal.action === "approve" ? "Confirm Approval" : "Confirm Rejection")}
      >
        <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "var(--text-muted)" }}>
          {otReviewModal.item?.user_name} claimed <strong>+{otReviewModal.item?.ot_hours} hrs</strong> on <strong>{otReviewModal.item?.date}</strong> for "{otReviewModal.item?.reason}".
          {otReviewModal.item?.action_type === "Credit Comp-Off" && otReviewModal.action === "approve" && (
            <div style={{ color: "#059669", fontWeight: "700", marginTop: "6px" }}>
              Compensatory off will be automatically credited to employee leave balance upon approval.
            </div>
          )}
        </p>

        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: "700", marginBottom: "4px" }}>Review Comments</label>
          <input
            type="text"
            placeholder={otReviewModal.action === "approve" ? "Approved" : "Reason for rejection"}
            value={otReviewModal.comment}
            onChange={(e) => setOtReviewModal({ ...otReviewModal, comment: e.target.value })}
            style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
          />
        </div>
      </FormModal>

      {/* TAB 4: WEEKDAY WORK SHIFTS / SCHEDULES (SUPERADMIN ONLY) */}
      {activeTab === "schedules" && isSuperAdmin && (

        <div>
          {/* MONTHLY LATE INSTANCES & GRACE POLICY */}
          <div style={{
            background: "var(--card-bg, var(--ui-surface, #fff))",
            borderRadius: "16px",
            padding: "24px",
            marginBottom: "28px",
            border: "1px solid var(--ui-border, #e2e8f0)",
            boxShadow: "var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.03))"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
              <div>
                <h3 style={{ fontSize: "17px", fontWeight: "800", color: "var(--text-main, #1e293b)", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Monthly Late Instances & Grace Time Policy
                </h3>
                <p style={{ fontSize: "13px", color: "var(--text-muted, #64748b)", margin: "4px 0 0" }}>
                  Configure employee monthly late arrival allowances and grace period. Once monthly instances are exhausted, late arrivals automatically receive a First Half Day penalty.
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveAttSettings} style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 1, minWidth: "220px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "6px" }}>
                  Monthly Late Instances Limit (Count)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={attSettings.monthly_late_instances}
                  onChange={(e) => setAttSettings({ ...attSettings, monthly_late_instances: parseInt(e.target.value) || 0 })}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    fontSize: "14px",
                    fontWeight: "600",
                    background: "var(--ui-bg, #f8fafc)",
                    color: "var(--text-main, #0f172a)",
                    boxSizing: "border-box"
                  }}
                  placeholder="e.g. 3"
                />
                <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", display: "block", marginTop: "4px" }}>
                  Max late clock-ins allowed per employee per month (e.g. 3 instances)
                </span>
              </div>

              <div style={{ flex: 1, minWidth: "220px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "6px" }}>
                  Late Grace Time (Minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  max="180"
                  value={attSettings.late_grace_minutes}
                  onChange={(e) => setAttSettings({ ...attSettings, late_grace_minutes: parseInt(e.target.value) || 0 })}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    fontSize: "14px",
                    fontWeight: "600",
                    background: "var(--ui-bg, #f8fafc)",
                    color: "var(--text-main, #0f172a)",
                    boxSizing: "border-box"
                  }}
                  placeholder="e.g. 30"
                />
                <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", display: "block", marginTop: "4px" }}>
                  Arrival after Shift Start + Grace (e.g. 10:00 + 30m = 10:31 AM) counts as late instance
                </span>
              </div>

              <div style={{ flex: 1, minWidth: "220px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "6px" }}>
                  Max Late for Half Day (Minutes)
                </label>
                <input
                  type="number"
                  min="0"
                  max="480"
                  value={attSettings.half_day_late_minutes ?? 120}
                  onChange={(e) => setAttSettings({ ...attSettings, half_day_late_minutes: parseInt(e.target.value) || 0 })}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    fontSize: "14px",
                    fontWeight: "600",
                    background: "var(--ui-bg, #f8fafc)",
                    color: "var(--text-main, #0f172a)",
                    boxSizing: "border-box"
                  }}
                  placeholder="e.g. 120"
                />
                <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", display: "block", marginTop: "4px" }}>
                  Arrival after Shift Start + this (e.g. 10:00 + 120m = 12:00 PM) directly marks as Half Day
                </span>
              </div>

              <button
                type="submit"
                disabled={savingSettings}
                style={{
                  background: "#4f46e5",
                  color: "#fff",
                  border: "none",
                  padding: "11px 24px",
                  borderRadius: "10px",
                  fontWeight: "700",
                  fontSize: "13px",
                  cursor: "pointer",
                  height: "42px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 2px 8px rgba(79, 70, 229, 0.3)"
                }}
              >
                {savingSettings ? "Saving..." : "Save Policy"}
              </button>
            </form>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main, #1e293b)", margin: 0 }}>
              Company Work Shifts (Weekly Hours)
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted, #64748b)", margin: "4px 0 0" }}>
              Set standard Clock In & Clock Out per day of the week (Monday, Tuesday, etc.). Applied across all dates automatically.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
            {schedules.map((item) => (
              <div
                key={item.id}
                className="shift-card"
                style={{
                  background: "var(--card-bg, var(--ui-surface, #fff))",
                  borderRadius: "14px",
                  padding: "20px",
                  border: item.is_working_day ? "1px solid var(--ui-border, #e2e8f0)" : "1px dashed var(--ui-border, #cbd5e1)",
                  boxShadow: "var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.03))",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  opacity: item.is_working_day ? 1 : 0.75
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-main, #1e293b)" }}>
                    {item.day_of_week}
                  </h4>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "20px",
                      fontSize: "12px",
                      fontWeight: "700",
                      background: item.is_working_day ? "rgba(34, 197, 94, 0.15)" : "var(--ui-border, #f1f5f9)",
                      color: item.is_working_day ? "#22c55e" : "var(--text-muted, #64748b)",
                      border: item.is_working_day ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid var(--ui-border, #cbd5e1)"
                    }}
                  >
                    {item.is_working_day ? "Working Day" : "Off Day"}
                  </span>
                </div>

                <div style={{ 
                  background: "var(--ui-bg, #f8fafc)", 
                  padding: "12px 14px", 
                  borderRadius: "10px", 
                  border: "1px solid var(--ui-border, #f1f5f9)" 
                }}>
                  {item.is_working_day ? (
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                        <div>
                          <span style={{ display: "block", color: "var(--text-muted, #64748b)", fontSize: "11px", fontWeight: "600" }}>CLOCK IN</span>
                          <strong style={{ color: "#22c55e" }}>{format12Hour(item.clock_in_time)}</strong>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <span style={{ display: "block", color: "var(--text-muted, #64748b)", fontSize: "11px", fontWeight: "600" }}>CLOCK OUT</span>
                          <strong style={{ color: "#ef4444" }}>{format12Hour(item.clock_out_time)}</strong>
                        </div>
                      </div>
                      <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px dashed var(--ui-border, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Total Shift Hours:</span>
                        <strong style={{ fontSize: "13px", color: "var(--primary-color, #4f46e5)", background: "var(--primary-light, #e0e7ff)", padding: "2px 8px", borderRadius: "6px" }}>
                          {calculateShiftHours(item.clock_in_time, item.clock_out_time)}
                        </strong>
                      </div>

                      {/* Half-Day Shift Breakdown */}
                      <div style={{ marginTop: "10px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        <div style={{ background: "rgba(59, 130, 246, 0.1)", padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                          <span style={{ display: "block", color: "#3b82f6", fontSize: "11px", fontWeight: "700" }}>1ST HALF</span>
                          <strong style={{ color: "#60a5fa", fontSize: "12px" }}>
                            {item.first_half_hours || "4.75"} hrs
                          </strong>
                          <span style={{ display: "block", color: "var(--text-muted, #64748b)", fontSize: "11px", marginTop: "2px" }}>
                            Up to {getTimeAfterHours(item.clock_in_time, item.first_half_hours || 4.75)}
                          </span>
                        </div>
                        <div style={{ background: "rgba(217, 70, 239, 0.1)", padding: "8px 10px", borderRadius: "8px", border: "1px solid rgba(217, 70, 239, 0.2)" }}>
                          <span style={{ display: "block", color: "#d946ef", fontSize: "11px", fontWeight: "700" }}>2ND HALF</span>
                          <strong style={{ color: "#f472b6", fontSize: "12px" }}>
                            {item.second_half_hours || "4.75"} hrs
                          </strong>
                          <span style={{ display: "block", color: "var(--text-muted, #64748b)", fontSize: "11px", marginTop: "2px" }}>
                            After {getTimeAfterHours(item.clock_in_time, item.first_half_hours || 4.75)}
                          </span>
                        </div>
                      </div>
                      {/* Saturday Specific Rule Badge */}
                      {item.day_of_week === "Saturday" && (
                        <div style={{ marginTop: "10px", padding: "8px 10px", borderRadius: "8px", background: "rgba(99, 102, 241, 0.1)", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
                          <span style={{ display: "block", color: "var(--primary-color, #4f46e5)", fontSize: "11px", fontWeight: "700" }}>SATURDAY HOLIDAY POLICY</span>
                          <span style={{ fontSize: "12px", color: "var(--text-main, #1e293b)", fontWeight: "600", display: "block", marginTop: "2px" }}>
                            {item.saturday_rule === "all_working" ? "All Saturdays Working" : item.saturday_rule === "all_off" ? "All Saturdays Off" : "2nd & 4th Saturday Holiday (1st, 3rd, 5th Working)"}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", color: "var(--text-muted, #94a3b8)", fontSize: "13px", padding: "4px 0" }}>
                      Weekend / Non-working
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "auto", paddingTop: "8px" }}>
                  <button
                    className="action-btn"
                    onClick={() => {
                      setEditingSchedule(item);
                      setScheduleForm({
                        is_working_day: Boolean(item.is_working_day),
                        clock_in_time: item.clock_in_time || "09:30",
                        clock_out_time: item.clock_out_time || "18:30",
                        first_half_hours: item.first_half_hours ? String(item.first_half_hours) : "4.75",
                        second_half_hours: item.second_half_hours ? String(item.second_half_hours) : "4.75",
                        saturday_rule: item.saturday_rule || "2nd_4th_off"
                      });
                      setShowScheduleModal(true);
                    }}
                    title={`Edit ${item.day_of_week} Schedule`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL 1: EDIT / ADD ATTENDANCE (Status, Work Mode, Notes) */}
      <FormModal
        show={showModal}
        onClose={() => {
          setShowModal(false);
          setEditRecord(null);
        }}
        title={editRecord ? "Edit / Regularize Attendance" : "Manual Attendance Entry"}
        onSave={handleSubmit}
        saveText={editRecord ? "Update Record" : "Save Record"}
        maxWidth="480px"
      >
        <form noValidate onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {editRecord ? (
            <div style={{ background: "#f8fafc", padding: "10px 14px", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>Employee</span>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "#1e293b", marginTop: "2px" }}>
                {formData.user_name} <span style={{ fontWeight: "400", color: "#64748b", fontSize: "12px" }}>({formData.user_email})</span>
              </div>
            </div>
          ) : (
            <div>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)", display: "block", marginBottom: "4px" }}>
                Select Staff <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
              </label>
              <select 
                value={formData.user_id} 
                onChange={(e) => {
                  const sel = staffList.find(s => s._id === e.target.value);
                  setFormData({
                    ...formData,
                    user_id: e.target.value,
                    user_name: sel ? sel.name : "",
                    user_email: sel ? sel.email : ""
                  });
                  if (fieldErrors.user_id) setFieldErrors(prev => ({ ...prev, user_id: null }));
                }}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: fieldErrors.user_id ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                  borderRadius: "6px",
                  background: fieldErrors.user_id ? "#fff5f5" : "var(--ui-surface, #fff)",
                  color: "var(--text-main, #1e293b)"
                }}
              >
                <option value="">-- Choose Employee --</option>
                {staffList.map(s => (
                  <option key={s._id} value={s._id}>{s.name} ({s.email})</option>
                ))}
              </select>
              {fieldErrors.user_id && (
                <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                  {fieldErrors.user_id}
                </span>
              )}
            </div>
          )}

          <div>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)", display: "block", marginBottom: "4px" }}>Status</label>
            <select 
              value={formData.status} 
              onChange={(e) => {
                const newStatus = e.target.value;
                setFormData({ ...formData, status: newStatus });
              }}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            >
              <option value="Present">Present</option>
              <option value="Half Day">Half Day</option>
              <option value="Absent">Absent</option>
              <option value="On Leave">On Leave</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)", display: "block", marginBottom: "4px" }}>Clock In Time</label>
              <input 
                type="time" 
                value={formData.clock_in || ""} 
                onChange={(e) => {
                  const cin = e.target.value;
                  let th = formData.total_hours;
                  if (cin && formData.clock_out) {
                    const [inH, inM] = cin.split(":").map(Number);
                    const [outH, outM] = formData.clock_out.split(":").map(Number);
                    const diff = (outH * 60 + outM) - (inH * 60 + inM);
                    th = diff > 0 ? parseFloat((diff / 60).toFixed(2)) : 0;
                  }
                  setFormData({ ...formData, clock_in: cin, total_hours: th });
                }}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)", display: "block", marginBottom: "4px" }}>Clock Out Time</label>
              <input 
                type="time" 
                value={formData.clock_out || ""} 
                onChange={(e) => {
                  const cout = e.target.value;
                  let th = formData.total_hours;
                  if (formData.clock_in && cout) {
                    const [inH, inM] = formData.clock_in.split(":").map(Number);
                    const [outH, outM] = cout.split(":").map(Number);
                    const diff = (outH * 60 + outM) - (inH * 60 + inM);
                    th = diff > 0 ? parseFloat((diff / 60).toFixed(2)) : 0;
                  }
                  setFormData({ ...formData, clock_out: cout, total_hours: th });
                }}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)", display: "block", marginBottom: "4px" }}>Total Hours (calculated or custom)</label>
            <input 
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g. 8.00"
              value={formData.total_hours}
              onChange={(e) => setFormData({ ...formData, total_hours: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)", display: "block", marginBottom: "4px" }}>Work Mode</label>
            <select 
              value={formData.work_mode} 
              onChange={(e) => setFormData({ ...formData, work_mode: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            >
              <option value="Office">Office</option>
              <option value="Work From Home">Work From Home</option>
              <option value="On-site">On-site</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)", display: "block", marginBottom: "4px" }}>Admin Notes</label>
            <textarea 
              value={formData.notes} 
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g. Regularized by Super Admin"
              rows="2"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            />
          </div>

          <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer", margin: 0 }}>
              <input
                type="checkbox"
                checked={formData.only_admin_clock_out}
                onChange={(e) => setFormData({ ...formData, only_admin_clock_out: e.target.checked })}
                style={{ width: "18px", height: "18px", marginTop: "2px", cursor: "pointer" }}
              />
              <div>
                <strong style={{ fontSize: "13px", color: "var(--text-main, #1e293b)", display: "block" }}>
                  Only Admin Can Clock Out
                </strong>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                  Employee cannot clock out themselves from the dashboard. Their clock out can only be completed by an Admin.
                </span>
              </div>
            </label>
          </div>
        </form>
      </FormModal>

      {/* MODAL 2: EDIT WORK SCHEDULE / SHIFT (Monday, Tuesday, etc.) */}
      <FormModal
        show={showScheduleModal && !!editingSchedule}
        onClose={() => {
          setShowScheduleModal(false);
          setEditingSchedule(null);
        }}
        title={`Edit Shift: ${editingSchedule?.day_of_week || ""}`}
        onSave={handleSaveSchedule}
        saveText="Update Shift"
        maxWidth="440px"
      >
        <form onSubmit={handleSaveSchedule} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "600", color: "#1e293b", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={scheduleForm.is_working_day}
                onChange={(e) => setScheduleForm({ ...scheduleForm, is_working_day: e.target.checked })}
                style={{ width: "18px", height: "18px", cursor: "pointer" }}
              />
              Mark as Working Day
            </label>
          </div>

          {editingSchedule?.day_of_week === "Saturday" && (
            <div style={{ background: "rgba(99, 102, 241, 0.08)", padding: "12px 14px", borderRadius: "10px", border: "1px solid rgba(99, 102, 241, 0.2)" }}>
              <label style={{ fontSize: "12px", fontWeight: "700", color: "var(--primary-color, #4f46e5)", display: "block", marginBottom: "6px" }}>
                Saturday Holiday Rule
              </label>
              <select
                value={scheduleForm.saturday_rule || "2nd_4th_off"}
                onChange={(e) => setScheduleForm({ ...scheduleForm, saturday_rule: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)", fontWeight: "600" }}
              >
                <option value="2nd_4th_off">2nd & 4th Saturday Off (1st, 3rd, 5th Working)</option>
                <option value="all_working">All Saturdays Working</option>
                <option value="all_off">All Saturdays Off (Holiday)</option>
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "6px" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>
                  {scheduleForm.saturday_rule === "2nd_4th_off" && "The 2nd and 4th Saturday of every month will be treated as company holidays."}
                  {scheduleForm.saturday_rule === "all_working" && "Employees are required to clock in on all Saturdays."}
                  {scheduleForm.saturday_rule === "all_off" && "All Saturdays are non-working company off days."}
                </span>
              </div>
            </div>
          )}

          {scheduleForm.is_working_day && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)", display: "block", marginBottom: "4px" }}>
                  Clock In Time
                </label>
                <input
                  type="time"
                  value={scheduleForm.clock_in_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, clock_in_time: e.target.value })}
                  required
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                />
                <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "2px", display: "block" }}>
                  {format12Hour(scheduleForm.clock_in_time)}
                </span>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)", display: "block", marginBottom: "4px" }}>
                  Clock Out Time
                </label>
                <input
                  type="time"
                  value={scheduleForm.clock_out_time}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, clock_out_time: e.target.value })}
                  required
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                />
                <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "2px", display: "block" }}>
                  {format12Hour(scheduleForm.clock_out_time)}
                </span>
              </div>
            </div>
          )}

          {scheduleForm.is_working_day && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)", display: "block", marginBottom: "4px" }}>
                  First Half Hours (1st Half)
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="1"
                  max="12"
                  value={scheduleForm.first_half_hours}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, first_half_hours: e.target.value })}
                  required
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                />
                <span style={{ fontSize: "11px", color: "#3b82f6", marginTop: "2px", display: "block" }}>
                  Ends at: {getTimeAfterHours(scheduleForm.clock_in_time, scheduleForm.first_half_hours)}
                </span>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-muted, #475569)", display: "block", marginBottom: "4px" }}>
                  Second Half Hours (2nd Half)
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="1"
                  max="12"
                  value={scheduleForm.second_half_hours}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, second_half_hours: e.target.value })}
                  required
                  style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
                />
                <span style={{ fontSize: "11px", color: "#d946ef", marginTop: "2px", display: "block" }}>
                  Starts at: {getTimeAfterHours(scheduleForm.clock_in_time, scheduleForm.first_half_hours)}
                </span>
              </div>
            </div>
          )}

          {scheduleForm.is_working_day && (
            <div style={{ background: "rgba(34, 197, 94, 0.1)", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(34, 197, 94, 0.25)", fontSize: "12px", color: "var(--text-main, #166534)", lineHeight: "1.5", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: "2px" }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <div>
                <strong>Automatic Leave Integration:</strong> If an employee tries to Clock Out before <strong>{getTimeAfterHours(scheduleForm.clock_in_time, scheduleForm.first_half_hours)}</strong>, they must apply for <strong>First Half Leave</strong>. After this time, they must apply for <strong>Second Half Leave</strong>.
              </div>
            </div>
          )}

          {scheduleForm.is_working_day && (
            <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-muted, #475569)" }}>Calculated Shift Duration:</span>
              <strong style={{ fontSize: "14px", color: "var(--primary-color, #4f46e5)", background: "var(--primary-light, #e0e7ff)", padding: "4px 10px", borderRadius: "6px" }}>
                {calculateShiftHours(scheduleForm.clock_in_time, scheduleForm.clock_out_time)}
              </strong>
            </div>
          )}
        </form>
      </FormModal>

      {/* MODAL: REQUEST PUNCH REGULARIZATION */}
      <FormModal
        isOpen={showRegModal}
        onClose={() => setShowRegModal(false)}
        title="Request Punch Regularization"
        onSubmit={handleCreateRegularization}
        loading={submittingReg}
      >
        <form onSubmit={handleCreateRegularization} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.2)", borderRadius: "8px", padding: "12px 14px", fontSize: "12px", color: "var(--text-main, #334155)", lineHeight: "1.5" }}>
            <strong>Punch Regularization Policy:</strong> Submit a correction if you missed punching in/out, had biometric hardware issues, or worked off-site. Once approved by your reporting manager or admin, your attendance will be automatically marked <strong>Present</strong> with the requested punch hours.
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Target Date <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={regForm.target_date}
              onChange={(e) => {
                setRegForm({ ...regForm, target_date: e.target.value });
                if (regFieldErrors.target_date) setRegFieldErrors(prev => ({ ...prev, target_date: null }));
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: regFieldErrors.target_date ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                borderRadius: "6px",
                background: regFieldErrors.target_date ? "#fff5f5" : "var(--ui-surface, #fff)",
                color: "var(--text-main, #1e293b)"
              }}
            />
            {regFieldErrors.target_date && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {regFieldErrors.target_date}
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
                Requested Clock In <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="time"
                value={regForm.requested_clock_in}
                onChange={(e) => {
                  setRegForm({ ...regForm, requested_clock_in: e.target.value });
                  if (regFieldErrors.requested_clock_in) setRegFieldErrors(prev => ({ ...prev, requested_clock_in: null }));
                }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: regFieldErrors.requested_clock_in ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                  borderRadius: "6px",
                  background: regFieldErrors.requested_clock_in ? "#fff5f5" : "var(--ui-surface, #fff)",
                  color: "var(--text-main, #1e293b)"
                }}
              />
              {regFieldErrors.requested_clock_in && (
                <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                  {regFieldErrors.requested_clock_in}
                </span>
              )}
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
                Requested Clock Out <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <input
                type="time"
                value={regForm.requested_clock_out}
                onChange={(e) => {
                  setRegForm({ ...regForm, requested_clock_out: e.target.value });
                  if (regFieldErrors.requested_clock_out) setRegFieldErrors(prev => ({ ...prev, requested_clock_out: null }));
                }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: regFieldErrors.requested_clock_out ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                  borderRadius: "6px",
                  background: regFieldErrors.requested_clock_out ? "#fff5f5" : "var(--ui-surface, #fff)",
                  color: "var(--text-main, #1e293b)"
                }}
              />
              {regFieldErrors.requested_clock_out && (
                <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                  {regFieldErrors.requested_clock_out}
                </span>
              )}
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Reason for Punch Correction <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <textarea
              rows="3"
              value={regForm.reason}
              onChange={(e) => {
                setRegForm({ ...regForm, reason: e.target.value });
                if (regFieldErrors.reason) setRegFieldErrors(prev => ({ ...prev, reason: null }));
              }}
              placeholder="e.g. Biometric scanner was not working in the morning; client visit off-site; forgot to clock out at end of shift."
              style={{
                width: "100%",
                padding: "10px 12px",
                border: regFieldErrors.reason ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                borderRadius: "6px",
                background: regFieldErrors.reason ? "#fff5f5" : "var(--ui-surface, #fff)",
                color: "var(--text-main, #1e293b)",
                resize: "vertical"
              }}
            />
            {regFieldErrors.reason && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {regFieldErrors.reason}
              </span>
            )}
          </div>
        </form>
      </FormModal>

      {/* MODAL: REVIEW REGULARIZATION (APPROVE / REJECT) */}
      <FormModal
        isOpen={reviewModal.show}
        onClose={() => setReviewModal({ show: false, reg: null, action: "approve", comment: "" })}
        title={reviewModal.action === "approve" ? "Approve Punch Regularization" : "Reject Punch Regularization"}
        onSubmit={handleReviewAction}
        loading={processingReview}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {reviewModal.reg && (
            <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <strong>Employee:</strong> {reviewModal.reg.user_name} ({reviewModal.reg.user_email})
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <strong>Target Date:</strong> {new Date(reviewModal.reg.target_date).toLocaleDateString()}
              </div>
              <div>
                <strong>Reason:</strong> "{reviewModal.reg.reason}"
              </div>
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              {reviewModal.action === "approve" ? "Approval Remarks (Optional)" : "Rejection Reason *"}
            </label>
            <input
              type="text"
              value={reviewModal.comment}
              onChange={(e) => setReviewModal({ ...reviewModal, comment: e.target.value })}
              placeholder={reviewModal.action === "approve" ? "e.g. Verified with team lead / CCTV" : "e.g. Unexplained absence, not approved"}
              required={reviewModal.action === "reject"}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            />
          </div>
        </div>
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

