import React, { useEffect, useState } from "react";
import API from "../api/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import DataTable from "./common/DataTable";
import FormModal from "./common/FormModal";
import ConfirmModal from "./common/ConfirmModal";
import { TextInput, SelectField } from "./common/FormFields";
import { CheckIcon, WrenchIcon } from "./common/Icons";

const planColors = {
  monthly: { gradient: "linear-gradient(135deg, #64748b 0%, #475569 100%)", label: "FREE" },
  quarterly: { gradient: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)", label: "POPULAR" },
  yearly: { gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", label: "BEST VALUE" },
};

const modulesList = [
  { id: "maxProjects", label: "Project Management" },
  { id: "maxTasks", label: "Task Management" },
  { id: "maxTaskStatuses", label: "Task Status Management" },
  { id: "maxDocuments", label: "Document Management" },
  { id: "maxAddText", label: "Add Text Access" },
  { id: "maxBulkUploads", label: "Bulk Upload Access" },
  { id: "maxStaff", label: "Staff Management" },
];

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

export default function SubscriptionView({ isSuperAdmin = false }) {
  const [plans, setPlans] = useState([]);
  const [currentSub, setCurrentSub] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(null);

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
  const [formData, setFormData] = useState({
    name: "", billingCycle: "monthly", price: 0,
    maxProjects: 1, maxTasks: 25, maxStaff: 5, maxDocuments: 10,
    maxTaskStatuses: 5, maxIssues: 10, maxBulkUploads: 1, maxAddText: 5
  });

  // Track input as strings for better editing (allows "-" and "")
  const [inputValues, setInputValues] = useState({});
  const [activeToggles, setActiveToggles] = useState({});

  const { showToast } = useToast();
  const { user } = useAuth();

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
    const initialData = {
      name: "", billingCycle: "monthly", price: 0,
      maxProjects: 1, maxTasks: 25, maxStaff: 5, maxDocuments: 10,
      maxTaskStatuses: 5, maxIssues: 10, maxBulkUploads: 1, maxAddText: 5
    };
    setFormData(initialData);

    // Initialize toggles: everything enabled by default for new plan
    const toggles = {};
    const inputs = {};
    modulesList.forEach(m => {
      toggles[m.id] = true;
      inputs[m.id] = String(initialData[m.id]);
    });
    setActiveToggles(toggles);
    setInputValues(inputs);

    setShowModal(true);
  };

  const openEditModal = (plan) => {
    const fullData = { ...plan };
    const toggles = {};
    const inputs = {};
    modulesList.forEach(mod => {
      if (fullData[mod.id] === undefined) fullData[mod.id] = 0;
      toggles[mod.id] = fullData[mod.id] !== 0;
      inputs[mod.id] = String(fullData[mod.id]);
    });
    setEditingPlan(plan);
    setFormData(fullData);
    setActiveToggles(toggles);
    setInputValues(inputs);
    setShowModal(true);
  };

  const handleSavePlan = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);

    // Ensure unchecked modules are sent as 0 and strings are cast to numbers
    const finalData = {
      ...formData,
      price: Number(formData.price) || 0
    };

    modulesList.forEach(m => {
      if (!activeToggles[m.id]) {
        finalData[m.id] = 0;
      } else {
        const val = inputValues[m.id];
        finalData[m.id] = val === "" || val === "-" ? 0 : Number(val);
      }
    });

    try {
      if (editingPlan) {
        await API.put(`/subscriptions/plans/${editingPlan._id}`, finalData);
        showToast("Plan updated successfully");
      } else {
        await API.post("/subscriptions/plans", finalData);
        showToast("Plan created successfully");
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      showToast(err.response?.data?.error || "Operation failed", "error");
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

  const getExpiryDays = () => {
    if (!currentSub?.expiry) return null;
    const days = Math.ceil((new Date(currentSub.expiry) - new Date()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const currentPlanId = currentSub?.plan?._id;
  const expiryDays = getExpiryDays();

  if (loading) return <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading subscription...</div>;

  return (
    <div className="subscription-view">
      <style>{`
        .no-spinner::-webkit-inner-spin-button, 
        .no-spinner::-webkit-outer-spin-button { 
          -webkit-appearance: none; 
          margin: 0; 
        }
        .no-spinner {
          -moz-appearance: textfield;
        }
      `}</style>

      {/* Super Admin Add Button */}
      {isSuperAdmin && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
          <button
            className="btn btn-primary"
            onClick={openAddModal}
            style={{ borderRadius: '12px', padding: '10px 20px', fontWeight: '800' }}
          >
            + Add New Plan
          </button>
        </div>
      )}

      {/* Current Plan & Usage Panel */}
      {!isSuperAdmin && (
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
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" /></svg>
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

      {/* Pricing Grids/Table */}
      <div style={{ marginTop: "10px" }}>
        {isSuperAdmin ? (
          <DataTable
            data={plans}
            columns={[
              { header: "Plan Name", key: "name", render: (val, p) => <div style={{ fontWeight: "800", color: "var(--primary-color)" }}>{p.name}</div> },
              { header: "Cycle", key: "billingCycle", render: (val, p) => <span style={{ textTransform: "capitalize", fontSize: "11px", fontWeight: "700", padding: "4px 10px", borderRadius: "20px", background: "var(--primary-light)", color: "var(--primary-color)" }}>{p.billingCycle}</span> },
              { header: "Price", key: "price", render: (val, p) => <div style={{ fontWeight: "900", color: "var(--text-main)" }}>${p.price}</div> },
              {
                header: "ACTIONS", key: "_id", render: (val, p) => (
                  <div className="action-buttons">
                    <button onClick={() => openEditModal(p)} className="action-btn" title="Edit Plan">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                    </button>
                    <button onClick={() => handleDeletePlan(p._id)} className="action-btn delete" title="Delete Plan">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                    </button>
                  </div>
                )
              }
            ]}
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "30px", marginTop: "20px" }}>
            {plans.map(p => {
              const isCurrentPlan = p._id === currentPlanId;
              const style = planColors[p.billingCycle] || planColors.monthly;

              return (
                <div key={p._id} style={{
                  background: "var(--neu-bg)", borderRadius: "24px", padding: "40px 30px",
                  boxShadow: isCurrentPlan ? "var(--neu-shadow-active)" : "var(--neu-shadow)",
                  display: "flex", flexDirection: "column", position: "relative",
                  border: isCurrentPlan ? "2px solid var(--primary-color)" : "none"
                }}>
                  {isCurrentPlan && (
                    <div style={{ position: "absolute", top: "20px", right: "20px", background: "var(--primary-color)", color: "#fff", fontSize: "10px", fontWeight: "900", padding: "4px 12px", borderRadius: "20px", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                      <CheckIcon size={12} color="#fff" /> Current Plan
                    </div>
                  )}

                  <div style={{ fontSize: "12px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" }}>{style.label}</div>
                  <h2 style={{ fontSize: "28px", fontWeight: "900", color: "var(--text-main)", margin: "0 0 16px" }}>{p.name}</h2>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "30px" }}>
                    <span style={{ fontSize: "36px", fontWeight: "900", color: "var(--primary-color)" }}>${p.price}</span>
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-muted)" }}>/ {p.billingCycle}</span>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "15px", borderBottom: "1px solid rgba(0,0,0,0.05)", paddingBottom: "10px" }}>What's Included</div>
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
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success-color)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                          <span>{item.val === -1 ? "Unlimited" : item.val} {item.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => handleUpgrade(p._id, p.name)}
                    disabled={upgrading === p._id || isCurrentPlan}
                    style={{
                      marginTop: "40px", width: "100%", padding: "16px", borderRadius: "16px", border: "none", fontSize: "14px", fontWeight: "900",
                      background: isCurrentPlan ? "var(--neu-bg)" : "linear-gradient(135deg, var(--primary-color) 0%, #1e40af 100%)",
                      color: isCurrentPlan ? "var(--text-muted)" : "#fff",
                      boxShadow: isCurrentPlan ? "var(--neu-shadow-active)" : "0 10px 20px rgba(37, 99, 235, 0.2)",
                      cursor: isCurrentPlan ? "default" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px"
                    }}
                  >
                    {isCurrentPlan ? (
                      <>
                        <CheckIcon size={14} color="currentColor" /> Active Plan
                      </>
                    ) : upgrading === p._id ? "Processing..." : "Upgrade Now"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* PLAN MANAGEMENT MODAL */}
      <FormModal
        show={showModal}
        onClose={() => setShowModal(false)}
        title={editingPlan ? "Edit Subscription Plan" : "Create New Plan"}
        onSave={handleSavePlan}
        loading={saving}
        saveText={editingPlan ? "Update Plan" : "Create Plan"}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Plan Basics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <TextInput
              label="Plan Name"
              name="name"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Premium Yearly"
              style={{ gridColumn: "span 2" }}
              required
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
              onChange={e => setFormData({ ...formData, price: e.target.value })}
              required
            />
          </div>

          {/* Modules & Limits Checklist */}
          <div>
            <label style={{ fontSize: "14px", fontWeight: "800", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "16px", borderBottom: "1px solid var(--border-color)", paddingBottom: "8px", width: "100%" }}>
              <WrenchIcon size={15} color="#4f46e5" /> Tier Modules & Limits
            </label>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {modulesList.map(mod => {
                const isEnabled = activeToggles[mod.id];
                const displayVal = inputValues[mod.id] || "";
                const isInf = displayVal === "-1";

                return (
                  <div key={mod.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "12px 16px", borderRadius: "12px",
                    background: isEnabled ? "#f8fafc" : "#fff",
                    border: isEnabled ? "1px solid #e2e8f0" : "1px solid #f1f5f9",
                    transition: "0.2s"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={() => {
                          const newState = !isEnabled;
                          setActiveToggles({ ...activeToggles, [mod.id]: newState });
                          if (newState && !inputValues[mod.id]) {
                            setInputValues({ ...inputValues, [mod.id]: mod.id === 'maxProjects' ? "1" : "5" });
                          }
                        }}
                        style={{ width: "18px", height: "18px", cursor: "pointer" }}
                      />
                      <span style={{ fontSize: "14px", fontWeight: "750", color: isEnabled ? "var(--text-main)" : "var(--text-muted)" }}>
                        {mod.label}
                      </span>
                    </div>

                    {isEnabled && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ position: "relative", width: "100px" }}>
                          <input
                            type="text"
                            className="no-spinner"
                            value={displayVal}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "" || val === "-" || /^-?\d*$/.test(val)) {
                                setInputValues({ ...inputValues, [mod.id]: val });
                              }
                            }}
                            style={{
                              width: "100%", padding: "6px 12px", borderRadius: "8px",
                              border: isInf ? "1px solid var(--success-color)" : "1px solid #cbd5e1",
                              fontSize: "14px", fontWeight: "800",
                              background: isInf ? "var(--success-color)" : "#fff",
                              color: isInf ? "#fff" : "var(--primary-color)",
                              textAlign: "center", position: "relative", zIndex: 1
                            }}
                          />
                          {isInf && (
                            <button
                              onClick={() => {
                                setInputValues({ ...inputValues, [mod.id]: "" });
                                // Focus the input if possible? In React it's better to just clear it.
                              }}
                              style={{
                                position: "absolute", top: "0", left: "0", width: "100%", height: "100%",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: "10px", fontWeight: "900", color: "#fff",
                                zIndex: 2, background: "var(--success-color)", borderRadius: "8px",
                                border: "none", cursor: "pointer"
                              }}
                              title="Click to change limit"
                            >
                              UNLIMITED
                            </button>
                          )}
                        </div>
                        <div style={{ fontSize: "11px", fontWeight: "800", color: "var(--text-muted)" }}>
                          {isInf ? "∞" : "Limit"}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "12px", fontStyle: "italic" }}>
              * Tip: Type <strong>-1</strong> for Unlimited access.
            </p>
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
