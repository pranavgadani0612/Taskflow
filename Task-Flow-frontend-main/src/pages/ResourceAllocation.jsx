import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../contexts/PermissionContext";
import FormModal from "../components/common/FormModal";
import ConfirmModal from "../components/common/ConfirmModal";
import { IconChart, IconPlus, IconX, IconEdit } from "../components/common/Icons";
import "../style/main.css";

export default function ResourceAllocation() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { hasPermission: ctxHasPermission } = usePermissions();

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
  const isOwner = isSuperAdmin || user?.role?.name === "Company Owner";
  const hasPermission = (action = "read") => {
    if (isOwner) return true;
    return ctxHasPermission("resource_management", action);
  };
  const isLeadOrAdmin = isOwner || hasPermission("create") || hasPermission("update") || user?.position?.includes("Manager") || user?.position?.includes("Lead");

  const [utilization, setUtilization] = useState([]);
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  // Allocate Modal
  const [showModal, setShowModal] = useState(false);
  const [allocForm, setAllocForm] = useState({
    project_id: "",
    project_name: "",
    user_id: "",
    user_name: "",
    user_role: "Software Developer",
    allocation_percentage: 50,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: "",
    billing_type: "Billable"
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Edit Allocation Modal
  const [editModal, setEditModal] = useState({ show: false, allocation: null });
  const [editForm, setEditForm] = useState({
    allocation_percentage: 50,
    billing_type: "Billable",
    start_date: "",
    end_date: "",
    user_role: ""
  });
  const [savingEdit, setSavingEdit] = useState(false);

  const handleOpenEdit = (alloc) => {
    setEditModal({ show: true, allocation: alloc });
    setEditForm({
      allocation_percentage: alloc.allocation_percentage || 50,
      billing_type: alloc.billing_type || "Billable",
      start_date: alloc.start_date ? alloc.start_date.slice(0, 10) : "",
      end_date: alloc.end_date ? alloc.end_date.slice(0, 10) : "",
      user_role: alloc.user_role || "Contributor"
    });
  };

  const handleSaveEdit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editModal.allocation) return;
    setSavingEdit(true);
    try {
      await API.put(`/allocations/${editModal.allocation.id}`, editForm);
      showToast("Allocation updated successfully!", "success");
      setEditModal({ show: false, allocation: null });
      fetchAllocationData();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update allocation", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const fetchAllocationData = async () => {
    try {
      setLoading(true);
      const res = await API.get("/allocations/team-utilization");
      setUtilization(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error loading team utilization:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDependencies = async () => {
    try {
      const [projRes, staffRes] = await Promise.all([
        API.get("/projects"),
        API.get("/staff")
      ]);
      setProjects(Array.isArray(projRes.data) ? projRes.data : []);
      setEmployees(Array.isArray(staffRes.data) ? staffRes.data : []);
    } catch (err) {
      console.error("Error loading projects/staff:", err);
    }
  };

  useEffect(() => {
    fetchAllocationData();
    fetchDependencies();
  }, []);

  const handleAllocateSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});
    setSubmitting(true);
    try {
      await API.post("/allocations", allocForm);
      showToast("Resource allocated successfully!", "success");
      setShowModal(false);
      setFieldErrors({});
      setAllocForm({
        project_id: "",
        project_name: "",
        user_id: "",
        user_name: "",
        user_role: "Software Developer",
        allocation_percentage: 50,
        start_date: new Date().toISOString().slice(0, 10),
        end_date: "",
        billing_type: "Billable"
      });
      fetchAllocationData();
    } catch (err) {
      const serverErr = err.response?.data?.error;
      const serverField = err.response?.data?.field;
      if (serverField) {
        setFieldErrors({ [serverField]: serverErr });
      } else if (serverErr) {
        showToast(serverErr, "error");
      } else {
        showToast("Allocation failed", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAllocation = (id) => {
    askConfirm("Remove Allocation", "Are you sure you want to remove this project allocation?", async () => {
      try {
        await API.delete(`/allocations/${id}`);
        showToast("Allocation removed", "success");
        fetchAllocationData();
      } catch (err) {
        showToast(err.response?.data?.error || "Failed to delete allocation", "error");
      }
    });
  };

  // Metrics
  const totalEmployees = utilization.length;
  const optimalCount = utilization.filter(u => u.status === "Optimal").length;
  const benchCount = utilization.filter(u => u.status.includes("Bench")).length;
  const overallocatedCount = utilization.filter(u => u.status === "Overallocated").length;

  return (
    <div className="main-content-container" style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "var(--text-main, #0f172a)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <IconChart size={28} color="#2563eb" /> Project Resource Allocation & Utilization
          </h1>
          <p style={{ color: "var(--text-muted, #64748b)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Team bandwidth tracking, project workload heatmaps, bench capacity & billable allocation %
          </p>
        </div>

        {isLeadOrAdmin && (
          <button
            onClick={() => setShowModal(true)}
            style={{
              background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              padding: "0.6rem 1.2rem",
              fontWeight: "600",
              fontSize: "0.9rem",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem"
            }}
          >
            <IconPlus size={16} /> Allocate Resource
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Total Engineering Staff</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#2563eb", marginTop: "0.25rem" }}>{totalEmployees}</div>
        </div>

        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
            Optimal Utilization (80-100%)
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#10b981", marginTop: "0.25rem" }}>{optimalCount}</div>
        </div>

        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#f59e0b", display: "inline-block" }} />
            Bench / Underutilized (&lt;80%)
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#f59e0b", marginTop: "0.25rem" }}>{benchCount}</div>
        </div>

        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
            Overallocated (&gt;100%)
          </div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#ef4444", marginTop: "0.25rem" }}>{overallocatedCount}</div>
        </div>
      </div>

      {/* Utilization Heatmap Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: "1.25rem" }}>
        {loading ? (
          <div style={{ gridColumn: "1 / -1", padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
            Loading resource allocations...
          </div>
        ) : utilization.length === 0 ? (
          <div style={{ gridColumn: "1 / -1", padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
            No engineering resources allocated yet.
          </div>
        ) : (
          utilization.map(emp => {
            const isOptimal = emp.status === "Optimal";
            const isOver = emp.status === "Overallocated";
            const barColor = isOver ? "#ef4444" : isOptimal ? "#10b981" : "#f59e0b";
            const badgeBg = isOver ? "#fef2f2" : isOptimal ? "#ecfdf5" : "#fffbeb";
            const badgeText = isOver ? "#b91c1c" : isOptimal ? "#047857" : "#b45309";
            const badgeBorder = isOver ? "#fecaca" : isOptimal ? "#a7f3d0" : "#fde68a";

            return (
              <div
                key={emp.id}
                style={{
                  background: "var(--ui-surface, #ffffff)",
                  border: "1px solid var(--ui-border, #e2e8f0)",
                  borderRadius: "12px",
                  padding: "1.25rem",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between"
                }}
              >
                <div>
                  {/* Top: Avatar, Name, and Status Badge */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <div style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: "700",
                        fontSize: "0.95rem"
                      }}>
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: "700", color: "var(--text-main, #0f172a)", fontSize: "1rem" }}>{emp.name}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted, #64748b)" }}>{emp.position || emp.department}</div>
                      </div>
                    </div>

                    <span style={{
                      padding: "0.25rem 0.6rem",
                      borderRadius: "9999px",
                      fontSize: "0.75rem",
                      fontWeight: "700",
                      background: badgeBg,
                      color: badgeText,
                      border: `1px solid ${badgeBorder}`
                    }}>
                      {emp.total_allocation}% {emp.status}
                    </span>
                  </div>

                  {/* Progress / Capacity Bar */}
                  <div style={{ margin: "0.75rem 0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted, #64748b)", marginBottom: "0.25rem" }}>
                      <span>Allocated: <strong>{emp.total_allocation}%</strong> ({emp.billable_allocation}% Billable)</span>
                      <span>Bench Capacity: <strong>{emp.bench_capacity}%</strong></span>
                    </div>
                    <div style={{ width: "100%", height: "8px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min(100, emp.total_allocation)}%`,
                          height: "100%",
                          background: barColor,
                          transition: "width 0.3s ease"
                        }}
                      />
                    </div>
                  </div>

                  {/* Assigned Projects Chips */}
                  <div style={{ marginTop: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: "700", color: "var(--text-muted, #64748b)", textTransform: "uppercase", marginBottom: "0.4rem" }}>
                      Assigned Projects ({emp.projects?.length || 0})
                    </div>
                    {(!emp.projects || emp.projects.length === 0) ? (
                      <div style={{ fontSize: "0.85rem", color: "#94a3b8", fontStyle: "italic" }}>
                        Currently on Bench (No active projects assigned)
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {emp.projects.map(p => (
                          <div
                            key={p.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              borderRadius: "6px",
                              padding: "0.4rem 0.6rem",
                              fontSize: "0.85rem"
                            }}
                          >
                            <span style={{ fontWeight: "600", color: "#1e293b" }}>{p.project_name}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                              <span style={{ fontWeight: "700", color: "#2563eb" }}>{p.allocation_percentage}%</span>
                              <span style={{ fontSize: "0.7rem", color: "#64748b", background: "#e2e8f0", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>
                                {p.billing_type}
                              </span>
                              {isLeadOrAdmin && (
                                <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                  <button
                                    onClick={() => handleOpenEdit(p)}
                                    style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: "0.8rem", padding: "0 0.2rem", display: "inline-flex", alignItems: "center" }}
                                    title="Edit allocation % and role"
                                  >
                                    <IconEdit size={12} color="#2563eb" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAllocation(p.id)}
                                    style={{ border: "none", background: "none", color: "#ef4444", cursor: "pointer", fontSize: "0.8rem", padding: "0 0.2rem", display: "inline-flex", alignItems: "center" }}
                                    title="Remove allocation"
                                  >
                                    <IconX size={12} color="#ef4444" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ─── ALLOCATE RESOURCE MODAL ─── */}
      <FormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Allocate Resource to Project"
        onSubmit={handleAllocateSubmit}
        submitText={submitting ? "Allocating..." : "Confirm Allocation"}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>
              Select Employee <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
            </label>
            <select
              value={allocForm.user_id}
              onChange={(e) => {
                const emp = employees.find(ep => ep.id === e.target.value);
                setAllocForm({
                  ...allocForm,
                  user_id: e.target.value,
                  user_name: emp?.name || "",
                  user_role: emp?.position || "Developer"
                });
                if (fieldErrors.user_id) setFieldErrors({ ...fieldErrors, user_id: null });
              }}
              style={{
                width: "100%",
                padding: "0.55rem",
                borderRadius: "6px",
                border: fieldErrors.user_id ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                background: fieldErrors.user_id ? "#fff5f5" : undefined
              }}
            >
              <option value="">-- Choose Employee --</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.position || emp.department})</option>
              ))}
            </select>
            {fieldErrors.user_id && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {fieldErrors.user_id}
              </span>
            )}
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>
              Select Project <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
            </label>
            <select
              value={allocForm.project_id}
              onChange={(e) => {
                const proj = projects.find(p => p.id === e.target.value);
                setAllocForm({
                  ...allocForm,
                  project_id: e.target.value,
                  project_name: proj?.name || ""
                });
                if (fieldErrors.project_id) setFieldErrors({ ...fieldErrors, project_id: null });
              }}
              style={{
                width: "100%",
                padding: "0.55rem",
                borderRadius: "6px",
                border: fieldErrors.project_id ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                background: fieldErrors.project_id ? "#fff5f5" : undefined
              }}
            >
              <option value="">-- Choose Project --</option>
              {projects.map(proj => (
                <option key={proj.id} value={proj.id}>{proj.name}</option>
              ))}
            </select>
            {fieldErrors.project_id && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {fieldErrors.project_id}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>
              Bandwidth Allocation % ({allocForm.allocation_percentage}%)
            </label>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={allocForm.allocation_percentage}
              onChange={(e) => setAllocForm({ ...allocForm, allocation_percentage: parseInt(e.target.value) })}
              style={{ width: "100%", accentColor: "#2563eb", marginTop: "0.4rem" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Billing Type</label>
            <select
              value={allocForm.billing_type}
              onChange={(e) => setAllocForm({ ...allocForm, billing_type: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            >
              <option value="Billable">Billable (Client Invoiced)</option>
              <option value="Non-Billable">Non-Billable / Internal</option>
              <option value="Shadow">Shadow / Training</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Allocation Start Date</label>
            <input
              type="date"
              value={allocForm.start_date}
              onChange={(e) => setAllocForm({ ...allocForm, start_date: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Allocation End Date</label>
            <input
              type="date"
              value={allocForm.end_date}
              onChange={(e) => setAllocForm({ ...allocForm, end_date: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>
      </FormModal>

      {/* ─── EDIT ALLOCATION MODAL ─── */}
      <FormModal
        isOpen={editModal.show}
        onClose={() => setEditModal({ show: false, allocation: null })}
        title={`Edit Allocation: ${editModal.allocation?.project_name || "Project"}`}
        onSubmit={handleSaveEdit}
        submitText={savingEdit ? "Updating..." : "Update Allocation"}
      >
        <div style={{ marginBottom: "1rem", padding: "0.75rem 1rem", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
            Employee: <strong style={{ color: "#0f172a" }}>{editModal.allocation?.user_name}</strong>
          </div>
          <div style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "2px" }}>
            Project: <strong style={{ color: "#0f172a" }}>{editModal.allocation?.project_name}</strong>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>
              Allocation % (10 - 100) *
            </label>
            <input
              type="number"
              min="10"
              max="100"
              step="5"
              required
              value={editForm.allocation_percentage}
              onChange={(e) => setEditForm({ ...editForm, allocation_percentage: parseInt(e.target.value) || 0 })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Billing Type</label>
            <select
              value={editForm.billing_type}
              onChange={(e) => setEditForm({ ...editForm, billing_type: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            >
              <option value="Billable">Billable (Client Invoiced)</option>
              <option value="Non-Billable">Non-Billable / Internal</option>
              <option value="Shadow">Shadow / Training</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Project Role</label>
          <input
            type="text"
            value={editForm.user_role}
            onChange={(e) => setEditForm({ ...editForm, user_role: e.target.value })}
            placeholder="e.g. Lead Frontend Engineer, QA Specialist"
            style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Start Date</label>
            <input
              type="date"
              value={editForm.start_date}
              onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>End Date</label>
            <input
              type="date"
              value={editForm.end_date}
              onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>
      </FormModal>

      <ConfirmModal
        show={confirmConfig.show}
        onClose={() => setConfirmConfig(prev => ({ ...prev, show: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        confirmColor={confirmConfig.confirmColor}
      />
    </div>
  );
}
