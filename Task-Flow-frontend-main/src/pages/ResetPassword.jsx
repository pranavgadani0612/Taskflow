import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import API from "../api/api";
import { CheckCircleIcon } from "../components/common/Icons";
import "../style/login.css";

export default function ResetPassword() {
    const navigate = useNavigate();
    const location = useLocation();
    const token = new URLSearchParams(location.search).get("token");

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleReset = async (e) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            return setError("Passwords do not match");
        }

        const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        if (!strongPassword.test(password)) {
            return setError("Password must be 8+ chars with uppercase, lowercase, number, and symbol.");
        }

        setLoading(true);
        try {
            await API.post("/auth/reset-password", { token, password });
            setSuccess(true);
            setTimeout(() => navigate("/login"), 3000);
        } catch (err) {
            setError(err.response?.data?.error || "Reset failed. Link may be expired.");
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="login-page">
                <div className="login-card" style={{ textAlign: "center" }}>
                    <h2 style={{ color: "#ef4444" }}>Invalid Request</h2>
                    <p style={{ color: "#64748b" }}>Missing reset token.</p>
                    <button onClick={() => navigate("/login")} className="submit-button" style={{ marginTop: "20px" }}>
                        Back to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page">
            <header className="landing-header animate-fade-down" style={{ opacity: 1 }}>
                <div className="landing-logo" style={{ cursor: "pointer" }} onClick={() => navigate("/login")}>
                    <img 
                        src="/padhya-logo.webp" 
                        alt="Padhya Software Technologies" 
                        style={{ height: "42px", maxWidth: "220px", objectFit: "contain" }} 
                    />
                </div>
            </header>

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
                        <h2 style={{ fontSize: "28px", fontWeight: "900", color: "#0f172a" }}>Reset Password</h2>
                        <p style={{ color: "#64748b", marginTop: "8px", fontSize: "15px" }}>
                            Create a new secure password for your account.
                        </p>
                    </div>

                    {success ? (
                        <div style={{ textAlign: "center" }}>
                            <div style={{ marginBottom: "12px", display: "flex", justifyContent: "center" }}>
                                <CheckCircleIcon size={44} color="#10b981" />
                            </div>
                            <h3 style={{ color: "#16a34a" }}>Success!</h3>
                            <p style={{ color: "#64748b" }}>Password has been reset. Redirecting to login...</p>
                            <button onClick={() => navigate("/login")} className="submit-button" style={{ marginTop: "15px" }}>
                                Go to Login
                            </button>
                        </div>
                    ) : (
                        <form className="login-form" onSubmit={handleReset}>
                            <div className="form-group">
                                <label className="input-label">New Password</label>
                                <div style={{ position: "relative" }}>
                                    <input
                                        className="input-field"
                                        type={showPassword ? "text" : "password"}
                                        required
                                        placeholder="8+ characters"
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: "" }));
                                        }}
                                        style={{ paddingRight: "45px", ...(fieldErrors.password ? { borderColor: "#ef4444", background: "#fff5f5" } : {}) }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={{
                                            position: "absolute", right: "12px", top: "50%",
                                            transform: "translateY(-50%)", cursor: "pointer",
                                            display: "flex", alignItems: "center", color: "#64748b",
                                            background: "transparent", border: "none"
                                        }}
                                    >
                                        {showPassword ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                <circle cx="12" cy="12" r="3"></circle>
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                                <line x1="1" y1="1" x2="23" y2="23"></line>
                                            </svg>
                                        )}
                                    </button>
                                </div>
                                {fieldErrors.password && (
                                    <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                                        {fieldErrors.password}
                                    </span>
                                )}
                            </div>

                            <div className="form-group">
                                <label className="input-label">Confirm New Password</label>
                                <div style={{ position: "relative" }}>
                                    <input
                                        className="input-field"
                                        type={showConfirmPassword ? "text" : "password"}
                                        required
                                        placeholder="Repeat password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        style={{ paddingRight: "45px" }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        style={{
                                            position: "absolute", right: "12px", top: "50%",
                                            transform: "translateY(-50%)", cursor: "pointer",
                                            display: "flex", alignItems: "center", color: "#64748b",
                                            background: "transparent", border: "none"
                                        }}
                                    >
                                        {showConfirmPassword ? (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                                <circle cx="12" cy="12" r="3"></circle>
                                            </svg>
                                        ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                                                <line x1="1" y1="1" x2="23" y2="23"></line>
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div style={{
                                    padding: "12px", borderRadius: "8px", background: "#fee2e2",
                                    color: "#991b1b", fontSize: "13px", border: "1px solid #fecaca",
                                    marginBottom: "15px"
                                }}>
                                    {error}
                                </div>
                            )}

                            <button className="submit-button" type="submit" disabled={loading}>
                                {loading ? "Updating..." : "Update Password"}
                            </button>
                        </form>
                    )}
                </div>
            </section>
        </div>
    );
}
