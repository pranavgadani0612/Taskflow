import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/api";
import { useToast } from "../contexts/ToastContext";
import { MailIcon, ChevronLeftIcon } from "../components/common/Icons";
import "../style/login.css";

export default function ForgotPassword() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [success, setSuccess] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email || !email.trim()) {
            setFieldErrors({ email: "Email address is required" });
            return;
        }
        setFieldErrors({});
        setLoading(true);
        try {
            await API.post("/auth/forgot-password", { email });
            setSuccess(true);
            showToast("Password reset link sent!");
        } catch (err) {
            showToast(err.response?.data?.error || "Failed to send reset email.", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            {/* STICKY HEADER */}
            <header className="landing-header animate-fade-down" style={{ opacity: 1 }}>
                <div className="landing-logo" style={{ cursor: "pointer" }} onClick={() => navigate("/login")}>
                    <img 
                        src="/padhya-logo.webp" 
                        alt="Padhya Software Technologies" 
                        style={{ height: "42px", maxWidth: "220px", objectFit: "contain" }} 
                    />
                </div>
                <div className="header-login-container">
                    <button onClick={() => navigate("/login")} className="header-login-btn">Sign In</button>
                </div>
            </header>

            {/* HERO / BACKGROUND SECTION */}
            <section className="hero-sec" style={{ minHeight: "calc(100vh - 80px)", display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 0 }}>
                <div className="hero-blob blob-1"></div>
                <div className="hero-blob blob-2"></div>
                
                <div className="login-card" style={{ 
                    maxWidth: "450px", width: "90%", background: "#fff",
                    padding: "40px", borderRadius: "24px", position: "relative",
                    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
                    zIndex: 10
                }}>
                    <div style={{ textAlign: "center", marginBottom: "30px" }}>
                        <div style={{
                            width: "60px", height: "60px", background: "#e0e7ff",
                            borderRadius: "18px", display: "flex", alignItems: "center",
                            justifyContent: "center", margin: "0 auto 20px", color: "#4f46e5"
                        }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M12 15V17M12 7V13M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" />
                            </svg>
                        </div>
                        <h2 style={{ fontSize: "28px", fontWeight: "900", color: "#0f172a" }}>Forgot Password?</h2>
                        <p style={{ color: "#64748b", marginTop: "8px", fontSize: "15px" }}>
                            Enter your email to receive a reset link.
                        </p>
                    </div>

                    {success ? (
                        <div style={{ textAlign: "center", padding: "20px 0" }}>
                            <div style={{ marginBottom: "16px", display: "flex", justifyContent: "center" }}>
                                <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#4f46e5" }}>
                                    <MailIcon size={32} color="#4f46e5" />
                                </div>
                            </div>
                            <h3 style={{ color: "#16a34a", marginBottom: "12px" }}>Check your Email</h3>
                            <p style={{ color: "#64748b", marginBottom: "24px" }}>
                                Reset link sent to <strong>{email}</strong>.
                            </p>
                            <button onClick={() => navigate("/login")} className="submit-button">
                                Back to Login
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label className="input-label">Email Address</label>
                                <input
                                    className="input-field"
                                    type="email"
                                    placeholder="name@company.com"
                                    required
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        if (fieldErrors.email) setFieldErrors({});
                                    }}
                                    style={fieldErrors.email ? { borderColor: "#ef4444", background: "#fff5f5" } : {}}
                                />
                                {fieldErrors.email && (
                                    <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                                        {fieldErrors.email}
                                    </span>
                                )}
                            </div>

                            <button className="submit-button" type="submit" disabled={loading} style={{ marginTop: "10px" }}>
                                {loading ? "Sending link..." : "Send Reset Link"}
                            </button>

                            <div style={{ textAlign: "center", marginTop: "24px" }}>
                                <span 
                                    onClick={() => navigate("/login")} 
                                    style={{ color: "#6366f1", cursor: "pointer", fontWeight: "600", fontSize: "14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                                >
                                    <ChevronLeftIcon size={14} color="#6366f1" /> Back to Login
                                </span>
                            </div>
                        </form>
                    )}
                </div>
            </section>
        </div>
    );
}
