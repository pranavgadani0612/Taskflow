import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { IconShield } from "../components/common/Icons";
import Pagination from "../components/common/Pagination";
import { useTableSort, SortIndicator } from "../utils/tableSort";
import "../style/main.css";

export default function AuditLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedModule, setSelectedModule] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedLog, setExpandedLog] = useState(null);
  const { sortedData: sortedLogs, sortConfig, requestSort } = useTableSort(logs);

  const fetchModules = async () => {
    try {
      const res = await API.get("/audit-logs/modules");
      setModules(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error loading audit modules:", err);
    }
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      let url = `/audit-logs?page=${page}&limit=50`;
      if (selectedModule !== "All") url += `&module=${selectedModule}`;
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
      const res = await API.get(url);
      setLogs(res.data.logs || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error("Error loading audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
  }, []);

  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed || trimmed.length >= 3) {
      const delay = setTimeout(() => {
        setPage(1);
        fetchLogs();
      }, 300);
      return () => clearTimeout(delay);
    }
  }, [selectedModule, page, search]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  const getModuleBadgeColor = (module) => {
    switch (module?.toLowerCase()) {
      case "attendance":
        return { bg: "rgba(79, 70, 229, 0.12)", color: "#4f46e5" };
      case "wfh":
        return { bg: "rgba(2, 132, 199, 0.12)", color: "#0284c7" };
      case "announcements":
        return { bg: "rgba(245, 158, 11, 0.12)", color: "#d97706" };
      case "holidays":
        return { bg: "rgba(16, 185, 129, 0.12)", color: "#059669" };
      case "expenses":
        return { bg: "rgba(236, 72, 153, 0.12)", color: "#db2777" };
      case "staff":
        return { bg: "rgba(147, 51, 234, 0.12)", color: "#9333ea" };
      default:
        return { bg: "rgba(100, 116, 139, 0.12)", color: "#64748b" };
    }
  };

  const formatIST = (dateStr) => {
    if (!dateStr) return { date: "-", time: "-" };
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) {
      d = new Date(String(dateStr).replace(" ", "T") + "Z");
    }
    try {
      const date = d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
      const time = d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
      return { date, time };
    } catch (e) {
      return { date: d.toLocaleDateString(), time: d.toLocaleTimeString() };
    }
  };

  return (
    <div style={{ padding: "clamp(16px, 3vw, 28px)", maxWidth: "1280px", margin: "0 auto" }}>
      {/* HEADER */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <IconShield size={26} color="#4f46e5" />
          <h1 style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-main, #1e293b)", margin: 0 }}>
            Universal System Audit Logs
          </h1>
        </div>
        <p style={{ color: "var(--text-muted, #64748b)", margin: "6px 0 0", fontSize: "14px" }}>
          Immutable cross-module changelog tracking who changed what, when, and from where across all modules.
        </p>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "20px", background: "var(--ui-surface, #fff)", padding: "14px 18px", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", flexWrap: "wrap" }}>
        {/* Module Filter */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted, #64748b)" }}>Module:</span>
          {["All", ...modules].map(m => (
            <button
              key={m}
              onClick={() => { setSelectedModule(m); setPage(1); }}
              style={{
                padding: "4px 12px",
                borderRadius: "20px",
                border: selectedModule === m ? "1px solid #4f46e5" : "1px solid var(--ui-border, #cbd5e1)",
                background: selectedModule === m ? "#4f46e5" : "var(--ui-bg, #f8fafc)",
                color: selectedModule === m ? "#fff" : "var(--text-main, #475569)",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                textTransform: "capitalize"
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} style={{ display: "flex", gap: "8px" }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search action, actor, target..."
            style={{ padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", fontSize: "13px", background: "var(--ui-bg, #f8fafc)", color: "var(--text-main, #1e293b)", width: "220px" }}
          />
          <button
            type="submit"
            style={{ padding: "6px 14px", borderRadius: "6px", border: "none", background: "#4f46e5", color: "#fff", fontWeight: "700", fontSize: "12px", cursor: "pointer" }}
          >
            Filter
          </button>
        </form>
      </div>

      {/* AUDIT LOG TABLE */}
      <div style={{ overflowX: "auto", background: "var(--ui-surface, #fff)", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)" }}>
              <th onClick={() => requestSort("created_at")} style={{ padding: "12px 16px", fontWeight: "700", cursor: "pointer", userSelect: "none" }}>
                Timestamp <SortIndicator sortKey="created_at" currentKey={sortConfig.key} direction={sortConfig.direction} />
              </th>
              <th onClick={() => requestSort("actor_name")} style={{ padding: "12px 16px", fontWeight: "700", cursor: "pointer", userSelect: "none" }}>
                Actor <SortIndicator sortKey="actor_name" currentKey={sortConfig.key} direction={sortConfig.direction} />
              </th>
              <th onClick={() => requestSort("module")} style={{ padding: "12px 16px", fontWeight: "700", cursor: "pointer", userSelect: "none" }}>
                Module <SortIndicator sortKey="module" currentKey={sortConfig.key} direction={sortConfig.direction} />
              </th>
              <th onClick={() => requestSort("action")} style={{ padding: "12px 16px", fontWeight: "700", cursor: "pointer", userSelect: "none" }}>
                Action <SortIndicator sortKey="action" currentKey={sortConfig.key} direction={sortConfig.direction} />
              </th>
              <th onClick={() => requestSort("target_name")} style={{ padding: "12px 16px", fontWeight: "700", cursor: "pointer", userSelect: "none" }}>
                Target Affected <SortIndicator sortKey="target_name" currentKey={sortConfig.key} direction={sortConfig.direction} />
              </th>
              <th style={{ padding: "12px 16px", fontWeight: "700", textAlign: "right" }}>Payload</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>
                  Loading audit logs...
                </td>
              </tr>
            ) : sortedLogs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>
                  No audit logs found matching criteria.
                </td>
              </tr>
            ) : (
              sortedLogs.map(log => {
                const bColor = getModuleBadgeColor(log.module);
                const isExpanded = expandedLog === log.id;

                return (
                  <React.Fragment key={log.id}>
                    <tr style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)" }}>
                      <td style={{ padding: "14px 16px", color: "var(--text-muted, #64748b)", whiteSpace: "nowrap" }}>
                        {(() => {
                          const { date, time } = formatIST(log.created_at);
                          return (
                            <>
                              <div style={{ fontWeight: "600", color: "var(--text-main, #334155)" }}>
                                {date}
                              </div>
                              <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>
                                {time} IST
                              </div>
                            </>
                          );
                        })()}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: "700", color: "var(--text-main, #1e293b)" }}>{log.actor_name || "System"}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>{log.actor_role}</div>
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span style={{
                          padding: "3px 8px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: "700",
                          background: bColor.bg,
                          color: bColor.color,
                          textTransform: "uppercase"
                        }}>
                          {log.module}
                        </span>
                      </td>
                      <td style={{ padding: "14px 16px", fontWeight: "600", color: "var(--text-main, #1e293b)" }}>
                        <code>{log.action}</code>
                      </td>
                      <td style={{ padding: "14px 16px", color: "var(--text-main, #475569)", maxWidth: "260px" }}>
                        <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {log.target_name || log.target_id || "-"}
                        </div>
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        {log.details ? (
                          <button
                            onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                            style={{
                              background: "var(--ui-bg, #f1f5f9)",
                              border: "1px solid var(--ui-border, #cbd5e1)",
                              borderRadius: "6px",
                              padding: "4px 8px",
                              fontSize: "11px",
                              fontWeight: "600",
                              cursor: "pointer",
                              color: "var(--text-main, #475569)"
                            }}
                          >
                            {isExpanded ? "Hide Details" : "View Details"}
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-muted, #cbd5e1)", fontSize: "11px" }}>None</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && log.details && (
                      <tr style={{ background: "var(--ui-bg, #f8fafc)" }}>
                        <td colSpan={6} style={{ padding: "12px 16px", borderBottom: "1px solid var(--ui-border, #e2e8f0)" }}>
                          <pre style={{ margin: 0, fontSize: "11px", color: "var(--text-main, #1e293b)", background: "var(--ui-surface, #fff)", padding: "10px", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", overflowX: "auto" }}>
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <Pagination
        currentPage={page}
        totalRecords={total}
        pageSize={50}
        onPageChange={(newPage) => setPage(newPage)}
      />
    </div>
  );
}
