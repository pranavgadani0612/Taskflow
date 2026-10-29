import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import API from "../api/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import PageHeader from "../components/common/PageHeader";
import FormModal from "../components/common/FormModal";
import ConfirmModal from "../components/common/ConfirmModal";
import DataTable from "../components/common/DataTable";
import { TextInput, SelectField } from "../components/common/FormFields";
import { SparkleIcon, CheckIcon, WrenchIcon, ClipboardIcon } from "../components/common/Icons";

export default function Subscription() {
  const [plans, setPlans] = useState([]);
  const [currentSub, setCurrentSub] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(null);
  const [planSelected, setPlanSelected] = useState(false); // tracks if a plan was just chosen

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

  // Super Admin Management State
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formData, setFormData] = useState({
    name: "", billingCycle: "monthly", price: 0,
    maxProjects: 1, maxTasks: 25, maxStaff: 5, maxDocuments: 10,
    maxTaskStatuses: 5, maxIssues: 10, maxBulkUploads: 1, maxAddText: 5
  });

  const { showToast } = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNewRegistration = searchParams.get("new") === "1";
  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [plansRes, subRes, usageRes] = await Promise.all([
        API.get("/subscriptions/plans"),
        !isSuperAdmin ? API.get("/subscriptions/current") : Promise.resolve({ data: null }),
        !isSuperAdmin ? API.get("/subscriptions/usage") : Promise.resolve({ data: null }),
      ]);
      setPlans(plansRes.data);
      setCurrentSub(subRes.data);
      setUsage(usageRes.data);
    } catch (err) {
      showToast("Failed to load subscription data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (planId, planName) => {
    if (upgrading) return;
    setUpgrading(planId);
    try {
      await API.post("/subscriptions/upgrade", { planId });
      showToast(`Successfully activated ${planName} plan!`);
      setPlanSelected(true);
      await loadData();
    } catch (err) {
      showToast(err.response?.data?.error || "Upgrade failed", "error");
    } finally {
      setUpgrading(null);
    }
  };

  // Super Admin Actions
  const openAddModal = () => {
    setEditingPlan(null);
    setFieldErrors({});
    setFormData({
      name: "", billingCycle: "monthly", price: 0,
      maxProjects: 1, maxTasks: 25, maxStaff: 5, maxDocuments: 10,
      maxTaskStatuses: 5, maxIssues: 10, maxBulkUploads: 1, maxAddText: 5
    });
    setShowModal(true);
  };

  const openEditModal = (plan) => {
    setEditingPlan(plan);
    setFieldErrors({});
    setFormData({ ...plan });
    setShowModal(true);
  };

  const handleSavePlan = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setFieldErrors({});
    setSaving(true);
    try {
      if (editingPlan) {
        await API.put(`/subscriptions/plans/${editingPlan._id}`, formData);
        showToast("Plan updated successfully");
      } else {
        await API.post("/subscriptions/plans", formData);
        showToast("Plan created successfully");
      }
      setShowModal(false);
      setFieldErrors({});
      loadData();
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || "Operation failed";
      let matched = false;
      if (errMsg.toLowerCase().includes("plan name") || errMsg.toLowerCase().includes("name")) {
        setFieldErrors(prev => ({ ...prev, name: "Plese enter plan name" }));
        matched = true;
      }
      if (errMsg.toLowerCase().includes("price")) {
        setFieldErrors(prev => ({ ...prev, price: "Plese enter price" }));
        matched = true;
      }
      if (!matched) {
        showToast(errMsg, "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = (id) => {
    askConfirm(
      "Delete Plan",
      "Are you sure you want to delete this plan? This may affect companies currently on this plan.",
      async () => {
        try {
          await API.delete(`/subscriptions/plans/${id}`);
          showToast("Plan deleted successfully");
          loadData();
        } catch (err) {
          showToast(err.response?.data?.error || "Delete failed", "error");
        }
      }
    );
  };

  const formatLimit = (val) => (val === -1 ? "Unlimited" : val);

  const getExpiryDays = () => {
    if (!currentSub?.expiry) return null;
    const days = Math.ceil((new Date(currentSub.expiry) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const UsageBar = ({ label, used, max }) => {
    const isUnlimited = max === -1;
    const pct = isUnlimited ? 0 : Math.min(100, (used / max) * 100);
    const color = pct > 85 ? "#ef4444" : pct > 60 ? "#f59e0b" : "#22c55e";
    return (
      <div style={{ marginBottom: "12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "13px", fontWeight: "600", color: "#475569" }}>
          <span>{label}</span>
          <span style={{ color: isUnlimited ? "#22c55e" : pct > 85 ? "#ef4444" : "#64748b" }}>
            {used} / {isUnlimited ? "∞" : max}
          </span>
        </div>
        <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
          {!isUnlimited && (
            <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "10px", transition: "width 0.5s ease" }} />
          )}
          {isUnlimited && (
            <div style={{ height: "100%", width: "100%", background: "linear-gradient(90deg, #22c55e, #86efac)", borderRadius: "10px" }} />
          )}
        </div>
      </div>
    );
  };

  const planColors = {
    monthly: { gradient: "linear-gradient(135deg, #64748b 0%, #475569 100%)", label: "FREE" },
    quarterly: { gradient: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)", label: "POPULAR" },
    yearly: { gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", label: "BEST VALUE" },
  };

  const currentPlanId = currentSub?.plan?._id;
  const expiryDays = getExpiryDays();

  if (loading) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
        <div className="loading-spinner" style={{ margin: "0 auto 16px" }}></div>
        Loading subscription data...
      </div>
    );
  }

  return (
    <div className="page" style={{ padding: "24px" }}>

      {/* ===== NEW REGISTRATION WELCOME BANNER ===== */}
      {isNewRegistration && (
        <div style={{
          background: "linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)",
          borderRadius: "20px", padding: "28px 32px",
          marginBottom: "32px", boxShadow: "0 15px 40px rgba(99,102,241,0.3)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "16px"
        }}>
          <div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.8)", fontWeight: "600", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "6px" }}>
              <SparkleIcon size={16} color="#fbbf24" /> Welcome to Task Manager!
            </div>
            <div style={{ fontSize: "22px", fontWeight: "900", color: "#fff" }}>
              Choose your Subscription Plan
            </div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", marginTop: "6px" }}>
              You're on the <strong>Free</strong> plan by default. Upgrade anytime to unlock more features.
            </div>
          </div>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "rgba(255,255,255,0.2)", border: "2px solid rgba(255,255,255,0.5)",
              color: "#fff", padding: "12px 24px", borderRadius: "12px",
              fontWeight: "800", fontSize: "13px", cursor: "pointer",
              backdropFilter: "blur(10px)", whiteSpace: "nowrap"
            }}
          >
            {planSelected ? "Go to Dashboard →" : "Skip, Go to Dashboard →"}
          </button>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="Subscription Plans"
        buttonText={isSuperAdmin ? "+ Add New Plan" : null}
        onButtonClick={openAddModal}
        secondaryButtonText={planSelected && isNewRegistration ? "Continue to Dashboard →" : null}
        onSecondaryButtonClick={() => navigate("/")}
      />

      {/* Current Plan & Usage Panel */}
      {!isSuperAdmin && !isNewRegistration && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "24px", marginBottom: "32px" }}>
          
          {/* Enhanced Current Plan Banner */}
          {currentSub?.plan && (
            <div style={{
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              borderRadius: "24px", padding: "32px",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
              boxShadow: "0 20px 40px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.1)",
              position: "relative", overflow: "hidden"
            }}>
              {/* Decorative Circle */}
              <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "120px", height: "120px", background: "rgba(37, 99, 235, 0.1)", borderRadius: "50%" }}></div>
              
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", fontWeight: "800", textTransform: "uppercase", letterSpacing: "2px", marginBottom: "8px" }}>
                      Your Subscription
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: "900", color: "#fff", display: "flex", alignItems: "center", gap: "12px" }}>
                      {currentSub.plan.name}
                      <span style={{
                        fontSize: "10px",
                        background: currentSub.status === "active" ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)",
                        color: currentSub.status === "active" ? "#4ade80" : "#fbbf24",
                        border: currentSub.status === "active" ? "1px solid rgba(34,197,94,0.3)" : "1px solid rgba(245,158,11,0.3)",
                        padding: "4px 10px", borderRadius: "20px", fontWeight: "900"
                      }}>
                        {currentSub.status?.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  {expiryDays !== null && (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "28px", fontWeight: "900", color: expiryDays < 7 ? "#f87171" : "#fff" }}>{expiryDays}</div>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", fontWeight: "700", textTransform: "uppercase" }}>Days Left</div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)", fontWeight: "600" }}>Manage your plan or upgrade below</span>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 10px #22c55e" }}></div>
              </div>
            </div>
          )}

          {/* Enhanced Usage Stats */}
          {usage && (
            <div style={{
              background: "var(--neu-bg)", borderRadius: "24px", padding: "32px",
              boxShadow: "var(--neu-shadow-sm)", display: "flex", flexDirection: "column"
            }}>
              <h3 style={{ fontSize: "12px", fontWeight: "800", color: "var(--text-muted)", marginBottom: "20px", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
                Resource Usage
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <UsageBar label="Staff Members" used={usage.usage?.staff || 0} max={usage.limits?.maxStaff || 0} />
                <UsageBar label="Projects" used={usage.usage?.projects || 0} max={usage.limits?.maxProjects || 0} />
                <UsageBar label="Active Tasks" used={usage.usage?.tasks || 0} max={usage.limits?.maxTasks || 0} />
                <UsageBar label="Documents" used={usage.usage?.documents || 0} max={usage.limits?.maxDocuments || 0} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pricing Section */}
      <div style={{ marginTop: "10px" }}>
        {isSuperAdmin ? (
          <DataTable
            data={plans}
            columns={[
              {
                header: "Plan Name", key: "name", render: (val, p) => (
                  <div style={{ fontWeight: "800", color: "var(--primary-color)" }}>{p.name}</div>
                )
              },
              {
                header: "Cycle", key: "billingCycle", render: (val, p) => (
                  <span style={{
                    textTransform: "capitalize", fontSize: "11px", fontWeight: "700",
                    padding: "4px 10px", borderRadius: "20px", background: "var(--primary-light)", color: "var(--primary-color)"
                  }}>{p.billingCycle}</span>
                )
              },
              {
                header: "Price", key: "price", render: (val, p) => (
                  <div style={{ fontWeight: "900", color: "var(--text-main)" }}>${p.price}</div>
                )
              },
              {
                header: "ACTIONS", key: "_id", render: (val, p) => (
                  <div className="action-buttons">
                    <button
                      className="action-btn"
                      onClick={() => openEditModal(p)}
                      title="Edit Plan"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    </button>
                    <button
                      className="action-btn delete"
                      onClick={() => handleDeletePlan(p._id)}
                      title="Delete Plan"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                    </button>
                  </div>
                )
              }
            ]}
          />
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "30px",
            marginTop: "20px"
          }}>
            {plans.map(p => {
              const isCurrentPlan = p._id === currentPlanId;
              const style = planColors[p.billingCycle] || planColors.monthly;

              return (
                <div key={p._id} style={{
                  background: "var(--neu-bg)",
                  borderRadius: "24px",
                  padding: "40px 30px",
                  boxShadow: isCurrentPlan ? "var(--neu-shadow-active)" : "var(--neu-shadow)",
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  transition: "0.3s ease",
                  border: isCurrentPlan ? "2px solid var(--primary-color)" : "none"
                }}>
                  {isCurrentPlan && (
                    <div style={{
                      position: "absolute", top: "20px", right: "20px",
                      background: "var(--primary-color)", color: "#fff",
                      fontSize: "10px", fontWeight: "900", padding: "4px 12px",
                      borderRadius: "20px", textTransform: "uppercase",
                      display: "inline-flex", alignItems: "center", gap: "4px"
                    }}>
                      <CheckIcon size={12} color="#fff" /> Current Plan
                    </div>
                  )}

                  <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>
                    {style.label}
                  </div>
                  <h2 style={{ fontSize: "28px", fontWeight: "900", color: "var(--text-main)", margin: "0 0 16px" }}>
                    {p.name}
                  </h2>

                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "30px" }}>
                    <span style={{ fontSize: "36px", fontWeight: "900", color: "var(--primary-color)" }}>${p.price}</span>
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-muted)" }}>/ {p.billingCycle}</span>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "15px", borderBottom: "1px solid rgba(0,0,0,0.05)", paddingBottom: "10px" }}>
                      What's Included
                    </div>

                    <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
                      {[
                        { label: "Projects", val: p.maxProjects },
                        { label: "Staff Members", val: p.maxStaff },
                        { label: "Tasks", val: p.maxTasks },
                        { label: "Documents", val: p.maxDocuments },
                        { label: "Custom Statuses", val: p.maxTaskStatuses },
                        { label: "Issues Tracking", val: p.maxIssues }
                      ].map((item, idx) => (
                        <li key={idx} style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: "600", color: "var(--text-main)" }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          <span>{item.val === -1 ? "Unlimited" : item.val} {item.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => handleUpgrade(p._id, p.name)}
                    disabled={upgrading === p._id || isCurrentPlan}
                    style={{
                      marginTop: "40px",
                      width: "100%",
                      padding: "16px",
                      borderRadius: "16px",
                      border: "none",
                      fontSize: "14px",
                      fontWeight: "900",
                      cursor: isCurrentPlan ? "default" : "pointer",
                      background: isCurrentPlan ? "var(--neu-bg)" : "linear-gradient(135deg, var(--primary-color) 0%, #1e40af 100%)",
                      color: isCurrentPlan ? "var(--text-muted)" : "#fff",
                      boxShadow: isCurrentPlan ? "var(--neu-shadow-active)" : "0 10px 20px rgba(37, 99, 235, 0.2)",
                      transition: "0.3s ease",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px"
                    }}
                  >
                    {isCurrentPlan ? (
                      <>
                        <CheckIcon size={14} color="currentColor" /> Your active Plan
                      </>
                    ) : upgrading === p._id ? "Processing..." : "Upgrade Now"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Note */}
      <p style={{ textAlign: "center", marginTop: "32px", fontSize: "12px", color: "var(--text-muted)" }}>
        All plans include core features. Upgrade any time. Contact support for custom enterprise needs.
      </p>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 6px 20px rgba(34,197,94,0.35); }
          50% { box-shadow: 0 6px 30px rgba(34,197,94,0.6); }
        }
        .management-modal-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .management-modal {
          background: #fff; width: 90%; max-width: 500px; padding: 32px;
          borderRadius: 20px; box-shadow: 0 25px 50px rgba(0,0,0,0.2);
        }
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 6px; }
        .form-control { width: 100%; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 14px; }
      `}</style>

      {/* PLAN MANAGEMENT MODAL */}
      <FormModal
        show={showModal}
        onClose={() => setShowModal(false)}
        title={editingPlan ? "Edit Subscription Plan" : "Create New Plan"}
        onSave={handleSavePlan}
        loading={saving}
        saveText={editingPlan ? "Update Plan" : "Create Plan"}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
          <TextInput
            label="Plan Name"
            name="name"
            value={formData.name}
            onChange={e => {
              setFormData({ ...formData, name: e.target.value });
              if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: null }));
            }}
            placeholder="e.g. Premium Yearly"
            style={{ gridColumn: "span 2" }}
            required
            error={fieldErrors.name}
          />
          <SelectField
            label="Billing Cycle"
            value={formData.billingCycle}
            onChange={e => setFormData({ ...formData, billingCycle: e.target.value })}
            options={[
              { value: "monthly", label: "Monthly" },
              { value: "quarterly", label: "Quarterly" },
              { value: "yearly", label: "Yearly" }
            ]}
          />
          <TextInput
            label="Price ($)"
            type="number"
            value={formData.price}
            onChange={e => {
              setFormData({ ...formData, price: e.target.value === "" ? "" : Number(e.target.value) });
              if (fieldErrors.price) setFieldErrors(prev => ({ ...prev, price: null }));
            }}
            required
            error={fieldErrors.price}
          />

          <div style={{ gridColumn: "span 2", marginTop: "16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <label style={{ fontSize: "12px", fontWeight: "800", color: "#475569", textTransform: "uppercase", letterSpacing: "0.5px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <WrenchIcon size={14} color="#4f46e5" /> Active Modules & Limits
              </label>
              {!['maxProjects', 'maxTasks', 'maxStaff', 'maxDocuments'].every(id => formData[id] !== 0) && (
                <div style={{ display: "flex", gap: "6px" }}>
                  <select
                    id="module-selector"
                    style={{ padding: "4px 8px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: "700", background: "#f8fafc" }}
                  >
                    {[
                      { id: "maxProjects", label: "Project Management" },
                      { id: "maxTasks", label: "Task Management" },
                      { id: "maxTaskStatuses", label: "Task Status Management" },
                      { id: "maxDocuments", label: "Document Management" },
                      { id: "maxBulkUploads", label: "Bulk Upload Access" },
                      { id: "maxAddText", label: "Add Text Access" },
                      { id: "maxStaff", label: "Staff Management" }
                    ].filter(m => formData[m.id] === 0).map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const sel = document.getElementById("module-selector");
                      if (sel && sel.value) {
                        let defaultVal = 5;
                        if (sel.value === 'maxProjects') defaultVal = 1;
                        if (sel.value === 'maxTasks') defaultVal = 25;
                        if (sel.value === 'maxDocuments') defaultVal = 10;
                        if (sel.value === 'maxBulkUploads') defaultVal = 1;
                        setFormData({ ...formData, [sel.value]: defaultVal });
                      }
                    }}
                    style={{ background: "var(--primary-color)", color: "#fff", border: "none", borderRadius: "8px", width: "28px", height: "28px", cursor: "pointer", fontWeight: "900" }}
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { id: "maxProjects", label: "Project Management" },
                { id: "maxTasks", label: "Task Management" },
                { id: "maxTaskStatuses", label: "Task Status Management" },
                { id: "maxDocuments", label: "Document Management" },
                { id: "maxBulkUploads", label: "Bulk Upload Access" },
                { id: "maxAddText", label: "Add Text Access" },
                { id: "maxStaff", label: "Staff Management" },
              ].filter(mod => formData[mod.id] !== 0).map(mod => (
                <div key={mod.id} style={{
                  background: "#fff", padding: "14px 18px", borderRadius: "14px",
                  border: "1.5px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between",
                  boxShadow: "0 2px 5px rgba(0,0,0,0.02)"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, [mod.id]: 0 })}
                      style={{
                        width: '36px', height: '36px', padding: 0,
                        borderRadius: '50%', color: '#ef4444',
                        boxShadow: 'var(--neu-shadow-sm)',
                        background: 'var(--neu-bg)',
                        border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'all 0.2s ease'
                      }}
                      title="Remove Module"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                    <span style={{ fontSize: "13px", fontWeight: "750", color: "#1e293b" }}>
                      {mod.label}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ display: "flex", background: "#f1f5f9", borderRadius: "10px", padding: "4px", border: "1px solid #e2e8f0" }}>
                      <input
                        type="number"
                        value={formData[mod.id]}
                        onChange={(e) => setFormData({ ...formData, [mod.id]: Number(e.target.value) })}
                        style={{ width: "60px", background: "transparent", border: "none", textAlign: "center", fontSize: "14px", fontWeight: "800", color: "var(--primary-color)" }}
                      />
                      <button type="button" style={{
                        background: (formData[mod.id] === -1 ? "#22c55e" : "#fff"), color: (formData[mod.id] === -1 ? "#fff" : "#64748b"),
                        border: "none", borderRadius: "7px", padding: "4px 10px", fontSize: "10px", fontWeight: "900", cursor: "pointer",
                        boxShadow: formData[mod.id] === -1 ? "0 2px 10px rgba(34,197,94,0.3)" : "0 2px 4px rgba(0,0,0,0.05)"
                      }} onClick={() => setFormData({ ...formData, [mod.id]: formData[mod.id] === -1 ? (mod.id === 'maxProjects' ? 1 : 10) : -1 })}>
                        {formData[mod.id] === -1 ? "UNLIMITED" : "∞"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {['maxProjects', 'maxTasks', 'maxStaff', 'maxDocuments'].every(id => formData[id] === 0) && (
                <div style={{ padding: "40px", border: "2px dashed #e2e8f0", borderRadius: "16px", textAlign: "center", color: "#94a3b8" }}>
                  <div style={{ marginBottom: "10px", display: "flex", justifyContent: "center" }}><ClipboardIcon size={32} color="#94a3b8" /></div>
                  <div style={{ fontSize: "14px", fontWeight: "700" }}>No modules active in this plan</div>
                  <div style={{ fontSize: "12px", opacity: 0.7 }}>Click the + button above to add modules</div>
                </div>
              )}
            </div>
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
