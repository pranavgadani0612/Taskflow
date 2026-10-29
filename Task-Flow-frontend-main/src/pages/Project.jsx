import React, { useEffect, useState, useRef } from "react";
import API from "../api/api";
import "../style/main.css";
import DataTable from "../components/common/DataTable";
import FormModal from "../components/common/FormModal";
import PageHeader from "../components/common/PageHeader";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { useCompany } from "../contexts/CompanyContext";

export default function Project() {
    const [projects, setProjects] = useState([]);
    const [staff, setStaff] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [staffSearch, setStaffSearch] = useState("");
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [toast, setToast] = useState(null);
    const dropdownRef = useRef(null);
    const { user } = useAuth();
    const { hasPermission: ctxHasPermission } = usePermissions();
    const { selectedCompany } = useCompany();

    const roleName = String(user?.role?.name || "").toLowerCase().trim();
    const roleId = String(user?.role?.id || user?.role?._id || user?.role || "").toLowerCase().trim();
    const position = String(user?.position || "").toLowerCase().trim();

    const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || roleName === "super admin";
    const isCompanyOwner = isSuperAdmin ||
                           roleName.includes("owner") || 
                           roleName.includes("admin") || 
                           roleName.includes("manager") ||
                           roleId === "role_owner" || 
                           roleId === "role_superadmin" || 
                           position.includes("manager") || 
                           position.includes("owner") || 
                           position.includes("admin");

    const hasPermission = (module, action = "read") => {
        if (isSuperAdmin || isCompanyOwner) return true;
        return ctxHasPermission(module, action);
    };

    const [form, setForm] = useState({
        name: "",
        description: "",
        assignedTo: [],
        status: "Active",
    });
    const [fieldErrors, setFieldErrors] = useState({});

    // Toast notification
    const showToast = (msg, type = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 1000);
    };

    const load = async () => {
        try {
            const [p, s] = await Promise.all([
                API.get("/projects"),
                API.get("/staff"),
            ]);
            setProjects(p.data || []);
            setStaff(s.data || []);
        } catch (e) {
            console.log(e);
        }
    };

    useEffect(() => {
        load();
    }, [selectedCompany]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setIsDropdownOpen(false);
            }
        };

        if (isDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isDropdownOpen]);

    const handleStaffToggle = (staffId) => {
        setForm((prev) => {
            const isSelected = prev.assignedTo.includes(staffId);
            return {
                ...prev,
                assignedTo: isSelected
                    ? prev.assignedTo.filter((id) => id !== staffId)
                    : [...prev.assignedTo, staffId],
            };
        });
    };

    const save = async () => {
        if (!form.name || !form.name.trim()) {
            showToast("Project name is required", "error");
            return;
        }
        if (form.name && form.name.length > 100) {
            showToast("Project name must be 100 characters or less", "error");
            return;
        }
        if (form.description && form.description.length > 500) {
            showToast("Project description must be 500 characters or less", "error");
            return;
        }

        try {
            setFieldErrors({});
            if (editId) {
                const originalProject = projects.find(p => p._id === editId);
                if (originalProject) {
                    const isSameName = originalProject.name === form.name.trim();
                    const isSameDesc = (originalProject.description || "") === form.description.trim();
                    const isSameStatus = (originalProject.status || "") === form.status;
                    
                    const originalAssigned = Array.isArray(originalProject.assignedTo) ? originalProject.assignedTo.map(u => typeof u === 'object' ? u._id : u) : [];
                    const isSameAssigned = originalAssigned.length === form.assignedTo.length && 
                                           originalAssigned.every(id => form.assignedTo.includes(id));
                    
                    if (isSameName && isSameDesc && isSameStatus && isSameAssigned) {
                        showToast("No changes detected.", "info");
                        setShowForm(false);
                        setEditId(null);
                        setStaffSearch("");
                        setIsDropdownOpen(false);
                        setFieldErrors({});
                        setForm({
                            name: "",
                            description: "",
                            assignedTo: [],
                            status: "",
                        });
                        return;
                    }
                }
                await API.put(`/projects/${editId}`, form);
                showToast("Project updated successfully!");
            } else {
                await API.post("/projects", form);
                showToast("Project added successfully!");
            }

            setShowForm(false);
            setEditId(null);
            setStaffSearch("");
            setIsDropdownOpen(false);
            setFieldErrors({});
            setForm({
                name: "",
                description: "",
                assignedTo: [],
                status: "",
            });
            await load();
        } catch (error) {
            console.error(error);
            const serverMsg = error.response?.data?.error || error.response?.data?.message;
            const field = error.response?.data?.field;
            if (field && serverMsg) {
                setFieldErrors({ [field]: serverMsg });
            } else if (serverMsg && serverMsg.toLowerCase().includes("project name")) {
                setFieldErrors({ name: serverMsg });
            } else {
                showToast(serverMsg || "Error saving project", "error");
            }
        }
    };

    const edit = (item) => {
        setForm({
            name: item.name,
            description: item.description || "",
            assignedTo: item.assignedTo?.map(u => u._id) || [],
            status: item.status || "",
        });
        setEditId(item._id);
        setStaffSearch("");
        setIsDropdownOpen(false);
        setShowForm(true);
    };

    const remove = async (id) => {
        try {
            await API.delete(`/projects/${id}`);
            showToast("Project deleted successfully!", "delete");
            load();
        } catch (error) {
            console.error(error);
            showToast("Error deleting project", "error");
        }
    };

    const columns = [
        {
            header: "Name",
            key: "name",
            render: (v) => <span style={{ fontWeight: "500", color: "var(--text-main)", textTransform: 'capitalize', fontSize: '15px' }}>{v}</span>
        },
        { header: "Description", key: "description" },
        {
            header: "Assigned To",
            key: "assignedTo",
            render: (v) => {
                if (!v || v.length === 0) return <span style={{ color: "#aaa" }}>—</span>;

                const MAX_DISPLAY = 2;
                const displayUsers = v.slice(0, MAX_DISPLAY);
                const remainingCount = v.length - MAX_DISPLAY;
                const allNames = v.map(u => u.name).join(", ");

                return (
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }} title={allNames}>
                        {displayUsers.map((user) => (
                            <div key={user._id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div style={{
                                    width: "28px", height: "28px", borderRadius: "50%",
                                    background: "linear-gradient(135deg, var(--primary-color), #6366f1)",
                                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                                    fontSize: "11px", fontWeight: "800", boxShadow: "0 2px 5px rgba(59, 130, 246, 0.2)", flexShrink: 0
                                }}>
                                    {user.name?.charAt(0).toUpperCase()}
                                </div>
                                <span style={{ fontWeight: "600", color: "var(--text-main)", fontSize: "13px" }}>
                                    {user.name.split(" ")[0]}
                                </span>
                            </div>
                        ))}
                        {remainingCount > 0 && (
                            <span style={{
                                background: "rgba(99, 102, 241, 0.15)",
                                color: "var(--primary-color)",
                                padding: "4px 8px",
                                borderRadius: "12px",
                                fontSize: "11px",
                                fontWeight: "700",
                                display: "inline-block",
                                border: "1px dashed rgba(99, 102, 241, 0.4)",
                                boxSizing: "border-box"
                            }} title={v.slice(MAX_DISPLAY).map(u => u.name).join(", ")}>
                                +{remainingCount} more
                            </span>
                        )}
                    </div>
                );
            } },
        {
            header: "Status",
            key: "status",
            render: (v) => (
                <span style={{
                    padding: "6px 14px",
                    borderRadius: "20px",
                    fontSize: "11px",
                    fontWeight: "500",
                    background: v === "Active" ? "var(--badge-success-bg)" : "var(--badge-danger-bg)",
                    color: v === "Active" ? "var(--badge-success-text)" : "var(--badge-danger-text)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    border: v === "Active" ? "1px solid rgba(52, 211, 153, 0.2)" : "1px solid rgba(248, 113, 113, 0.2)"
                }}>
                    {v || "Active"}
                </span>
            )
        },
    ];

    return (
        <div className="page">
            <PageHeader
                title="Manage Projects"
                buttonText={hasPermission("project_management", "create") ? "+ Add Project" : null}
                onButtonClick={() => {
                    setForm({ name: "", description: "", assignedTo: [], status: "Active" });
                    setEditId(null);
                    setStaffSearch("");
                    setIsDropdownOpen(false);
                    setShowForm(true);
                }}
            />

            <FormModal
                show={showForm}
                onClose={() => setShowForm(false)}
                title={editId ? "Edit Project" : "Add Project"}
                onSave={save}
                maxWidth="650px"
            >
                <div className="form-group">
                    <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>
                            PROJECT NAME <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{form.name.length}/100</span>
                    </label>
                    <input
                        className="form-control"
                        required
                        placeholder="e.g. Website Redesign"
                        value={form.name}
                        onChange={(e) => {
                            setForm({ ...form, name: e.target.value });
                            if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: "" }));
                        }}
                        maxLength={100}
                        style={fieldErrors.name ? { borderColor: "#ef4444", background: "#fff5f5" } : {}}
                    />
                    {fieldErrors.name && (
                        <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                            {fieldErrors.name}
                        </span>
                    )}
                </div>

                <div className="form-group">
                    <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>DESCRIPTION</span>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{form.description.length}/500</span>
                    </label>
                    <textarea
                        className="form-control"
                        placeholder="Tell us about the project goal..."
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        maxLength={500}
                        style={{ height: '100px', resize: 'none' }}
                    />
                </div>

                <div className="form-group">
                    <label>ASSIGN USERS</label>
                    
                    {/* Selected Users Chips */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
                        {form.assignedTo.length === 0 && <span style={{ fontSize: "13px", color: "#94a3b8", fontStyle: 'italic' }}>No users assigned yet.</span>}
                        {form.assignedTo.map(staffId => {
                            const user = staff.find(s => (s._id || s.id) === staffId);
                            if (!user) return null;
                            return (
                                <span key={staffId} style={{
                                    background: "var(--primary-light)", color: "var(--primary-color)",
                                    padding: "6px 14px", borderRadius: "8px", fontSize: "12px",
                                    fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "8px",
                                    border: "1px solid var(--primary-color)"
                                }}>
                                    {user.name}
                                    <span style={{ cursor: "pointer", fontWeight: "900" }} onClick={() => handleStaffToggle(staffId)}>×</span>
                                </span>
                            );
                        })}
                    </div>

                    {/* Search Bar */}
                    <div style={{ position: 'relative' }} ref={dropdownRef}>
                        <div style={{ position: "relative" }}>
                             <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /></svg>
                            </span>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Type name or role to find staff..."
                                value={staffSearch}
                                onChange={(e) => setStaffSearch(e.target.value)}
                                onFocus={() => setIsDropdownOpen(true)}
                                style={{ paddingLeft: '42px' }}
                            />
                        </div>

                        {/* Search Dropdown */}
                        {isDropdownOpen && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, right: 0,
                                maxHeight: "200px", overflowY: "auto", background: "#ffffff",
                                borderRadius: "12px", boxShadow: "var(--shadow-lg)", zIndex: 100,
                                marginTop: '8px', border: '1px solid var(--ui-border)', padding: '6px'
                            }}>
                                {staff
                                    .filter(s => s.status !== "Inactive")
                                    .filter(s => !form.assignedTo.includes(s._id || s.id))
                                    .filter(s => {
                                        if (!staffSearch) return true;
                                        const search = staffSearch.toLowerCase();
                                        const nameMatch = s.name?.toLowerCase().includes(search);
                                        const posMatch = (s.position || s.role?.name || "").toLowerCase().includes(search);
                                        const emailMatch = s.email?.toLowerCase().includes(search);
                                        return nameMatch || posMatch || emailMatch;
                                    })
                                    .map((s) => (
                                        <div
                                            key={s._id}
                                            onClick={() => handleStaffToggle(s._id)}
                                            style={{
                                                display: "flex", alignItems: "center", gap: "12px",
                                                padding: "10px 14px", cursor: "pointer", borderRadius: '8px',
                                                transition: 'all 0.2s', color: 'var(--text-main)'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                                            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                        >
                                            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "800" }}>
                                                {s.name?.charAt(0).toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: '700', fontSize: '14px' }}>{s.name}</div>
                                                <div style={{ color: "var(--text-muted)", fontSize: "10px", fontWeight: '600', textTransform: 'uppercase' }}>{s.position || s.role?.name || "Staff"}</div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="form-group">
                    <label>STATUS</label>
                    <select className="form-control" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        <option value="">Select Status</option>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                    </select>
                </div>
            </FormModal>

            <DataTable
                data={projects}
                columns={columns}
                onEdit={hasPermission("project_management", "update") ? edit : null}
                onDelete={hasPermission("project_management", "delete") ? remove : null}
            />

            {/* TOAST */}
            {toast && (
                <div style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    padding: '16px 24px',
                    borderRadius: '8px',
                    background: toast.type === 'success' ? '#4CAF50' : toast.type === 'delete' ? '#f44336' : toast.type === 'error' ? '#f44336' : '#ff9800',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '600',
                    zIndex: 9999,
                    animation: 'slideInRight 0.3s ease-out',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                }}>
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
