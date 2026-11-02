import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useSocket } from "../../contexts/SocketContext";
import API from "../../api/api";
import { formatDuration } from "../../utils/formatDuration";
import { UsersIcon, FolderIcon, ZapIcon, TicketIcon, BugIcon } from "../../components/common/Icons";
import CelebrationsWidget from "../../components/common/CelebrationsWidget";
import "../../style/main.css";


export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { socket } = useSocket();

  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    staffCount: 0,
    projectsCount: 0,
    tasksCount: 0,
    issuesCount: 0,
    openTicketsCount: 0,
  });

  const [missingPunches, setMissingPunches] = useState([]);
  const [missingLoading, setMissingLoading] = useState(true);
  const [missingDate, setMissingDate] = useState(getYesterday);
  const [pendingApprovals, setPendingApprovals] = useState({ leaves: [], shortLeaves: [] });
  const [dailyHours, setDailyHours] = useState([]);
  const [dailyHoursDate, setDailyHoursDate] = useState(getYesterday);
  const [upcomingLeaves, setUpcomingLeaves] = useState([]);

  const loadDailyHours = useCallback(async () => {
    try {
      const res = await API.get("/timesheets/admin/daily-hours", {
        params: dailyHoursDate ? { date: dailyHoursDate } : {},
      });
      setDailyHours(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setDailyHours([]);
    }
  }, [dailyHoursDate]);

  useEffect(() => {
    loadDailyHours();
  }, [loadDailyHours]);

  const loadMissingPunches = useCallback(async () => {
    setMissingLoading(true);
    try {
      const res = await API.get("/attendance/admin/missing-punch", {
        params: missingDate ? { from: missingDate, to: missingDate } : {},
      });
      setMissingPunches(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setMissingPunches([]);
    } finally {
      setMissingLoading(false);
    }
  }, [missingDate]);

  useEffect(() => {
    loadMissingPunches();
  }, [loadMissingPunches]);

  const loadSuperAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [staffRes, projectsRes, tasksRes, ticketsRes, leavesRes, shortLeavesRes, upcomingRes] = await Promise.allSettled([
        API.get("/staff"),
        API.get("/projects"),
        API.get("/tasks"),
        API.get("/tickets/stats"),
        API.get("/leave/all", { params: { status: "Pending" } }),
        API.get("/leave/short-leaves/all"),
        API.get("/leave/all", { params: { upcomingDays: 10 } }),
      ]);

      const pendingLeaves = leavesRes.status === "fulfilled" && Array.isArray(leavesRes.value.data)
        ? leavesRes.value.data
        : [];
      const pendingShortLeaves = shortLeavesRes.status === "fulfilled" && Array.isArray(shortLeavesRes.value.data)
        ? shortLeavesRes.value.data.filter(sl => sl.status === "Pending")
        : [];
      setPendingApprovals({ leaves: pendingLeaves, shortLeaves: pendingShortLeaves });

      const upcoming = upcomingRes.status === "fulfilled" && Array.isArray(upcomingRes.value.data)
        ? upcomingRes.value.data.filter(ul => {
            if (ul.status !== "Approved") return false;
            const fromD = String(ul.from_date || "").slice(0, 10);
            const toD = String(ul.to_date || "").slice(0, 10);
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            const maxD = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10);
            const maxDStr = `${maxD.getFullYear()}-${String(maxD.getMonth() + 1).padStart(2, "0")}-${String(maxD.getDate()).padStart(2, "0")}`;
            return toD >= todayStr && fromD <= maxDStr;
          })
        : [];
      setUpcomingLeaves(upcoming);

      const staffData = staffRes.status === "fulfilled"
        ? (Array.isArray(staffRes.value.data) ? staffRes.value.data : staffRes.value.data?.staff || [])
        : [];
      const projData = projectsRes.status === "fulfilled" && Array.isArray(projectsRes.value.data)
        ? projectsRes.value.data
        : [];
      const taskData = tasksRes.status === "fulfilled" && Array.isArray(tasksRes.value.data)
        ? tasksRes.value.data
        : [];
      const ticketStats = ticketsRes.status === "fulfilled" && ticketsRes.value.data
        ? ticketsRes.value.data
        : { open: 0 };

      const issueCount = taskData.filter(t => t.type === "issue").length;
      const activeStaffCount = staffData.filter(s => (s.status || "Active").toLowerCase() === "active").length;

      setMetrics({
        staffCount: activeStaffCount,
        projectsCount: projData.length,
        tasksCount: taskData.length,
        issuesCount: issueCount,
        openTicketsCount: ticketStats.open || 0,
      });
    } catch (err) {
      console.error("Super Admin dashboard error:", err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSuperAdminData();
  }, [loadSuperAdminData]);

  // Real-time synchronization
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => loadSuperAdminData();
    socket.on("taskCreated", handleUpdate);
    socket.on("taskUpdated", handleUpdate);
    socket.on("taskDeleted", handleUpdate);
    return () => {
      socket.off("taskCreated", handleUpdate);
      socket.off("taskUpdated", handleUpdate);
      socket.off("taskDeleted", handleUpdate);
    };
  }, [socket, loadSuperAdminData]);

  return (
    <div style={{ padding: "10px 0 40px 0", maxWidth: "1400px", margin: "0 auto" }}>
      {/* 1. MISSING PUNCH & DAILY REPORT HOURS != 9 (FIRST SECTION) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          gap: "24px",
          marginBottom: "24px",
        }}
      >
        {/* MISSING PUNCH IN / PUNCH OUT REPORT */}
        <div style={panelStyle}>
          <PanelHeader
            title="Missing Punch In / Punch Out Report"
            subtitle={missingDate ? "Unresolved records for selected date" : "Last 30 days, unresolved records"}
            action={
              <input
                type="date"
                value={missingDate}
                onChange={(e) => setMissingDate(e.target.value)}
                style={dateInputStyle}
              />
            }
          />
          <ReportTable
            loading={missingLoading}
            emptyText="No missing punches found."
            columns={["Date", "Name", "Punch In", "Punch Out", "Missing In/Out"]}
            rows={missingPunches.map(r => ({
              key: r.id,
              cells: [
                formatDate(r.date),
                r.name,
                formatTime(r.punch_in),
                formatTime(r.punch_out),
                <StatusPill key="m" text={`Missing ${r.missing}`} color="#ef4444" />,
              ],
            }))}
          />
        </div>

        {/* DAILY REPORT HOURS != 9 */}
        <div style={panelStyle}>
          <PanelHeader
            title="Daily Report (Employee)"
            subtitle={dailyHoursDate ? "Logged hours less or greater than 9" : "Last 7 days, logged hours less or greater than 9"}
            action={
              <input
                type="date"
                value={dailyHoursDate}
                onChange={(e) => setDailyHoursDate(e.target.value)}
                style={dateInputStyle}
              />
            }
          />
          <ReportTable
            loading={false}
            emptyText="All daily reports are exactly 9 hours."
            columns={["Date", "Name", "Hours", "Less / More"]}
            rows={dailyHours.map(r => ({
              key: `${r.date}-${r.user_id}`,
              cells: [
                formatDate(r.date),
                r.name,
                formatDuration(r.hours),
                <StatusPill
                  key="f"
                  text={`${r.flag} (${r.difference > 0 ? "+" : ""}${formatDuration(r.difference)})`}
                  color={r.flag === "Less" ? "#ef4444" : "#f59e0b"}
                />,
              ],
            }))}
          />
        </div>
      </div>

      {/* 2. PENDING LEAVE / SHORT LEAVE APPROVALS (SECOND SECTION) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          gap: "24px",
          marginBottom: "24px",
        }}
      >
        <div style={panelStyle}>
          <PanelHeader
            title={`Pending Leave Approval (${loading ? "..." : pendingApprovals.leaves.length})`}
            subtitle="Employees waiting for leave approval"
            action={<ReviewButton onClick={() => navigate("/leave")} />}
          />
          <ReportTable
            loading={loading}
            emptyText="No pending leave requests."
            columns={["Name", "Leave Type", "From", "To", "Days"]}
            rows={pendingApprovals.leaves.map(l => ({
              key: l.id,
              cells: [
                l.user_name || l.user_email || "Unknown",
                <StatusPill key="t" text={l.leave_type || "Leave"} color="#6366f1" />,
                formatDate(l.from_date),
                formatDate(l.to_date),
                `${parseFloat(l.total_days || 0)}${l.day_type && l.day_type !== "Full Day" ? ` (${l.day_type})` : ""}`,
              ],
            }))}
          />
        </div>

        <div style={panelStyle}>
          <PanelHeader
            title={`Pending Short Leave Approval (${loading ? "..." : pendingApprovals.shortLeaves.length})`}
            subtitle="Employees waiting for short leave approval"
            action={<ReviewButton onClick={() => navigate("/leave")} />}
          />
          <ReportTable
            loading={loading}
            emptyText="No pending short leave requests."
            columns={["Name", "Date", "Time", "Hours"]}
            rows={pendingApprovals.shortLeaves.map(sl => ({
              key: sl.id,
              cells: [
                sl.user_name || sl.user_email || "Unknown",
                formatDate(sl.date),
                `${formatClock(sl.from_time)} - ${formatClock(sl.to_time)}`,
                formatDuration(sl.hours),
              ],
            }))}
          />
        </div>
      </div>

      {/* 3. FUTURE LEAVES (UPCOMING 10 DAYS) & TEAM CELEBRATIONS (THIRD SECTION) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
          gap: "24px",
          marginBottom: "32px",
        }}
      >
        <div style={panelStyle}>
          <PanelHeader
            title={`Upcoming Leaves - Next 10 Days (${loading ? "..." : upcomingLeaves.length})`}
            subtitle="Employees scheduled for leave in the upcoming 10 days"
            action={<ReviewButton onClick={() => navigate("/leave")} />}
          />
          <ReportTable
            loading={loading}
            emptyText="No upcoming leaves scheduled in the next 10 days."
            columns={["Name", "Leave Type", "From", "To", "Days", "Status"]}
            rows={upcomingLeaves.map(ul => ({
              key: ul.id,
              cells: [
                ul.user_name || ul.user_email || "Unknown",
                <StatusPill key="t" text={ul.leave_type || "Leave"} color="#6366f1" />,
                formatDate(ul.from_date),
                formatDate(ul.to_date),
                `${parseFloat(ul.total_days || 0)}${ul.day_type && ul.day_type !== "Full Day" ? ` (${ul.day_type})` : ""}`,
                <StatusPill
                  key="s"
                  text={ul.status || "Pending"}
                  color={ul.status === "Approved" ? "#10b981" : ul.status === "Pending" ? "#f59e0b" : "#ef4444"}
                />,
              ],
            }))}
          />
        </div>

        {/* TEAM CELEBRATIONS WIDGET */}
        <CelebrationsWidget />
      </div>
    </div>
  );
}

