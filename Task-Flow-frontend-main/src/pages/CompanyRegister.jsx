import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { CloseIcon } from "../components/common/Icons";
import "../style/login.css";

const SectionBadge = ({ number, title }) => (
    <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        marginBottom: "12px", marginTop: "20px"
    }}>
        <div style={{
            width: "28px", height: "28px", borderRadius: "8px", 
            background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "14px", fontWeight: "800", boxShadow: "0 4px 10px rgba(99, 102, 241, 0.3)"
        }}>
            {number}
        </div>
        <h3 style={{ fontSize: "17px", fontWeight: "900", color: "#0f172a", margin: 0, letterSpacing: "-0.5px" }}>
            {title}
        </h3>
        <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, #f1f5f9, transparent)" }}></div>
    </div>
);

export default function CompanyRegister() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const { login } = useAuth();
    const [loading, setLoading] = useState(false);
    const [logo, setLogo] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});

    const [form, setForm] = useState({
        companyName: "",
        gstNumber: "",
        panNumber: "",
        contactPersonName: "",
        contactPersonPhone: "",
        contactPersonEmail: "",
        email: "",
        phone: "",
        addressLine1: "",
        addressLine2: "",
        country: "India",
        state: "",
        city: "",
        pincode: "",
        password: "",
        confirmPassword: ""
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (fieldErrors[name]) {
            setFieldErrors(prev => ({ ...prev, [name]: null }));
        }
        if (name.toLowerCase().includes("phone") || name === "pincode") {
            const onlyNums = value.replace(/[^0-9]/g, "");
            const maxLen = name === "pincode" ? 6 : 10;
            if (onlyNums.length <= maxLen) setForm({ ...form, [name]: onlyNums });
            return;
        }
        if (name === "gstNumber" && value.length > 15) return;
        if (name === "panNumber" && value.length > 10) return;
        setForm({ ...form, [name]: value });
    };

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setLogo(file);
            const reader = new FileReader();
            reader.onloadend = () => setLogoPreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFieldErrors({});
        if (form.password !== form.confirmPassword) {
            setFieldErrors(prev => ({ ...prev, confirmPassword: "Passwords do not match" }));
            return showToast("Passwords do not match", "error");
        }

        setLoading(true);
        try {
            const formData = new FormData();
            Object.keys(form).forEach(key => {
                if (key !== 'confirmPassword') {
                    let val = form[key];
                    if (key === 'contactPersonEmail' && !val) {
                        val = form.email;
                    }
                    formData.append(key, ['gstNumber', 'panNumber'].includes(key) && val ? val.toUpperCase() : val);
                }
            });
            if (logo) formData.append("appLogo", logo);

            const res = await API.post("/companies/register", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            if (res.data.token) localStorage.setItem("token", res.data.token);
            if (res.data.staff) login(res.data.staff);
            showToast("Registration Successful!");
            navigate("/profile?tab=subscription&new=1");
        } catch (err) {
            const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || "Registration failed";
            if (errMsg.toLowerCase().includes("company name")) {
                setFieldErrors(prev => ({ ...prev, companyName: "Plese enter company name" }));
            }
            if (errMsg.toLowerCase().includes("email")) {
                setFieldErrors(prev => ({ ...prev, email: "Plese enter email" }));
            }
            if (errMsg.toLowerCase().includes("contact person name") || errMsg.toLowerCase().includes("contact person")) {
                setFieldErrors(prev => ({ ...prev, contactPersonName: "Plese enter contact person name" }));
            }
            if (errMsg.toLowerCase().includes("phone")) {
                setFieldErrors(prev => ({ ...prev, contactPersonPhone: "Plese enter contact phone" }));
            }
            if (errMsg.toLowerCase().includes("password")) {
                setFieldErrors(prev => ({ ...prev, password: "Plese enter password" }));
            }
            showToast(errMsg, "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="split-page">
            {/* LEFT PANEL: PREMIUM BRANDING */}
        <div className="split-left" style={{ flex: 0.7, background: "linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)", padding: "40px" }}>
                {/* Animated Background Orbs */}
                <div style={{ position: "absolute", top: "-15%", left: "-10%", width: "500px", height: "500px", background: "radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)", filter: "blur(40px)", animation: "floatHero 10s infinite alternate" }}></div>
                <div style={{ position: "absolute", bottom: "-10%", right: "-20%", width: "600px", height: "600px", background: "radial-gradient(circle, rgba(168,85,247,0.25) 0%, transparent 70%)", filter: "blur(60px)", animation: "floatHero 15s infinite alternate-reverse" }}></div>

                <div style={{ position: "relative", zIndex: 10 }}>
                    <div style={{ background: "rgba(255,255,255,0.95)", padding: "8px 18px", borderRadius: "12px", display: "inline-block", marginBottom: "36px" }}>
                        <img 
                            src="/padhya-logo.webp" 
                            alt="Padhya Software Technologies" 
                            style={{ height: "34px", display: "block" }} 
                        />
                    </div>

                    <div style={{
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                        padding: "6px 14px", borderRadius: "30px", fontSize: "11px", fontWeight: "800",
                        textTransform: "uppercase", letterSpacing: "1.5px", width: "fit-content", marginBottom: "20px",
                        backdropFilter: "blur(10px)", color: "#c7d2fe"
                    }}>
                        Setup Workspace
                    </div>

                    <h1 style={{ fontSize: "42px", fontWeight: "900", marginBottom: "20px", lineHeight: "1", letterSpacing: "-1.5px", color: "#fff" }}>
                        Engineered for <br />
                        <span style={{ 
                            color: "#fff", 
                            background: "linear-gradient(to right, #818cf8, #c084fc)", 
                            WebkitBackgroundClip: "text", 
                            WebkitTextFillColor: "transparent",
                            textShadow: "0 0 30px rgba(129, 140, 248, 0.4)"
                        }}>
                            High-Performance
                        </span> Teams.
                    </h1>

                    <p style={{ fontSize: "16px", lineHeight: "1.6", color: "rgba(255, 255, 255, 0.7)", marginBottom: "40px", maxWidth: "450px" }}>
                        Establish your corporate workspace in minutes. Invite your staff, assign roles, and start shipping.
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {[
                            { title: "Centralized Staff Management", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                            { title: "Enterprise-grade Security", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> },
                            { title: "Real-time Auditing & Reports", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
                        ].map((item, i) => (
                            <div key={i} className="feature-item-hover" style={{ 
                                display: "flex", alignItems: "center", gap: "16px", 
                                background: "rgba(255,255,255,0.05)", padding: "14px 18px", 
                                borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", 
                                backdropFilter: "blur(5px)", transition: "all 0.3s ease", cursor: "default"
                            }}>
                                <div style={{ 
                                    width: "40px", height: "40px", borderRadius: "10px", 
                                    background: "rgba(99,102,241,0.25)", display: "flex", 
                                    alignItems: "center", justifyContent: "center",
                                    boxShadow: "0 4px 15px rgba(0,0,0,0.1)"
                                }}>
                                    {item.icon}
                                </div>
                                <span style={{ fontWeight: "700", fontSize: "15px", color: "#f8fafc", letterSpacing: "-0.2px" }}>{item.title}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL: FORM */}
            <div className="split-right" style={{ background: "#f8fafc", flex: 1.3 }}>
                <div className="split-card" style={{ padding: "40px 50px" }}>
                    <h2 style={{ fontSize: "30px", letterSpacing: "-1px", color: "#0f172a", marginBottom: "8px", fontWeight: "900" }}>Register Organization</h2>
                    <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "30px" }}>Complete the details below to initialize your admin profile.</p>

                    <form noValidate onSubmit={handleSubmit}>

                        <SectionBadge number="1" title="Company Details" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                            <div className="form-group" style={{ gridColumn: "span 2" }}>
                                <label className="input-label">Company Legal Name <span style={{ color: "#ef4444" }}>*</span></label>
                                <input
                                    className="input-field"
                                    name="companyName"
                                    value={form.companyName}
                                    onChange={handleChange}
                                    placeholder="e.g. Acme Innovations Pvt Ltd"
                                    style={fieldErrors.companyName ? { borderColor: "#ef4444" } : {}}
                                />
                                {fieldErrors.companyName && (
                                    <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                        {fieldErrors.companyName}
                                    </div>
                                )}
                            </div>
                            <div className="form-group">
                                <label className="input-label">GST Number</label>
                                <input className="input-field" name="gstNumber" value={form.gstNumber} onChange={handleChange} maxLength={15} placeholder="22AAAAA0000A1Z5" />
                            </div>
                            <div className="form-group">
                                <label className="input-label">PAN Number</label>
                                <input className="input-field" name="panNumber" value={form.panNumber} onChange={handleChange} maxLength={10} placeholder="ABCDE1234F" />
                            </div>
                            <div className="form-group" style={{ gridColumn: "span 2" }}>
                                <label className="input-label">Company Email (Workspace Admin Login) <span style={{ color: "#ef4444" }}>*</span></label>
                                <input
                                    className="input-field"
                                    type="email"
                                    name="email"
                                    value={form.email}
                                    onChange={handleChange}
                                    placeholder="admin@yourcompany.com"
                                    style={{
                                        background: "#e0e7ff",
                                        borderColor: fieldErrors.email ? "#ef4444" : "#c7d2fe",
                                        color: "#312e81"
                                    }}
                                />
                                {fieldErrors.email && (
                                    <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                        {fieldErrors.email}
                                    </div>
                                )}
                            </div>
                        </div>

                        <SectionBadge number="2" title="Contact Person & Security" />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#f1f5f9", padding: "12px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="input-label">Manager / Admin Name <span style={{ color: "#ef4444" }}>*</span></label>
                                <input
                                    className="input-field"
                                    style={{ background: "#fff", ...(fieldErrors.contactPersonName ? { borderColor: "#ef4444" } : {}) }}
                                    name="contactPersonName"
                                    value={form.contactPersonName}
                                    onChange={handleChange}
                                    placeholder="John Doe"
                                />
                                {fieldErrors.contactPersonName && (
                                    <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                        {fieldErrors.contactPersonName}
                                    </div>
                                )}
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="input-label">Contact Phone <span style={{ color: "#ef4444" }}>*</span></label>
                                <input
                                    className="input-field"
                                    style={{ background: "#fff", ...(fieldErrors.contactPersonPhone ? { borderColor: "#ef4444" } : {}) }}
                                    type="tel"
                                    name="contactPersonPhone"
                                    value={form.contactPersonPhone}
                                    onChange={handleChange}
                                    maxLength={10}
                                    placeholder="10 Digit Number"
                                />
                                {fieldErrors.contactPersonPhone && (
                                    <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                        {fieldErrors.contactPersonPhone}
                                    </div>
                                )}
                            </div>
                            <div className="form-group" style={{ marginBottom: 0, position: "relative" }}>
                                <label className="input-label">Admin Password <span style={{ color: "#ef4444" }}>*</span></label>
                                <input
                                    className="input-field"
                                    style={{ background: "#fff", paddingRight: "40px", ...(fieldErrors.password ? { borderColor: "#ef4444" } : {}) }}
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    value={form.password}
                                    onChange={handleChange}
                                    placeholder="••••••••"
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: "12px", top: "32px", background: "none", border: "none", cursor: "pointer", color: "#6366f1", display: "flex", alignItems: "center" }}>
                                    {showPassword ? (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    )}
                                </button>
                                {fieldErrors.password && (
                                    <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                        {fieldErrors.password}
                                    </div>
                                )}
                            </div>
                            <div className="form-group" style={{ marginBottom: 0, position: "relative" }}>
                                <label className="input-label">Confirm Password <span style={{ color: "#ef4444" }}>*</span></label>
                                <input
                                    className="input-field"
                                    style={{ background: "#fff", paddingRight: "40px", ...(fieldErrors.confirmPassword ? { borderColor: "#ef4444" } : {}) }}
                                    type={showConfirmPassword ? "text" : "password"}
                                    name="confirmPassword"
                                    value={form.confirmPassword}
                                    onChange={handleChange}
                                    placeholder="••••••••"
                                />
                                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: "absolute", right: "12px", top: "32px", background: "none", border: "none", cursor: "pointer", color: "#6366f1", display: "flex", alignItems: "center" }}>
                                    {showConfirmPassword ? (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    ) : (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                                    )}
                                </button>
                                {fieldErrors.confirmPassword && (
                                    <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                                        {fieldErrors.confirmPassword}
                                    </div>
                                )}
                            </div>
                        </div>

                        <SectionBadge number="3" title="Headquarters" />
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                            <div className="form-group" style={{ gridColumn: "span 3" }}>
                                <label className="input-label">Full Address *</label>
                                <input className="input-field" name="addressLine1" value={form.addressLine1} onChange={handleChange} required placeholder="Building, Street, Area" />
                            </div>
                            <div className="form-group">
                                <label className="input-label">City *</label>
                                <input className="input-field" name="city" value={form.city} onChange={handleChange} required placeholder="Mumbai" />
                            </div>
                            <div className="form-group">
                                <label className="input-label">State *</label>
                                <input className="input-field" name="state" value={form.state} onChange={handleChange} required placeholder="Maharashtra" />
                            </div>
                            <div className="form-group">
                                <label className="input-label">Pincode *</label>
                                <input className="input-field" type="tel" name="pincode" value={form.pincode} onChange={handleChange} required maxLength={6} placeholder="400001" />
                            </div>
                        </div>

                        <SectionBadge number="4" title="Brand Logo" />
                        <div style={{ padding: "30px", background: "#fff", borderRadius: "20px", border: "2px dashed #cbd5e1", textAlign: "center", transition: "0.2s" }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files[0]) { handleLogoChange({ target: { files: e.dataTransfer.files } }) } }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                                {logoPreview ? (
                                    <div style={{ position: "relative" }}>
                                        <img src={logoPreview} alt="Preview" style={{ width: "120px", height: "120px", objectFit: "contain", borderRadius: "16px", background: "#f8fafc", padding: "10px", boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)" }} />
                                        <button type="button" onClick={() => { setLogo(null); setLogoPreview(null); }} style={{ position: "absolute", top: "-10px", right: "-10px", width: "28px", height: "28px", borderRadius: "50%", background: "#ef4444", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><CloseIcon size={14} color="#fff" /></button>
                                    </div>
                                ) : (
                                    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                                        <input type="file" accept="image/*" onChange={handleLogoChange} style={{ opacity: 0, position: "absolute", inset: 0, cursor: "pointer", zIndex: 10 }} />
                                        <div style={{ width: "60px", height: "60px", background: "#f1f5f9", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "12px", color: "#64748b" }}>
                                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                                        </div>
                                        <div style={{ color: "#475569", fontWeight: "700", fontSize: "15px" }}>Click to upload branding logo</div>
                                        <div style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>PNG, JPG or SVG (Max 5MB)</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ marginTop: "25px", borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}>
                            <button className="submit-button" type="submit" disabled={loading} style={{ height: "48px", fontSize: "14px", borderRadius: "10px", textTransform: "uppercase", letterSpacing: "1px" }}>
                                {loading ? "INITIALIZING..." : "CREATE WORKSPACE"}
                                {!loading && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7" /></svg>}
                            </button>

                            <div style={{ textAlign: "center", marginTop: "24px", fontSize: "15px", fontWeight: "600", color: "#64748b" }}>
                                Already registered? <span onClick={() => navigate("/login")} style={{ color: "#6366f1", cursor: "pointer", textDecoration: "underline" }}>Sign in to your workspace</span>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
