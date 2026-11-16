import React, { useState, useEffect, useMemo } from "react";
import API from "../api/api";
import { formatDuration } from "../utils/formatDuration";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useProject } from "../contexts/ProjectContext";
import { ChevronLeftIcon, ChevronRightIcon, SheetIcon, CheckIcon, SaveIcon, CloseIcon, IconAlertTriangle, IconFileText } from "../components/common/Icons";
import html2pdf from "html2pdf.js";
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

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin" || user?.role === "Super Admin";
  const isManager = user?.position?.includes("Manager") || user?.role?.name?.includes("Manager") || user?.role === "Manager";
  const canReview = isSuperAdmin || isManager;

  const isSuperAdminUser = (u) => {
    if (!u) return false;
    const name = (u.user_name || u.name || "").toLowerCase();
    const email = (u.user_email || u.email || "").toLowerCase();
    return email === "gadanipranav@gmail.com" || name.includes("super admin");
  };

  // Helper: Detect if project is "Other" or "R&D" (free text typing for task and subtask)
  const isCustomTaskProject = (projectName) => {
    if (!projectName) return false;
    const p = projectName.toLowerCase().trim();
    return p === "other" || p === "r&d" || p === "r & d" || p.includes("r&d") || p.includes("other");
  };

  const getFirstDayOfCurrentMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };
  const getTodayDate = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const [activeTab, setActiveTab] = useState("my-excel"); // "my-excel" | "all-logs" | "summary"
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [dailyEntries, setDailyEntries] = useState([]);
  const [rowErrors, setRowErrors] = useState({});
  const [allTimesheets, setAllTimesheets] = useState([]);
  const [summary, setSummary] = useState({ projectSummary: [], todayHours: 0, weekHours: 0 });
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [leaveList, setLeaveList] = useState([]);
  const [holidayList, setHolidayList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Filters for review tab
  const [filterProject, setFilterProject] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterStartDate, setFilterStartDate] = useState(getFirstDayOfCurrentMonth());
  const [filterEndDate, setFilterEndDate] = useState(getTodayDate());
  const [filterUser, setFilterUser] = useState("");
  const [filterHours, setFilterHours] = useState(""); // "" | "less_9" | "less_8" | "completed"
  const [filterTaskMatch, setFilterTaskMatch] = useState(""); // "" | "out_of_schedule" | "not_assigned"
  const [rejectModal, setRejectModal] = useState({ show: false, id: null, reason: "" });
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPageSize, setReviewPageSize] = useState(10);

  // Helper: Detect if a date is a company holiday (Sunday, 2nd/4th Saturday, or official declared holiday)
  const isCompanyHolidayDate = (dateStr) => {
    if (!dateStr) return false;
    const cleanDate = String(dateStr).slice(0, 10);
    const d = new Date(cleanDate);
    if (isNaN(d.getTime())) return false;

    // 1. Sunday is always a company holiday
    if (d.getDay() === 0) return true;

    // 2. 2nd and 4th Saturday of the month
    if (d.getDay() === 6) {
      const satIndex = Math.ceil(d.getDate() / 7);
      if (satIndex === 2 || satIndex === 4) return true;
    }

    // 3. Listed in company_holidays table
    if (holidayList && holidayList.length > 0) {
      const isOfficialHoliday = holidayList.some(h => {
        const hDate = h.holiday_date ? String(h.holiday_date).slice(0, 10) : "";
        return hDate === cleanDate;
      });
      if (isOfficialHoliday) return true;
    }

    return false;
  };

  // Helper: Find approved leave for a given employee and date
  const getEmployeeLeaveForDate = (userId, userEmail, dateStr) => {
    if (!dateStr || !leaveList || leaveList.length === 0) return null;
    const cleanDate = String(dateStr).slice(0, 10);
    const uId = (userId || "").toString();
    const uEmail = (userEmail || "").toLowerCase();

    return leaveList.find(l => {
      if (l.status !== "Approved") return false;
      const leaveUid = (l.user_id || "").toString();
      const leaveEmail = (l.user_email || "").toLowerCase();
      const matchesUser = (leaveUid && leaveUid === uId) || (leaveEmail && leaveEmail === uEmail);
      if (!matchesUser) return false;

      const fromD = l.from_date ? String(l.from_date).slice(0, 10) : "";
      const toD = l.to_date ? String(l.to_date).slice(0, 10) : fromD;
      return cleanDate >= fromD && cleanDate <= toD;
    });
  };

  // Group each employee's total logged hours by date for consolidated Hours Summary
  const employeeDailySummary = useMemo(() => {
    const map = {};
    (allTimesheets || []).forEach(ts => {
      const userKey = ts.user_id || ts.user_email || ts.user_name || "Unknown";
      const dateKey = ts.date ? String(ts.date).slice(0, 10) : "";
      const key = `${userKey}_${dateKey}`;
      if (!map[key]) {
        map[key] = {
          id: key,
          user_id: ts.user_id,
          user_name: ts.user_name || "Employee",
          user_email: ts.user_email || "",
          date: ts.date,
          total_hours: 0,
          entries_count: 0,
          projects: new Set(),
        };
      }
      map[key].total_hours += (parseFloat(ts.hours) || 0);
      map[key].entries_count += 1;
      if (ts.project_name) map[key].projects.add(ts.project_name);
    });

    // Check every employee in staffList for dates in range if not filled or on leave
    if (filterHours === "missing_or_leave" || filterHours === "on_leave" || filterHours === "not_filled") {
      const startDateStr = filterStartDate || getFirstDayOfCurrentMonth();
      const endDateStr = filterEndDate || getTodayDate();
      const startD = new Date(startDateStr);
      const endD = new Date(endDateStr);

      // Generate date range excluding all company holidays (Sundays, 2nd & 4th Saturdays, Official Holidays)
      const datesInRange = [];
      const curr = new Date(startD);
      while (curr <= endD) {
        const dStr = curr.toISOString().slice(0, 10);
        if (!isCompanyHolidayDate(dStr)) {
          datesInRange.push(dStr);
        }
        curr.setDate(curr.getDate() + 1);
      }

      (staffList || []).forEach(staff => {
        const staffId = (staff._id || staff.id || "").toString();
        const staffEmail = (staff.email || "").toLowerCase();
        const staffName = staff.name || staff.fullName || "Employee";

        datesInRange.forEach(dStr => {
          const key = `${staffId || staffEmail}_${dStr}`;
          const existing = map[key];
          const leave = getEmployeeLeaveForDate(staffId, staffEmail, dStr);

          if (!existing) {
            // Employee did NOT fill timesheet on this working date
            map[key] = {
              id: key,
              user_id: staffId,
              user_name: staffName,
              user_email: staffEmail,
              date: dStr,
              total_hours: 0,
              entries_count: 0,
              projects: new Set(),
              is_missing_entry: true,
              leave_info: leave ? {
                type: leave.leave_type || "Leave",
                reason: leave.reason || "Approved Leave",
                day_type: leave.day_type || "Full Day"
              } : null
            };
          } else if (leave) {
            existing.leave_info = {
              type: leave.leave_type || "Leave",
              reason: leave.reason || "Approved Leave",
              day_type: leave.day_type || "Full Day"
            };
          }
        });
      });
    } else {
      // Also attach leave_info to standard daily summary entries if approved leave exists
      Object.values(map).forEach(item => {
        const leave = getEmployeeLeaveForDate(item.user_id, item.user_email, item.date);
        if (leave) {
          item.leave_info = {
            type: leave.leave_type || "Leave",
            reason: leave.reason || "Approved Leave",
            day_type: leave.day_type || "Full Day"
          };
        }
      });
    }

    const targetHours = filterHours === "less_8" ? 8.0 : 9.0;
    const list = Object.values(map).map(item => {
      const shortage = parseFloat((targetHours - item.total_hours).toFixed(2));
      return {
        ...item,
        target_hours: targetHours,
        shortage: shortage > 0 ? shortage : 0,
        difference: parseFloat((item.total_hours - targetHours).toFixed(2)),
        is_less: item.total_hours < targetHours,
        projects_list: Array.from(item.projects).join(", ")
      };
    });

    if (filterHours === "less_9" || filterHours === "less") {
      return list.filter(item => item.total_hours < 9.0);
    }
    if (filterHours === "less_8") {
      return list.filter(item => item.total_hours < 8.0);
    }
    if (filterHours === "completed") {
      return list.filter(item => item.total_hours >= 9.0);
    }
    if (filterHours === "on_leave") {
      return list.filter(item => Boolean(item.leave_info));
    }
    if (filterHours === "not_filled") {
      return list.filter(item => item.is_missing_entry && !item.leave_info);
    }
    if (filterHours === "missing_or_leave") {
      return list.filter(item => item.is_missing_entry || Boolean(item.leave_info) || item.is_less);
    }
    return list;
  }, [allTimesheets, filterHours, staffList, leaveList, holidayList, filterStartDate, filterEndDate]);

  // Map tasks by id for schedule / assignment checking
  const tasksMap = useMemo(() => {
    const map = new Map();
    (tasks || []).forEach(t => {
      const id = (t._id || t.id)?.toString();
      if (id) map.set(id, t);
    });
    return map;
  }, [tasks]);

  // Enhanced timesheet items with task validation flags
  const timesheetsWithValidation = useMemo(() => {
    return (allTimesheets || []).map(ts => {
      const task = ts.task_id ? tasksMap.get(ts.task_id.toString()) : null;
      let isOutOfSchedule = false;
      let isNotAssigned = false;
      let scheduleInfo = "";

      if (task) {
        const logDateStr = ts.date ? String(ts.date).slice(0, 10) : "";
        const taskStart = task.startDate ? String(task.startDate).slice(0, 10) : "";
        const taskEnd = task.endDate ? String(task.endDate).slice(0, 10) : "";

        // Check if log date is outside scheduled start/end dates
        if (logDateStr) {
          if (taskStart && logDateStr < taskStart) {
            isOutOfSchedule = true;
            scheduleInfo = `Task scheduled from ${new Date(taskStart).toLocaleDateString('en-GB')}`;
          } else if (taskEnd && logDateStr > taskEnd) {
            isOutOfSchedule = true;
            scheduleInfo = `Task deadline was ${new Date(taskEnd).toLocaleDateString('en-GB')}`;
          }
        }

        // Check if user is actually assigned to this task or subtask
        const tsUserId = (ts.user_id || "").toString();
        const tsUserEmail = (ts.user_email || "").toLowerCase();
        
        const assignedUsers = Array.isArray(task.assignedTo) ? task.assignedTo : [];
        const isAssignedToTask = assignedUsers.some(u => {
          const uId = (u?._id || u?.id || u)?.toString();
          const uEmail = (u?.email || "").toLowerCase();
          return (uId && uId === tsUserId) || (uEmail && uEmail === tsUserEmail);
        });

        // Also check subtasks assignment if applicable
        let isAssignedToSubtask = false;
        if (ts.subtask_id && Array.isArray(task.subtasks)) {
          const sub = task.subtasks.find(s => (s._id || s.id)?.toString() === ts.subtask_id.toString());
          if (sub && sub.assignedTo) {
            const subUserId = (sub.assignedTo?._id || sub.assignedTo?.id || sub.assignedTo)?.toString();
            const subEmail = (sub.assignedTo?.email || "").toLowerCase();
            isAssignedToSubtask = (subUserId && subUserId === tsUserId) || (subEmail && subEmail === tsUserEmail);
          }
        }

        if (assignedUsers.length > 0 && !isAssignedToTask && !isAssignedToSubtask) {
          isNotAssigned = true;
        }
      }

      return {
        ...ts,
        isOutOfSchedule,
        isNotAssigned,
        scheduleInfo
      };
    });
  }, [allTimesheets, tasksMap]);

  // Filtered timesheets based on filterTaskMatch
  const filteredTimesheets = useMemo(() => {
    if (!filterTaskMatch) return timesheetsWithValidation;
    if (filterTaskMatch === "out_of_schedule") {
      return timesheetsWithValidation.filter(t => t.isOutOfSchedule);
    }
    if (filterTaskMatch === "not_assigned") {
      return timesheetsWithValidation.filter(t => t.isNotAssigned);
    }
    if (filterTaskMatch === "any_issue") {
      return timesheetsWithValidation.filter(t => t.isOutOfSchedule || t.isNotAssigned);
    }
    return timesheetsWithValidation;
  }, [timesheetsWithValidation, filterTaskMatch]);

  const { sortedData: sortedSummary, sortConfig: summarySortConfig, requestSort: requestSummarySort } = useTableSort(employeeDailySummary, "date", "desc");
  const { sortedData: sortedTimesheets, sortConfig: tsSortConfig, requestSort: requestTsSort } = useTableSort(filteredTimesheets, "date", "desc");

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
  }, [activeTab, selectedDate, filterProject, filterStatus, filterStartDate, filterEndDate, filterUser]);

  useEffect(() => {
    setReviewPage(1);
  }, [filterProject, filterStatus, filterStartDate, filterEndDate, filterUser, filterHours, filterTaskMatch]);

  const fetchMeta = async () => {
    try {
      const [pRes, tRes, sRes, lRes, hRes] = await Promise.all([
        API.get("/projects"),
        API.get("/tasks"),
        API.get("/staff").catch(() => ({ data: [] })),
        API.get("/leaves/all").catch(() => API.get("/leave/all").catch(() => ({ data: [] }))),
        API.get("/holidays").catch(() => ({ data: [] }))
      ]);
      setProjects(pRes.data || []);
      const rawTasks = Array.isArray(tRes.data) ? tRes.data : (tRes.data?.tasks || []);
      setTasks(rawTasks);
      setStaffList(Array.isArray(sRes.data) ? sRes.data : (sRes.data?.staff || []));
      const rawLeaves = Array.isArray(lRes.data) ? lRes.data : (lRes.data?.leaves || lRes.data?.data || []);
      setLeaveList(rawLeaves);
      const rawHolidays = Array.isArray(hRes.data) ? hRes.data : [];
      setHolidayList(rawHolidays);
    } catch (e) {
      console.error(e);
    }
  };

  // Distinct Employee list for filter dropdown (from staffList + any historical timesheets)
  const employeeOptions = useMemo(() => {
    const map = new Map();
    (staffList || []).forEach(s => {
      const id = (s._id || s.id || s.email)?.toString();
      if (id) {
        map.set(id, {
          id,
          name: s.name || s.fullName || s.email || "Employee",
          email: s.email || ""
        });
      }
    });
    (allTimesheets || []).forEach(ts => {
      const id = (ts.user_id || ts.user_email)?.toString();
      if (id && !map.has(id)) {
        map.set(id, {
          id,
          name: ts.user_name || ts.user_email || "Employee",
          email: ts.user_email || ""
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [staffList, allTimesheets]);

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
      if (filterStartDate) url += `startDate=${filterStartDate}&`;
      if (filterEndDate) url += `endDate=${filterEndDate}&`;
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
        const isCustom = isCustomTaskProject(row.project_name);

        if (isCustom) {
          // If custom project ("Other" or "R&D"), initialize text inputs
          row.task_id = "";
          row.task_title = "";
          row.subtask_id = "";
          row.subtask_title = "";
          row.task_status = "In Process";
        } else {
          const projTasks = tasks.filter(t => (t.project?._id || t.project?.id || t.project)?.toString() === value?.toString());
          const firstT = projTasks[0];
          row.task_id = (firstT?._id || firstT?.id)?.toString() || "";
          row.task_title = firstT?.title || "";
          const firstS = firstT?.subtasks?.[0];
          row.subtask_id = (firstS?._id || firstS?.id)?.toString() || "";
          row.subtask_title = firstS?.title || "";
          row.task_status = firstS?.status || "In Process";
        }
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
    const isCustom = isCustomTaskProject(row.project_name);
    const errors = {};
    if (!row.hours || parseFloat(row.hours) <= 0) {
      errors.hours = "Please enter hours";
    }
    if (!row.project_id) {
      errors.project_id = "Please select project";
    }
    if (isCustom) {
      if (!row.task_title || !row.task_title.trim()) {
        errors.task_id = "Please type task name";
      }
      if (!row.subtask_title || !row.subtask_title.trim()) {
        errors.subtask_id = "Please type sub task name";
      }
    } else {
      if (!row.task_id) {
        errors.task_id = "Please select task";
      }
      if (!row.subtask_id) {
        errors.subtask_id = "Please select sub task";
      }
    }
    if (!row.description || !row.description.trim()) {
      errors.description = "Please enter description";
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
      const customTaskId = isCustom ? (row.task_id || `custom_task_${Date.now()}`) : row.task_id;
      const customSubtaskId = isCustom ? (row.subtask_id || `custom_sub_${Date.now()}`) : row.subtask_id;

      const payload = {
        project_id: row.project_id,
        project_name: row.project_name,
        task_id: customTaskId || null,
        task_title: row.task_title || "",
        subtask_id: customSubtaskId || null,
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
        setRowErrors(prev => ({ ...prev, [index]: { ...prev[index], project_id: "Please select project" } }));
        matchedField = true;
      }
      if (errMsg.toLowerCase().includes("subtask") || errMsg.toLowerCase().includes("sub task")) {
        setRowErrors(prev => ({ ...prev, [index]: { ...prev[index], subtask_id: "Please select sub task" } }));
        matchedField = true;
      } else if (errMsg.toLowerCase().includes("task")) {
        setRowErrors(prev => ({ ...prev, [index]: { ...prev[index], task_id: "Please select task" } }));
        matchedField = true;
      }
      if (errMsg.toLowerCase().includes("hours")) {
        setRowErrors(prev => ({ ...prev, [index]: { ...prev[index], hours: errMsg } }));
        matchedField = true;
      }
      if (errMsg.toLowerCase().includes("description")) {
        setRowErrors(prev => ({ ...prev, [index]: { ...prev[index], description: "Please enter description" } }));
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

    // Check for any missing project, task, or subtask before submission
    const invalidEntry = dailyEntries.find(r => !r.project_id || !r.task_id || !r.subtask_id);
    if (invalidEntry) {
      showToast("Each timesheet entry must have a Project, Task, and Sub Task selected!", "error");
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

  // ─── Export Staff Logs to Excel / CSV ─────────────────────────────────────
  const handleExportExcel = () => {
    const dateSuffix = filterStartDate && filterEndDate
      ? `${filterStartDate}_to_${filterEndDate}`
      : (filterStartDate || filterEndDate || new Date().toISOString().slice(0, 10));

    // When Hours Filter is applied, export the aggregated Employee Daily Summary
    if (filterHours) {
      if (!sortedSummary || sortedSummary.length === 0) {
        showToast("No summary records to export!", "error");
        return;
      }

      // Sort records by Employee Name (A to Z) then Date (desc), excluding Super Admin
      const exportSummaryData = [...sortedSummary]
        .filter(item => !isSuperAdminUser(item))
        .sort((a, b) => {
          const nameA = (a.user_name || "").toLowerCase();
          const nameB = (b.user_name || "").toLowerCase();
          const nameCmp = nameA.localeCompare(nameB);
          if (nameCmp !== 0) return nameCmp;
          return (b.date || "").localeCompare(a.date || "");
        });

      const headers = [
        "Sr No",
        "Employee Name",
        "Employee Email",
        "Date",
        "Logged Hours",
        "Required Hours",
        "Remaining Shortage",
        "Status",
        "Projects Worked",
        "Tasks Count"
      ];

      const totalLoggedHoursSum = exportSummaryData.reduce((acc, t) => acc + (parseFloat(t.total_hours) || 0), 0);
      const totalShortageHoursSum = exportSummaryData.reduce((acc, t) => acc + (parseFloat(t.shortage) || 0), 0);
      const totalRequiredHoursSum = exportSummaryData.reduce((acc, t) => acc + (parseFloat(t.target_hours) || 0), 0);

      const rows = exportSummaryData.map((item, idx) => [
        idx + 1,
        `"${(item.user_name || "").replace(/"/g, '""')}"`,
        `"${(item.user_email || "").replace(/"/g, '""')}"`,
        `"${item.date ? new Date(item.date).toLocaleDateString('en-GB') : ""}"`,
        `"${formatDuration(item.total_hours)}"`,
        `"${item.target_hours} h"`,
        `"${item.shortage > 0 ? formatDuration(item.shortage) + ' Short' : '0'}"`,
        `"${item.is_less ? 'Less Hours' : 'Full Day'}"`,
        `"${(item.projects_list || "").replace(/"/g, '""')}"`,
        item.entries_count
      ]);

      // Add Total Summary row at bottom of Excel
      rows.push([
        "",
        `"TOTAL (${exportSummaryData.length} records)"`,
        '""',
        '""',
        `"${formatDuration(totalLoggedHoursSum)}"`,
        `"${totalRequiredHoursSum.toFixed(1)} h (${exportSummaryData.length} Days)"`,
        `"${formatDuration(totalShortageHoursSum)} Short"`,
        '""',
        '""',
        '""'
      ]);

      // Add a blank row and then distinct Employee Overall Summary
      rows.push([]);
      rows.push(["", '"EMPLOYEE OVERALL MISSING HOURS SUMMARY"', "", "", "", "", "", "", "", ""]);
      rows.push(["#", "Employee Name", "Employee Email", "Logged Days", "Total Logged Hours", "Total Required Hours", "Total Missing Shortage", "", "", ""]);

      const empCsvMap = new Map();
      exportSummaryData.forEach(item => {
        const empKey = item.user_id || item.user_email || item.user_name || "Employee";
        if (!empCsvMap.has(empKey)) {
          empCsvMap.set(empKey, {
            name: item.user_name || "Employee",
            email: item.user_email || "",
            days_count: 0,
            total_logged: 0,
            total_required: 0,
            total_shortage: 0,
            shortage_days: 0,
          });
        }
        const acc = empCsvMap.get(empKey);
        acc.days_count += 1;
        acc.total_logged += (parseFloat(item.total_hours) || 0);
        acc.total_required += (parseFloat(item.target_hours) || 0);
        acc.total_shortage += (parseFloat(item.shortage) || 0);
        if (item.shortage > 0) acc.shortage_days += 1;
      });

      Array.from(empCsvMap.values())
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .forEach((emp, i) => {
          rows.push([
            i + 1,
            `"${emp.name.replace(/"/g, '""')}"`,
            `"${emp.email.replace(/"/g, '""')}"`,
            emp.days_count,
            `"${formatDuration(emp.total_logged)}"`,
            `"${emp.total_required.toFixed(1)} h"`,
            `"${emp.total_shortage > 0 ? formatDuration(emp.total_shortage) + ' Short (' + emp.shortage_days + ' days)' : '0'}"`,
            '""',
            '""',
            '""'
          ]);
        });

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Staff_Hours_Summary_${dateSuffix}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast("Staff hours summary exported to Excel successfully!", "success");
      return;
    }

    if (!sortedTimesheets || sortedTimesheets.length === 0) {
      showToast("No timesheet records to export!", "error");
      return;
    }

    // Sort records by Employee Name (A to Z) then Date (desc), excluding Super Admin
    const exportTimesheetData = [...sortedTimesheets]
      .filter(item => !isSuperAdminUser(item))
      .sort((a, b) => {
        const nameA = (a.user_name || "").toLowerCase();
        const nameB = (b.user_name || "").toLowerCase();
        const nameCmp = nameA.localeCompare(nameB);
        if (nameCmp !== 0) return nameCmp;
        return (b.date || "").localeCompare(a.date || "");
      });

    const headers = [
      "Sr No",
      "Employee Name",
      "Employee Email",
      "Date",
      "Task Hours",
      "Project",
      "Task Title",
      "Subtask Title",
      "Description",
      "Task Status",
      "Approval Status",
      "Approved By"
    ];

    const rows = exportTimesheetData.map((ts, idx) => [
      idx + 1,
      `"${(ts.user_name || "").replace(/"/g, '""')}"`,
      `"${(ts.user_email || "").replace(/"/g, '""')}"`,
      `"${ts.date ? new Date(ts.date).toLocaleDateString('en-GB') : ""}"`,
      `"${formatDuration(ts.hours)}"`,
      `"${(ts.project_name || "").replace(/"/g, '""')}"`,
      `"${(ts.task_title || "").replace(/"/g, '""')}"`,
      `"${(ts.subtask_title || "").replace(/"/g, '""')}"`,
      `"${(ts.description || "").replace(/"/g, '""')}"`,
      `"${(ts.task_status || "").replace(/"/g, '""')}"`,
      `"${(ts.status || "").replace(/"/g, '""')}"`,
      `"${(ts.approved_by || "").replace(/"/g, '""')}"`
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Staff_Timesheets_${dateSuffix}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Staff timesheets exported to Excel successfully!", "success");
  };

  // ─── Export Staff Logs to PDF ─────────────────────────────────────────────
  const handleExportPdf = async () => {
    const dateSuffix = filterStartDate && filterEndDate
      ? `${filterStartDate}_to_${filterEndDate}`
      : (filterStartDate || filterEndDate || new Date().toISOString().slice(0, 10));

    const filterDesc = [
      filterStartDate && filterEndDate
        ? `Date: ${new Date(filterStartDate).toLocaleDateString('en-GB')} to ${new Date(filterEndDate).toLocaleDateString('en-GB')}`
        : filterStartDate
          ? `From: ${new Date(filterStartDate).toLocaleDateString('en-GB')}`
          : filterEndDate
            ? `To: ${new Date(filterEndDate).toLocaleDateString('en-GB')}`
            : "All Dates",
      filterProject ? `Project: ${projects.find(p => String(p._id || p.id) === String(filterProject))?.name || "Selected"}` : "",
      filterStatus ? `Status: ${filterStatus}` : "",
      filterHours ? `Hours: ${filterHours === "less_9" ? "Less (<9h)" : filterHours === "less_8" ? "Less (<8h)" : "Full Day (≥9h)"}` : ""
    ].filter(Boolean).join(" | ");

    // Show loading indicator
    showToast("Generating PDF...", "info");

    const container = document.createElement("div");
    container.style.padding = "20px";
    container.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    container.style.color = "#1e293b";
    container.style.background = "#ffffff";

    // Summary PDF when Hours Filter is active
    if (filterHours) {
      if (!sortedSummary || sortedSummary.length === 0) {
        showToast("No summary records to export!", "error");
        return;
      }

      // Sort records by Employee Name (A to Z) then Date (desc), excluding Super Admin
      const exportSummaryData = [...sortedSummary]
        .filter(item => !isSuperAdminUser(item))
        .sort((a, b) => {
          const nameA = (a.user_name || "").toLowerCase();
          const nameB = (b.user_name || "").toLowerCase();
          const nameCmp = nameA.localeCompare(nameB);
          if (nameCmp !== 0) return nameCmp;
          return (b.date || "").localeCompare(a.date || "");
        });

      const summaryTableRows = exportSummaryData.map((item, index) => `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 9px; page-break-inside: avoid;">
          <td style="padding: 8px 6px; width: 5%;">${index + 1}</td>
          <td style="padding: 8px 6px; width: 18%; font-weight: 700; min-width: 100px;">
            ${item.user_name || "—"}<br/>
            <span style="font-size: 8px; color: #64748b; font-weight: 400; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.user_email || ""}</span>
          </td>
          <td style="padding: 8px 6px; width: 10%; white-space: nowrap;">${item.date ? new Date(item.date).toLocaleDateString('en-GB') : "—"}</td>
          <td style="padding: 8px 6px; width: 12%; font-weight: 700; white-space: nowrap;">${formatDuration(item.total_hours)}</td>
          <td style="padding: 8px 6px; width: 8%; color: #64748b; font-weight: 600;">${item.target_hours} h</td>
          <td style="padding: 8px 6px; width: 12%; font-weight: 700; white-space: nowrap; color: ${item.shortage > 0 ? '#dc2626' : '#16a34a'};">
            ${item.shortage > 0 ? `${formatDuration(item.shortage)} Short` : 'Completed'}
          </td>
          <td style="padding: 8px 6px; width: 20%;">
            <span style="display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 8px; font-weight: 700; background: ${item.leave_info ? '#e0e7ff' : item.is_missing_entry ? '#fee2e2' : item.is_less ? '#fee2e2' : '#dcfce7'}; color: ${item.leave_info ? '#3730a3' : item.is_missing_entry ? '#991b1b' : item.is_less ? '#b91c1c' : '#15803d'}; max-width: 100px; overflow: hidden; text-overflow: ellipsis;">
              ${item.leave_info ? `ON LEAVE` : item.is_missing_entry ? 'NOT FILLED' : item.is_less ? 'LESS HOURS' : 'FULL DAY'}
            </span>
          </td>
          <td style="padding: 8px 6px; width: 15%; font-size: 8px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.projects_list || ''}">
            ${item.projects_list || "—"} (${item.entries_count})
          </td>
        </tr>
      `).join("");

      const totalLoggedHoursSum = exportSummaryData.reduce((acc, t) => acc + (parseFloat(t.total_hours) || 0), 0);
      const totalShortageHoursSum = exportSummaryData.reduce((acc, t) => acc + (parseFloat(t.shortage) || 0), 0);
      const totalRequiredHoursSum = exportSummaryData.reduce((acc, t) => acc + (parseFloat(t.target_hours) || 0), 0);

      // Group aggregated total hours and shortage by distinct Employee
      const empAggregateMap = new Map();
      exportSummaryData.forEach(item => {
        const empKey = item.user_id || item.user_email || item.user_name || "Employee";
        if (!empAggregateMap.has(empKey)) {
          empAggregateMap.set(empKey, {
            name: item.user_name || "Employee",
            email: item.user_email || "",
            days_count: 0,
            total_logged: 0,
            total_required: 0,
            total_shortage: 0,
            shortage_days: 0,
          });
        }
        const acc = empAggregateMap.get(empKey);
        acc.days_count += 1;
        acc.total_logged += (parseFloat(item.total_hours) || 0);
        acc.total_required += (parseFloat(item.target_hours) || 0);
        acc.total_shortage += (parseFloat(item.shortage) || 0);
        if (item.shortage > 0) acc.shortage_days += 1;
      });

      const empAggregateList = Array.from(empAggregateMap.values()).sort((a, b) => 
        (a.name || "").localeCompare(b.name || "")
      );

      const empSummaryTableRows = empAggregateList.map((emp, index) => `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10.5px; page-break-inside: avoid;">
          <td style="padding: 7px 6px;">${index + 1}</td>
          <td style="padding: 7px 6px; font-weight: 700;">
            ${emp.name}<br/>
            <span style="font-size: 9px; color: #64748b; font-weight: 400;">${emp.email}</span>
          </td>
          <td style="padding: 7px 6px; text-align: center; font-weight: 600;">${emp.days_count}</td>
          <td style="padding: 7px 6px; font-weight: 700;">${formatDuration(emp.total_logged)}</td>
          <td style="padding: 7px 6px; color: #64748b; font-weight: 600;">${emp.total_required.toFixed(1)} h</td>
          <td style="padding: 7px 6px; font-weight: 800; color: ${emp.total_shortage > 0 ? '#dc2626' : '#16a34a'};">
            ${emp.total_shortage > 0 ? `${formatDuration(emp.total_shortage)} Short (${emp.shortage_days} days)` : 'Completed (0 shortage)'}
          </td>
        </tr>
      `).join("");

      container.innerHTML = `
        <div style="margin-bottom: 16px; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <h2 style="margin: 0 0 4px 0; font-size: 18px; color: #0f172a; font-weight: 800;">Staff Daily Hours Summary Report</h2>
            <div style="font-size: 11px; color: #475569; font-weight: 600;">${filterDesc}</div>
          </div>
          <div style="text-align: right; font-size: 10px; color: #64748b;">
            <div>Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString()}</div>
          </div>
        </div>
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="background: #f8fafc; border-bottom: 1.5px solid #cbd5e1; font-size: 10px; color: #475569; text-transform: uppercase;">
              <th style="padding: 8px 6px;">#</th>
              <th style="padding: 8px 6px;">Employee</th>
              <th style="padding: 8px 6px;">Date</th>
              <th style="padding: 8px 6px;">Logged Hours</th>
              <th style="padding: 8px 6px;">Required</th>
              <th style="padding: 8px 6px;">Remaining Shortage</th>
              <th style="padding: 8px 6px;">Status</th>
              <th style="padding: 8px 6px;">Projects Worked</th>
            </tr>
          </thead>
          <tbody>
            ${summaryTableRows}
          </tbody>
          <tfoot>
            <tr style="background: #f1f5f9; border-top: 2px solid #94a3b8; font-weight: 800; font-size: 11px; page-break-inside: avoid;">
              <td colspan="3" style="padding: 10px 6px; text-align: right; text-transform: uppercase; color: #1e293b;">
                TOTAL (${exportSummaryData.length} records):
              </td>
              <td style="padding: 10px 6px; color: #0f172a; white-space: nowrap;">
                ${formatDuration(totalLoggedHoursSum)}
              </td>
              <td style="padding: 10px 6px; color: #64748b;">
                ${totalRequiredHoursSum.toFixed(1)} h (${exportSummaryData.length} Days)
              </td>
              <td style="padding: 10px 6px; color: #dc2626; white-space: nowrap;">
                ${formatDuration(totalShortageHoursSum)} Short
              </td>
              <td colspan="2" style="padding: 10px 6px;"></td>
            </tr>
          </tfoot>
        </table>

        <!-- Employee-wise Consolidated Total Summary -->
        <div class="html2pdf__page-break" style="page-break-before: always; break-before: page; margin-top: 25px; padding-top: 15px;">
          <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #0f172a; font-weight: 800; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 6px; page-break-after: avoid; break-after: avoid;">
            Employee Overall Missing Hours Summary (${empAggregateList.length} Employees)
          </h3>
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: #f8fafc; border-bottom: 1.5px solid #cbd5e1; font-size: 10px; color: #475569; text-transform: uppercase;">
                <th style="padding: 7px 6px;">#</th>
                <th style="padding: 7px 6px;">Employee</th>
                <th style="padding: 7px 6px; text-align: center;">Logged Days</th>
                <th style="padding: 7px 6px;">Total Logged</th>
                <th style="padding: 7px 6px;">Total Required</th>
                <th style="padding: 7px 6px;">Total Missing Shortage</th>
              </tr>
            </thead>
            <tbody>
              ${empSummaryTableRows}
            </tbody>
            <tfoot>
              <tr style="background: #f1f5f9; border-top: 2px solid #94a3b8; font-weight: 800; font-size: 10.5px; page-break-inside: avoid;">
                <td colspan="3" style="padding: 8px 6px; text-align: right; text-transform: uppercase; color: #1e293b;">
                  OVERALL GRAND TOTAL:
                </td>
                <td style="padding: 8px 6px; color: #0f172a;">${formatDuration(totalLoggedHoursSum)}</td>
                <td style="padding: 8px 6px; color: #64748b;">${totalRequiredHoursSum.toFixed(1)} h (${exportSummaryData.length} Days)</td>
                <td style="padding: 8px 6px; color: #dc2626;">${formatDuration(totalShortageHoursSum)} Short</td>
              </tr>
            </tfoot>
          </table>
        </div>
      `;

      const opt = {
        margin: [8, 8, 8, 8],
        filename: `Staff_Hours_Summary_${dateSuffix}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollY: 0
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "landscape",
          compress: true
        },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      try {
        await html2pdf().from(container).set(opt).save();
        showToast("Staff hours summary exported to PDF successfully!", "success");
      } catch (error) {
        console.error("PDF export error:", error);
        showToast("Failed to generate PDF", "error");
      }
      return;
    }

    if (!sortedTimesheets || sortedTimesheets.length === 0) {
      showToast("No timesheet records to export!", "error");
      return;
    }

    // Sort records by Employee Name (A to Z) then Date (desc), excluding Super Admin
    const exportTimesheetData = [...sortedTimesheets]
      .filter(item => !isSuperAdminUser(item))
      .sort((a, b) => {
        const nameA = (a.user_name || "").toLowerCase();
        const nameB = (b.user_name || "").toLowerCase();
        const nameCmp = nameA.localeCompare(nameB);
        if (nameCmp !== 0) return nameCmp;
        return (b.date || "").localeCompare(a.date || "");
      });

    const totalHoursSum = exportTimesheetData.reduce((acc, t) => acc + (parseFloat(t.hours) || 0), 0);

    const detailTableRows = exportTimesheetData.map((ts, index) => `
      <tr style="border-bottom: 1px solid #e2e8f0; font-size: 10.5px; page-break-inside: avoid;">
        <td style="padding: 7px 6px;">${index + 1}</td>
        <td style="padding: 7px 6px; font-weight: 700;">
          ${ts.user_name || "—"}<br/>
          <span style="font-size: 9px; color: #64748b; font-weight: 400;">${ts.user_email || ""}</span>
        </td>
        <td style="padding: 7px 6px; white-space: nowrap;">
          ${ts.date ? new Date(ts.date).toLocaleDateString('en-GB') : "—"}
        </td>
        <td style="padding: 7px 6px; font-weight: 700; white-space: nowrap;">
          ${formatDuration(ts.hours)}
        </td>
        <td style="padding: 7px 6px; color: #4f46e5; font-weight: 600;">
          ${ts.project_name || "—"}
        </td>
        <td style="padding: 7px 6px;">
          <div style="font-weight: 600;">${ts.task_title || "General Task"}</div>
          ${ts.subtask_title ? `<div style="font-size: 9px; color: #475569;">↳ ${ts.subtask_title}</div>` : ""}
        </td>
        <td style="padding: 7px 6px; max-width: 200px; font-size: 9.5px; color: #334155;">
          ${(ts.description || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
        </td>
        <td style="padding: 7px 6px; text-align: center;">
          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; background: ${ts.task_status === 'Complete' ? '#ecfdf5' : '#eff6ff'}; color: ${ts.task_status === 'Complete' ? '#15803d' : '#1d4ed8'};">
            ${ts.task_status || "—"}
          </span>
        </td>
        <td style="padding: 7px 6px; text-align: center;">
          <span style="display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; background: ${ts.status === 'Approved' ? '#ecfdf5' : ts.status === 'Rejected' ? '#fef2f2' : '#eff6ff'}; color: ${ts.status === 'Approved' ? '#16a34a' : ts.status === 'Rejected' ? '#ef4444' : '#2563eb'};">
            ${ts.status || "Submitted"}
          </span>
        </td>
      </tr>
    `).join("");

    container.innerHTML = `
      <div style="margin-bottom: 16px; border-bottom: 2px solid #4f46e5; padding-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <h2 style="margin: 0 0 4px 0; font-size: 18px; color: #0f172a; font-weight: 800;">Daily Timesheet Report — Staff Logs</h2>
          <div style="font-size: 11px; color: #475569; font-weight: 600;">${filterDesc}</div>
        </div>
        <div style="text-align: right; font-size: 10px; color: #64748b;">
          <div>Generated: ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString()}</div>
          <div>Total Records: <strong>${sortedTimesheets.length}</strong> | Total Hours: <strong>${formatDuration(totalHoursSum)}</strong></div>
        </div>
      </div>
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr style="background: #f8fafc; border-bottom: 1.5px solid #cbd5e1; font-size: 10px; color: #475569; text-transform: uppercase;">
            <th style="padding: 8px 6px;">#</th>
            <th style="padding: 8px 6px;">Employee</th>
            <th style="padding: 8px 6px;">Date</th>
            <th style="padding: 8px 6px;">Hours</th>
            <th style="padding: 8px 6px;">Project</th>
            <th style="padding: 8px 6px;">Task & Subtask</th>
            <th style="padding: 8px 6px;">Description</th>
            <th style="padding: 8px 6px; text-align: center;">Task Status</th>
            <th style="padding: 8px 6px; text-align: center;">Approval</th>
          </tr>
        </thead>
        <tbody>
          ${detailTableRows}
        </tbody>
      </table>
    `;

    const opt = {
      margin: [8, 8, 8, 8],
      filename: `Timesheet_Report_${dateSuffix}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        scrollY: 0
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "landscape",
        compress: true
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    try {
      await html2pdf().from(container).set(opt).save();
      showToast("Staff timesheets exported to PDF successfully!", "success");
    } catch (error) {
      console.error("PDF export error:", error);
      showToast("Failed to generate PDF", "error");
    }
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

        {/* ─── DATE FILTER (Only shown for Daily Sheet tab, hidden on Review & Project tabs or for pure Super Admin view) ───────────── */}
        {activeTab === "my-excel" && !isSuperAdmin && (
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
              Total: {formatDuration(dayTotalHours)}
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
        )}
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
            Review All Staff Logs ({filterHours ? employeeDailySummary.length : allTimesheets.length})
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
                      3. Task <span style={{ color: "#ef4444" }}>*</span>
                    </th>
                    <th style={{ padding: "12px 10px", fontSize: "11px", fontWeight: "700", color: "#64748b", width: "170px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                      4. Sub Task <span style={{ color: "#ef4444" }}>*</span>
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
                          {isCustomTaskProject(row.project_name) ? (
                            <input
                              type="text"
                              disabled={isLocked}
                              value={row.task_title || ""}
                              onChange={(e) => {
                                handleRowFieldChange(idx, "task_title", e.target.value);
                                if (!row.task_id) {
                                  handleRowFieldChange(idx, "task_id", `custom_task_${Date.now()}`);
                                }
                                if (err.task_id) {
                                  setRowErrors(prev => ({ ...prev, [idx]: { ...prev[idx], task_id: null } }));
                                }
                              }}
                              placeholder="Type Task..."
                              style={{
                                width: "100%", 
                                height: "38px",
                                padding: "0 10px", 
                                border: err.task_id ? "1.5px solid #ef4444" : "1px solid #d1d5db", 
                                borderRadius: "7px",
                                fontSize: "12.5px", 
                                color: "#1e293b", 
                                background: isLocked ? "#f1f5f9" : "#fff",
                                boxSizing: "border-box",
                                outline: "none"
                              }}
                            />
                          ) : (
                            <select
                              disabled={isLocked}
                              value={row.task_id}
                              onChange={(e) => {
                                handleRowFieldChange(idx, "task_id", e.target.value);
                                if (err.task_id) {
                                  setRowErrors(prev => ({ ...prev, [idx]: { ...prev[idx], task_id: null } }));
                                }
                              }}
                              style={{
                                width: "100%", 
                                height: "38px",
                                padding: "0 10px", 
                                border: err.task_id ? "1.5px solid #ef4444" : "1px solid #d1d5db", 
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
                          )}
                          {err.task_id && (
                            <div style={{ color: "#ef4444", fontSize: "11px", marginTop: "3px", fontWeight: "600" }}>
                              {err.task_id}
                            </div>
                          )}
                        </td>

                        {/* 4. Sub Task */}
                        <td style={{ padding: "10px", verticalAlign: "middle" }}>
                          {isCustomTaskProject(row.project_name) ? (
                            <input
                              type="text"
                              disabled={isLocked}
                              value={row.subtask_title || ""}
                              onChange={(e) => {
                                handleRowFieldChange(idx, "subtask_title", e.target.value);
                                if (!row.subtask_id) {
                                  handleRowFieldChange(idx, "subtask_id", `custom_sub_${Date.now()}`);
                                }
                                if (err.subtask_id) {
                                  setRowErrors(prev => ({ ...prev, [idx]: { ...prev[idx], subtask_id: null } }));
                                }
                              }}
                              placeholder="Type Sub Task..."
                              style={{
                                width: "100%", 
                                height: "38px",
                                padding: "0 10px", 
                                border: err.subtask_id ? "1.5px solid #ef4444" : "1px solid #d1d5db", 
                                borderRadius: "7px",
                                fontSize: "12.5px", 
                                color: "#334155", 
                                background: isLocked ? "#f1f5f9" : "#fff",
                                boxSizing: "border-box",
                                outline: "none"
                              }}
                            />
                          ) : (
                            <select
                              disabled={isLocked}
                              value={row.subtask_id}
                              onChange={(e) => {
                                handleRowFieldChange(idx, "subtask_id", e.target.value);
                                if (err.subtask_id) {
                                  setRowErrors(prev => ({ ...prev, [idx]: { ...prev[idx], subtask_id: null } }));
                                }
                              }}
                              style={{
                                width: "100%", 
                                height: "38px",
                                padding: "0 10px", 
                                border: err.subtask_id ? "1.5px solid #ef4444" : "1px solid #d1d5db", 
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
                          )}
                          {err.subtask_id && (
                            <div style={{ color: "#ef4444", fontSize: "11px", marginTop: "3px", fontWeight: "600" }}>
                              {err.subtask_id}
                            </div>
                          )}
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
                          {formatDuration(dayTotalHours)}
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
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="form-control"
              style={{ width: "190px" }}
              title="Filter by Employee"
            >
              <option value="">All Employees</option>
              {employeeOptions.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>

            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="form-control"
              style={{ width: "190px" }}
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

            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>Start:</span>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="form-control"
                style={{ width: "145px" }}
                title="Start Date"
              />
            </div>

            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#64748b", textTransform: "uppercase" }}>End:</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="form-control"
                style={{ width: "145px" }}
                title="End Date"
              />
            </div>

            <select
              value={filterHours}
              onChange={(e) => setFilterHours(e.target.value)}
              className="form-control"
              style={{ width: "215px" }}
            >
              <option value="">All Hours</option>
              <option value="less_9">Less Hours (&lt; 9 hrs / day)</option>
              <option value="less_8">Less Hours (&lt; 8 hrs / day)</option>
              <option value="completed">Full Day (≥ 9 hrs)</option>
              <option value="on_leave">On Approved Leave</option>
              <option value="not_filled">Not Filled Timesheet (Absent / Missing)</option>
              <option value="missing_or_leave">All Missing / Leave / Shortage</option>
            </select>

            <select
              value={filterTaskMatch}
              onChange={(e) => setFilterTaskMatch(e.target.value)}
              className="form-control"
              style={{ 
                width: "215px", 
                borderColor: filterTaskMatch ? "#f59e0b" : "#cbd5e1",
                background: filterTaskMatch ? "#fffbeb" : "#fff",
                fontWeight: filterTaskMatch ? "700" : "500"
              }}
              title="Task Date & Assignment Filter"
            >
              <option value="">All Task Mappings</option>
              <option value="out_of_schedule">Not Scheduled for This Date</option>
              <option value="not_assigned">Task Not Assigned to Employee</option>
              <option value="any_issue">Any Issue (Not Scheduled / Not Assigned)</option>
            </select>

            {(filterUser || filterProject || filterStatus || filterHours || filterTaskMatch || filterStartDate !== getFirstDayOfCurrentMonth() || filterEndDate !== getTodayDate()) && (
              <button
                onClick={() => {
                  setFilterUser("");
                  setFilterProject("");
                  setFilterStatus("");
                  setFilterStartDate(getFirstDayOfCurrentMonth());
                  setFilterEndDate(getTodayDate());
                  setFilterHours("");
                  setFilterTaskMatch("");
                }}
                style={{ padding: "8px 14px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: "8px", cursor: "pointer", fontSize: "13px" }}
              >
                Reset Filters
              </button>
            )}

            <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleExportExcel}
                style={{
                  padding: "8px 14px",
                  background: "#10b981",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "700",
                  fontSize: "12.5px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 1px 2px rgba(16, 185, 129, 0.2)"
                }}
                title="Export current staff logs to Excel / CSV"
              >
                <SheetIcon size={14} color="#fff" />
                Export Excel
              </button>

              <button
                type="button"
                onClick={handleExportPdf}
                style={{
                  padding: "8px 14px",
                  background: "#ef4444",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  fontWeight: "700",
                  fontSize: "12.5px",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  boxShadow: "0 1px 2px rgba(239, 68, 68, 0.2)"
                }}
                title="Export current staff logs to PDF"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                Export PDF
              </button>
            </div>
          </div>

          <div style={{ background: "#ffffff", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.02)" }}>
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              {filterHours ? (
                /* ─── SUMMARY VIEW: Consolidated per Employee per Date ───────────── */
                <table className="custom-table" style={{ width: "100%", minWidth: "850px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>
                      <th onClick={() => requestSummarySort("user_name")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                        EMPLOYEE <SortIndicator sortKey="user_name" currentKey={summarySortConfig.key} direction={summarySortConfig.direction} />
                      </th>
                      <th onClick={() => requestSummarySort("date")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                        DATE <SortIndicator sortKey="date" currentKey={summarySortConfig.key} direction={summarySortConfig.direction} />
                      </th>
                      <th onClick={() => requestSummarySort("total_hours")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                        LOGGED HOURS <SortIndicator sortKey="total_hours" currentKey={summarySortConfig.key} direction={summarySortConfig.direction} />
                      </th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", color: "#475569" }}>
                        REQUIRED HOURS
                      </th>
                      <th onClick={() => requestSummarySort("shortage")} style={{ padding: "12px 16px", fontSize: "12px", color: "#475569", cursor: "pointer", userSelect: "none" }}>
                        REMAINING / SHORTAGE <SortIndicator sortKey="shortage" currentKey={summarySortConfig.key} direction={summarySortConfig.direction} />
                      </th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", color: "#475569" }}>
                        STATUS
                      </th>
                      <th style={{ padding: "12px 16px", fontSize: "12px", color: "#475569" }}>
                        PROJECTS WORKED
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedSummary.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                          No staff records found matching hours filter.
                        </td>
                      </tr>
                    ) : (
                      sortedSummary
                        .slice((reviewPage - 1) * reviewPageSize, reviewPage * reviewPageSize)
                        .map(row => (
                        <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ fontWeight: "700", color: "#1e293b", fontSize: "14px" }}>{row.user_name}</div>
                            <div style={{ fontSize: "11px", color: "#94a3b8" }}>{row.user_email}</div>
                          </td>
                          <td style={{ padding: "12px 16px", fontWeight: "600", color: "#334155", whiteSpace: "nowrap" }}>
                            {row.date ? new Date(row.date).toLocaleDateString('en-GB') : "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontWeight: "800", color: "#0f172a" }}>
                            <span style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: "6px", fontSize: "13px" }}>
                              {formatDuration(row.total_hours)}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", fontWeight: "600", color: "#64748b" }}>
                            {row.target_hours} h
                          </td>
                          <td style={{ padding: "12px 16px", fontWeight: "800" }}>
                            {row.shortage > 0 ? (
                              <span style={{ background: "#fee2e2", color: "#dc2626", padding: "4px 9px", borderRadius: "6px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <IconAlertTriangle size={12} color="#dc2626" />
                                {formatDuration(row.shortage)} Remaining
                              </span>
                            ) : (
                              <span style={{ background: "#ecfdf5", color: "#16a34a", padding: "4px 9px", borderRadius: "6px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <CheckIcon size={12} color="#16a34a" />
                                Completed (0 remaining)
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            {row.leave_info ? (
                              <span style={{ padding: "4px 9px", borderRadius: "8px", fontSize: "11px", fontWeight: "700", background: "#e0e7ff", color: "#3730a3", border: "1px solid #c7d2fe", display: "inline-flex", flexDirection: "column", gap: "2px" }}>
                                <span>ON LEAVE: {row.leave_info.type}</span>
                                <span style={{ fontSize: "10px", fontWeight: "500", color: "#4338ca" }}>Reason: {row.leave_info.reason}</span>
                              </span>
                            ) : row.is_missing_entry ? (
                              <span style={{ padding: "4px 9px", borderRadius: "8px", fontSize: "11px", fontWeight: "700", background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <IconAlertTriangle size={12} color="#dc2626" />
                                NOT FILLED (ABSENT)
                              </span>
                            ) : row.is_less ? (
                              <span style={{ padding: "3px 8px", borderRadius: "8px", fontSize: "11px", fontWeight: "700", background: "#fee2e2", color: "#b91c1c", border: "1px solid #fecaca" }}>
                                LESS HOURS
                              </span>
                            ) : (
                              <span style={{ padding: "3px 8px", borderRadius: "8px", fontSize: "11px", fontWeight: "700", background: "#dcfce7", color: "#15803d", border: "1px solid #bbf7d0" }}>
                                FULL DAY
                              </span>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px", color: "#475569", fontSize: "12px" }}>
                            {row.projects_list || "—"} <span style={{ color: "#94a3b8" }}>({row.entries_count} {row.entries_count === 1 ? "task" : "tasks"})</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {sortedSummary.length > 0 && (
                    <tfoot>
                      <tr style={{ background: "#f8fafc", borderTop: "2px solid #cbd5e1", fontWeight: "800" }}>
                        <td colSpan="2" style={{ padding: "12px 16px", color: "#1e293b", fontSize: "12px", textTransform: "uppercase" }}>
                          Total ({sortedSummary.length} Records)
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: "13px", whiteSpace: "nowrap" }}>
                          <span style={{ background: "#e2e8f0", padding: "4px 8px", borderRadius: "6px" }}>
                            {formatDuration(sortedSummary.reduce((acc, r) => acc + (parseFloat(r.total_hours) || 0), 0))}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: "12px" }}>
                          {sortedSummary.reduce((acc, r) => acc + (parseFloat(r.target_hours) || 0), 0).toFixed(1)} h ({sortedSummary.length} Days)
                        </td>
                        <td style={{ padding: "12px 16px", color: "#dc2626", fontSize: "13px", whiteSpace: "nowrap" }}>
                          <span style={{ background: "#fee2e2", color: "#dc2626", padding: "4px 9px", borderRadius: "6px", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <IconAlertTriangle size={12} color="#dc2626" />
                            {formatDuration(sortedSummary.reduce((acc, r) => acc + (parseFloat(r.shortage) || 0), 0))} Missing
                          </span>
                        </td>
                        <td colSpan="2" style={{ padding: "12px 16px" }}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              ) : (
                /* ─── DETAILED VIEW: All Hours (Normal full timesheets) ─────────────── */
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
                            <span style={{ background: "#f1f5f9", padding: "4px 8px", borderRadius: "6px", fontSize: "13px" }}>
                              {formatDuration(ts.hours)}
                            </span>
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
                            {ts.isOutOfSchedule && (
                              <div style={{ marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "4px", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", padding: "2px 6px", borderRadius: "4px", fontSize: "10.5px", fontWeight: "700" }}>
                                <IconAlertTriangle size={11} color="#b45309" />
                                {ts.scheduleInfo || "Date outside task schedule"}
                              </div>
                            )}
                            {ts.isNotAssigned && (
                              <div style={{ marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "4px", background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", padding: "2px 6px", borderRadius: "4px", fontSize: "10.5px", fontWeight: "700" }}>
                                <IconAlertTriangle size={11} color="#dc2626" />
                                Not assigned to this employee
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
                  {sortedTimesheets.length > 0 && (
                    <tfoot>
                      <tr style={{ background: "#f8fafc", borderTop: "2px solid #cbd5e1", fontWeight: "800" }}>
                        <td colSpan="2" style={{ padding: "12px 16px", color: "#1e293b", fontSize: "12px", textTransform: "uppercase" }}>
                          Total ({sortedTimesheets.length} Logs)
                        </td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontSize: "13px", whiteSpace: "nowrap" }}>
                          <span style={{ background: "#e2e8f0", padding: "4px 8px", borderRadius: "6px" }}>
                            {formatDuration(sortedTimesheets.reduce((acc, t) => acc + (parseFloat(t.hours) || 0), 0))}
                          </span>
                        </td>
                        <td colSpan="6" style={{ padding: "12px 16px" }}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </div>
            <Pagination
              currentPage={reviewPage}
              totalRecords={filterHours ? sortedSummary.length : sortedTimesheets.length}
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
                  {formatDuration(p.total_hours)}
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
                <span>Burned: {formatDuration(p.total_hours)}</span>
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
