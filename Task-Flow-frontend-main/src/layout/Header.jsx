import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import ConfirmModal from "../components/common/ConfirmModal";
import { CloseIcon } from "../components/common/Icons";
import { useCompany } from "../contexts/CompanyContext";
import { useProject } from "../contexts/ProjectContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { useSocket } from "../contexts/SocketContext";
import API from "../api/api";
import "./header.css";

export default function Header({ onToggleMobileSidebar }) {
    const [projects, setProjects] = useState([]);
    const { selectedProject, setSelectedProject } = useProject();
    const { selectedCompany, setSelectedCompany } = useCompany();
    const { user, logout } = useAuth();
    const { showToast } = useToast();
    const { socket } = useSocket();
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const [companies, setCompanies] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const dropdownRef = useRef(null);
    const companyDropdownRef = useRef(null);
    const profileRef = useRef(null);
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" });

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            showToast("New password and confirm password do not match", "error");
            return;
        }
        if (passwordForm.newPassword.length < 6) {
            showToast("New password must be at least 6 characters", "error");
            return;
        }
        setPasswordLoading(true);
        try {
            await API.put("/staff/change-password", {
                oldPassword: passwordForm.oldPassword,
                newPassword: passwordForm.newPassword
            });
            showToast("Password changed successfully!", "success");
            setShowPasswordModal(false);
            setPasswordForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
        } catch (err) {
            showToast(err.response?.data?.error || "Failed to change password", "error");
        } finally {
            setPasswordLoading(false);
        }
    };

    const roleName = String(user?.role?.name || "").toLowerCase().trim();
    const roleId = String(user?.role?.id || user?.role?._id || user?.role || "").toLowerCase().trim();
    const position = String(user?.position || "").toLowerCase().trim();

    const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || roleName === "super admin";
    const isOwnerOrAdmin = isSuperAdmin || 
                           roleName.includes("owner") || 
                           roleName.includes("admin") || 
                           roleName.includes("manager") ||
                           roleId === "role_owner" || 
                           roleId === "role_superadmin" || 
                           position.includes("manager") || 
                           position.includes("owner") || 
                           position.includes("admin");

    // Dark Mode State
    const [isDarkMode, setIsDarkMode] = useState(() => {
        return localStorage.getItem("theme") === "dark";
    });

    // Dark Mode Effect
    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.setAttribute("data-theme", "dark");
            localStorage.setItem("theme", "dark");
        } else {
            document.documentElement.removeAttribute("data-theme");
            localStorage.setItem("theme", "light");
        }
    }, [isDarkMode]);

    // Fetch unread count on mount and when user changes
    const fetchUnreadCount = async () => {
        if (!user) return;
        try {
            const res = await API.get("/chat/unread-counts");
            if (res.data && typeof res.data === "object") {
                const total = Object.values(res.data).reduce((acc, count) => acc + (Number(count) || 0), 0);
                setUnreadChatCount(total);
            }
        } catch (err) {
            console.error("Header fetchUnreadCount error:", err);
        }
    };

    useEffect(() => {
        fetchUnreadCount();

        const handleChatRead = () => {
            fetchUnreadCount();
        };
        window.addEventListener("chat_conversation_read", handleChatRead);

        return () => {
            window.removeEventListener("chat_conversation_read", handleChatRead);
        };
    }, [user]);

    // Socket & Chat Global Notification setup
    useEffect(() => {
        if (!socket || !user) return;
        const userId = user._id || user.id;

        // Register user to their personal socket room
        socket.emit("register_user", userId);

        // Request browser notification permission once
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }

        const handleChatNotification = (data) => {
            setUnreadChatCount((prev) => prev + 1);

            // In-app popup toast notification
            showToast(`${data.senderName}: "${data.text?.slice(0, 45) || 'New message'}"`, "info");

            // Desktop notification if permitted & window not focused
            if ("Notification" in window && Notification.permission === "granted" && document.hidden) {
                new Notification(`Message from ${data.senderName}`, {
                    body: data.text || "You received a new message in Taskflow",
                    icon: "/favicon.ico"
                });
            }
        };

        socket.on("chat_notification", handleChatNotification);

        return () => {
            socket.off("chat_notification", handleChatNotification);
        };
    }, [socket, user, showToast]);

    const toggleTheme = () => setIsDarkMode(!isDarkMode);

    const loadProjects = () => {
        API.get("/projects")
            .then((res) => {
                setProjects(res.data || []);
            })
            .catch((err) => {
                console.error('Error loading projects:', err);
            });
    };

    const loadCompanies = () => {
        if (!isSuperAdmin) return;
        API.get("/companies")
            .then((res) => {
                setCompanies(res.data || []);
            })
            .catch((err) => {
                console.error('Error loading companies:', err);
            });
    };

    useEffect(() => {
        loadProjects();
        if (isSuperAdmin) loadCompanies();
    }, [selectedCompany]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
            if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target)) {
                setIsCompanyDropdownOpen(false);
            }
            if (profileRef.current && !profileRef.current.contains(event.target)) {
                setIsProfileOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleProjectSelect = (project) => {
        setSelectedProject(project);
        setIsDropdownOpen(false);
    };

    const handleAllProjectsClick = () => {
        console.log('All Projects clicked', { projects });
        setSelectedProject(null);
        setIsDropdownOpen(false);
    };

    const handleCompanySelect = (company) => {
        setSelectedCompany(company);
        setSelectedProject(null); // Clear selected project when company changes
        setIsCompanyDropdownOpen(false);
    };

    const handleAllCompaniesClick = () => {
        setSelectedCompany(null);
        setSelectedProject(null);
        setIsCompanyDropdownOpen(false);
    };

    return (
        <div className="app-header">
            <div className="app-header__brand">
                {/* Mobile Hamburger Button */}
                <button
                    type="button"
                    className="mobile-hamburger-btn"
                    onClick={onToggleMobileSidebar}
                    aria-label="Toggle navigation menu"
                >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>

                <div className="project-dropdown" ref={dropdownRef}>
                    <button
                        className="project-dropdown__trigger"
                        onClick={() => {
                            if (!isDropdownOpen) loadProjects();
                            setIsDropdownOpen(!isDropdownOpen);
                        }}
                    >
                        {selectedProject ? selectedProject.name : "All Projects"}
                        <span className={`project-dropdown__arrow ${isDropdownOpen ? 'open' : ''}`}>▼</span>
                    </button>

                    {isDropdownOpen && (
                        <div className="project-dropdown__menu">
                            <button
                                className={`project-dropdown__item ${!selectedProject ? "active" : ""}`}
                                onClick={handleAllProjectsClick}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-1.22-1.8A2 2 0 0 0 7.53 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg> All Projects
                            </button>
                            {projects
                                .filter(p => {
                                    if (isOwnerOrAdmin) return true;
                                    return (p.assignedTo || []).some(m => {
                                        const memberId = (m?._id || m?.id || m)?.toString();
                                        const currentUserId = (user?._id || user?.id)?.toString();
                                        return memberId === currentUserId || (m?.email && m.email === user?.email);
                                    });
                                })
                                .map((p) => (
                                    <button
                                        key={p._id}
                                        className={`project-dropdown__item ${selectedProject?._id === p._id ? "active" : ""}`}
                                        onClick={() => handleProjectSelect(p)}
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-1.22-1.8A2 2 0 0 0 7.53 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg> {p.name}
                                    </button>
                                ))}
                        </div>
                    )}
                </div>  
            </div>

            {/* Center: Empty tabs to keep spacing if needed */}
            <nav className="app-header__tabs">
            </nav>


            <div className="app-header__right">
                <Link 
                    to="/chat" 
                    className="theme-toggle-btn" 
                    title="Messages"
                    onClick={() => setUnreadChatCount(0)}
                    style={{ position: "relative" }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    {unreadChatCount > 0 && (
                        <span style={{
                            position: "absolute",
                            top: "4px",
                            right: "4px",
                            width: "9px",
                            height: "9px",
                            background: "#ef4444",
                            borderRadius: "50%",
                            boxShadow: "0 0 6px #ef4444",
                            border: "1.5px solid var(--ui-surface, #fff)"
                        }} />
                    )}
                </Link>


                <button
                    onClick={toggleTheme}
                    className="theme-toggle-btn"
                    title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                    {isDarkMode ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
                    )}
                </button>

                {user && (
                    <div className="profile-dropdown" ref={profileRef}>
                        <button
                            className="profile-dropdown__trigger"
                            onClick={() => setIsProfileOpen(!isProfileOpen)}
                        >
                            <div className="profile-avatar">
                                {user.name?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <span className="profile-name">{user.name}</span>
                            <span className={`profile-dropdown__arrow ${isProfileOpen ? 'open' : ''}`}>▼</span>
                        </button>

                        {isProfileOpen && (
                            <div className="profile-dropdown__menu">
                                <div className="profile-dropdown__info">
                                    <div className="info-name">{user.name}</div>
                                    <div className="info-email">{user.email}</div>
                                </div>
                                <div className="profile-dropdown__divider"></div>

                                <div style={{ padding: '4px 12px 12px' }}>
                                    <div style={{ marginBottom: '12px' }}>
                                        <div style={{ color: 'var(--text-light)', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Account Role</div>
                                        <div style={{ color: 'var(--text-main)', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#6366f1' }}></div>
                                            {(user.email === "gadanipranav@gmail.com" || user.role?.name === "Super Admin") ? "Super Admin" : user.role?.name || "User"}
                                        </div>
                                    </div>

                                    <div>
                                        <div style={{ color: 'var(--text-light)', fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>Current Status</div>
                                        <div style={{ color: '#16a34a', fontSize: '13px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#dcfce7', padding: '2px 10px', borderRadius: '20px' }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }}></div>
                                            ACTIVE
                                        </div>
                                    </div>
                                </div>
                                <div className="profile-dropdown__divider"></div>

                                <button className="profile-dropdown__item" onClick={() => { setIsProfileOpen(false); setShowProfileModal(true); }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '12px' }}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> My Profile
                                </button>

                                <button className="profile-dropdown__item" onClick={() => { setIsProfileOpen(false); setShowPasswordModal(true); setPasswordForm({ oldPassword: "", newPassword: "", confirmPassword: "" }); }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '12px' }}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Change Password
                                </button>

                                {isOwnerOrAdmin && (
                                    <button className="profile-dropdown__item" onClick={() => { setIsProfileOpen(false); window.location.href='/profile'; }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '12px' }}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> Company Settings
                                    </button>
                                )}

                                <div className="profile-dropdown__divider"></div>

                                <button className="profile-dropdown__item logout-item" onClick={() => setShowLogoutConfirm(true)}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '12px' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg> Logout
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            <ConfirmModal
                show={showLogoutConfirm}
                onClose={() => setShowLogoutConfirm(false)}
                onConfirm={async () => {
                    await logout();
                    showToast("Logout Successful. See you soon!");
                }}
                title="Logout Confirmation"
                message="Are you sure you want to logout?"
                confirmText="Logout"
            />

            {/* MY PROFILE MODAL */}
            {showProfileModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
                    <div style={{ background: "var(--ui-surface, #fff)", borderRadius: "16px", padding: "24px", width: "90%", maxWidth: "450px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "var(--text-main, #0f172a)" }}>My Profile</h3>
                            <button onClick={() => setShowProfileModal(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", display: "flex", alignItems: "center" }}><CloseIcon size={18} /></button>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px" }}>
                            <div style={{ width: "56px", height: "56px", borderRadius: "50%", background: "linear-gradient(135deg, #4f46e5, #0ea5e9)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: "800" }}>
                                {user?.name?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style={{ fontSize: "16px", fontWeight: "800", color: "var(--text-main, #0f172a)" }}>{user?.name}</div>
                                <div style={{ fontSize: "13px", color: "var(--text-muted, #64748b)" }}>{user?.email}</div>
                                <div style={{ fontSize: "11px", fontWeight: "700", marginTop: "4px", color: "#6366f1", background: "rgba(99, 102, 241, 0.1)", display: "inline-block", padding: "2px 8px", borderRadius: "10px" }}>
                                    {user?.role?.name || "Staff"}
                                </div>
                            </div>
                        </div>
                        <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "14px", borderRadius: "10px", display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Phone:</span>
                                <span style={{ fontWeight: "700", color: "var(--text-main, #1e293b)" }}>{user?.phone || "—"}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Position:</span>
                                <span style={{ fontWeight: "700", color: "var(--text-main, #1e293b)" }}>{user?.position || "Staff"}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "var(--text-muted, #64748b)", fontWeight: "600" }}>Account Status:</span>
                                <span style={{ fontWeight: "700", color: "#16a34a" }}>Active</span>
                            </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                            <button className="btn btn-secondary" onClick={() => setShowProfileModal(false)} style={{ padding: "8px 16px", borderRadius: "8px" }}>Close</button>
                        </div>
                    </div>
                </div>
            )}

            {/* CHANGE PASSWORD MODAL */}
            {showPasswordModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
                    <div style={{ background: "var(--ui-surface, #fff)", borderRadius: "16px", padding: "24px", width: "90%", maxWidth: "420px", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "var(--text-main, #0f172a)" }}>Change Password</h3>
                            <button onClick={() => setShowPasswordModal(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted, #64748b)", display: "flex", alignItems: "center" }}><CloseIcon size={18} /></button>
                        </div>
                        <form onSubmit={handleChangePassword}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-muted, #64748b)", marginBottom: "6px" }}>Current Password</label>
                                    <input
                                        type="password"
                                        required
                                        value={passwordForm.oldPassword}
                                        onChange={(e) => setPasswordForm({ ...passwordForm, oldPassword: e.target.value })}
                                        className="form-control"
                                        style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--ui-border, #cbd5e1)" }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-muted, #64748b)", marginBottom: "6px" }}>New Password (min 6 characters)</label>
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={passwordForm.newPassword}
                                        onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                        className="form-control"
                                        style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--ui-border, #cbd5e1)" }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-muted, #64748b)", marginBottom: "6px" }}>Confirm New Password</label>
                                    <input
                                        type="password"
                                        required
                                        value={passwordForm.confirmPassword}
                                        onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                        className="form-control"
                                        style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid var(--ui-border, #cbd5e1)" }}
                                    />
                                </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordModal(false)} style={{ padding: "8px 16px", borderRadius: "8px" }}>Cancel</button>
                                <button type="submit" disabled={passwordLoading} className="btn btn-primary" style={{ padding: "8px 16px", borderRadius: "8px", background: "var(--primary-color, #4f46e5)", color: "#fff" }}>
                                    {passwordLoading ? "Updating..." : "Update Password"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div >
    );
}