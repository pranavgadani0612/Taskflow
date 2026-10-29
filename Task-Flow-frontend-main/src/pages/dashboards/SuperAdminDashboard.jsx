import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useSocket } from "../../contexts/SocketContext";
import API from "../../api/api";
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

  const [companyDetails, setCompanyDetails] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);

  const loadSuperAdminData = useCallback(async () => {
    setLoading(true);
    try {
      const [companiesRes, staffRes, projectsRes, tasksRes, ticketsRes] = await Promise.allSettled([
        API.get("/companies"),
        API.get("/staff"),
        API.get("/projects"),
        API.get("/tasks"),
        API.get("/tickets/stats"),
      ]);

      const compData = companiesRes.status === "fulfilled" && Array.isArray(companiesRes.value.data)
        ? companiesRes.value.data
        : [];
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

      // Find Padya Soft company record or default to the primary company
      const padyaSoft = compData.find(c => 
        (c.companyName || "").toLowerCase().includes("padya")
      ) || compData[0] || {
        companyName: "Padya Soft",
        contactPersonEmail: user?.email || "gadanipranav@gmail.com",
        status: "Active"
      };

      setCompanyDetails(padyaSoft);

      const issueCount = taskData.filter(t => t.type === "issue").length;
      const activeStaffCount = staffData.filter(s => (s.status || "Active").toLowerCase() === "active").length;

      setMetrics({
        staffCount: activeStaffCount,
        projectsCount: projData.length,
        tasksCount: taskData.length,
        issuesCount: issueCount,
        openTicketsCount: ticketStats.open || 0,
      });

      // Construct live audit/event timeline from recent tasks
      const recentTaskEvents = [...taskData]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map(t => ({
          id: t._id || t.id,
          title: `Task "${t.title || 'Untitled'}" was updated`,
          category: t.type === "issue" ? "Incident / Bug" : "Task",
          time: t.createdAt ? new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Just now",
          badgeColor: t.type === "issue" ? "#ef4444" : "#10b981",
        }));

      setRecentActivity(recentTaskEvents);
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
      {/* PADYA SOFT SUPER ADMIN HERO BANNER */}
      <div
        style={{
          background: "linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)",
          borderRadius: "24px",
          padding: "32px",
          marginBottom: "32px",
          color: "#fff",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "24px",
          boxShadow: "0 20px 40px -15px rgba(15, 23, 42, 0.4)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "relative", zIndex: 1, maxWidth: "650px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
            <span
              style={{
                fontSize: "11px",
                fontWeight: "900",
                letterSpacing: "1.5px",
                padding: "4px 12px",
                borderRadius: "20px",
                background: "rgba(129, 140, 248, 0.2)",
                color: "#c7d2fe",
                border: "1px solid rgba(129, 140, 248, 0.3)",
              }}
            >
              PADYA SOFT • SUPER ADMIN
            </span>
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>
              Enterprise Workspace Control
            </span>
          </div>

          <h1 style={{ margin: "0 0 8px 0", fontSize: "28px", fontWeight: "900", letterSpacing: "-0.5px" }}>
            Padya Soft Control Center
          </h1>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px", lineHeight: "1.6" }}>
            Manage staff members, active project lifecycles, and operations across Padya Soft from one unified dashboard.
          </p>
        </div>

        {/* QUICK ADMIN ACTIONS */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() => navigate("/staff")}
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
            <UsersIcon size={16} color="#fff" /> Manage Staff
          </button>
          <button
            onClick={() => navigate("/project")}
            style={{
              background: "rgba(255, 255, 255, 0.1)",
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
            <FolderIcon size={16} color="#fff" /> Projects
          </button>
        </div>
      </div>

      {/* PADYA SOFT STATS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "20px",
          marginBottom: "32px",
        }}
      >
        <AdminStatCard
          title="Total Staff"
          value={metrics.staffCount}
          subtitle="Padya Soft team members"
          color="#06b6d4"
          icon={<UsersIcon size={22} color="#06b6d4" />}
          loading={loading}
          onClick={() => navigate("/staff")}
        />
        <AdminStatCard
          title="Active Projects"
          value={metrics.projectsCount}
          subtitle="Running project pipelines"
          color="#10b981"
          icon={<FolderIcon size={22} color="#10b981" />}
          loading={loading}
          onClick={() => navigate("/project")}
        />
        <AdminStatCard
          title="Total Tasks"
          value={metrics.tasksCount}
          subtitle="Assigned work operations"
          color="#6366f1"
          icon={<ZapIcon size={22} color="#6366f1" />}
          loading={loading}
          onClick={() => navigate("/task")}
        />
        <AdminStatCard
          title="Open Tickets"
          value={metrics.openTicketsCount}
          subtitle="Hardware / IT requests"
          color="#f59e0b"
          icon={<TicketIcon size={22} color="#f59e0b" />}
          loading={loading}
          onClick={() => navigate("/tickets")}
        />
      </div>

      {/* PADYA SOFT PROFILE OVERVIEW & LIVE ACTIVITY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
          gap: "24px",
          marginBottom: "32px",
        }}
      >
        {/* LEFT COLUMN: COMPANY PROFILE & CELEBRATIONS */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* COMPANY PROFILE DETAILS */}
          <div
            style={{
              background: "var(--ui-surface, #ffffff)",
              borderRadius: "20px",
              padding: "clamp(16px, 3vw, 24px)",
              border: "1px solid var(--ui-border, #e2e8f0)",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>
                  Organization Profile
                </h3>
                <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                  Padya Soft internal workspace
                </span>
              </div>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "700",
                  padding: "4px 10px",
                  borderRadius: "8px",
                  background: "rgba(16, 185, 129, 0.1)",
                  color: "#10b981",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}
              >
                Active
              </span>
            </div>

            <div
              style={{
                padding: "clamp(14px, 2.5vw, 20px)",
                borderRadius: "16px",
                background: "var(--ui-bg, #f8fafc)",
                border: "1px solid var(--ui-border, #e2e8f0)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                <div
                  style={{
                    width: "48px",
                    height: "48px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                    fontWeight: "900",
                    flexShrink: 0,
                  }}
                >
                  PS
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main, #1e293b)", wordBreak: "break-word" }}>
                    {companyDetails?.companyName || "Padya Soft"}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", marginTop: "2px" }}>
                    Primary Workspace Organization
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: "12px", marginTop: "4px" }}>
                <div style={{ padding: "12px", background: "var(--ui-surface, #ffffff)", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)", minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", fontWeight: "700" }}>CONTACT EMAIL</div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginTop: "3px", wordBreak: "break-all" }}>
                    {companyDetails?.contactPersonEmail || companyDetails?.email || user?.email || "gadanipranav@gmail.com"}
                  </div>
                </div>
                <div style={{ padding: "12px", background: "var(--ui-surface, #ffffff)", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)", minWidth: 0 }}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", fontWeight: "700" }}>PHONE / CONTACT</div>
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginTop: "3px", wordBreak: "break-word" }}>
                    {companyDetails?.phone || companyDetails?.contactPersonPhone || "+91 98765 43210"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* TEAM CELEBRATIONS WIDGET */}
          <CelebrationsWidget />
        </div>

        {/* SYSTEM AUDIT & ACTIVITY FEED */}
        <div

          style={{
            background: "var(--ui-surface, #ffffff)",
            borderRadius: "20px",
            padding: "clamp(16px, 3vw, 24px)",
            border: "1px solid var(--ui-border, #e2e8f0)",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <div>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>
                Live Activity Feed
              </h3>
              <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                Recent Padya Soft tasks and updates
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981" }}></span>
              <span style={{ fontSize: "11px", fontWeight: "700", color: "#10b981" }}>LIVE</span>
            </div>
          </div>

          {recentActivity.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-muted, #64748b)" }}>
              No recent task activity recorded yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {recentActivity.map((evt) => (
                <div
                  key={evt.id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                    padding: "12px 14px",
                    borderRadius: "12px",
                    background: "var(--ui-bg, #f8fafc)",
                    border: "1px solid var(--ui-border, #e2e8f0)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", minWidth: 0, flex: 1 }}>
                    <span
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: evt.badgeColor,
                        marginTop: "5px",
                        flexShrink: 0,
                      }}
                    ></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: "13px",
                          fontWeight: "700",
                          color: "var(--text-main, #1e293b)",
                          wordBreak: "break-word",
                          lineHeight: "1.4",
                        }}
                      >
                        {evt.title}
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "2px" }}>
                        {evt.category}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: "600",
                      color: "var(--text-muted, #64748b)",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      alignSelf: "flex-start",
                      marginTop: "2px",
                    }}
                  >
                    {evt.time}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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
