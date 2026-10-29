import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useSocket } from "../../contexts/SocketContext";
import API from "../../api/api";
import {
  UsersIcon,
  FolderIcon,
  ZapIcon,
  TicketIcon,
  BugIcon,
  ClockIcon,
  PlayIcon,
  CoffeeIcon,
  StopIcon,
  CheckIcon,
  CheckCircleIcon,
  TimerIcon
} from "../../components/common/Icons";
import AlertModal from "../../components/common/AlertModal";
import ConfirmModal from "../../components/common/ConfirmModal";
import ForgotPunchOutAlert from "../../components/attendance/ForgotPunchOutAlert";
import "../../style/main.css";

export default function ProjectManagerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket();

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    totalProjects: 0,
    activeProjects: 0,
    teamMembersCount: 0,
    totalTasks: 0,
    inProgressTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    bugCount: 0,
  });

  const [projectsList, setProjectsList] = useState([]);
  const [tasksList, setTasksList] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);

  // Attendance state for Project Manager
  const [attendance, setAttendance] = useState(null);
  const [attLoading, setAttLoading] = useState(false);
  const [workMode, setWorkMode] = useState("Office");
  const [leaveNotice, setLeaveNotice] = useState(null);
  const [scheduleInfo, setScheduleInfo] = useState(null);
  const [lateInstances, setLateInstances] = useState(null);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const [alertInfo, setAlertInfo] = useState({ show: false, title: "", message: "", type: "info" });
  const [showConfirmClockOut, setShowConfirmClockOut] = useState(false);
  const [clockOutConfirmMsg, setClockOutConfirmMsg] = useState("");

  const showAlert = (message, title = "Notice", type = "warning") => {
    setAlertInfo({ show: true, title, message, type });
  };

  // Fetch PM Attendance
  const fetchTodayAttendance = useCallback(async () => {
    try {
      const res = await API.get("/attendance/today");
      setAttendance(res.data?.attendance || null);
      setLeaveNotice(res.data?.requiredLeaveNotice || null);
      if (res.data?.schedule) {
        setScheduleInfo(res.data.schedule);
      }
      if (res.data?.monthlyInstances) {
        setLateInstances(res.data.monthlyInstances);
      }
      if (res.data?.attendance?.work_mode) {
        setWorkMode(res.data.attendance.work_mode);
      }
    } catch (err) {
      console.error("Attendance fetch error:", err);
    }
  }, []);

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
      let msg = "Are you sure you want to end your shift for today? Your total hours and timesheet records will be saved.";
      if (rem > 0) {
        const h = Math.floor(rem / 60);
        const m = Math.round(rem % 60);
        const timeStr = h > 0 ? `${h} hrs ${m} mins` : `${m} mins`;
        msg = `You still have ${timeStr} left in your shift. If you Clock Out now, it will be counted as a Half Day / Leave. Are you sure you want to Clock Out?`;
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

  // Load PM Data
  const loadPMData = useCallback(async () => {
    setLoading(true);
    try {
      const [projectsRes, tasksRes, staffRes] = await Promise.allSettled([
        API.get("/projects"),
        API.get("/tasks"),
        API.get("/staff"),
      ]);

      const projData = projectsRes.status === "fulfilled" && Array.isArray(projectsRes.value.data)
        ? projectsRes.value.data
        : [];
      const taskData = tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.data)
        ? tasksRes.value.data
        : [];
      const staffData = staffRes.status === "fulfilled"
        ? (Array.isArray(staffRes.value.data) ? staffRes.value.data : staffRes.value.data?.staff || [])
        : [];

      setProjectsList(projData.slice(0, 5));
      setTasksList(taskData.slice(0, 6));
      setTeamMembers(staffData.slice(0, 5));

      const inProg = taskData.filter(t => {
        const s = (t.status?.name || t.status || "").toLowerCase();
        return s.includes("progress") || s.includes("dev") || s.includes("review");
      }).length;

      const comp = taskData.filter(t => {
        const s = (t.status?.name || t.status || "").toLowerCase();
        return s.includes("done") || s.includes("complete") || s.includes("finished");
      }).length;

      const bugs = taskData.filter(t => t.type === "issue" || (t.title || "").toLowerCase().includes("bug")).length;
      const pend = Math.max(0, taskData.length - inProg - comp);

      setMetrics({
        totalProjects: projData.length,
        activeProjects: projData.filter(p => (p.status || "Active").toLowerCase() !== "archived").length,
        teamMembersCount: staffData.length,
        totalTasks: taskData.length,
        inProgressTasks: inProg,
        completedTasks: comp,
        pendingTasks: pend,
        bugCount: bugs,
      });
    } catch (err) {
      console.error("Project Manager Dashboard Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPMData();
    fetchTodayAttendance();
  }, [loadPMData, fetchTodayAttendance]);

  // Live Timer for clocked-in Project Manager
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

  // Real-time synchronization
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      loadPMData();
      fetchTodayAttendance();
    };
    socket.on("task:created", handleUpdate);
    socket.on("task:updated", handleUpdate);
    socket.on("task:deleted", handleUpdate);
    socket.on("project:created", handleUpdate);
    socket.on("project:updated", handleUpdate);

    return () => {
      socket.off("task:created", handleUpdate);
      socket.off("task:updated", handleUpdate);
      socket.off("task:deleted", handleUpdate);
      socket.off("project:created", handleUpdate);
      socket.off("project:updated", handleUpdate);
    };
  }, [socket, loadPMData, fetchTodayAttendance]);

  const completionPercent = metrics.totalTasks > 0
    ? Math.round((metrics.completedTasks / metrics.totalTasks) * 100)
    : 0;

  return (
    <div className="task-page" style={{ padding: "28px", maxWidth: "1600px", margin: "0 auto" }}>
      <ForgotPunchOutAlert />
      {/* MODERN HERO HEADER FOR PROJECT MANAGER */}
      <div
        style={{
          background: "linear-gradient(135deg, #090d16 0%, #0f172a 50%, #1e1b4b 100%)",
          borderRadius: "24px",
          padding: "36px 40px",
          marginBottom: "32px",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          boxShadow: "0 20px 40px -15px rgba(0, 0, 0, 0.5)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span
              style={{
                fontSize: "12px",
                fontWeight: "800",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                background: "rgba(99, 102, 241, 0.18)",
                color: "#818cf8",
                padding: "5px 12px",
                borderRadius: "20px",
                border: "1px solid rgba(99, 102, 241, 0.35)",
              }}
            >
              Project Manager Workspace
            </span>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              • Live Team Synchronized
            </span>
          </div>

          <h1
            style={{
              fontSize: "32px",
              fontWeight: "900",
              color: "#ffffff",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Welcome, {user?.name || "Project Manager"}
          </h1>
          <p
            style={{
              color: "#94a3b8",
              fontSize: "15px",
              marginTop: "8px",
              maxWidth: "600px",
              lineHeight: "1.5",
            }}
          >
            Track project deliverables, sprint tasks, team productivity, and attendance across all assigned repositories.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div style={{ display: "flex", gap: "12px", position: "relative", zIndex: 2, flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/project")}
            style={{
              background: "linear-gradient(135deg, #6366f1, #4f46e5)",
              color: "#fff",
              border: "none",
              padding: "12px 20px",
              borderRadius: "12px",
              fontWeight: "700",
              fontSize: "13px",
              cursor: "pointer",
              boxShadow: "0 4px 14px rgba(79, 70, 229, 0.35)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FolderIcon size={16} color="#fff" /> New Project
          </button>
          <button
            onClick={() => navigate("/task")}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              color: "#fff",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              padding: "12px 20px",
              borderRadius: "12px",
              fontWeight: "700",
              fontSize: "13px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <ZapIcon size={16} color="#fff" /> Assign Task
          </button>
        </div>
      </div>

      {/* REQUIRED LEAVE NOTICE BANNER (IF MISSED CLOCK OUT) */}
      {leaveNotice && (
        <div style={{
          background: "rgba(245, 158, 11, 0.12)",
          border: "1px solid #f59e0b",
          borderRadius: "16px",
          padding: "16px 20px",
          marginBottom: "24px",
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
            onClick={() => navigate("/leave")}
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

      {/* SHIFT PUNCH / ATTENDANCE WIDGET */}
      <div style={{
        background: "var(--ui-surface, #ffffff)",
        borderRadius: "20px",
        padding: "20px 24px",
        marginBottom: "32px",
        border: "1px solid var(--ui-border, #e2e8f0)",
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "18px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{
              width: "50px",
              height: "50px",
              borderRadius: "14px",
              background: attendance?.clock_in && !attendance?.clock_out ? "rgba(34, 197, 94, 0.15)" : "var(--ui-bg, #f1f5f9)",
              color: attendance?.clock_in && !attendance?.clock_out ? "#22c55e" : "var(--text-muted, #64748b)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid var(--ui-border, #e2e8f0)"
            }}>
              <ClockIcon size={24} color="currentColor" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>
                Shift Punch & Daily Attendance
              </h3>
              <p style={{ margin: "2px 0 0", color: "var(--text-muted, #64748b)", fontSize: "13px" }}>
                {attendance?.clock_in ? (
                  <>Clocked In at <strong style={{ color: "#22c55e" }}>{new Date(attendance.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> ({attendance.work_mode})</>
                ) : (
                  "You haven't clocked in yet for today. Start your shift below."
                )}
                {attendance?.clock_out && (
                  <> • Clocked Out at <strong style={{ color: "#ef4444" }}>{new Date(attendance.clock_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong> ({attendance.total_hours} hrs)</>
                )}
              </p>
            </div>
          </div>

          {/* LIVE ELAPSED WORKING TIMER & SHIFT BADGES */}
          {attendance?.clock_in && (
            <div style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              padding: "10px 18px",
              borderRadius: "14px",
              border: "1px solid rgba(56, 189, 248, 0.25)",
              display: "flex",
              alignItems: "center",
              gap: "16px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)"
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: "800", letterSpacing: "1px", textTransform: "uppercase" }}>
                    Today's Shift Time
                  </span>
                  {scheduleInfo && (
                    <span style={{
                      fontSize: "10.5px",
                      fontWeight: "700",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      background: "rgba(56, 189, 248, 0.15)",
                      color: "#38bdf8",
                      border: "1px solid rgba(56, 189, 248, 0.3)"
                    }}>
                      Shift: {scheduleInfo.timing} ({scheduleInfo.standardShiftHours}h)
                    </span>
                  )}
                  {lateInstances && (
                    <span style={{
                      fontSize: "10.5px",
                      fontWeight: "700",
                      padding: "2px 8px",
                      borderRadius: "12px",
                      background: lateInstances.used > 0 ? "rgba(245, 158, 11, 0.15)" : "rgba(34, 197, 94, 0.15)",
                      color: lateInstances.used > 0 ? "#f59e0b" : "#22c55e",
                      border: lateInstances.used > 0 ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid rgba(34, 197, 94, 0.3)"
                    }}>
                      Late: {lateInstances.used}/{lateInstances.limit} Used
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: "26px",
                  fontWeight: "900",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  color: "#38bdf8",
                  letterSpacing: "1px",
                  lineHeight: "1"
                }}>
                  {elapsedTime}
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {!attendance?.clock_in && (
            <select
              value={workMode}
              onChange={(e) => setWorkMode(e.target.value)}
              style={{
                padding: "9px 12px",
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
              <option value="On-site" style={{ background: "var(--ui-surface, #1e293b)", color: "var(--text-main, #fff)" }}>On-site</option>
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
                padding: "10px 20px",
                borderRadius: "10px",
                fontWeight: "700",
                fontSize: "14px",
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
                onClick={() => navigate("/breaks")}
                disabled={attLoading}
                style={{
                  background: attendance.break_start ? "#eab308" : "var(--ui-bg, #f1f5f9)",
                  color: attendance.break_start ? "#ffffff" : "var(--text-main, #334155)",
                  border: "1px solid var(--ui-border, #cbd5e1)",
                  padding: "10px 16px",
                  borderRadius: "10px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <CoffeeIcon size={15} color="currentColor" /> {attendance.break_start ? "End Break" : "Take Break"}
              </button>
              <button
                onClick={handleClockOut}
                disabled={attLoading}
                style={{
                  background: "#dc2626",
                  color: "#ffffff",
                  border: "none",
                  padding: "10px 20px",
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
                <StopIcon size={12} color="#fff" /> Clock Out
              </button>
            </>
          ) : (
            <span style={{
              background: "rgba(16, 185, 129, 0.15)",
              color: "#10b981",
              padding: "8px 16px",
              borderRadius: "10px",
              fontWeight: "700",
              fontSize: "13px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
            }}>
              <CheckIcon size={15} color="#10b981" /> Shift Completed ({attendance.total_hours} hrs)
            </span>
          )}
        </div>
      </div>

      {/* PROJECT MANAGER KPI CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "20px",
          marginBottom: "32px",
        }}
      >
        <PMStatCard
          title="Active Projects"
          value={metrics.activeProjects}
          subtitle={`${metrics.totalProjects} total assigned`}
          color="#3b82f6"
          icon={<FolderIcon size={20} color="#3b82f6" />}
          onClick={() => navigate("/project")}
        />
        <PMStatCard
          title="Team Members"
          value={metrics.teamMembersCount}
          subtitle="Staff & developers"
          color="#10b981"
          icon={<UsersIcon size={20} color="#10b981" />}
          onClick={() => navigate("/staff")}
        />
        <PMStatCard
          title="Active Tasks"
          value={metrics.inProgressTasks}
          subtitle={`${metrics.totalTasks} total tasks`}
          color="#6366f1"
          icon={<ZapIcon size={20} color="#6366f1" />}
          onClick={() => navigate("/task")}
        />
        <PMStatCard
          title="Completed"
          value={metrics.completedTasks}
          subtitle={`${completionPercent}% velocity rate`}
          color="#8b5cf6"
          icon={<CheckCircleIcon size={20} color="#8b5cf6" />}
          onClick={() => navigate("/task")}
        />
        <PMStatCard
          title="Pending / Bugs"
          value={metrics.bugCount}
          subtitle="Bugs & blockers"
          color="#ef4444"
          icon={<BugIcon size={20} color="#ef4444" />}
          onClick={() => navigate("/task")}
        />
      </div>

      {/* ACTIVE PROJECTS & RECENT SPRINT TASKS GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: "24px",
          marginBottom: "32px",
        }}
      >
        {/* Active Projects Table */}
        <div
          style={{
            background: "var(--ui-surface, #ffffff)",
            borderRadius: "18px",
            padding: "24px",
            border: "1px solid var(--ui-border, #e2e8f0)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>
                Active Projects Pipeline
              </h3>
              <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                Projects currently under your supervision
              </span>
            </div>
            <button
              onClick={() => navigate("/project")}
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

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {projectsList.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--text-muted, #94a3b8)", padding: "20px" }}>No projects found.</p>
            ) : (
              projectsList.map((p) => (
                <div
                  key={p._id || p.id}
                  onClick={() => navigate("/project")}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "12px",
                    background: "var(--ui-bg, #f8fafc)",
                    border: "1px solid var(--ui-border, #e2e8f0)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    transition: "transform 0.15s ease",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = "translateX(4px)"}
                  onMouseLeave={(e) => e.currentTarget.style.transform = "none"}
                >
                  <div>
                    <strong style={{ fontSize: "14px", color: "var(--text-main, #1e293b)", display: "block" }}>
                      {p.name || p.projectName || "Untitled Project"}
                    </strong>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                      {p.clientName ? `Client: ${p.clientName}` : p.description || "Active Workspace"}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "700",
                      padding: "4px 10px",
                      borderRadius: "10px",
                      background: "rgba(16, 185, 129, 0.15)",
                      color: "#10b981",
                    }}
                  >
                    {p.status || "Active"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sprint Tasks Overview */}
        <div
          style={{
            background: "var(--ui-surface, #ffffff)",
            borderRadius: "18px",
            padding: "24px",
            border: "1px solid var(--ui-border, #e2e8f0)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>
                Latest Sprint Tasks
              </h3>
              <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                Real-time task allocations and progress
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
              View Tasks →
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {tasksList.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--text-muted, #94a3b8)", padding: "20px" }}>No tasks created yet.</p>
            ) : (
              tasksList.map((t) => {
                const isIssue = t.type === "issue";
                return (
                  <div
                    key={t._id || t.id}
                    onClick={() => navigate("/task")}
                    style={{
                      padding: "12px 16px",
                      borderRadius: "12px",
                      background: "var(--ui-bg, #f8fafc)",
                      border: "1px solid var(--ui-border, #e2e8f0)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      cursor: "pointer",
                      transition: "transform 0.15s ease",
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = "translateX(4px)"}
                    onMouseLeave={(e) => e.currentTarget.style.transform = "none"}
                  >
                    <div>
                      <strong style={{ fontSize: "13px", color: "var(--text-main, #1e293b)", display: "block" }}>
                        {t.title || "Untitled Task"}
                      </strong>
                      <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                        {t.assignedTo?.name ? `Assignee: ${t.assignedTo.name}` : "Unassigned"} • Priority: {t.priority || "Normal"}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        padding: "3px 8px",
                        borderRadius: "8px",
                        background: isIssue ? "rgba(239, 68, 68, 0.15)" : "rgba(99, 102, 241, 0.15)",
                        color: isIssue ? "#ef4444" : "#6366f1",
                      }}
                    >
                      {t.status?.name || t.status || (isIssue ? "Bug" : "In Progress")}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* MANAGED TEAM ROSTER */}
      <div
        style={{
          background: "var(--ui-surface, #ffffff)",
          borderRadius: "18px",
          padding: "24px",
          border: "1px solid var(--ui-border, #e2e8f0)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "17px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>
              Project Team Roster
            </h3>
            <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
              Direct team members, engineers, and QA contributors
            </span>
          </div>
          <button
            onClick={() => navigate("/staff")}
            style={{
              background: "none",
              border: "none",
              color: "#6366f1",
              fontSize: "13px",
              fontWeight: "700",
              cursor: "pointer",
            }}
          >
            Manage Team →
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "16px" }}>
          {teamMembers.length === 0 ? (
            <p style={{ color: "var(--text-muted, #94a3b8)" }}>No team members assigned.</p>
          ) : (
            teamMembers.map((m) => (
              <div
                key={m._id || m.id}
                style={{
                  padding: "16px",
                  borderRadius: "14px",
                  background: "var(--ui-bg, #f8fafc)",
                  border: "1px solid var(--ui-border, #e2e8f0)",
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "12px",
                    background: "rgba(99, 102, 241, 0.15)",
                    color: "#6366f1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: "800",
                    fontSize: "16px",
                  }}
                >
                  {(m.name || "U")[0].toUpperCase()}
                </div>
                <div>
                  <strong style={{ fontSize: "14px", color: "var(--text-main, #1e293b)", display: "block" }}>
                    {m.name}
                  </strong>
                  <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                    {typeof m.role === "object" ? (m.role?.name || "Developer") : (m.role || "Developer")} • {m.email}
                  </span>
                </div>
              </div>
            ))
          )}
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
        message={clockOutConfirmMsg || "Are you sure you want to end your shift for today? Your total hours and timesheet records will be saved."}
        confirmText="Yes, Clock Out"
        confirmColor="#dc2626"
        cancelText="Cancel"
        onConfirm={confirmClockOut}
        onClose={() => setShowConfirmClockOut(false)}
      />
    </div>
  );
}

// KPI Card Component
function PMStatCard({ title, value, subtitle, color, icon, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--ui-surface, #ffffff)",
        borderRadius: "18px",
        padding: "22px 24px",
        border: "1px solid var(--ui-border, #e2e8f0)",
        boxShadow: "0 4px 15px rgba(0,0,0,0.04)",
        cursor: "pointer",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = `0 12px 24px -6px ${color}33`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = "0 4px 15px rgba(0,0,0,0.04)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-muted, #64748b)" }}>
          {title}
        </span>
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: `${color}15`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
      </div>
      <div>
        <div style={{ fontSize: "28px", fontWeight: "900", color: "var(--text-main, #1e293b)" }}>
          {value}
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)", marginTop: "2px" }}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}
