import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import API from "../api/api";
import { useToast } from "../contexts/ToastContext";
import { CloseIcon } from "../components/common/Icons";
import "../style/login.css";

const FeatureBox = ({ icon, title, desc }) => (
    <div className="feature-box">
        <div className="feature-icon-circle">{icon}</div>
        <h3>{title}</h3>
        <p>{desc}</p>
    </div>
);

export default function Login() {
    const navigate = useNavigate();
    const { user, login: setAuthUser } = useAuth();
    const { showToast } = useToast();
    useEffect(() => {
        if (user) {
            navigate("/");
        }
    }, [user, navigate]);

    const [loginForm, setLoginForm] = useState({ email: "", password: "" });
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [showLoginForm, setShowLoginForm] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('reveal-visible');
                }
            });
        }, { threshold: 0.1 });

        const hiddenElements = document.querySelectorAll('.reveal-hidden');
        hiddenElements.forEach((el) => observer.observe(el));

        return () => observer.disconnect();
    }, []);

    const login = async (e) => {
        e.preventDefault();
        const errs = {};
        if (!loginForm.email || !loginForm.email.trim()) {
            errs.email = "Email address is required";
        }
        if (!loginForm.password) {
            errs.password = "Password is required";
        }
        if (Object.keys(errs).length > 0) {
            setFieldErrors(errs);
            return;
        }
        setFieldErrors({});
        setLoading(true);
        try {
            const res = await API.post("/auth/login", loginForm);
            const user = res.data.user;
            const token = res.data.token;
            if (token) localStorage.setItem("token", token);
            
            setAuthUser(user);
            showToast("Login Successful!");
            navigate("/");
        } catch (err) {
            showToast(err.response?.data?.error || "Invalid Credentials", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            {/* STICKY HEADER */}
            <header className="landing-header animate-fade-down">
                <div className="landing-logo" style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "14px" }} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                    <img 
                        src="/padhya-logo.webp" 
                        alt="Padhya Software Technologies" 
                        style={{ height: "46px", maxWidth: "230px", objectFit: "contain" }} 
                    />
                    <span style={{ 
                        fontSize: "11px", 
                        fontWeight: "800", 
                        background: "rgba(30, 79, 163, 0.1)", 
                        color: "#1E4FA3", 
                        padding: "4px 10px", 
                        borderRadius: "6px", 
                        letterSpacing: "1px", 
                        textTransform: "uppercase" 
                    }}>
                        Employee Portal
                    </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                    <nav className="header-nav-links" style={{ gap: "24px" }}>
                        <a 
                            href="#modules" 
                            style={{ textDecoration: "none", color: "#475569", fontWeight: "600", fontSize: "14px", transition: "color 0.2s" }}
                            onMouseEnter={(e) => e.target.style.color = "#1E4FA3"}
                            onMouseLeave={(e) => e.target.style.color = "#475569"}
                        >
                            Modules
                        </a>
                        <a 
                            href="#roles" 
                            style={{ textDecoration: "none", color: "#475569", fontWeight: "600", fontSize: "14px", transition: "color 0.2s" }}
                            onMouseEnter={(e) => e.target.style.color = "#1E4FA3"}
                            onMouseLeave={(e) => e.target.style.color = "#475569"}
                        >
                            Roles
                        </a>
                        <a 
                            href="#support" 
                            style={{ textDecoration: "none", color: "#475569", fontWeight: "600", fontSize: "14px", transition: "color 0.2s" }}
                            onMouseEnter={(e) => e.target.style.color = "#1E4FA3"}
                            onMouseLeave={(e) => e.target.style.color = "#475569"}
                        >
                            IT &amp; HR Helpdesk
                        </a>
                    </nav>

                    <button
                        type="button"
                        className="header-login-btn"
                        style={{ background: "linear-gradient(135deg, #1E4FA3 0%, #2F6FD6 100%)", boxShadow: "0 4px 14px rgba(30, 79, 163, 0.3)" }}
                        onClick={() => setShowLoginForm(true)}
                    >
                        Employee Login
                    </button>
                </div>
            </header>

            {/* FULLSCREEN LOGIN MODAL */}
            {showLoginForm && (
                <div style={{
                    position: "fixed", inset: 0, background: "rgba(10, 25, 60, 0.75)",
                    backdropFilter: "blur(10px)", display: "flex", alignItems: "center",
                    justifyContent: "center", zIndex: 9999
                }}>
                    <div style={{
                        maxWidth: "460px", width: "90%", background: "var(--ui-surface, #fff)",
                        padding: "40px", borderRadius: "24px", position: "relative",
                        animation: "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                        boxShadow: "0 30px 60px -12px rgba(10, 25, 60, 0.35)",
                        border: "1px solid var(--ui-border, #e2e8f0)"
                    }}>
                        <button
                            type="button"
                            onClick={() => setShowLoginForm(false)}
                            aria-label="Close login form"
                            title="Close"
                            style={{
                                position: "absolute", top: "20px", right: "20px",
                                background: "var(--ui-bg, #f1f5f9)", border: "none", width: "36px", height: "36px",
                                borderRadius: "50%", cursor: "pointer",
                                color: "var(--text-muted, #64748b)", display: "flex", alignItems: "center", justifyContent: "center"
                            }}
                        ><CloseIcon size={16} /></button>

                        <div style={{ textAlign: "center", marginBottom: "26px", marginTop: "6px" }}>
                            <img 
                                src="/padhya-favicon.svg" 
                                alt="Padhya" 
                                style={{ width: "48px", height: "48px", margin: "0 auto 14px", display: "block" }} 
                            />
                            <h2 style={{ fontSize: "26px", fontWeight: "900", color: "var(--text-main, #0f172a)" }}>Employee Login</h2>
                            <p style={{ color: "var(--text-muted, #64748b)", marginTop: "6px", fontSize: "14px" }}>
                                Sign in with your company email to access your workspace.
                            </p>
                        </div>

                        <form onSubmit={login}>
                            <div className="form-group">
                                <label className="input-label">Company Email</label>
                                <input
                                    className="input-field"
                                    type="email"
                                    placeholder="name@padhyasoft.com"
                                    required
                                    autoFocus
                                    value={loginForm.email}
                                    onChange={(e) => {
                                        setLoginForm({ ...loginForm, email: e.target.value });
                                        if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: "" }));
                                    }}
                                    style={fieldErrors.email ? { borderColor: "#ef4444", background: "#fff5f5" } : {}}
                                />
                                {fieldErrors.email && (
                                    <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                                        {fieldErrors.email}
                                    </span>
                                )}
                            </div>

                            <div className="form-group">
                                <label className="input-label">Password</label>
                                <div style={{ position: "relative" }}>
                                    <input
                                        className="input-field"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="••••••••"
                                        required
                                        value={loginForm.password}
                                        onChange={(e) => {
                                            setLoginForm({ ...loginForm, password: e.target.value });
                                            if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: "" }));
                                        }}
                                        style={{ paddingRight: "45px", ...(fieldErrors.password ? { borderColor: "#ef4444", background: "#fff5f5" } : {}) }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                        title={showPassword ? "Hide password" : "Show password"}
                                        style={{
                                            position: "absolute", right: "12px", top: "50%",
                                            transform: "translateY(-50%)", background: "none",
                                            border: "none", cursor: "pointer", color: "#64748b",
                                            display: "flex", alignItems: "center", justifyContent: "center"
                                        }}
                                    >
                                        {showPassword ? (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
                                            </svg>
                                        ) : (
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                                {fieldErrors.password && (
                                    <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                                        {fieldErrors.password}
                                    </span>
                                )}
                                <span onClick={() => { setShowLoginForm(false); navigate("/forgot-password"); showToast("Contact HR or use reset password link.", "info"); }} className="forgot-password-link">
                                    Forgot password?
                                </span>
                            </div>

                            <button 
                                className="submit-button" 
                                type="submit" 
                                disabled={loading} 
                                style={{ 
                                    marginTop: "16px", 
                                    background: "linear-gradient(135deg, #1E4FA3 0%, #2F6FD6 100%)",
                                    boxShadow: "0 6px 20px rgba(30, 79, 163, 0.3)"
                                }}
                            >
                                {loading ? "Signing in..." : "Sign In to Employee Portal"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* HERO SECTION */}
            <section className="hero-sec" style={{ position: "relative", overflow: "hidden", background: "radial-gradient(ellipse at 50% 0%, #e9f2ff 0%, #ffffff 75%)", paddingBottom: "70px" }}>
                <div className="hero-blob blob-1" style={{ background: "radial-gradient(circle, rgba(47,111,214,0.18) 0%, transparent 70%)" }}></div>
                <div className="hero-blob blob-2" style={{ background: "radial-gradient(circle, rgba(30,79,163,0.15) 0%, transparent 70%)" }}></div>
                <div className="hero-content-wrapper">
                    <div className="animate-fade-up" style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 18px", borderRadius: "100px", background: "rgba(30, 79, 163, 0.08)", border: "1px solid rgba(30, 79, 163, 0.2)", color: "#1E4FA3", fontSize: "13px", fontWeight: "700", marginBottom: "24px", letterSpacing: "0.5px" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#2F6FD6", display: "inline-block" }}></span>
                        INTERNAL WORKSPACE • PADHYA SOFTWARE TECHNOLOGIES
                    </div>
                    
                    <h1 className="animate-fade-up" style={{ fontSize: "clamp(2.4rem, 4.8vw, 56px)", fontWeight: "900", letterSpacing: "-0.03em", lineHeight: "1.15", maxWidth: "940px", margin: "0 auto 20px" }}>
                        Unified Workspace for <span style={{ background: "linear-gradient(120deg, #1E4FA3, #2F6FD6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Padhya Software Team</span>
                    </h1>

                    <p className="animate-fade-up delay-100" style={{ fontSize: "19px", color: "#475569", maxWidth: "760px", margin: "0 auto 36px", lineHeight: "1.65" }}>
                        Manage daily sprint tasks, update project milestones, apply for leaves, access technical documentation, and collaborate seamlessly across all departments.
                    </p>

                    <div className="hero-cta animate-scale-in delay-200" style={{ display: "flex", gap: "16px", justifyContent: "center", flexWrap: "wrap" }}>
                        <button 
                            onClick={() => setShowLoginForm(true)} 
                            className="primary-cta" 
                            style={{ 
                                background: "linear-gradient(135deg, #1E4FA3 0%, #2F6FD6 100%)",
                                boxShadow: "0 8px 24px rgba(30, 79, 163, 0.35)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "10px",
                                padding: "16px 36px",
                                borderRadius: "14px",
                                fontSize: "16px",
                                fontWeight: "700",
                                border: "none",
                                color: "#fff",
                                cursor: "pointer",
                                transition: "all 0.3s ease"
                            }}
                        >
                            Sign In to Employee Portal
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                        <button 
                            onClick={() => {
                                const el = document.getElementById("modules");
                                if (el) el.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="secondary-cta"
                            style={{
                                padding: "16px 32px",
                                borderRadius: "14px",
                                fontSize: "16px",
                                fontWeight: "700",
                                background: "#fff",
                                color: "#1E4FA3",
                                border: "2px solid rgba(30, 79, 163, 0.25)",
                                cursor: "pointer",
                                transition: "all 0.3s ease"
                            }}
                        >
                            View Internal Modules
                        </button>
                    </div>

                    {/* INTERNAL WORKSPACE STRIP */}
                    <div style={{ 
                        display: "flex", 
                        justifyContent: "center", 
                        gap: "40px", 
                        flexWrap: "wrap", 
                        marginTop: "56px", 
                        padding: "20px 32px", 
                        background: "rgba(255,255,255,0.85)", 
                        backdropFilter: "blur(14px)", 
                        borderRadius: "20px", 
                        border: "1px solid rgba(226, 232, 240, 0.8)", 
                        boxShadow: "0 10px 30px rgba(30, 79, 163, 0.06)",
                        maxWidth: "880px", 
                        margin: "56px auto 0" 
                    }}>
                        <div style={{ textAlign: "center", minWidth: "120px" }}>
                            <div style={{ fontSize: "26px", fontWeight: "900", color: "#1E4FA3" }}>Sprints &amp; Tasks</div>
                            <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b" }}>Interactive Kanban</div>
                        </div>
                        <div style={{ width: "1px", background: "#e2e8f0" }}></div>
                        <div style={{ textAlign: "center", minWidth: "120px" }}>
                            <div style={{ fontSize: "26px", fontWeight: "900", color: "#1E4FA3" }}>Leaves &amp; Shifts</div>
                            <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b" }}>Instant Requests</div>
                        </div>
                        <div style={{ width: "1px", background: "#e2e8f0" }}></div>
                        <div style={{ textAlign: "center", minWidth: "120px" }}>
                            <div style={{ fontSize: "26px", fontWeight: "900", color: "#1E4FA3" }}>Company Vault</div>
                            <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b" }}>Specs &amp; Documents</div>
                        </div>
                        <div style={{ width: "1px", background: "#e2e8f0" }}></div>
                        <div style={{ textAlign: "center", minWidth: "120px" }}>
                            <div style={{ fontSize: "26px", fontWeight: "900", color: "#1E4FA3" }}>Team Sync</div>
                            <div style={{ fontSize: "13px", fontWeight: "600", color: "#64748b" }}>All Departments</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* INTERNAL MODULES SECTION */}
            <section id="modules" className="landing-section" style={{ background: "#ffffff", padding: "90px 5%" }}>
                <div className="section-title reveal-hidden">
                    <span style={{ fontSize: "12px", fontWeight: "800", color: "#1E4FA3", letterSpacing: "2px", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>CORE MODULES</span>
                    <h2>Everything Padhya Team Needs Every Day</h2>
                    <p>Designed to help our engineering, QA, design, and operations teams build and ship high-quality products.</p>
                </div>

                <div className="features-grid">
                    <div className="reveal-hidden">
                        <FeatureBox
                            title="Task & Sprint Management"
                            desc="Organize sprint backlogs, track bug tickets, update task statuses on Kanban boards, and review assigned deliverables."
                            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>}
                        />
                    </div>
                    <div className="reveal-hidden reveal-delay-1">
                        <FeatureBox
                            title="Leave & Attendance Tracking"
                            desc="Submit planned or emergency leaves, track approval status from project leads, and view company holiday schedules."
                            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
                        />
                    </div>
                    <div className="reveal-hidden reveal-delay-2">
                        <FeatureBox
                            title="Internal Document Vault"
                            desc="Access project architecture blueprints, API references, client specifications, and company HR policy handbooks."
                            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
                        />
                    </div>
                    <div className="reveal-hidden reveal-delay-3">
                        <FeatureBox
                            title="Cross-Department Sync"
                            desc="Seamless coordination across UI/UX, Web Dev, Mobile (Flutter/Native), Industrial Automation, and QA teams."
                            icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                        />
                    </div>
                </div>
            </section>

            {/* BUILT FOR INTERNAL ROLES SECTION */}
            <section id="roles" className="landing-section" style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0", padding: "90px 5%" }}>
                <div className="section-title reveal-hidden">
                    <span style={{ fontSize: "12px", fontWeight: "800", color: "#1E4FA3", letterSpacing: "2px", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>ACCESS TIERS</span>
                    <h2>Tailored for Every Padhya Team Role</h2>
                    <p>Granular role-based controls for management, team leads, and software engineers.</p>
                </div>

                <div className="reveal-hidden" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px", maxWidth: "1200px", margin: "0 auto" }}>
                    <div style={{ padding: "36px 32px", borderRadius: "24px", background: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.02)" }}>
                        <div style={{ color: "#1E4FA3", fontWeight: "900", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Management &amp; Admin</div>
                        <h4 style={{ fontSize: "21px", fontWeight: "800", marginBottom: "12px", color: "#0f172a" }}>Executive Governance</h4>
                        <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>Oversee all active company projects, configure department structures, manage staff accounts, and review company-wide operational metrics.</p>
                    </div>
                    <div style={{ padding: "36px 32px", borderRadius: "24px", background: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.02)" }}>
                        <div style={{ color: "#2F6FD6", fontWeight: "900", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Project Leads &amp; Managers</div>
                        <h4 style={{ fontSize: "21px", fontWeight: "800", marginBottom: "12px", color: "#0f172a" }}>Sprint &amp; Team Coordination</h4>
                        <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>Assign deliverables, define custom task stages, approve or review employee leave applications, and track sprint deadlines.</p>
                    </div>
                    <div style={{ padding: "36px 32px", borderRadius: "24px", background: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.02)" }}>
                        <div style={{ color: "#3b82f6", fontWeight: "900", fontSize: "12px", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "10px" }}>Developers &amp; Staff</div>
                        <h4 style={{ fontSize: "21px", fontWeight: "800", marginBottom: "12px", color: "#0f172a" }}>Daily Development Focus</h4>
                        <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.7" }}>Manage personal tickets, update task progress, request leaves, collaborate on technical documents, and track project requirements.</p>
                    </div>
                </div>
            </section>

            {/* INTERNAL IT & HR HELPDESK SECTION */}
            <section id="support" className="landing-section reveal-hidden" style={{ background: "#fff", borderTop: "1px solid #e2e8f0", padding: "90px 5%" }}>
                <div className="section-title">
                    <span style={{ fontSize: "12px", fontWeight: "800", color: "#1E4FA3", letterSpacing: "2px", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>INTERNAL SUPPORT</span>
                    <h2>Padhya IT &amp; HR Helpdesk</h2>
                    <p>Internal workplace assistance for team members and staff.</p>
                </div>

                <div style={{ maxWidth: "860px", margin: "0 auto", textAlign: "center", color: "#475569", fontSize: "17px", lineHeight: "1.8" }}>
                    <p style={{ margin: "0 20px 24px" }}>
                        Welcome to the internal operations hub of <strong>Padhya Software Technologies Pvt. Ltd.</strong> This platform is designed exclusively for our engineering, design, quality assurance, and management teams.
                    </p>
                    <p style={{ margin: "0 20px 36px" }}>
                        Need credentials, permissions for a new client repository, or help with leave records? Contact our internal IT support or HR administration team:
                    </p>

                    <div style={{ display: "inline-flex", gap: "24px", justifyContent: "center", flexWrap: "wrap", padding: "18px 30px", background: "#f8fafc", borderRadius: "18px", border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.02)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "600", color: "#1e293b" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E4FA3" strokeWidth="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            303, APM Mall Complex, Ghatlodiya, Ahmedabad
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "600", color: "#1e293b" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E4FA3" strokeWidth="2.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                            info@padhyasoft.com
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: "600", color: "#1e293b" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1E4FA3" strokeWidth="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            +91 90165 75815
                        </div>
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="landing-footer" style={{ background: "#0a193c", color: "#fff", padding: "64px 5% 40px" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "32px" }}>
                    <div style={{ background: "#ffffff", padding: "10px 24px", borderRadius: "14px", display: "inline-block", marginBottom: "16px", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                        <img 
                            src="/padhya-logo.webp" 
                            alt="Padhya Software Technologies" 
                            style={{ height: "40px", maxWidth: "220px", objectFit: "contain", display: "block" }} 
                        />
                    </div>
                    <p style={{ color: "#94a3b8", maxWidth: "600px", margin: "0 auto", fontSize: "14px", textAlign: "center", lineHeight: "1.6" }}>
                        Padhya Software Technologies Pvt. Ltd. — Internal Employee &amp; Project Operations Portal.
                    </p>
                    <p style={{ color: "#64748b", maxWidth: "600px", margin: "8px auto 0", fontSize: "12px", textAlign: "center" }}>
                        CONFIDENTIAL: For authorized employees only. Unauthorized access, sharing, or copying is strictly prohibited.
                    </p>
                </div>

                <div className="footer-links" style={{ display: "flex", gap: "28px", justifyContent: "center", flexWrap: "wrap", marginBottom: "32px" }}>
                    <span onClick={() => {
                        const el = document.getElementById("modules");
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                    }}>Modules</span>

                    <span onClick={() => {
                        const el = document.getElementById("roles");
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                    }}>Roles</span>

                    <span onClick={() => {
                        const el = document.getElementById("support");
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                    }}>IT &amp; HR Helpdesk</span>

                    <a href="https://www.padhyasoft.com" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>Company Website</a>
                </div>

                <div className="footer-copyright" style={{ color: "#64748b", fontSize: "13px" }}>
                    &copy; {new Date().getFullYear()} Padhya Software Technologies Pvt. Ltd. All rights reserved.
                </div>
            </footer>
        </div>
    );
}