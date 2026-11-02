import React, { useEffect, useState, useCallback } from "react";
import API from "../api/api";
import { formatDuration } from "../utils/formatDuration";
import "../style/main.css";

// Local "YYYY-MM-DD"
const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const monthStart = () => {
  const d = new Date();
  return toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
};

const formatDate = (d) => {
  if (!d) return "-";
  const [y, m, day] = String(d).slice(0, 10).split("-");
  return `${day}-${m}-${y}`;
};

const formatHours = formatDuration;

export default function ProjectReport() {
  const [options, setOptions] = useState({ employees: [], projects: [] });
  const [filters, setFilters] = useState({ userId: "", projectId: "", from: monthStart(), to: toDateStr(new Date()) });
  const [entriesDateFilter, setEntriesDateFilter] = useState("");
  const [report, setReport] = useState({ totalHours: 0, summary: [], rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null); // { project, employee } clicked in project card

  useEffect(() => {
    API.get("/timesheets/admin/report-options")
      .then(res => setOptions({ employees: res.data?.employees || [], projects: res.data?.projects || [] }))
      .catch(() => setOptions({ employees: [], projects: [] }));
  }, []);

  const loadReport = useCallback(async () => {
    if (filters.from && filters.to && filters.from > filters.to) {
      setError("From date cannot be after To date");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await API.get("/timesheets/admin/project-report", { params });
      setReport({
        totalHours: res.data?.totalHours || 0,
        summary: res.data?.summary || [],
        rows: res.data?.rows || [],
      });
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load report");
      setReport({ totalHours: 0, summary: [], rows: [] });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleReset = () => {
    const initial = { userId: "", projectId: "", from: monthStart(), to: toDateStr(new Date()) };
    setFilters(initial);
    setEntriesDateFilter("");
  };

  const displayedRows = entriesDateFilter
    ? report.rows.filter(r => String(r.date).slice(0, 10) === entriesDateFilter)
    : report.rows;

  // Group summary rows by project
  const projectGroups = [];
  report.summary.forEach(r => {
    let group = projectGroups.find(g => g.project_id === r.project_id);
    if (!group) {
      group = { project_id: r.project_id, project_name: r.project_name || "Unknown Project", hours: 0, employees: [] };
      projectGroups.push(group);
    }
    group.hours += r.hours;
    group.employees.push(r);
  });
  projectGroups.sort((a, b) => b.hours - a.hours);

  const employeeCount = new Set(report.summary.map(r => r.user_id)).size;

  const exportCsv = () => {
    const header = ["Date", "Employee", "Project", "Task", "Subtask", "Hours", "Description"];
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [header.map(escape).join(",")].concat(
      report.rows.map(r =>
        [formatDate(r.date), r.name, r.project_name, r.task_title, r.subtask_title, formatDuration(r.hours), r.description]
          .map(escape)
          .join(",")
      )
    );
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `project-report_${filters.from || "all"}_${filters.to || "all"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: "10px 0 40px 0", maxWidth: "1400px", margin: "0 auto" }}>
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 6px 0", fontSize: "24px", fontWeight: "900", color: "var(--text-main, #1e293b)" }}>
          Project Hours Report
        </h1>
        <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted, #64748b)" }}>
          Hours employees logged on each project and task, from daily reports.
        </p>
      </div>

      {/* SEARCH CRITERIA */}
      <div style={{ ...panelStyle, marginBottom: "24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "16px", alignItems: "end" }}>
          <Field label="Employee">
            <select value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })} style={inputStyle}>
              <option value="">All Employees</option>
              {options.employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name || emp.id}</option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select value={filters.projectId} onChange={(e) => setFilters({ ...filters, projectId: e.target.value })} style={inputStyle}>
              <option value="">All Projects</option>
              {options.projects.map(p => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
          </Field>
          <Field label="From Date">
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="To Date">
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} style={inputStyle} />
          </Field>
          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" onClick={handleReset} style={secondaryBtn}>Reset</button>
          </div>
        </div>
        {error && <div style={{ marginTop: "12px", color: "#ef4444", fontSize: "13px", fontWeight: "600" }}>{error}</div>}
      </div>

      {/* TOTALS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        <StatCard label="Total Hours" value={loading ? "..." : formatHours(report.totalHours)} color="#6366f1" />
        <StatCard label="Projects" value={loading ? "..." : projectGroups.length} color="#10b981" />
        <StatCard label="Employees" value={loading ? "..." : employeeCount} color="#06b6d4" />
        <StatCard label="Entries" value={loading ? "..." : report.rows.length} color="#f59e0b" />
      </div>

      {/* PROJECT-WISE SUMMARY */}
      <div style={{ ...panelStyle, marginBottom: "24px" }}>
        <SectionTitle title="Project-wise Hours" subtitle="Total hours per project, split by employee" />
        {loading ? (
          <Empty text="Loading..." />
        ) : projectGroups.length === 0 ? (
          <Empty text="No daily report entries found for the selected criteria." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "16px" }}>
            {projectGroups.map(g => (
              <div key={g.project_id} style={{ borderRadius: "14px", border: "1px solid var(--ui-border, #e2e8f0)", background: "var(--ui-bg, #f8fafc)", padding: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                  <div style={{ fontSize: "15px", fontWeight: "800", color: "var(--text-main, #1e293b)", wordBreak: "break-word" }}>{g.project_name}</div>
                  <span style={{ fontSize: "14px", fontWeight: "900", color: "#6366f1", whiteSpace: "nowrap" }}>{formatHours(g.hours)}</span>
                </div>
                {g.employees.map(emp => {
                  const pct = g.hours > 0 ? (emp.hours / g.hours) * 100 : 0;
                  return (
                    <div
                      key={emp.user_id}
                      onClick={() => setSelected({ project: g, employee: emp })}
                      title="View tasks"
                      style={{ marginBottom: "6px", padding: "4px 6px", margin: "0 -6px 6px", borderRadius: "8px", cursor: "pointer" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(99, 102, 241, 0.08)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "4px", gap: "8px" }}>
                        <span style={{ color: "var(--text-main, #1e293b)", fontWeight: "600" }}>{emp.name || "Unknown"}</span>
                        <span style={{ color: "var(--text-muted, #64748b)", whiteSpace: "nowrap" }}>
                          {formatHours(emp.hours)} · {emp.days} {emp.days === 1 ? "day" : "days"}
                        </span>
                      </div>
                      <div style={{ height: "6px", borderRadius: "4px", background: "var(--ui-border, #e2e8f0)", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#6366f1", borderRadius: "4px" }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DETAILED ENTRIES */}
      <div style={panelStyle}>
        <SectionTitle
          title="Daily Report Entries"
          subtitle="Each project and task line employees filled"
          action={
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted, #64748b)" }}>Filter Date:</span>
                <input
                  type="date"
                  value={entriesDateFilter}
                  onChange={(e) => setEntriesDateFilter(e.target.value)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "8px",
                    border: "1px solid var(--ui-border, #e2e8f0)",
                    fontSize: "12px",
                    background: "var(--ui-surface, #fff)",
                    color: "var(--text-main, #1e293b)"
                  }}
                />
                {entriesDateFilter && (
                  <button
                    type="button"
                    onClick={() => setEntriesDateFilter("")}
                    style={{
                      padding: "5px 9px",
                      borderRadius: "6px",
                      border: "none",
                      background: "#fee2e2",
                      color: "#dc2626",
                      fontSize: "11px",
                      fontWeight: "700",
                      cursor: "pointer"
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              {report.rows.length > 0 && (
                <button type="button" onClick={exportCsv} style={secondaryBtn}>Export CSV</button>
              )}
            </div>
          }
        />
        {loading ? (
          <Empty text="Loading..." />
        ) : displayedRows.length === 0 ? (
          <Empty text="No entries found." />
        ) : (
          <div style={{ maxHeight: "560px", overflow: "auto", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  {["Date", "Employee", "Project", "Task", "Hours", "Description"].map(c => (
                    <th key={c} style={thStyle}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedRows.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDate(r.date)}</td>
                    <td style={tdStyle}>{r.name || "Unknown"}</td>
                    <td style={tdStyle}>{r.project_name || "-"}</td>
                    <td style={tdStyle}>
                      {r.task_title || "-"}
                      {r.subtask_title && (
                        <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>{r.subtask_title}</div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap", fontWeight: "700" }}>{formatHours(r.hours)}</td>
                    <td style={{ ...tdStyle, color: "var(--text-muted, #64748b)", minWidth: "220px" }}>{r.description || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <EmployeeTasksModal
          project={selected.project}
          employee={selected.employee}
          rows={report.rows.filter(r => r.project_id === selected.project.project_id && r.user_id === selected.employee.user_id)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// Tasks & subtasks one employee logged on one project
function EmployeeTasksModal({ project, employee, rows, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Task -> subtask totals
  const tasks = [];
  rows.forEach(r => {
    const taskName = r.task_title || "No Task";
    let task = tasks.find(t => t.name === taskName);
    if (!task) {
      task = { name: taskName, hours: 0, subtasks: [] };
      tasks.push(task);
    }
    task.hours += r.hours;
    if (r.subtask_title) {
      let sub = task.subtasks.find(s => s.name === r.subtask_title);
      if (!sub) {
        sub = { name: r.subtask_title, hours: 0 };
        task.subtasks.push(sub);
      }
      sub.hours += r.hours;
    }
  });
  tasks.sort((a, b) => b.hours - a.hours);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...panelStyle, width: "min(900px, 100%)", maxHeight: "90vh", overflow: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "16px" }}>
          <div>
            <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: "900", color: "var(--text-main, #1e293b)" }}>
              {employee.name || "Unknown"}
            </h3>
            <span style={{ fontSize: "13px", color: "var(--text-muted, #64748b)" }}>
              {project.project_name} · {formatHours(employee.hours)} · {employee.days} {employee.days === 1 ? "day" : "days"}
            </span>
          </div>
          <button type="button" onClick={onClose} style={secondaryBtn}>Close</button>
        </div>

        {rows.length === 0 ? (
          <Empty text="No entries found." />
        ) : (
          <>
            {/* TASK / SUBTASK SUMMARY */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: "12px", marginBottom: "20px" }}>
              {tasks.map(t => (
                <div key={t.name} style={{ borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", background: "var(--ui-bg, #f8fafc)", padding: "12px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "13px", fontWeight: "800", color: "var(--text-main, #1e293b)" }}>
                    <span style={{ wordBreak: "break-word" }}>{t.name}</span>
                    <span style={{ color: "#6366f1", whiteSpace: "nowrap" }}>{formatHours(t.hours)}</span>
                  </div>
                  {t.subtasks.map(s => (
                    <div key={s.name} style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "12px", color: "var(--text-muted, #64748b)", marginTop: "6px", paddingLeft: "10px", borderLeft: "2px solid var(--ui-border, #e2e8f0)" }}>
                      <span style={{ wordBreak: "break-word" }}>{s.name}</span>
                      <span style={{ whiteSpace: "nowrap" }}>{formatHours(s.hours)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* DATE-WISE ENTRIES */}
            <div style={{ borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr>
                    {["Date", "Task", "Subtask", "Hours", "Description"].map(c => (
                      <th key={c} style={thStyle}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id}>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDate(r.date)}</td>
                      <td style={tdStyle}>{r.task_title || "-"}</td>
                      <td style={tdStyle}>{r.subtask_title || "-"}</td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", fontWeight: "700" }}>{formatHours(r.hours)}</td>
                      <td style={{ ...tdStyle, color: "var(--text-muted, #64748b)", minWidth: "200px" }}>{r.description || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
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

const inputStyle = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: "10px",
  border: "1px solid var(--ui-border, #e2e8f0)",
  background: "var(--ui-surface, #ffffff)",
  color: "var(--text-main, #1e293b)",
  fontSize: "13px",
  boxSizing: "border-box",
};

const primaryBtn = {
  flex: 1,
  padding: "10px 16px",
  borderRadius: "10px",
  border: "none",
  background: "linear-gradient(135deg, #6366f1, #4f46e5)",
  color: "#fff",
  fontWeight: "700",
  fontSize: "13px",
  cursor: "pointer",
};

const secondaryBtn = {
  padding: "9px 16px",
  borderRadius: "10px",
  border: "1px solid var(--ui-border, #e2e8f0)",
  background: "var(--ui-bg, #f8fafc)",
  color: "#6366f1",
  fontWeight: "700",
  fontSize: "13px",
  cursor: "pointer",
};

const thStyle = {
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
};

const tdStyle = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--ui-border, #e2e8f0)",
  color: "var(--text-main, #1e293b)",
  verticalAlign: "top",
};

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
      <span style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-muted, #64748b)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function SectionTitle({ title, subtitle, action }) {
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

function StatCard({ label, value, color }) {
  return (
    <div style={{ ...panelStyle, padding: "18px 20px" }}>
      <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-muted, #64748b)", textTransform: "uppercase", letterSpacing: "1px" }}>
        {label}
      </div>
      <div style={{ fontSize: "24px", fontWeight: "900", color, marginTop: "4px" }}>{value}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div style={{ textAlign: "center", padding: "30px", color: "var(--text-muted, #64748b)", fontSize: "13px" }}>{text}</div>;
}
