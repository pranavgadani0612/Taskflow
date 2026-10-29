import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useProject } from "../contexts/ProjectContext";
import { useCompany } from "../contexts/CompanyContext";
import { useSocket } from "../contexts/SocketContext";
import { ClockIcon, PlayIcon, CoffeeIcon, StopIcon, CheckIcon } from "../components/common/Icons";
import AlertModal from "../components/common/AlertModal";
import ConfirmModal from "../components/common/ConfirmModal";
import API from "../api/api";
import "../style/main.css";
import EmployeeDashboard from "./dashboards/EmployeeDashboard";
import SuperAdminDashboard from "./dashboards/SuperAdminDashboard";
import ProjectManagerDashboard from "./dashboards/ProjectManagerDashboard";

export default function Dashboard() {
  const { user } = useAuth();

  const roleName = (user?.role?.name || user?.role || "").toString().toLowerCase();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || roleName.includes("super admin");
  const isProjectManager = roleName.includes("project manager") || roleName === "role_owner" || roleName.includes("manager");
  const isCompanyOwner = roleName.includes("owner");

  // Route to dedicated Super Admin dashboard
  if (isSuperAdmin) {
    return <SuperAdminDashboard />;
  }

  // Route to dedicated Project Manager dashboard
  if (isProjectManager) {
    return <ProjectManagerDashboard />;
  }

  // Route to dedicated Employee dashboard
  if (!isCompanyOwner) {
    return <EmployeeDashboard />;
  }
  const { selectedProject } = useProject();
  const { selectedCompany } = useCompany();
  const { socket, connected } = useSocket();

  const [stats, setStats] = useState({
    staffCount: 0,
    projectCount: 0,
    taskCount: 0,
    issueCount: 0,
    completionRate: 0,
    distribution: { pending: 0, inProgress: 0, stable: 0 }
  });

  // Clock In / Clock Out State
  const [attendance, setAttendance] = useState(null);
  const [attLoading, setAttLoading] = useState(false);
  const [workMode, setWorkMode] = useState("Office");
  const [leaveNotice, setLeaveNotice] = useState(null);

  // Modern Popup Modals State
  const [alertInfo, setAlertInfo] = useState({ show: false, title: "", message: "", type: "info" });
  const [showConfirmClockOut, setShowConfirmClockOut] = useState(false);

  const showAlert = (message, title = "Notice", type = "warning") => {
    setAlertInfo({ show: true, title, message, type });
  };

  const [scheduleInfo, setScheduleInfo] = useState(null);
  const [lateInstances, setLateInstances] = useState(null);

  const [remainingShiftMinutes, setRemainingShiftMinutes] = useState(0);
  const [clockOutConfirmMsg, setClockOutConfirmMsg] = useState("");

  const fetchTodayAttendance = async () => {
    try {
      const res = await API.get("/attendance/today");
      setAttendance(res.data?.attendance || null);
      setLeaveNotice(res.data?.requiredLeaveNotice || null);
      if (res.data?.schedule) {
        setScheduleInfo(res.data.schedule);
      }
      if (res.data?.late_instances) {
        setLateInstances(res.data.late_instances);
      }
      if (res.data?.remainingShiftMinutes !== undefined) {
        setRemainingShiftMinutes(res.data.remainingShiftMinutes);
      }
      if (res.data?.attendance?.work_mode) {
        setWorkMode(res.data.attendance.work_mode);
      }
    } catch (err) {
      console.error("Attendance fetch error:", err);
    }
  };

  const handleClockIn = async () => {
    try {
      setAttLoading(true);
      const res = await API.post("/attendance/clock-in", { workMode });
      setAttendance(res.data.attendance);
      setLeaveNotice(null);
      if (res.data?.leaveNotice) {
        showAlert(res.data.leaveNotice, "You Are On Leave Today", "warning");
      } else if (res.data?.lateNotice) {
        showAlert(res.data.lateNotice, res.data.first_half_deducted ? "Half Day Applied" : "Late Arrival Recorded", res.data.first_half_deducted ? "danger" : "warning");
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
      // Fetch latest live attendance info before showing confirmation popup
      const res = await API.get("/attendance/today");
      const rem = res.data?.remainingShiftMinutes || 0;
      setRemainingShiftMinutes(rem);
      
      let msg = "Are you sure you want to Clock Out for today?";
      if (rem > 0) {
        const h = Math.floor(rem / 60);
        const m = Math.round(rem % 60);
        const timeStr = h > 0 ? `${h} hrs ${m} mins` : `${m} mins`;
        msg = `You still have ${timeStr} left in your shift. If you Clock Out now, it will be counted as a Half Day / Leave. Are you sure you want to Clock Out?`;
      } else {
        msg = "Are you sure you want to Clock Out for today? Make sure your daily tasks and timesheet are complete.";
      }
      setClockOutConfirmMsg(msg);
      setShowConfirmClockOut(true);
    } catch (err) {
      console.error(err);
      setClockOutConfirmMsg("Are you sure you want to Clock Out for today?");
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

      // If user had remaining shift time, inform them gently with a notice popup
      if (res.data?.remainingMinutes > 0) {
        const remMins = res.data.remainingMinutes;
        const h = Math.floor(remMins / 60);
        const m = Math.round(remMins % 60);
        const timeStr = h > 0 ? `${h}h ${m}m` : `${m} minutes`;
        showAlert(
          `You have clocked out early today. Remaining shift time was ${timeStr}. Your total worked time is ${res.data.totalHours || "0"} hrs.`,
          "Shift Notice",
          "info"
        );
      }
    } catch (err) {
      showAlert(err.response?.data?.error || "Clock Out Failed", "Timesheet / Shift Notice", "warning");
    } finally {
      setAttLoading(false);
    }
  };

  const navigate = useNavigate();

  // Helper: Format decimal hours to readable "X hrs Y mins" or "X mins"
  const formatTotalHours = (val) => {
    if (val === null || val === undefined || val === "" || isNaN(val)) return "0 mins";
    const totalMins = Math.round(Number(val) * 60);
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (h === 0) return `${m} mins`;
    if (m === 0) return `${h} hrs`;
    return `${h} hrs ${m} mins`;
  };

  const handleBreakToggle = () => {
    navigate("/breaks");
  };

  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState(new Date());

  const [recentLogs, setRecentLogs] = useState([]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, projectsRes, allTasksRes] = await Promise.all([
        API.get("/staff"),
        API.get("/projects"),
        API.get(selectedProject ? `/tasks?project=${selectedProject._id}` : "/tasks")
      ]);

      const rawStaff = Array.isArray(staffRes.data) ? staffRes.data : staffRes.data?.staff || [];
      const rawProjects = Array.isArray(projectsRes.data) ? projectsRes.data : [];
      let rawTasks = Array.isArray(allTasksRes.data) ? allTasksRes.data : [];

      // Process real logs for the feed
      const processedLogs = [...rawTasks]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 3)
        .map(t => ({
            msg: `${t.type === 'issue' ? 'Incident' : 'Task'} [${t.title}] Logged`,
            time: new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            type: t.type === 'issue' ? 'error' : 'success'
        }));
      setRecentLogs(processedLogs);

      // Calculate Real-time Distribution
      const total = rawTasks.length;
      const pendingCount = rawTasks.filter(t => ["pending", "to do", "backlog"].includes(t.status?.name?.toLowerCase() || t.status?.toLowerCase())).length;
      const stableCount = rawTasks.filter(t => ["done", "completed", "stable", "finished"].includes(t.status?.name?.toLowerCase() || t.status?.toLowerCase())).length;
      const inProgressCount = total - (pendingCount + stableCount);

      const completionRate = total > 0 ? Math.round((stableCount / total) * 100) : 0;
      const distribution = {
        pending: total > 0 ? Math.round((pendingCount / total) * 100) : 0,
        inProgress: total > 0 ? Math.round((inProgressCount / total) * 100) : 0,
        stable: total > 0 ? Math.round((stableCount / total) * 100) : 0
      };

      const activeStaffList = rawStaff.filter(s => (s.status || "Active").toLowerCase() === "active");
      let staffCount = activeStaffList.length;
      let projectCount = rawProjects.length;

      if (selectedProject) {
        projectCount = 1;
        if (selectedProject.assignedTo && selectedProject.assignedTo.length > 0) {
          const assignedIds = selectedProject.assignedTo.map(u => u._id || u);
          staffCount = activeStaffList.filter(s => assignedIds.includes(s._id)).length;
        } else {
          staffCount = 0;
        }
      }

      const taskCount = rawTasks.filter(t => t.type === "task" || !t.type).length;
      const issueCount = rawTasks.filter(t => t.type === "issue").length;

      setStats({ 
        staffCount, projectCount, taskCount, issueCount, 
        completionRate, distribution 
      });
      setLastSync(new Date());
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedProject]);

  useEffect(() => {
    fetchDashboardData();
    fetchTodayAttendance();
  }, [fetchDashboardData, selectedCompany]);

  // Real-time socket integration
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
        console.log("[Dashboard] Real-time Dashboard Update Triggered");
        fetchDashboardData();
    };

    socket.on("task:created", handleUpdate);
    socket.on("task:updated", handleUpdate);
    socket.on("task:deleted", handleUpdate);

    return () => {
        socket.off("task:created", handleUpdate);
        socket.off("task:updated", handleUpdate);
        socket.off("task:deleted", handleUpdate);
    };
  }, [socket, fetchDashboardData]);

  const StatCard = ({ title, value, icon, color, delay }) => (
    <div style={{
      background: "var(--ui-surface)",
      borderRadius: "16px",
      padding: "24px",
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      boxShadow: `0 10px 30px -10px ${color}33`,
      border: `1px solid ${color}44`,
      position: "relative",
      overflow: "hidden",
      transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      animation: `fadeUpIn 0.6s ease backwards ${delay}s`,
      cursor: 'default'
    }} className="digital-card">
      {/* Dynamic Glow Layer */}
      <div style={{
        position: 'absolute', top: '-15px', right: '-15px', width: '70px', height: '70px',
        background: color, filter: 'blur(35px)', opacity: 0.18
      }}></div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          background: `${color}15`,
          color: color,
          width: "42px",
          height: "42px",
          borderRadius: "11px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "18px",
          border: `1px solid ${color}33`,
          boxShadow: `0 0 16px ${color}22`
        }}>
          {icon}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}`, animation: 'pulse-glow 1.5s infinite' }}></span>
            <span style={{ fontSize: '9px', color: color, fontWeight: '900', letterSpacing: '1px' }}>SYNCED</span>
        </div>
      </div>

      <div>
        <p style={{
          margin: 0,
          color: "var(--text-muted)",
          fontSize: "10px",
          fontWeight: "800",
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          marginBottom: "6px"
        }}>
          {title}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
            <h3 style={{ margin: 0, color: "var(--text-main)", fontSize: "30px", fontWeight: "900", letterSpacing: '-0.8px' }}>
            {loading ? "..." : value}
            </h3>
            {!loading && <span style={{ fontSize: '11px', color: 'var(--success-color)', fontWeight: '800', opacity: 0.8 }}>NETWORK ACTIVE</span>}
        </div>
      </div>
      
      {/* Cybernetic Accent */}
      <div style={{
        position: 'absolute', bottom: 0, left: '10%', right: '10%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        opacity: 0.4
      }}></div>
    </div>
  );

  return (
    <div className="page" style={{ position: 'relative' }}>
      <style>{`
        .digital-card:hover {
            transform: translateY(-8px) scale(1.02);
            box-shadow: 0 25px 50px -12px ${stats.primaryColor || '#6366f1'}33 !important;
            border-color: var(--primary-color) !important;
        }
        @keyframes pulse-glow {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(1.2); }
            100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Header HUD - SYSTEM STATUS BOARD */}
      <div style={{ 
        marginBottom: "40px", 
        padding: "36px",
        background: "var(--ui-surface)",
        borderRadius: "26px",
        border: "1px solid var(--ui-border)",
        boxShadow: "0 15px 35px -5px rgba(0,0,0,0.05)",
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Futuristic Side Accents */}
        <div style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '100%', background: 'linear-gradient(to bottom, var(--primary-color), #4f46e5)' }}></div>
        <div style={{ position: 'absolute', top: 0, right: 0, width: '100px', height: '100px', background: 'var(--primary-glow)', borderRadius: '50%', filter: 'blur(50px)', opacity: 0.3 }}></div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '10px' }}>
            <div style={{ 
                padding: '5px 12px', 
                background: connected ? 'rgba(52, 211, 153, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                borderRadius: '6px', 
                border: connected ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <span style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    background: connected ? '#10b981' : '#ef4444', 
                    boxShadow: connected ? '0 0 10px #10b981' : '0 0 10px #ef4444',
                    animation: connected ? 'pulse-glow 1.5s infinite' : 'none' 
                }}></span>
                <span style={{ fontSize: '10px', fontWeight: '950', color: connected ? '#059669' : '#b91c1c', letterSpacing: '1px' }}>
                    {connected ? "SYNC ACTIVE" : "SYNC OFFLINE"}
                </span>
            </div>
            <span style={{ color: 'var(--text-light)', fontSize: '10px', fontWeight: '800' }}>
                LAST_REFRESH: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          
          <h1 style={{ margin: 0, fontSize: "42px", color: "var(--text-main)", fontWeight: "900", letterSpacing: "-1.5px", lineHeight: 1 }}>
            {selectedProject ? selectedProject.name : "IT Operations Workspace"}
          </h1>
          <p style={{ margin: "16px 0 0 0", color: "var(--text-muted)", fontSize: "19px", fontWeight: "600", display: 'flex', alignItems: 'center', gap: '10px' }}>
            Operational Access: <strong style={{ color: "var(--primary-color)", fontWeight: "900", borderBottom: '2px solid var(--primary-glow)' }}>{user?.name || "Authorized Personnel"}</strong>
          </p>
        </div>

        <div style={{ textAlign: 'right', paddingRight: '20px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '900', letterSpacing: '2px', marginBottom: '6px' }}>SYSTEM CHRONO</div>
            <div style={{ fontSize: '26px', fontWeight: '950', color: "var(--text-main)", letterSpacing: '-1px' }}>
                {new Date().toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()}
            </div>
        </div>
      </div>

      {/* CLOCK IN / CLOCK OUT BANNER WIDGET */}
      {leaveNotice && (
        <div style={{
          background: "rgba(245, 158, 11, 0.12)",
          border: "1px solid #f59e0b",
          borderRadius: "16px",
          padding: "16px 20px",
          marginBottom: "16px",
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
            onClick={() => navigate(`/leave?date=${leaveNotice.date}&type=Second Half`)}
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
            Apply Second Half Leave →
          </button>
        </div>
      )}

      <div style={{
        background: "var(--ui-surface, #ffffff)",
        borderRadius: "20px",
        padding: "24px 28px",
        marginBottom: "36px",
        border: "1px solid var(--ui-border, #e2e8f0)",
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "20px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div style={{
            width: "56px",
            height: "56px",
            borderRadius: "16px",
            background: attendance?.clock_in && !attendance?.clock_out ? "rgba(34, 197, 94, 0.15)" : "var(--ui-bg, #f1f5f9)",
            color: attendance?.clock_in && !attendance?.clock_out ? "#22c55e" : "var(--text-muted, #64748b)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--ui-border, #e2e8f0)"
          }}>
            <ClockIcon size={26} color="currentColor" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "20px", fontWeight: "800", color: "var(--text-main, #1e293b)", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              Daily Attendance & Shift Punch
              {scheduleInfo?.excessBreakMinutes > 0 && (
                <span
                  style={{
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
            </h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted, #64748b)", fontSize: "14px" }}>
              {attendance?.clock_in ? (
                <>Clocked In at <strong style={{ color: "#22c55e" }}>{new Date(attendance.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> ({attendance.work_mode})</>
              ) : (
                "You haven't clocked in yet for today. Start your shift below."
              )}
              {attendance?.clock_out && (
                <> • Clocked Out at <strong style={{ color: "#ef4444" }}>{new Date(attendance.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> ({formatTotalHours(attendance.total_hours)})</>
              )}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          {!attendance?.clock_in && (
            <select
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value)}
              style={{
                padding: "10px 14px",
                border: "1px solid var(--ui-border, #cbd5e1)",
                borderRadius: "10px",
                fontWeight: "600",
                background: "var(--ui-bg, #0f172a)",
                color: "var(--text-main, #334155)",
                outline: "none"
              }}
            >
              <option value="Office" style={{ background: "var(--ui-surface, #1e293b)", color: "var(--text-main, #fff)" }}>Office</option>
              <option value="Work From Home" style={{ background: "var(--ui-surface, #1e293b)", color: "var(--text-main, #fff)" }}>Work From Home</option>
              <option value="On-site" style={{ background: "var(--ui-surface, #1e293b)", color: "var(--text-main, #fff)" }}>On-site (Client)</option>
            </select>
          )}

          {!attendance?.clock_in ? (
            <button
              onClick={handleClockIn}
              disabled={attLoading}
              style={{
                background: "#16a34a",
                color: "#ffffff",
                border: "none",
                padding: "12px 24px",
                borderRadius: "12px",
                fontWeight: "700",
                fontSize: "15px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                boxShadow: "0 4px 14px rgba(22, 163, 74, 0.3)"
              }}
            >
              <PlayIcon size={12} color="#fff" /> Clock In Now
            </button>
          ) : !attendance?.clock_out ? (
            <>
              <button
                onClick={handleBreakToggle}
                disabled={attLoading}
                style={{
                  background: attendance.break_start ? "#eab308" : "var(--ui-bg, #f1f5f9)",
                  color: attendance.break_start ? "#ffffff" : "var(--text-main, #334155)",
                  border: "1px solid var(--ui-border, #cbd5e1)",
                  padding: "12px 18px",
                  borderRadius: "12px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <CoffeeIcon size={15} color="currentColor" /> {attendance.break_start ? "End Break" : "Take Break"}
              </button>
              {attendance?.only_admin_clock_out ? (
                <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
                  <button
                    disabled={true}
                    title="Your administrator has configured this shift so only an admin can clock you out."
                    style={{
                      background: "#94a3b8",
                      color: "#ffffff",
                      border: "none",
                      padding: "12px 24px",
                      borderRadius: "12px",
                      fontWeight: "700",
                      fontSize: "14px",
                      cursor: "not-allowed",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      opacity: 0.8
                    }}
                  >
                    <StopIcon size={12} color="#fff" /> Clock Out Restricted
                  </button>
                  <span style={{ fontSize: "11px", color: "#b45309", fontWeight: "600" }}>
                    * Clock out can only be performed by Admin
                  </span>
                </div>
              ) : (
                <button
                  onClick={handleClockOut}
                  disabled={attLoading}
                  style={{
                    background: "#dc2626",
                    color: "#ffffff",
                    border: "none",
                    padding: "12px 24px",
                    borderRadius: "12px",
                    fontWeight: "700",
                    fontSize: "15px",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: "0 4px 14px rgba(220, 38, 38, 0.3)"
                  }}
                >
                  <StopIcon size={12} color="#fff" /> Clock Out
                </button>
              )}
            </>
          ) : (
            <span style={{
              background: "#dcfce7",
              color: "#15803d",
              padding: "10px 18px",
              borderRadius: "10px",
              fontWeight: "700",
              fontSize: "14px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
            }}>
              <CheckIcon size={16} color="#15803d" /> Shift Completed ({formatTotalHours(attendance.total_hours)})
            </span>
          )}
        </div>
      </div>

      {/* NODE CLUSTER GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
        gap: "28px",
        marginBottom: "46px"
      }}>
        {!selectedProject && (
          <StatCard
            title="ACTIVE INFRASTRUCTURE"
            value={stats.projectCount}
            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7L12 12L22 7L12 2Z" /><path d="M2 17L12 22L22 17" /><path d="M2 12L12 17L22 12" /></svg>}
            color="#6366f1"
            delay={0.1}
          />
        )}
        <StatCard
          title="EXECUTED PROTOCOLS"
          value={stats.taskCount}
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11L12 14L22 4" /><path d="M21 12V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
          color="#10b981"
          delay={0.2}
        />
        <StatCard
          title="DEVIATION REPORTS"
          value={stats.issueCount}
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
          color="#f43f5e"
          delay={0.3}
        />
        <StatCard
          title="NETWORK ENTITIES"
          value={stats.staffCount}
          icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21V19a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
          color="#a855f7"
          delay={0.4}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '28px', marginBottom: '40px' }}>
          {/* TASK DISTRIBUTION HUD */}
          <div style={{
            background: "var(--ui-surface)",
            borderRadius: "28px",
            padding: "32px",
            boxShadow: "0 20px 40px -15px rgba(0,0,0,0.06)",
            border: "1px solid var(--ui-border)",
            display: 'flex',
            alignItems: 'center',
            gap: '30px'
          }}>
            <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                 <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="var(--ui-border)" strokeWidth="8" />
                    <circle cx="60" cy="60" r="54" fill="none" stroke="var(--primary-color)" strokeWidth="10" 
                        strokeDasharray="339.29" 
                        strokeDashoffset={339.29 * (1 - (stats.completionRate / 100))}
                        strokeLinecap="round"
                        transform="rotate(-90 60 60)"
                        style={{ filter: 'drop-shadow(0 0 5px var(--primary-color))', transition: 'stroke-dashoffset 1s ease-out' }}
                    />
                 </svg>
                 <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                     <div style={{ fontSize: '24px', fontWeight: '950', color: 'var(--text-main)' }}>{stats.completionRate}%</div>
                     <div style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-muted)' }}>COMPLETE</div>
                 </div>
            </div>
            <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: '950', letterSpacing: '2px', color: 'var(--text-main)' }}>PROTOCOL STATUS</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                        { label: 'PENDING', val: stats.distribution.pending, color: '#f59e0b' },
                        { label: 'IN_PROGRESS', val: stats.distribution.inProgress, color: '#3b82f6' },
                        { label: 'STABLE', val: stats.distribution.stable, color: '#10b981' }
                    ].map((s, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: s.color }}></div>
                            <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', flex: 1 }}>{s.label}</span>
                            <span style={{ fontSize: '12px', fontWeight: '900', color: "var(--text-main)" }}>{s.val}%</span>
                        </div>
                    ))}
                </div>
            </div>
          </div>

          {/* RECENT SYSTEM LOGS */}
          <div style={{
            background: "var(--ui-surface)",
            borderRadius: "28px",
            padding: "32px",
            boxShadow: "0 20px 40px -15px rgba(0,0,0,0.06)",
            border: "1px solid var(--ui-border)",
            height: '100%',
            overflow: 'hidden'
          }}>
             <h3 style={{ margin: '0 0 20px 0', fontSize: '13px', fontWeight: '950', letterSpacing: '2px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--primary-color)' }}>[</span> LIVE_AUDIT_FEED <span style={{ color: 'var(--primary-color)' }}>]</span>
             </h3>
             <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {recentLogs.length > 0 ? recentLogs.map((log, i) => (
                    <div key={i} style={{ display: 'flex', gap: '16px', animation: `fadeUpIn 0.5s ease backwards ${i * 0.1}s` }}>
                        <div style={{ width: '2px', background: 'var(--ui-border)', position: 'relative' }}>
                            <div style={{ 
                                position: 'absolute', top: '0', left: '-3px', width: '8px', height: '8px', borderRadius: '50%', 
                                background: log.type === 'error' ? 'var(--error-color)' : 'var(--success-color)',
                                boxShadow: `0 0 8px ${log.type === 'error' ? 'var(--error-color)' : 'var(--success-color)'}`
                            }}></div>
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: '800', color: "var(--text-main)", letterSpacing: '-0.2px' }}>{log.msg}</div>
                            <div style={{ fontSize: '10px', fontWeight: '950', color: 'var(--text-muted)', marginTop: '4px', letterSpacing: '0.5px' }}>{log.time.toUpperCase()}</div>
                        </div>
                    </div>
                )) : (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '800' }}>
                        SYSTEM_IDLE_NODE...
                    </div>
                )}
             </div>
          </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '28px' }}>
          {/* DIGITAL ACTIVITY PULSE - CUSTOM SVG GRAPH */}
          <div style={{
            background: "var(--ui-surface)",
            borderRadius: "28px",
            padding: "32px",
            boxShadow: "0 20px 40px -15px rgba(0,0,0,0.06)",
            border: "1px solid var(--ui-border)",
            position: 'relative',
            overflow: 'hidden',
             display: 'flex',
            flexDirection: 'column'
          }}>
             <h3 style={{
              margin: "0 0 24px 0",
              color: "var(--text-main)",
              fontSize: "13px",
              fontWeight: "950",
              textTransform: 'uppercase',
              letterSpacing: '2px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary-color)' }}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
              Activity Pulse Sync
            </h3>

            <div style={{ flex: 1, position: 'relative', minHeight: '180px' }}>
                <svg width="100%" height="180" viewBox="0 0 400 180" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                    {/* Background Grid */}
                    {[0, 45, 90, 135, 180].map(y => (
                        <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="var(--ui-border)" strokeWidth="0.5" strokeDasharray="4 4" />
                    ))}
                    
                    {/* The Pulse Line */}
                    <path 
                        d="M0,150 Q50,140 80,80 T160,110 T240,60 T320,130 T400,90" 
                        fill="none" 
                        stroke="var(--primary-color)" 
                        strokeWidth="3" 
                        strokeLinecap="round"
                        style={{ filter: 'drop-shadow(0 0 8px var(--primary-color))' }}
                    />
                    
                    {/* Under-glow area */}
                    <path 
                        d="M0,150 Q50,140 80,80 T160,110 T240,60 T320,130 T400,90 L400,180 L0,180 Z" 
                        fill="url(#pulseGradient)" 
                        opacity="0.1" 
                    />

                    <defs>
                        <linearGradient id="pulseGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="var(--primary-color)" />
                            <stop offset="100%" stopColor="transparent" />
                        </linearGradient>
                    </defs>

                    {/* Data Nodes */}
                    {[
                        { x: 80, y: 80 }, { x: 160, y: 110 }, { x: 240, y: 60 }, { x: 320, y: 130 }
                    ].map((pt, i) => (
                        <circle key={i} cx={pt.x} cy={pt.y} r="4" fill="var(--ui-surface)" stroke="var(--primary-color)" strokeWidth="2" />
                    ))}
                </svg>

                {/* Legend */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                    {['06 AM', '10 AM', '02 PM', '06 PM', '10 PM'].map(time => (
                        <span key={time} style={{ fontSize: '10px', color: 'var(--text-light)', fontWeight: '800' }}>{time}</span>
                    ))}
                </div>
            </div>
          </div>

          {/* SECURE IDENTITY HUD */}
          <div style={{
            background: "var(--ui-surface)",
            borderRadius: "28px",
            padding: "40px",
            boxShadow: "0 20px 40px -15px rgba(0,0,0,0.06)",
            border: "1px solid var(--ui-border)",
            position: 'relative',
            overflow: 'hidden',
            height: '100%'
          }}>
             {/* Cybernetic Grid Overlay Background */}
             <div style={{ position: 'absolute', top: 0, right: 0, width: '120px', height: '120px', background: 'var(--primary-glow)', borderRadius: '50%', filter: 'blur(50px)', opacity: 0.4 }}></div>
             
             <h3 style={{
              margin: "0 0 32px 0",
              color: "var(--text-main)",
              fontSize: "13px",
              fontWeight: "950",
              textTransform: 'uppercase',
              letterSpacing: '3px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px'
            }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary-color)', boxShadow: '0 0 12px var(--primary-color)', animation: 'pulse-glow 2s infinite' }}></span>
              AUTHENTICATED IDENTITY
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {[
                { label: 'NETWORK ENTITY', value: user?.name, icon: 'USER' },
                { label: 'ENCRYPTION NODE', value: user?.email, icon: 'NODE' },
                { label: 'SYSTEM CLUSTER', value: user?.companyId?.companyName || 'GLOBAL_ROOT', icon: 'UNIT' },
              ].map((item, idx) => (
                <div key={idx} style={{ 
                    display: "flex", 
                    justifyContent: "space-between", 
                    alignItems: "center",
                    padding: '16px 20px',
                    background: 'var(--ui-bg)',
                    borderRadius: '16px',
                    border: '1px solid var(--ui-border)',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '9px', fontWeight: '950', color: 'var(--primary-color)', opacity: 0.7, background: 'var(--primary-glow)', padding: '4px 8px', borderRadius: '4px' }}>{item.icon}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: "800", textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.label}</span>
                  </div>
                  <span style={{ fontWeight: "900", color: "var(--text-main)", fontSize: "15px", letterSpacing: '-0.3px' }}>{item.value || 'REDACTED'}</span>
                </div>
              ))}
              
              <div style={{ 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                padding: '16px 20px',
                marginTop: '10px'
              }}>
                <span style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: "800", textTransform: 'uppercase', letterSpacing: '1.5px' }}>SECURITY STATUS</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ 
                        background: 'var(--success-color)', 
                        color: '#fff', 
                        fontSize: '10px', 
                        fontWeight: '950', 
                        padding: '6px 14px', 
                        borderRadius: '25px',
                        boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
                        letterSpacing: '1px'
                    }}>ROOT ACCESS</span>
                </div>
              </div>
            </div>
            
            {/* HUD Corner Accents */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '20px', height: '20px', borderLeft: '2px solid var(--primary-glow)', borderBottom: '2px solid var(--primary-glow)' }}></div>
            <div style={{ position: 'absolute', top: 0, right: 0, width: '20px', height: '20px', borderRight: '2px solid var(--primary-glow)', borderTop: '2px solid var(--primary-glow)' }}></div>
          </div>
      </div>

      {/* Modern Notice / Error Popup */}
      <AlertModal
        show={alertInfo.show}
        title={alertInfo.title}
        message={alertInfo.message}
        type={alertInfo.type}
        onClose={() => setAlertInfo({ show: false, title: "", message: "", type: "info" })}
      />

      {/* Modern Clock Out Confirmation Popup */}
      <ConfirmModal
        show={showConfirmClockOut}
        title="Confirm Clock Out"
        message={clockOutConfirmMsg || "Are you sure you want to Clock Out for today? Make sure your daily tasks and shift hours are complete."}
        confirmText="Yes, Clock Out"
        confirmColor="#dc2626"
        onConfirm={confirmClockOut}
        onClose={() => setShowConfirmClockOut(false)}
      />
    </div>
  );
}