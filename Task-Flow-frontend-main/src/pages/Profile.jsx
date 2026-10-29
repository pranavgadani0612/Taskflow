import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import API from "../api/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useCompany } from "../contexts/CompanyContext";
import PageHeader from "../components/common/PageHeader";
import { TextInput } from "../components/common/FormFields";
import { PolicyIcon, SearchIcon, ClipboardIcon, EditIcon, TrashIcon, CloseIcon, PlusIcon, ChevronDownIcon, ChevronUpIcon } from "../components/common/Icons";
import ConfirmModal from "../components/common/ConfirmModal";

export default function Profile() {
    const { user } = useAuth();
    const { selectedCompany } = useCompany();
    const { showToast } = useToast();
    const [searchParams] = useSearchParams();
    const isOwnerOrAdmin = user?.role?.name === "Company Owner" || user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";

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

    const initialTab = searchParams.get("tab") || (isOwnerOrAdmin ? "bio" : "policies");
    const [activeTab, setActiveTab] = useState(initialTab);
    const [loading, setLoading] = useState(false);

    const [companyData, setCompanyData] = useState({
        companyName: "",
        email: "",
        phone: "",
        addressLine1: "",
        addressLine2: "",
        country: "",
        state: "",
        city: "",
        pincode: "",
        gstNumber: "",
        panNumber: "",
        appLogo: "",
        workingHours: { start: "09:00", end: "18:00" },
        breakTime: { start: "13:00", end: "14:00" },
        holidays: [],
        policies: []
    });

    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState("");
    const [newHoliday, setNewHoliday] = useState({ date: "", title: "" });

    // ─── POLICIES STATE ────────────────────────────────────────────────────────
    const [policyCategory, setPolicyCategory] = useState("All");
    const [policySearch, setPolicySearch] = useState("");
    const [expandedPolicyId, setExpandedPolicyId] = useState(null);
    const [showPolicyModal, setShowPolicyModal] = useState(false);
    const [editingPolicy, setEditingPolicy] = useState(null);
    const [policySaving, setPolicySaving] = useState(false);
    const [policyFieldErrors, setPolicyFieldErrors] = useState({});
    const [policyForm, setPolicyForm] = useState({
        title: "",
        category: "General",
        summary: "",
        content: "",
        effectiveDate: new Date().toISOString().slice(0, 10),
        status: "Active"
    });

    const [attSettings, setAttSettings] = useState({
        monthly_late_instances: 3,
        late_grace_minutes: 30,
        half_day_late_minutes: 120
    });

    useEffect(() => {
        fetchCompanyData();
    }, [user, selectedCompany]);

    useEffect(() => {
        const tabParam = searchParams.get("tab");
        if (tabParam) {
            setActiveTab(tabParam);
        }
    }, [searchParams]);

    const fetchCompanyData = async () => {
        try {
            const companyId = selectedCompany?._id;
            const url = companyId ? `/staff/company/settings?companyId=${companyId}` : "/staff/company/settings";
            const res = await API.get(url);
            if (res.data) {
                setCompanyData(prev => ({
                    ...prev,
                    ...res.data,
                    companyName: res.data.companyName ?? "",
                    email: res.data.email ?? "",
                    phone: res.data.phone ?? "",
                    addressLine1: res.data.addressLine1 ?? "",
                    addressLine2: res.data.addressLine2 ?? "",
                    city: res.data.city ?? "",
                    state: res.data.state ?? "",
                    pincode: res.data.pincode ?? "",
                    gstNumber: res.data.gstNumber ?? "",
                    panNumber: res.data.panNumber ?? "",
                    holidays: Array.isArray(res.data.holidays) ? res.data.holidays : (prev.holidays || []),
                    policies: Array.isArray(res.data.policies) ? res.data.policies : (prev.policies || [])
                }));
                setLogoPreview(res.data.appLogo || "");
            }
            try {
                const attRes = await API.get("/attendance/settings");
                if (attRes.data) {
                    setAttSettings({
                        monthly_late_instances: attRes.data.monthly_late_instances ?? 3,
                        late_grace_minutes: attRes.data.late_grace_minutes ?? 30,
                        half_day_late_minutes: attRes.data.half_day_late_minutes ?? 120
                    });
                }
            } catch (_) {}
        } catch (err) {
            console.error("Error fetching settings:", err);
        }
    };

    const handleUpdateCompany = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const formData = new FormData();
            Object.keys(companyData).forEach(key => {
                const value = companyData[key];
                if (['_id', '__v', 'createdAt', 'companyId', 'subscription', 'subscriptionStatus', 'subscriptionExpiry', 'policies'].includes(key)) return;
                if (value === "null" || value === null) return;
                if (key === 'workingHours' || key === 'breakTime' || key === 'holidays') {
                    formData.append(key, JSON.stringify(value));
                } else {
                    formData.append(key, value);
                }
            });
            if (logoFile) formData.append("appLogo", logoFile);
            const companyId = selectedCompany?._id;
            const url = companyId ? `/staff/company/settings?companyId=${companyId}` : "/staff/company/settings";
            await Promise.all([
                API.put(url, formData, { headers: { "Content-Type": "multipart/form-data" } }),
                API.put("/attendance/settings", attSettings)
            ]);
            showToast("Company & Attendance settings updated successfully!");
            fetchCompanyData();
        } catch (err) {
            showToast(err.response?.data?.error || "Update failed", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const addHoliday = () => {
        if (!newHoliday.date || !newHoliday.title) return;
        setCompanyData({ ...companyData, holidays: [...companyData.holidays, newHoliday] });
        setNewHoliday({ date: "", title: "" });
    };

    const removeHoliday = (index) => {
        const updated = companyData.holidays.filter((_, i) => i !== index);
        setCompanyData({ ...companyData, holidays: updated });
    };

    // ─── POLICY HANDLERS (ADMIN ONLY MUTATIONS) ────────────────────────────────
    const handleOpenAddPolicy = () => {
        setEditingPolicy(null);
        setPolicyFieldErrors({});
        setPolicyForm({
            title: "",
            category: "General",
            summary: "",
            content: "",
            effectiveDate: new Date().toISOString().slice(0, 10),
            status: "Active"
        });
        setShowPolicyModal(true);
    };

    const handleOpenEditPolicy = (policy) => {
        setEditingPolicy(policy);
        setPolicyFieldErrors({});
        setPolicyForm({
            title: policy.title,
            category: policy.category || "General",
            summary: policy.summary || "",
            content: policy.content,
            effectiveDate: policy.effectiveDate ? new Date(policy.effectiveDate).toISOString().slice(0, 10) : "",
            status: policy.status || "Active"
        });
        setShowPolicyModal(true);
    };

    const handleSavePolicy = async (e) => {
        e.preventDefault();
        setPolicyFieldErrors({});
        const errors = {};
        if (!policyForm.title.trim()) {
            errors.title = "Plese enter policy title";
        }
        if (!policyForm.content.trim()) {
            errors.content = "Plese enter policy content";
        }

        if (Object.keys(errors).length > 0) {
            setPolicyFieldErrors(errors);
            showToast(Object.values(errors)[0], "error");
            return;
        }

        setPolicySaving(true);
        try {
            if (editingPolicy) {
                await API.put(`/staff/company/policies/${editingPolicy._id}`, policyForm);
                showToast("Company policy updated successfully!");
            } else {
                await API.post("/staff/company/policies", policyForm);
                showToast("New company policy published!");
            }
            setShowPolicyModal(false);
            setEditingPolicy(null);
            setPolicyFieldErrors({});
            fetchCompanyData();
        } catch (err) {
            const errMsg = err.response?.data?.error || err.message || "Error saving policy";
            if (errMsg.toLowerCase().includes("title")) {
                setPolicyFieldErrors(prev => ({ ...prev, title: "Plese enter policy title" }));
            }
            if (errMsg.toLowerCase().includes("content")) {
                setPolicyFieldErrors(prev => ({ ...prev, content: "Plese enter policy content" }));
            }
            showToast(errMsg, "error");
        } finally {
            setPolicySaving(false);
        }
    };

    const handleDeletePolicy = (policyId) => {
        askConfirm("Delete Company Policy", "Are you sure you want to delete this company policy?", async () => {
            try {
                await API.delete(`/staff/company/policies/${policyId}`);
                showToast("Policy removed successfully");
                fetchCompanyData();
            } catch (err) {
                showToast(err.response?.data?.error || "Delete failed", "error");
            }
        });
    };

    const toggleExpandPolicy = (id) => {
        setExpandedPolicyId(prev => prev === id ? null : id);
    };

    // ─── FILTER POLICIES ───────────────────────────────────────────────────────
    const filteredPolicies = (companyData.policies || []).filter(p => {
        const matchesCategory = policyCategory === "All" || p.category === policyCategory;
        const matchesSearch = !policySearch.trim() ||
            p.title?.toLowerCase().includes(policySearch.toLowerCase()) ||
            p.summary?.toLowerCase().includes(policySearch.toLowerCase()) ||
            p.content?.toLowerCase().includes(policySearch.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const getCategoryBadge = (cat) => {
        switch (cat) {
            case "Leave & Attendance":
                return { bg: "#ecfdf5", color: "#059669", border: "#a7f3d0" };
            case "IT & Security":
                return { bg: "#f5f3ff", color: "#7c3aed", border: "#ddd6fe" };
            case "Code of Conduct":
                return { bg: "#eff6ff", color: "#2563eb", border: "#bfdbfe" };
            case "Remote Work":
                return { bg: "#fff7ed", color: "#ea580c", border: "#fed7aa" };
            default:
                return { bg: "#f8fafc", color: "#475569", border: "#cbd5e1" };
        }
    };

    const TabButton = ({ id, label }) => (
        <button
            type="button"
            onClick={() => setActiveTab(id)}
            style={{
                background: "none", border: "none", padding: "12px 0", cursor: "pointer",
                marginRight: '24px',
                fontWeight: "700", color: activeTab === id ? "var(--primary-color)" : "var(--text-muted)",
                borderBottom: activeTab === id ? "3px solid var(--primary-color)" : "3px solid transparent",
                fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.04em", transition: "all 0.2s"
            }}
        >
            {label}
        </button>
    );

    return (
        <div className="profile-page" style={{ maxWidth: "1200px", margin: "0 auto", paddingBottom: "30px" }}>
            <PageHeader title={isOwnerOrAdmin ? "Company Profile & Settings" : "Company Policies"} />

            {/* TABS Navigation */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "24px", borderBottom: "1px solid var(--ui-border)" }}>
                {isOwnerOrAdmin && <TabButton id="bio" label="Overview" />}
                {isOwnerOrAdmin && <TabButton id="settings" label="Operational Settings" />}
                <TabButton id="policies" label="Company Policies" />
            </div>

            {/* CONTENT AREA */}
            <div className="profile-content" style={{
                background: "var(--ui-surface)",
                padding: "28px",
                borderRadius: "14px",
                border: "1px solid var(--ui-border)",
                boxShadow: "var(--shadow-sm)"
            }}>
                {/* ─── TAB 1: OVERVIEW (ADMIN ONLY) ────────────────────────── */}
                {activeTab === "bio" && isOwnerOrAdmin && (
                    <form onSubmit={handleUpdateCompany}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '48px' }}>
                            <div>
                                <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '24px', color: 'var(--text-main)' }}>Organization Details</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
                                    <TextInput label="Company Name" value={companyData.companyName} onChange={e => setCompanyData({...companyData, companyName: e.target.value})} />
                                    <TextInput type="email" label="Business Email" value={companyData.email} onChange={e => setCompanyData({...companyData, email: e.target.value})} />
                                    <TextInput label="Business Phone" value={companyData.phone} onChange={e => setCompanyData({...companyData, phone: e.target.value})} />
                                    <TextInput label="GST Number" value={companyData.gstNumber} onChange={e => setCompanyData({...companyData, gstNumber: e.target.value})} />
                                    <TextInput label="PAN Number" value={companyData.panNumber} onChange={e => setCompanyData({...companyData, panNumber: e.target.value})} />
                                </div>

                                <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '24px', color: 'var(--text-main)', marginTop: '40px' }}>Location</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <TextInput label="Address Line 1" value={companyData.addressLine1} onChange={e => setCompanyData({...companyData, addressLine1: e.target.value})} />
                                    <TextInput label="City" value={companyData.city} onChange={e => setCompanyData({...companyData, city: e.target.value})} />
                                    <TextInput label="State" value={companyData.state} onChange={e => setCompanyData({...companyData, state: e.target.value})} />
                                    <TextInput label="Postal Code" value={companyData.pincode} onChange={e => setCompanyData({...companyData, pincode: e.target.value})} />
                                </div>
                            </div>

                            {/* Logo Upload Section */}
                            <div style={{ 
                                padding: '24px', 
                                border: '1px solid var(--ui-border)', 
                                borderRadius: '12px', 
                                textAlign: 'center',
                                background: '#f8fafc',
                                maxHeight: '400px'
                            }}>
                                <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '16px', display: 'block' }}>Branding Logo</label>
                                <div style={{ 
                                    width: '120px', height: '120px', 
                                    margin: '0 auto 20px', 
                                    background: '#fff', 
                                    borderRadius: '12px', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '1px solid var(--ui-border)',
                                    overflow: 'hidden',
                                    padding: '8px'
                                }}>
                                    {logoPreview ? (
                                        <img 
                                            src={logoPreview.startsWith('blob') ? logoPreview : (logoPreview.startsWith('http') ? logoPreview : `${API.defaults.baseURL}${logoPreview}`)} 
                                            alt="Preview" 
                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                        />
                                    ) : <span style={{ fontSize: '12px', color: '#94a3b8' }}>No Logo</span>}
                                </div>
                                <input type="file" onChange={handleLogoChange} style={{ fontSize: '12px', width: '100%', marginBottom: '12px' }} accept="image/*" />
                                <p style={{ fontSize: '10px', color: 'var(--text-light)' }}>Recommended size 200x200px</p>
                            </div>
                        </div>
                        <div style={{ borderTop: '1px solid var(--ui-border)', marginTop: '40px', paddingTop: '24px', textAlign: 'right' }}>
                            <button type="submit" className="btn btn-primary" disabled={loading}>Update Company Info</button>
                        </div>
                    </form>
                )}

                {/* ─── TAB 2: OPERATIONAL SETTINGS (ADMIN ONLY) ─────────────── */}
                {activeTab === "settings" && isOwnerOrAdmin && (
                    <form onSubmit={handleUpdateCompany}>
                        <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '12px', color: 'var(--text-main)' }}>Late Arrival & Instance Policy</h3>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                            Configure the monthly late arrival allowances and grace period. Operating shift hours and break durations are dynamically configured under the <strong>Attendance &gt; Schedules &amp; Breaks</strong> module.
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "20px", marginBottom: "40px" }}>
                            <div>
                                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>Monthly Late Instances Limit (Count)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="30"
                                    value={attSettings.monthly_late_instances}
                                    onChange={e => setAttSettings({ ...attSettings, monthly_late_instances: parseInt(e.target.value) || 0 })}
                                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--ui-border)", background: "var(--ui-surface)", color: "var(--text-main)", boxSizing: "border-box" }}
                                    placeholder="e.g. 3"
                                />
                                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>Max allowed late arrivals per employee per month (e.g. 3 instances)</span>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>Late Grace Time (Minutes)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="180"
                                    value={attSettings.late_grace_minutes}
                                    onChange={e => setAttSettings({ ...attSettings, late_grace_minutes: parseInt(e.target.value) || 0 })}
                                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--ui-border)", background: "var(--ui-surface)", color: "var(--text-main)", boxSizing: "border-box" }}
                                    placeholder="e.g. 30"
                                />
                                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>Clocking in after Shift Start + Grace (e.g. 10:00 + 30m = 10:31 AM) counts as late instance</span>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>Max Late for Half Day (Minutes)</label>
                                <input
                                    type="number"
                                    min="0"
                                    max="480"
                                    value={attSettings.half_day_late_minutes ?? 120}
                                    onChange={e => setAttSettings({ ...attSettings, half_day_late_minutes: parseInt(e.target.value) || 0 })}
                                    style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid var(--ui-border)", background: "var(--ui-surface)", color: "var(--text-main)", boxSizing: "border-box" }}
                                    placeholder="e.g. 120"
                                />
                                <span style={{ fontSize: "11px", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>Arrival after Shift Start + this (e.g. 10:00 + 120m = 12:00 PM) directly marks as Half Day</span>
                            </div>
                        </div>

                        <h3 style={{ fontSize: '15px', fontWeight: '700', marginBottom: '24px', color: 'var(--text-main)' }}>Public Holidays</h3>
                        <div style={{ border: '1px solid var(--ui-border)', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ background: '#f8fafc', padding: '16px', display: 'flex', gap: '12px', borderBottom: '1px solid var(--ui-border)', flexWrap: 'wrap' }}>
                                <input type="date" value={newHoliday.date} onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--ui-border)', flex: 1, minWidth: '160px' }} />
                                <input type="text" placeholder="Holiday Title" value={newHoliday.title} onChange={e => setNewHoliday({...newHoliday, title: e.target.value})} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--ui-border)', flex: 2, minWidth: '200px' }} />
                                <button type="button" onClick={addHoliday} className="btn btn-primary">+ Add</button>
                            </div>
                            <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                {(companyData.holidays || []).map((h, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', borderBottom: i < companyData.holidays.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                        <span style={{ fontSize: '14px', fontWeight: '500' }}>{new Date(h.date).toDateString()} — {h.title}</span>
                                        <button type="button" onClick={() => removeHoliday(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: '700' }}>Remove</button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ marginTop: '40px', textAlign: 'right' }}>
                            <button type="submit" className="btn btn-primary">Save Operational Settings</button>
                        </div>
                    </form>
                )}

                {/* ─── TAB 3: COMPANY POLICIES (ACCESSIBLE TO ALL EMPLOYEES) ─── */}
                {activeTab === "policies" && (
                    <div>
                        {/* Section Header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "22px", flexWrap: "wrap", gap: "12px" }}>
                            <div>
                                <h3 style={{ fontSize: "19px", fontWeight: "800", color: "var(--text-main)", margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                                    <PolicyIcon size={22} color="var(--primary-color)" /> Company Policies & Team Guidelines
                                </h3>
                                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
                                    Official workplace rules, attendance policies, and standards for all employees at {companyData.companyName || "Padhya Soft"}.
                                </p>
                            </div>

                            {/* Only Admin can add policy */}
                            {isOwnerOrAdmin && (
                                <button
                                    type="button"
                                    onClick={handleOpenAddPolicy}
                                    style={{
                                        background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                                        color: "#ffffff",
                                        border: "none",
                                        padding: "9px 18px",
                                        borderRadius: "8px",
                                        fontWeight: "700",
                                        fontSize: "13px",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        boxShadow: "0 2px 8px rgba(99, 102, 241, 0.25)"
                                    }}
                                >
                                    <PlusIcon size={14} color="#fff" /> Add New Policy
                                </button>
                            )}
                        </div>

                        {/* Category Filter Chips & Search Bar */}
                        <div style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            gap: "12px", marginBottom: "24px", flexWrap: "wrap",
                            paddingBottom: "16px", borderBottom: "1px solid var(--ui-border)"
                        }}>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                {["All", "Leave & Attendance", "IT & Security", "Code of Conduct", "General"].map(cat => (
                                    <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setPolicyCategory(cat)}
                                        style={{
                                            padding: "6px 14px",
                                            borderRadius: "20px",
                                            border: policyCategory === cat ? "1.5px solid var(--primary-color)" : "1px solid var(--ui-border)",
                                            background: policyCategory === cat ? "var(--primary-light)" : "var(--ui-surface)",
                                            color: policyCategory === cat ? "var(--primary-color)" : "var(--text-muted)",
                                            fontWeight: policyCategory === cat ? "700" : "500",
                                            fontSize: "12.5px",
                                            cursor: "pointer",
                                            transition: "all 0.2s"
                                        }}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>

                            <div style={{ position: "relative", minWidth: "260px" }}>
                                <input
                                    type="text"
                                    placeholder="Search policies by keyword..."
                                    value={policySearch}
                                    onChange={(e) => setPolicySearch(e.target.value)}
                                    style={{
                                        padding: "8px 12px 8px 34px",
                                        borderRadius: "8px",
                                        border: "1px solid var(--ui-border)",
                                        background: "var(--ui-surface)",
                                        color: "var(--text-main)",
                                        fontSize: "13px",
                                        width: "100%",
                                        outline: "none"
                                    }}
                                />
                                <span style={{ position: "absolute", left: "11px", top: "10px", color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
                                    <SearchIcon size={14} color="var(--text-muted)" />
                                </span>
                            </div>
                        </div>

                        {/* Policies Cards Accordion */}
                        {filteredPolicies.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)" }}>
                                <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
                                    <ClipboardIcon size={42} color="var(--text-muted)" />
                                </div>
                                <h4 style={{ margin: "0 0 6px", fontSize: "16px", fontWeight: "700", color: "var(--text-main)" }}>No Policies Found</h4>
                                <p style={{ fontSize: "13px", maxWidth: "420px", margin: "0 auto" }}>
                                    {policySearch ? "No policies match your search query." : "No company policies have been published yet."}
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                {filteredPolicies.map((policy, idx) => {
                                    const isExpanded = expandedPolicyId === (policy._id || idx);
                                    const badge = getCategoryBadge(policy.category);

                                    return (
                                        <div
                                            key={policy._id || idx}
                                            style={{
                                                background: "var(--ui-surface)",
                                                border: "1.5px solid var(--ui-border)",
                                                borderRadius: "12px",
                                                overflow: "hidden",
                                                transition: "all 0.2s ease",
                                                boxShadow: isExpanded ? "0 4px 16px rgba(0,0,0,0.06)" : "none"
                                            }}
                                        >
                                            {/* Policy Card Header */}
                                            <div
                                                onClick={() => toggleExpandPolicy(policy._id || idx)}
                                                style={{
                                                    padding: "16px 20px",
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    cursor: "pointer",
                                                    background: isExpanded ? "rgba(99, 102, 241, 0.03)" : "transparent",
                                                    borderBottom: isExpanded ? "1px solid var(--ui-border)" : "none",
                                                    gap: "14px"
                                                }}
                                            >
                                                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                                                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                                                        <span style={{
                                                            fontSize: "11px",
                                                            fontWeight: "800",
                                                            padding: "3px 10px",
                                                            borderRadius: "12px",
                                                            background: badge.bg,
                                                            color: badge.color,
                                                            border: `1px solid ${badge.border}`,
                                                            textTransform: "uppercase",
                                                            letterSpacing: "0.5px"
                                                        }}>
                                                            {policy.category || "General"}
                                                        </span>

                                                        <h4 style={{ fontSize: "15.5px", fontWeight: "700", color: "var(--text-main)", margin: 0 }}>
                                                            {policy.title}
                                                        </h4>

                                                        {policy.status === "Draft" && (
                                                            <span style={{ fontSize: "10.5px", background: "#fef3c7", color: "#b45309", padding: "2px 8px", borderRadius: "10px", fontWeight: "700" }}>
                                                                DRAFT
                                                            </span>
                                                        )}
                                                    </div>

                                                    {policy.summary && (
                                                        <p style={{ margin: 0, fontSize: "13px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                                                            {policy.summary}
                                                        </p>
                                                    )}
                                                </div>

                                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }} onClick={e => e.stopPropagation()}>
                                                    <span style={{ fontSize: "12px", color: "var(--text-light)", fontWeight: "500", whiteSpace: "nowrap" }}>
                                                        Effective: {policy.effectiveDate ? new Date(policy.effectiveDate).toLocaleDateString("en-GB") : "Immediate"}
                                                    </span>

                                                    {/* Admin only Action Buttons */}
                                                    {isOwnerOrAdmin && (
                                                        <div className="action-buttons" style={{ display: "flex", gap: "6px" }}>
                                                            <button
                                                                type="button"
                                                                className="action-btn"
                                                                onClick={() => handleOpenEditPolicy(policy)}
                                                                title="Edit Policy"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M12 20h9" />
                                                                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                                                </svg>
                                                            </button>

                                                            <button
                                                                type="button"
                                                                className="action-btn delete"
                                                                onClick={() => handleDeletePolicy(policy._id)}
                                                                title="Delete Policy"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M3 6h18" />
                                                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => toggleExpandPolicy(policy._id || idx)}
                                                        style={{
                                                            background: "none",
                                                            border: "none",
                                                            color: "var(--primary-color)",
                                                            cursor: "pointer",
                                                            padding: "4px",
                                                            display: "flex",
                                                            alignItems: "center"
                                                        }}
                                                    >
                                                        {isExpanded ? <ChevronUpIcon size={16} /> : <ChevronDownIcon size={16} />}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Expanded Full Policy Clauses */}
                                            {isExpanded && (
                                                <div style={{
                                                    padding: "20px 24px",
                                                    background: "var(--ui-surface)",
                                                    fontSize: "13.5px",
                                                    color: "var(--text-main)",
                                                    lineHeight: 1.7,
                                                    whiteSpace: "pre-line"
                                                }}>
                                                    <div style={{
                                                        background: "#f8fafc",
                                                        padding: "16px 20px",
                                                        borderRadius: "8px",
                                                        border: "1px solid #e2e8f0",
                                                        fontFamily: "inherit"
                                                    }}>
                                                        {policy.content}
                                                    </div>

                                                    <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", color: "var(--text-light)" }}>
                                                        <span>Published by: <strong>{policy.updatedBy || "Company Admin"}</strong></span>
                                                        <span>Last revised: {policy.updatedAt ? new Date(policy.updatedAt).toLocaleDateString("en-GB") : "Recently"}</span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ─── MODAL: ADD / EDIT POLICY (ADMIN ONLY) ────────────────────── */}
            {showPolicyModal && isOwnerOrAdmin && (
                <div style={{
                    position: "fixed",
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: "rgba(15, 23, 42, 0.65)",
                    backdropFilter: "blur(4px)",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    zIndex: 10000,
                    padding: "20px"
                }}>
                    <div style={{
                        background: "var(--ui-surface)",
                        borderRadius: "14px",
                        width: "100%",
                        maxWidth: "680px",
                        maxHeight: "90vh",
                        overflowY: "auto",
                        boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)",
                        border: "1px solid var(--ui-border)"
                    }}>
                        <div style={{
                            padding: "20px 24px",
                            borderBottom: "1px solid var(--ui-border)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                        }}>
                            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
                                {editingPolicy ? <EditIcon size={18} color="var(--primary-color)" /> : <PolicyIcon size={18} color="var(--primary-color)" />}
                                {editingPolicy ? "Edit Company Policy" : "Add New Company Policy"}
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowPolicyModal(false)}
                                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center" }}
                            >
                                <CloseIcon size={18} />
                            </button>
                        </div>

                        <form noValidate onSubmit={handleSavePolicy} style={{ padding: "24px" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>
                                        Policy Title <span style={{ color: "#ef4444" }}>*</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Workplace Attendance & Timesheet Policy"
                                        required
                                        value={policyForm.title}
                                        onChange={(e) => {
                                            setPolicyForm({ ...policyForm, title: e.target.value });
                                            if (policyFieldErrors.title) setPolicyFieldErrors(prev => ({ ...prev, title: null }));
                                        }}
                                        style={{
                                            width: "100%", padding: "9px 12px", borderRadius: "8px",
                                            border: policyFieldErrors.title ? "1px solid #ef4444" : "1px solid var(--ui-border)",
                                            background: "var(--ui-surface)",
                                            color: "var(--text-main)", fontSize: "13.5px", outline: "none"
                                        }}
                                    />
                                    {policyFieldErrors.title && (
                                        <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                            {policyFieldErrors.title}
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                    <div>
                                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>
                                            Category
                                        </label>
                                        <select
                                            value={policyForm.category}
                                            onChange={(e) => setPolicyForm({ ...policyForm, category: e.target.value })}
                                            style={{
                                                width: "100%", padding: "9px 12px", borderRadius: "8px",
                                                border: "1px solid var(--ui-border)", background: "var(--ui-surface)",
                                                color: "var(--text-main)", fontSize: "13.5px", outline: "none"
                                            }}
                                        >
                                            <option value="General">General</option>
                                            <option value="Leave & Attendance">Leave & Attendance</option>
                                            <option value="IT & Security">IT & Security</option>
                                            <option value="Code of Conduct">Code of Conduct</option>
                                            <option value="Remote Work">Remote Work</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>
                                            Effective Date
                                        </label>
                                        <input
                                            type="date"
                                            value={policyForm.effectiveDate}
                                            onChange={(e) => setPolicyForm({ ...policyForm, effectiveDate: e.target.value })}
                                            style={{
                                                width: "100%", padding: "8px 12px", borderRadius: "8px",
                                                border: "1px solid var(--ui-border)", background: "var(--ui-surface)",
                                                color: "var(--text-main)", fontSize: "13.5px", outline: "none"
                                            }}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>
                                        Brief Summary (1-2 sentences for team preview)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Quick overview for staff at a glance"
                                        value={policyForm.summary}
                                        onChange={(e) => setPolicyForm({ ...policyForm, summary: e.target.value })}
                                        style={{
                                            width: "100%", padding: "9px 12px", borderRadius: "8px",
                                            border: "1px solid var(--ui-border)", background: "var(--ui-surface)",
                                            color: "var(--text-main)", fontSize: "13.5px", outline: "none"
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: "700", color: "var(--text-main)", marginBottom: "6px" }}>
                                        Full Policy Content & Clauses <span style={{ color: "#ef4444" }}>*</span>
                                    </label>
                                    <textarea
                                        rows="8"
                                        placeholder="Enter the numbered clauses, expectations, and regulations for all team members..."
                                        required
                                        value={policyForm.content}
                                        onChange={(e) => {
                                            setPolicyForm({ ...policyForm, content: e.target.value });
                                            if (policyFieldErrors.content) setPolicyFieldErrors(prev => ({ ...prev, content: null }));
                                        }}
                                        style={{
                                            width: "100%", padding: "10px 12px", borderRadius: "8px",
                                            border: policyFieldErrors.content ? "1px solid #ef4444" : "1px solid var(--ui-border)",
                                            background: "var(--ui-surface)",
                                            color: "var(--text-main)", fontSize: "13.5px", outline: "none",
                                            lineHeight: 1.6, resize: "vertical"
                                        }}
                                    />
                                    {policyFieldErrors.content && (
                                        <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                            {policyFieldErrors.content}
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <label style={{ fontSize: "12.5px", fontWeight: "700", color: "var(--text-main)" }}>
                                        Status:
                                    </label>
                                    <select
                                        value={policyForm.status}
                                        onChange={(e) => setPolicyForm({ ...policyForm, status: e.target.value })}
                                        style={{
                                            padding: "6px 12px", borderRadius: "6px",
                                            border: "1px solid var(--ui-border)", background: "var(--ui-surface)",
                                            color: "var(--text-main)", fontSize: "13px"
                                        }}
                                    >
                                        <option value="Active">Active (Visible to Staff)</option>
                                        <option value="Draft">Draft (Work in progress)</option>
                                    </select>
                                </div>
                            </div>

                            <div style={{
                                marginTop: "24px", paddingTop: "18px", borderTop: "1px solid var(--ui-border)",
                                display: "flex", justifyContent: "flex-end", gap: "12px"
                            }}>
                                <button
                                    type="button"
                                    onClick={() => setShowPolicyModal(false)}
                                    style={{
                                        padding: "9px 18px", borderRadius: "8px", border: "1px solid var(--ui-border)",
                                        background: "#f1f5f9", color: "#475569", fontWeight: "700", cursor: "pointer"
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={policySaving}
                                    style={{
                                        padding: "9px 20px", borderRadius: "8px", border: "none",
                                        background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                                        color: "#ffffff", fontWeight: "700", cursor: "pointer"
                                    }}
                                >
                                    {policySaving ? "Saving..." : (editingPolicy ? "Update Policy" : "Publish Policy")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