const panelStyle = {
  background: "var(--ui-surface, #ffffff)",
  borderRadius: "20px",
  padding: "clamp(16px, 3vw, 24px)",
  border: "1px solid var(--ui-border, #e2e8f0)",
  boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05)",
  minWidth: 0,
};

// Yesterday as local "YYYY-MM-DD" (default for the report date filters)
const getYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const dateInputStyle = {
  padding: "6px 10px",
  borderRadius: "8px",
  border: "1px solid var(--ui-border, #e2e8f0)",
  background: "var(--ui-surface, #ffffff)",
  color: "var(--text-main, #1e293b)",
  fontSize: "12px",
};

// Dates arrive as "YYYY-MM-DD" and datetimes as "YYYY-MM-DD HH:mm:ss" (mysql dateStrings)
const formatDate = (d) => {
  if (!d) return "-";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return `${day}-${m}-${y}`;
};

// "HH:mm" -> "hh:mm AM/PM"
const formatClock = (t) => {
  if (!t) return "-";
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "-";
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

const formatTime = (dt) => (dt ? formatClock(String(dt).slice(11, 16)) : "-");

function PanelHeader({ title, subtitle, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "16px" }}>
      <div>
        <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>{title}</h3>
        <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>{subtitle}</span>
      </div>
      {action}
    </div>
  );
}

function ReviewButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: "8px",
        border: "1px solid var(--ui-border, #e2e8f0)",
        background: "var(--ui-bg, #f8fafc)",
        color: "#6366f1",
        fontSize: "12px",
        fontWeight: "700",
        cursor: "pointer",
      }}
    >
      Review
    </button>
  );
}

function StatusPill({ text, color }) {
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: "700",
        padding: "3px 10px",
        borderRadius: "8px",
        background: `${color}1a`,
        color,
        border: `1px solid ${color}33`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function ReportTable({ columns, rows, loading, emptyText }) {
  if (loading) {
    return <div style={{ textAlign: "center", padding: "30px", color: "var(--text-muted, #64748b)" }}>Loading...</div>;
  }
  if (rows.length === 0) {
    return <div style={{ textAlign: "center", padding: "30px", color: "var(--text-muted, #64748b)", fontSize: "13px" }}>{emptyText}</div>;
  }
  return (
    <div style={{ maxHeight: "360px", overflow: "auto", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr>
            {columns.map(c => (
              <th
                key={c}
                style={{
                  position: "sticky",
                  top: 0,
                  textAlign: "left",
                  padding: "10px 12px",
                  fontSize: "11px",
                  fontWeight: "800",
                  textTransform: "uppercase",
                  color: "var(--text-muted, #64748b)",
                  background: "var(--ui-bg, #f8fafc)",
                  borderBottom: "1px solid var(--ui-border, #e2e8f0)",
                  whiteSpace: "nowrap",
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              {r.cells.map((cell, i) => (
                <td
                  key={i}
                  style={{
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--ui-border, #e2e8f0)",
                    color: "var(--text-main, #1e293b)",
                    whiteSpace: i === 1 ? "normal" : "nowrap",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminStatCard({ title, value, subtitle, color, icon, loading, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--ui-surface, #ffffff)",
        borderRadius: "20px",
        padding: "20px 24px",
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <span style={{ fontSize: "22px" }}>{icon}</span>
      </div>
      <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-muted, #64748b)", textTransform: "uppercase", letterSpacing: "1px" }}>
        {title}
      </div>
      <div style={{ fontSize: "26px", fontWeight: "900", color: "var(--text-main, #1e293b)", margin: "4px 0" }}>
        {loading ? "..." : value}
      </div>
      <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>{subtitle}</div>
    </div>
  );
}
