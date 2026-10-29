import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useProject } from "../../contexts/ProjectContext";
import { useSocket } from "../../contexts/SocketContext";
import {
  ClockIcon,
  PlayIcon,
  CoffeeIcon,
  StopIcon,
  CheckIcon,
  CheckCircleIcon,
  TimerIcon,
  TicketIcon,
  CalendarIcon,
  ChatBubbleIcon,
  UserIcon,
  SheetIcon
} from "../../components/common/Icons";
import AlertModal from "../../components/common/AlertModal";
import ConfirmModal from "../../components/common/ConfirmModal";
import CelebrationsWidget from "../../components/common/CelebrationsWidget";
import ForgotPunchOutAlert from "../../components/attendance/ForgotPunchOutAlert";
import API from "../../api/api";
import "../../style/main.css";


export default function EmployeeDashboard() {
  const { user } = useAuth();
  const { selectedProject } = useProject();
  const navigate = useNavigate();
  const { socket } = useSocket();

  // Attendance state
  const [attendance, setAttendance] = useState(null);
  const [attLoading, setAttLoading] = useState(false);
  const [workMode, setWorkMode] = useState("Office");
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const [leaveNotice, setLeaveNotice] = useState(null);

  // Tasks & performance state
  const [tasks, setTasks] = useState([]);
  const [taskStats, setTaskStats] = useState({
    assigned: 0,
    inProgress: 0,
    completed: 0,
    highPriority: 0,
  });
  const [leaveBalance, setLeaveBalance] = useState({
    cl_balance: 0,
    sl_balance: 0,
    pl_balance: 0,
    comp_off: 0,
  });

  const [loading, setLoading] = useState(true);
  const [alertInfo, setAlertInfo] = useState({ show: false, title: "", message: "", type: "info" });
  const [showConfirmClockOut, setShowConfirmClockOut] = useState(false);
  const [clockOutConfirmMsg, setClockOutConfirmMsg] = useState("");

  const showAlert = (message, title = "Notice", type = "warning") => {
    setAlertInfo({ show: true, title, message, type });
  };

  const [scheduleInfo, setScheduleInfo] = useState(null);
  const [lateInstances, setLateInstances] = useState(null);

  // Fetch Attendance
  const fetchTodayAttendance = useCallback(async () => {
    try {
      const res = await API.get("/attendance/today");
      const att = res.data?.attendance || null;
      setAttendance(att);
      setLeaveNotice(res.data?.requiredLeaveNotice || null);
      if (res.data?.schedule) {
        setScheduleInfo(res.data.schedule);
      }
      if (res.data?.late_instances) {
        setLateInstances(res.data.late_instances);
      }
      if (att?.work_mode) {
        setWorkMode(att.work_mode);
      }
    } catch (err) {
      console.error("Attendance fetch error:", err);
    }
  }, []);

  // Fetch Assigned Tasks & Leaves dynamically
  const fetchEmployeeData = useCallback(async () => {
    setLoading(true);
    try {
      const taskEndpoint = selectedProject?._id || selectedProject?.id
        ? `/tasks?project=${selectedProject._id || selectedProject.id}`
        : "/tasks";

      const [tasksRes, leaveRes] = await Promise.allSettled([
        API.get(taskEndpoint),
        API.get("/leave/balance"),
      ]);

      if (tasksRes.status === "fulfilled") {
        const rawTasks = Array.isArray(tasksRes.value.data)
          ? tasksRes.value.data
          : tasksRes.value.data?.tasks || [];

        // Robust, dynamic filter for tasks assigned to current logged-in user
        const currentUserId = String(user?._id || user?.id || "");
        const currentUserEmail = (user?.email || "").toLowerCase().trim();

        const myTasks = rawTasks.filter((t) => {
          if (!currentUserId && !currentUserEmail) return false;

          // 1. Check t.assignedTo as array of objects or strings (formatTask output)
          if (Array.isArray(t.assignedTo)) {
            const hasMatch = t.assignedTo.some((item) => {
              if (!item) return false;
              if (typeof item === "string") return String(item) === currentUserId;
              const itemId = String(item._id || item.id || "");
              const itemEmail = (item.email || "").toLowerCase().trim();
              return (itemId && itemId === currentUserId) || (itemEmail && currentUserEmail && itemEmail === currentUserEmail);
            });
            if (hasMatch) return true;
          }

          // 2. Check t.assignedTo as single object
          if (typeof t.assignedTo === "object" && t.assignedTo !== null && !Array.isArray(t.assignedTo)) {
            const assignedId = String(t.assignedTo._id || t.assignedTo.id || "");
            const assignedEmail = (t.assignedTo.email || "").toLowerCase().trim();
            if (assignedId && assignedId === currentUserId) return true;
            if (assignedEmail && currentUserEmail && assignedEmail === currentUserEmail) return true;
          }

          // 3. Check t.assignedTo as direct string
          if (typeof t.assignedTo === "string" && String(t.assignedTo) === currentUserId) {
            return true;
          }

          // 4. Check t.assigned_to (raw MySQL column fallback)
          if (t.assigned_to) {
            if (String(t.assigned_to) === currentUserId) return true;
            if (typeof t.assigned_to === "object") {
              const aId = String(t.assigned_to._id || t.assigned_to.id || "");
              const aEmail = (t.assigned_to.email || "").toLowerCase().trim();
              if (aId && aId === currentUserId) return true;
              if (aEmail && currentUserEmail && aEmail === currentUserEmail) return true;
            }
          }

          // 5. Check subtasks assigned to this employee
          if (Array.isArray(t.subtasks) && t.subtasks.length > 0) {
            const hasSubMatch = t.subtasks.some((sub) => {
              const subUser = sub.assignedTo || sub.assigned_to;
              if (!subUser) return false;
              if (typeof subUser === "string") return String(subUser) === currentUserId;
              const subId = String(subUser._id || subUser.id || "");
              const subEmail = (subUser.email || "").toLowerCase().trim();
              return (subId && subId === currentUserId) || (subEmail && currentUserEmail && subEmail === currentUserEmail);
            });
            if (hasSubMatch) return true;
          }

          return false;
        });

        const inProg = myTasks.filter((t) => {
          const s = (t.status?.name || t.status || "").toLowerCase();
          return s.includes("progress") || s.includes("review") || s.includes("doing") || s.includes("dev");
        }).length;

        const done = myTasks.filter((t) => {
          const s = (t.status?.name || t.status || "").toLowerCase();
          return s.includes("done") || s.includes("complete") || s.includes("stable") || s.includes("finished");
        }).length;

        const high = myTasks.filter(
          (t) => (t.priority || "").toLowerCase() === "high" || (t.priority || "").toLowerCase() === "urgent"
        ).length;

        setTasks(myTasks);
        setTaskStats({
          assigned: myTasks.length,
          inProgress: inProg,
          completed: done,
          highPriority: high,
        });
      }

      if (leaveRes.status === "fulfilled" && leaveRes.value.data) {
        setLeaveBalance(leaveRes.value.data);
      }
    } catch (err) {
      console.error("Employee dashboard data load error:", err);
    } finally {
      setLoading(false);
    }
  }, [user, selectedProject]);

  useEffect(() => {
    fetchTodayAttendance();
    fetchEmployeeData();
  }, [fetchTodayAttendance, fetchEmployeeData, selectedProject]);

  // Live Timer for clocked-in employee
  useEffect(() => {
    let interval = null;
    if (attendance?.clock_in && !attendance?.clock_out) {
      const start = new Date(attendance.clock_in).getTime();
      const updateTimer = () => {
        const now = Date.now();
        const diffSecs = Math.max(0, Math.floor((now - start) / 1000));
        const hrs = String(Math.floor(diffSecs / 3600)).padStart(2, "0");
        const mins = String(Math.floor((diffSecs % 3600) / 60)).padStart(2, "0");
        const secs = String(diffSecs % 60).padStart(2, "0");
        setElapsedTime(`${hrs}:${mins}:${secs}`);
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else if (attendance?.clock_out && attendance?.total_hours !== undefined && attendance?.total_hours !== null) {
      const totalMins = Math.round(Number(attendance.total_hours) * 60);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      if (h === 0) {
        setElapsedTime(`${m} mins`);
      } else if (m === 0) {
        setElapsedTime(`${h} hrs`);
      } else {
        setElapsedTime(`${h} hrs ${m} mins`);
      }
    } else {
      setElapsedTime("00:00:00");
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [attendance]);

  // Real-time socket sync
  useEffect(() => {
    if (!socket) return;
    const handleTaskChange = () => {
      fetchEmployeeData();
    };
    socket.on("taskCreated", handleTaskChange);
    socket.on("taskUpdated", handleTaskChange);
    socket.on("taskDeleted", handleTaskChange);
    return () => {
      socket.off("taskCreated", handleTaskChange);
      socket.off("taskUpdated", handleTaskChange);
      socket.off("taskDeleted", handleTaskChange);
    };
  }, [socket, fetchEmployeeData]);

  // Clock Actions
  const handleClockIn = async () => {
    try {
      setAttLoading(true);
      const res = await API.post("/attendance/clock-in", { workMode });
      setAttendance(res.data.attendance);
      setLeaveNotice(null);
      if (res.data?.leaveNotice) {
        showAlert(res.data.leaveNotice, "You Are On Leave Today", "warning");
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || "Clock In Failed";
      if (err.response?.data?.requireLeaveDate) {
        setLeaveNotice({
          date: err.response.data.requireLeaveDate,
          message: errMsg
        });
        showAlert(errMsg, "Leave Required To Clock In", "warning");
      } else {
        showAlert(errMsg, "Clock In Restricted", "danger");
      }
    } finally {
      setAttLoading(false);
    }
  };

  const handleClockOut = async () => {
    try {
      setAttLoading(true);
      const res = await API.get("/attendance/today");
      const rem = res.data?.remainingShiftMinutes || 0;
      let msg = "Are you sure you want to end your shift for today?";
      if (rem > 0) {
        const h = Math.floor(rem / 60);
        const m = Math.round(rem % 60);
        const timeStr = h > 0 ? `${h} hrs ${m} mins` : `${m} mins`;
        msg = `You still have ${timeStr} left in your shift. If you Clock Out now, it will be counted as a Half Day / Leave. Are you sure you want to Clock Out?`;
      } else {
        msg = "Are you sure you want to end your shift for today? Make sure your daily tasks and timesheet are complete.";
      }
      setClockOutConfirmMsg(msg);
      setShowConfirmClockOut(true);
    } catch (err) {
      console.error(err);
      setClockOutConfirmMsg("Are you sure you want to end your shift for today?");
      setShowConfirmClockOut(true);
    } finally {
      setAttLoading(false);
    }
  };

  const confirmClockOut = async () => {
    setShowConfirmClockOut(false);
    try {
      setAttLoading(true);
      const res = await API.post("/attendance/clock-out");
      setAttendance(res.data.attendance);
    } catch (err) {
      showAlert(err.response?.data?.error || "Clock Out Failed", "Shift Notice", "warning");
    } finally {
      setAttLoading(false);
    }
  };

  // Completion percentage
  const completionRate = taskStats.assigned > 0
    ? Math.round((taskStats.completed / taskStats.assigned) * 100)
    : 0;

  // Active or upcoming tasks
  const activeTasks = tasks
    .filter((t) => {
      const s = (t.status?.name || t.status || "").toLowerCase();
      return !s.includes("done") && !s.includes("complete") && !s.includes("stable");
    })
    .slice(0, 5);

  return (
    <div style={{ padding: "0 0 32px 0", maxWidth: "1400px", margin: "0 auto" }}>
      <ForgotPunchOutAlert />
      {/* REQUIRED LEAVE NOTICE BANNER (IF MISSED CLOCK OUT) */}
      {leaveNotice && (
        <div style={{
          background: "rgba(245, 158, 11, 0.12)",
          border: "1px solid #f59e0b",
          borderRadius: "16px",
          padding: "16px 20px",
          marginBottom: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "10px", background: "rgba(245, 158, 11, 0.15)", color: "#d97706" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <div>
              <strong style={{ color: "#d97706", fontSize: "14px", display: "block" }}>Action Required Before Clock In</strong>
              <span style={{ color: "var(--text-main, #1e293b)", fontSize: "13px" }}>{leaveNotice.message}</span>
            </div>
          </div>
          <button
            onClick={() => {
              const leaveType = leaveNotice.type || (leaveNotice.message?.includes("Second Half") ? "Second Half" : "Full Day");
              navigate(`/leave?date=${leaveNotice.date}&type=${encodeURIComponent(leaveType)}`);
            }}
            style={{
              background: "#d97706",
              color: "#fff",
              border: "none",
              padding: "8px 16px",
              borderRadius: "8px",
              fontWeight: "700",
              fontSize: "13px",
              cursor: "pointer"
            }}
          >
            Apply Leave Now →
          </button>
        </div>
      )}

      {/* WELCOME & REAL-TIME SHIFT HERO */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))",
          borderRadius: "20px",
          padding: "24px 28px",
          marginBottom: "24px",
          color: "#fff",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
          boxShadow: "0 14px 30px -10px rgba(15, 23, 42, 0.3)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", zIndex: 1, maxWidth: "560px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            <span
              style={{
                fontSize: "10.5px",
                fontWeight: "800",
                letterSpacing: "1.2px",
                padding: "3px 8px",
                borderRadius: "20px",
                background: "rgba(99, 102, 241, 0.2)",
                color: "#a5b4fc",
                border: "1px solid rgba(99, 102, 241, 0.3)",
              }}
            >
              STAFF WORKSPACE
            </span>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </span>
          </div>

          <h1 style={{ margin: "0 0 6px 0", fontSize: "24px", fontWeight: "800", letterSpacing: "-0.5px" }}>
            Welcome back, {user?.name || "Team Member"}!
          </h1>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "13.5px", lineHeight: "1.5" }}>
            Here is your daily workflow overview. You have{" "}
            <strong style={{ color: "#38bdf8" }}>{taskStats.assigned - taskStats.completed} pending tasks</strong> today.
          </p>
        </div>

        {/* SHIFT / CLOCK IN CONTROLLER */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            background: "rgba(255, 255, 255, 0.05)",
            backdropFilter: "blur(12px)",
            padding: "14px 18px",
            borderRadius: "16px",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            maxWidth: "100%",
            boxSizing: "border-box"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: "800", letterSpacing: "1.2px", textTransform: "uppercase" }}>
                Today's Shift Time
              </span>
              {scheduleInfo && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "11px",
                    fontWeight: "700",
                    padding: "3px 10px",
                    borderRadius: "20px",
                    background: scheduleInfo.is_working_day === false ? "rgba(239, 68, 68, 0.15)" : "rgba(56, 189, 248, 0.12)",
                    color: scheduleInfo.is_working_day === false ? "#f87171" : "#38bdf8",
                    border: scheduleInfo.is_working_day === false ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(56, 189, 248, 0.3)",
                    boxShadow: "0 2px 6px rgba(56, 189, 248, 0.1)",
                    letterSpacing: "0.2px"
                  }}
                >
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: scheduleInfo.is_working_day === false ? "#f87171" : "#38bdf8", display: "inline-block" }}></span>
                  {scheduleInfo.day_note || (scheduleInfo.is_working_day === false ? "Company Off Day" : `Shift: ${scheduleInfo.timing} (${scheduleInfo.standardShiftHours}h)`)}
                </span>
              )}
              {scheduleInfo?.excessBreakMinutes > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "11px",
                    fontWeight: "700",
                    padding: "3px 10px",
                    borderRadius: "20px",
                    background: "rgba(245, 158, 11, 0.15)",
                    color: "#f59e0b",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    letterSpacing: "0.2px"
                  }}
                  title={scheduleInfo.excessBreakBreakdown?.join("; ") || `+${scheduleInfo.excessBreakMinutes}m excess break`}
                >
                  <ClockIcon size={12} color="#b45309" style={{ marginRight: 4 }} />+{scheduleInfo.excessBreakMinutes}m Excess Break (Shift: {Math.floor(scheduleInfo.requiredShiftMinutes / 60)}h {scheduleInfo.requiredShiftMinutes % 60}m)
                </span>
              )}
              {lateInstances && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    fontSize: "11px",
                    fontWeight: "700",
                    padding: "3px 10px",
                    borderRadius: "20px",
                    background: lateInstances.is_exhausted
                      ? "rgba(239, 68, 68, 0.15)"
                      : lateInstances.used > 0
                      ? "rgba(245, 158, 11, 0.15)"
                      : "rgba(34, 197, 94, 0.15)",
                    color: lateInstances.is_exhausted
                      ? "#f87171"
                      : lateInstances.used > 0
                      ? "#f59e0b"
                      : "#22c55e",
                    border: lateInstances.is_exhausted
                      ? "1px solid rgba(239, 68, 68, 0.35)"
                      : lateInstances.used > 0
                      ? "1px solid rgba(245, 158, 11, 0.35)"
                      : "1px solid rgba(34, 197, 94, 0.35)",
                    letterSpacing: "0.2px"
                  }}
                  title={
                    lateInstances.is_exhausted
                      ? `Monthly late instances exhausted (${lateInstances.used}/${lateInstances.limit}). Late arrival triggers First Half Day!`
                      : `Used ${lateInstances.used} of ${lateInstances.limit} allowed monthly late instances. Grace period is ${lateInstances.grace_minutes} mins.`
                  }
                >
                  <span style={{ display: "inline-flex", alignItems: "center", marginRight: "6px" }}>
                    {lateInstances.is_exhausted ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    ) : lateInstances.used > 0 ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                    )}
                  </span>
                  Late Instances: {lateInstances.used}/{lateInstances.limit} Used ({lateInstances.remaining} Left)
                </span>
              )}
            </div>
            <div style={{ fontSize: "32px", fontWeight: "900", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", color: "#38bdf8", letterSpacing: "1px", lineHeight: "1" }}>
              {elapsedTime}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {!attendance?.clock_in && (
              <select
                value={workMode}
                onChange={(e) => setWorkMode(e.target.value)}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  background: "rgba(15, 23, 42, 0.7)",
                  color: "#fff",
                  fontWeight: "600",
                  outline: "none",
                  cursor: "pointer",
                }}
              >
                <option value="Office">Office</option>
                <option value="Work From Home">Work From Home</option>
                <option value="On-site">On-site (Client)</option>
              </select>
            )}

            {!attendance?.clock_in ? (
              <button
                onClick={handleClockIn}
                disabled={attLoading}
                style={{
                  background: "linear-gradient(135deg, #16a34a, #22c55e)",
                  color: "#fff",
                  border: "none",
                  padding: "12px 22px",
                  borderRadius: "12px",
                  fontWeight: "700",
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  boxShadow: "0 4px 14px rgba(34, 197, 94, 0.35)",
                }}
              >
                <PlayIcon size={14} color="#fff" /> Clock In
              </button>
            ) : !attendance?.clock_out ? (
              <>
                <button
                  onClick={() => navigate("/breaks")}
                  disabled={attLoading}
                  style={{
                    background: attendance.break_start ? "#eab308" : "rgba(255, 255, 255, 0.1)",
                    color: "#fff",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    padding: "11px 16px",
                    borderRadius: "12px",
                    fontWeight: "600",
                    fontSize: "13px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <CoffeeIcon size={15} color="#fff" /> {attendance.break_start ? "In Break" : "Take Break"}
                </button>

                {attendance?.only_admin_clock_out ? (
                  <span style={{ fontSize: "11px", color: "#f87171", fontWeight: "600" }}>Admin Clock-Out Only</span>
                ) : (
                  <button
                    onClick={handleClockOut}
                    disabled={attLoading}
                    style={{
                      background: "linear-gradient(135deg, #dc2626, #ef4444)",
                      color: "#fff",
                      border: "none",
                      padding: "11px 20px",
                      borderRadius: "12px",
                      fontWeight: "700",
                      fontSize: "13px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      boxShadow: "0 4px 14px rgba(239, 68, 68, 0.35)",
                    }}
                  >
                    <StopIcon size={14} color="#fff" /> Clock Out
                  </button>
                )}
              </>
            ) : (
              <div
                style={{
                  background: "rgba(34, 197, 94, 0.15)",
                  color: "#4ade80",
                  padding: "10px 16px",
                  borderRadius: "12px",
                  fontWeight: "700",
                  fontSize: "13px",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                }}
              >
                <CheckIcon size={16} color="#4ade80" /> Shift Completed
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
          marginBottom: "32px",
        }}
      >
        <MetricCard
          title="Assigned Tasks"
          value={taskStats.assigned}
          subtitle="Total tasks on your plate"
          color="#6366f1"
          icon={<TimerIcon size={20} color="#6366f1" />}
          loading={loading}
          onClick={() => navigate("/task")}
        />
        <MetricCard
          title="In Progress"
          value={taskStats.inProgress}
          subtitle="Currently being worked on"
          color="#3b82f6"
          icon={<PlayIcon size={18} color="#3b82f6" />}
          loading={loading}
          onClick={() => navigate("/task")}
        />
        <MetricCard
          title="Completed"
          value={taskStats.completed}
          subtitle={`${completionRate}% resolution rate`}
          color="#10b981"
          icon={<CheckCircleIcon size={20} color="#10b981" />}
          loading={loading}
          onClick={() => navigate("/task")}
        />
        <MetricCard
          title="High Priority"
          value={taskStats.highPriority}
          subtitle="Urgent attention required"
          color="#f43f5e"
          icon={<ClockIcon size={20} color="#f43f5e" />}
          loading={loading}
          onClick={() => navigate("/task")}
        />
      </div>

      {/* WORKSPACE SPLIT: MY ACTIVE TASKS & LEAVE BALANCES */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: "24px",
          marginBottom: "32px",
        }}
      >
        {/* CURRENT ASSIGNED TASKS */}
        <div
          style={{
            background: "var(--ui-surface, #ffffff)",
            borderRadius: "20px",
            padding: "24px",
            border: "1px solid var(--ui-border, #e2e8f0)",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
            <div>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>
                Active Tasks To Do
              </h3>
              <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                Tasks prioritized for your execution
              </span>
            </div>
            <button
              onClick={() => navigate("/task")}
              style={{
                background: "none",
                border: "none",
                color: "#6366f1",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              View All →
            </button>
          </div>

          {activeTasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted, #64748b)" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px", color: "#10b981" }}>
                <CheckCircleIcon size={36} color="#10b981" />
              </div>
              <div style={{ fontWeight: "700", fontSize: "15px", color: "var(--text-main, #1e293b)" }}>
                All caught up!
              </div>
              <p style={{ margin: "4px 0 0 0", fontSize: "13px" }}>No open tasks assigned to you right now.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {activeTasks.map((t) => {
                const priority = (t.priority || "Medium").toLowerCase();
                const badgeColor =
                  priority === "high" || priority === "urgent"
                    ? "#ef4444"
                    : priority === "low"
                    ? "#10b981"
                    : "#f59e0b";

                return (
                  <div
                    key={t._id || t.id}
                    onClick={() => navigate("/task")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 18px",
                      borderRadius: "14px",
                      background: "var(--ui-bg, #f8fafc)",
                      border: "1px solid var(--ui-border, #e2e8f0)",
                      cursor: "pointer",
                      transition: "transform 0.15s ease, border-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateX(4px)";
                      e.currentTarget.style.borderColor = "#6366f1";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.borderColor = "var(--ui-border, #e2e8f0)";
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: "12px" }}>
                      <div
                        style={{
                          fontWeight: "700",
                          fontSize: "14px",
                          color: "var(--text-main, #1e293b)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {t.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", marginTop: "4px" }}>
                        {t.project?.name ? `Project: ${t.project.name}` : "General Task"}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          padding: "3px 8px",
                          borderRadius: "8px",
                          background: `${badgeColor}15`,
                          color: badgeColor,
                          border: `1px solid ${badgeColor}30`,
                        }}
                      >
                        {t.priority || "Medium"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* LEAVE BALANCE & QUICK SHORTCUTS */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* LEAVE BALANCES */}
          <div
            style={{
              background: "var(--ui-surface, #ffffff)",
              borderRadius: "20px",
              padding: "24px",
              border: "1px solid var(--ui-border, #e2e8f0)",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>
                  Leave Balances
                </h3>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                  Your current eligible balance
                </span>
              </div>
              <button
                onClick={() => navigate("/leave")}
                style={{
                  background: "none",
                  border: "none",
                  color: "#6366f1",
                  fontSize: "13px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Apply Leave →
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              <LeaveCard label="Casual Leave" val={leaveBalance.cl_balance} color="#6366f1" />
              <LeaveCard label="Sick Leave" val={leaveBalance.sl_balance} color="#06b6d4" />
              <LeaveCard label="Privilege Leave" val={leaveBalance.pl_balance} color="#8b5cf6" />
            </div>
          </div>

          {/* QUICK WORKDAY SHORTCUTS */}
          {/* TEAM CELEBRATIONS WIDGET */}
          <CelebrationsWidget />

          {/* PRODUCTIVITY SHORTCUTS */}
          <div
            style={{
              background: "var(--ui-surface, #ffffff)",
              borderRadius: "20px",
              padding: "24px",
              border: "1px solid var(--ui-border, #e2e8f0)",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05)",
            }}
          >
            <h3 style={{ margin: "0 0 16px 0", fontSize: "15px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>
              Productivity Shortcuts
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px" }}>
              <ShortcutCard label="Raise Ticket" icon={<TicketIcon size={20} color="#6366f1" />} onClick={() => navigate("/tickets")} />
              <ShortcutCard label="My Timesheets" icon={<SheetIcon size={20} color="#3b82f6" />} onClick={() => navigate("/timesheet")} />
              <ShortcutCard label="Attendance Logs" icon={<CalendarIcon size={20} color="#10b981" />} onClick={() => navigate("/attendance")} />
              <ShortcutCard label="Team Chat" icon={<ChatBubbleIcon size={20} color="#f59e0b" />} onClick={() => navigate("/chat")} />
              <ShortcutCard label="My Profile" icon={<UserIcon size={20} color="#a855f7" />} onClick={() => navigate("/profile")} />
            </div>
          </div>
        </div>
      </div>

      {/* POPUP MODALS */}
      <AlertModal
        show={alertInfo.show}
        title={alertInfo.title}
        message={alertInfo.message}
        type={alertInfo.type}
        onClose={() => setAlertInfo({ show: false, title: "", message: "", type: "info" })}
      />

      <ConfirmModal
        show={showConfirmClockOut}
        title="Confirm Clock Out"
        message={clockOutConfirmMsg || "Are you sure you want to end your shift for today?"}
        confirmText="Yes, Clock Out"
        confirmColor="#dc2626"
        onConfirm={confirmClockOut}
        onClose={() => setShowConfirmClockOut(false)}
      />
    </div>
  );
}

function MetricCard({ title, value, subtitle, color, icon, loading, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--ui-surface, #ffffff)",
        borderRadius: "20px",
        padding: "22px 24px",
        border: "1px solid var(--ui-border, #e2e8f0)",
        boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05)",
        cursor: onClick ? "pointer" : "default",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "translateY(-3px)";
          e.currentTarget.style.boxShadow = `0 14px 28px -6px ${color}22`;
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.05)";
        }
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div
          style={{
            width: "42px",
            height: "42px",
            borderRadius: "12px",
            background: `${color}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
      </div>
      <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-muted, #64748b)", textTransform: "uppercase", letterSpacing: "1px" }}>
        {title}
      </div>
      <div style={{ fontSize: "28px", fontWeight: "900", color: "var(--text-main, #1e293b)", margin: "4px 0" }}>
        {loading ? "..." : value}
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>{subtitle}</div>
    </div>
  );
}

function LeaveCard({ label, val, color }) {
  return (
    <div
      style={{
        background: "var(--ui-bg, #f8fafc)",
        borderRadius: "14px",
        padding: "16px 12px",
        textAlign: "center",
        border: "1px solid var(--ui-border, #e2e8f0)",
      }}
    >
      <div style={{ fontSize: "22px", fontWeight: "900", color }}>{val ?? 0}</div>
      <div style={{ fontSize: "11px", fontWeight: "700", color: "var(--text-muted, #64748b)", marginTop: "4px" }}>
        {label}
      </div>
    </div>
  );
}

function ShortcutCard({ label, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "var(--ui-bg, #f8fafc)",
        border: "1px solid var(--ui-border, #e2e8f0)",
        borderRadius: "14px",
        padding: "16px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#6366f1";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--ui-border, #e2e8f0)";
        e.currentTarget.style.transform = "none";
      }}
    >
      <span style={{ fontSize: "22px" }}>{icon}</span>
      <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)" }}>{label}</span>
    </button>
  );
}
