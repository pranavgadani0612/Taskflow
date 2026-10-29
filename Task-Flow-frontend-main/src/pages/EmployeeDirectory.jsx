import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import FormModal from "../components/common/FormModal";
import Pagination from "../components/common/Pagination";
import { IconUsers, IconSearch } from "../components/common/Icons";
import "../style/main.css";

export default function EmployeeDirectory() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";

  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState("All");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Edit extended profile modal (Admin)
  const [editModal, setEditModal] = useState({ show: false, staff: null });
  const [editForm, setEditForm] = useState({
    department: "",
    reporting_manager_name: "",
    joining_date: "",
    dob: "",
    emergency_contact: ""
  });
  const [saving, setSaving] = useState(false);

  const fetchStaff = async () => {
    try {
      setLoading(true);
      const [resStaff, resRoles] = await Promise.all([
        API.get("/staff"),
        API.get("/roles").catch(() => ({ data: [] }))
      ]);
      setStaff(Array.isArray(resStaff.data) ? resStaff.data : []);
      setRoles(Array.isArray(resRoles.data) ? resRoles.data : []);
    } catch (err) {
      console.error("Error loading directory:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, selectedDept]);

  const getRoleDisplayName = (emp) => {
    if (!emp) return "Staff";
    // Check if role is an object with name
    if (emp.role && typeof emp.role === "object" && emp.role.name) {
      return emp.role.name;
    }
    // Check against roles list by ID or name
    const roleId = emp.role?._id || emp.role?.id || emp.role || "";
    if (roleId) {
      const matched = roles.find(r => r._id === roleId || r.id === roleId || r.name === roleId);
      if (matched?.name) return matched.name;
    }
    // Also check position if position is different from generic fallback
    if (emp.position && emp.position !== "role_staff" && emp.position !== "role_superadmin" && emp.position !== "Developer") {
      return emp.position;
    }
    return formatRole(emp.role || emp.position);
  };

  const formatRole = (role) => {
    if (!role) return "Staff";
    if (typeof role === "object") return role.name || "Staff";
    const matched = roles.find(r => r._id === role || r.id === role);
    if (matched?.name) return matched.name;
    if (typeof role === "string" && role.startsWith("role_")) {
      const raw = role.replace(/^role_/, "");
      if (raw === "staff") return "Staff";
      if (raw === "owner") return "Company Owner";
      if (raw === "pm") return "Project Manager";
      if (raw === "developer") return "Developer";
      if (raw === "admin") return "Administrator";
      if (raw === "superadmin") return "Super Admin";
      if (raw === "hr") return "HR Manager";
      if (raw === "qa") return "QA Engineer";
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }
    return role;
  };

  const getEmpDept = (emp) => {
    if (emp.department && emp.department !== "Engineering") return emp.department;
    if (emp.department) return emp.department;
    const pos = (emp.position || "").toLowerCase();
    if (pos.includes("qa") || pos.includes("test")) return "Quality Assurance";
    if (pos.includes("design") || pos.includes("ui")) return "UI/UX Design";
    if (pos.includes("hr") || pos.includes("people")) return "Human Resources";
    if (pos.includes("pm") || pos.includes("project")) return "Project Management";
    return "Engineering";
  };

  const getReportsTo = (emp) => {
    if (!emp.reporting_manager_name || emp.reporting_manager_name.toLowerCase() === "self" || emp.reporting_manager_name === emp.name) {
      if (emp.role === "Super Admin" || emp.role?.name === "Super Admin" || emp.position?.includes("Owner") || emp.position?.includes("Director")) {
        return "Board of Directors";
      }
      return "-";
    }
    return emp.reporting_manager_name;
  };

  const departments = ["All", ...new Set(staff.map(s => getEmpDept(s)).filter(Boolean))];

  const filtered = staff.filter(s => {
    const dept = getEmpDept(s);
    const roleName = getRoleDisplayName(s);
    const trimmed = search.trim().toLowerCase();
    const matchesSearch =
      !trimmed ||
      trimmed.length < 3 ||
      s.name?.toLowerCase().includes(trimmed) ||
      s.email?.toLowerCase().includes(trimmed) ||
      roleName.toLowerCase().includes(trimmed) ||
      dept.toLowerCase().includes(trimmed);

    const matchesDept = selectedDept === "All" || dept === selectedDept;

    return matchesSearch && matchesDept;
  });

  const handleOpenEdit = (emp) => {
    setEditModal({ show: true, staff: emp });
    setEditForm({
      department: emp.department || "Engineering",
      reporting_manager_name: emp.reporting_manager_name || "",
      joining_date: emp.joining_date ? emp.joining_date.slice(0, 10) : "",
      dob: emp.dob ? emp.dob.slice(0, 10) : "",
      emergency_contact: emp.emergency_contact || ""
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editModal.staff) return;
    setSaving(true);
    try {
      await API.put(`/staff/${editModal.staff.id}/extended-profile`, editForm);
      showToast("Employee details updated successfully!", "success");
      setEditModal({ show: false, staff: null });
      fetchStaff();
      if (selectedEmployee && selectedEmployee.id === editModal.staff.id) {
        setSelectedEmployee({ ...selectedEmployee, ...editForm });
      }
    } catch (err) {
      showToast(err.response?.data?.error || "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "clamp(16px, 3vw, 28px)", maxWidth: "1200px", margin: "0 auto" }}>
      {/* HEADER */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <IconUsers size={26} color="#4f46e5" />
          <h1 style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-main, #1e293b)", margin: 0 }}>
            Employee Directory & Profiles
          </h1>
        </div>
        <p style={{ color: "var(--text-muted, #64748b)", margin: "6px 0 0", fontSize: "14px" }}>
          Browse team members, designations, departments, reporting lines, and contact channels.
        </p>
      </div>

      {/* SEARCH & FILTERS */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "24px", flexWrap: "wrap", background: "var(--ui-surface, #fff)", padding: "16px 20px", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
        {/* Search */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: "260px" }}>
          <IconSearch size={18} color="var(--text-muted, #94a3b8)" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, role, email, department..."
            style={{ width: "100%", border: "none", outline: "none", fontSize: "14px", background: "transparent", color: "var(--text-main, #1e293b)" }}
          />
        </div>

        {/* Department Pills */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {departments.map(dept => (
            <button
              key={dept}
              onClick={() => setSelectedDept(dept)}
              style={{
                padding: "6px 14px",
                borderRadius: "20px",
                border: selectedDept === dept ? "1px solid #4f46e5" : "1px solid var(--ui-border, #cbd5e1)",
                background: selectedDept === dept ? "#4f46e5" : "var(--ui-bg, #f8fafc)",
                color: selectedDept === dept ? "#fff" : "var(--text-main, #475569)",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                transition: "0.15s"
              }}
            >
              {dept}
            </button>
          ))}
        </div>
      </div>

      {/* DIRECTORY CARDS GRID */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted, #94a3b8)" }}>
          Loading directory...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "var(--ui-surface, #fff)", borderRadius: "16px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
            <IconSearch size={36} color="#94a3b8" />
          </div>
          <div style={{ fontWeight: "700", fontSize: "16px", color: "var(--text-main, #1e293b)" }}>No employees match your search</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "20px" }}>
          {filtered
            .slice((page - 1) * pageSize, page * pageSize)
            .map(emp => (
            <div
              key={emp.id}
              style={{
                background: "var(--ui-surface, #ffffff)",
                borderRadius: "16px",
                padding: "20px",
                border: "1px solid var(--ui-border, #e2e8f0)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                transition: "transform 0.2s, box-shadow 0.2s",
                position: "relative"
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                <div style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "14px",
                  background: "linear-gradient(135deg, #4f46e5, #06b6d4)",
                  color: "#fff",
                  fontWeight: "800",
                  fontSize: "18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0
                }}>
                  {emp.name?.charAt(0) || "E"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "700", color: "var(--text-main, #0f172a)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {emp.name}
                    </h3>
                    <span style={{
                      fontSize: "10px",
                      fontWeight: "700",
                      padding: "2px 6px",
                      borderRadius: "6px",
                      background: emp.status === "Active" ? "rgba(34, 197, 94, 0.12)" : "rgba(100, 116, 139, 0.12)",
                      color: emp.status === "Active" ? "#16a34a" : "#64748b"
                    }}>
                      {emp.status || "Active"}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted, #64748b)", marginTop: "2px", fontWeight: "600" }}>
                    {getRoleDisplayName(emp)}
                  </div>
                  <div style={{ fontSize: "11px", color: "#4f46e5", fontWeight: "700", marginTop: "3px" }}>
                    {getEmpDept(emp)}
                  </div>
                </div>
              </div>

              {/* DETAILS BOX */}
              <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)", fontSize: "12px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--text-muted, #64748b)" }}>Email:</span>
                  <strong style={{ color: "var(--text-main, #334155)" }}>{emp.email}</strong>
                </div>
                {emp.joining_date && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--text-muted, #64748b)" }}>Joined:</span>
                    <strong style={{ color: "var(--text-main, #334155)" }}>{new Date(emp.joining_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</strong>
                  </div>
                )}
              </div>

              {/* ACTION FOOTER */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px" }}>
                <button
                  onClick={() => setSelectedEmployee(emp)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#4f46e5",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer",
                    padding: 0
                  }}
                >
                  View Full Profile →
                </button>

                {isSuperAdmin && (
                  <button
                    onClick={() => handleOpenEdit(emp)}
                    style={{
                      background: "var(--ui-bg, #f1f5f9)",
                      border: "1px solid var(--ui-border, #cbd5e1)",
                      borderRadius: "6px",
                      padding: "4px 8px",
                      fontSize: "11px",
                      fontWeight: "600",
                      cursor: "pointer",
                      color: "var(--text-main, #475569)"
                    }}
                  >
                    Edit HR Info
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ marginTop: "24px", background: "var(--ui-surface, #fff)", borderRadius: "14px", border: "1px solid var(--ui-border, #e2e8f0)", overflow: "hidden" }}>
          <Pagination
            currentPage={page}
            totalRecords={filtered.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => { setPageSize(newSize); setPage(1); }}
          />
        </div>
      )}

      {/* FULL EMPLOYEE PROFILE MODAL */}
      {selectedEmployee && (
        <FormModal
          isOpen={Boolean(selectedEmployee)}
          onClose={() => setSelectedEmployee(null)}
          title={`Employee Profile: ${selectedEmployee.name}`}
          onSubmit={(e) => { e.preventDefault(); setSelectedEmployee(null); }}
          submitText="Close"
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", background: "var(--ui-bg, #f8fafc)", padding: "16px", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
              <div style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #4f46e5, #06b6d4)",
                color: "#fff",
                fontWeight: "800",
                fontSize: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}>
                {selectedEmployee.name?.charAt(0) || "E"}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "var(--text-main, #0f172a)" }}>
                  {selectedEmployee.name}
                </h2>
                <div style={{ fontSize: "13px", color: "#4f46e5", fontWeight: "600", marginTop: "2px" }}>
                  {getRoleDisplayName(selectedEmployee)} • {getEmpDept(selectedEmployee)}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", fontSize: "13px" }}>
              <div style={{ padding: "10px 12px", background: "var(--ui-surface, #fff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", display: "block" }}>EMAIL</span>
                <strong>{selectedEmployee.email}</strong>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--ui-surface, #fff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", display: "block" }}>PHONE</span>
                <strong>{selectedEmployee.phone || "Not recorded"}</strong>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--ui-surface, #fff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", display: "block" }}>REPORTING MANAGER</span>
                <strong>{getReportsTo(selectedEmployee)}</strong>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--ui-surface, #fff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", display: "block" }}>JOINING DATE</span>
                <strong>{selectedEmployee.joining_date ? new Date(selectedEmployee.joining_date).toLocaleDateString() : "Not Recorded"}</strong>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--ui-surface, #fff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", display: "block" }}>BIRTHDAY</span>
                <strong>{selectedEmployee.dob ? new Date(selectedEmployee.dob).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Not Recorded"}</strong>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--ui-surface, #fff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", display: "block" }}>EMERGENCY CONTACT</span>
                <strong>{selectedEmployee.emergency_contact || "Not recorded"}</strong>
              </div>
            </div>
          </div>
        </FormModal>
      )}

      {/* EDIT EXTENDED HR INFO MODAL (ADMIN ONLY) */}
      <FormModal
        isOpen={editModal.show}
        onClose={() => setEditModal({ show: false, staff: null })}
        title={`Edit HR Details: ${editModal.staff?.name}`}
        onSubmit={handleSaveEdit}
        loading={saving}
      >
        <form onSubmit={handleSaveEdit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Department
            </label>
            <input
              type="text"
              value={editForm.department}
              onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
              placeholder="Engineering, Design, HR, QA..."
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Reporting Manager Name
            </label>
            <input
              type="text"
              value={editForm.reporting_manager_name}
              onChange={(e) => setEditForm({ ...editForm, reporting_manager_name: e.target.value })}
              placeholder="e.g. Pranav Gadani"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
                Joining Date
              </label>
              <input
                type="date"
                value={editForm.joining_date}
                onChange={(e) => setEditForm({ ...editForm, joining_date: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
                Date of Birth
              </label>
              <input
                type="date"
                value={editForm.dob}
                onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Emergency Contact
            </label>
            <input
              type="text"
              value={editForm.emergency_contact}
              onChange={(e) => setEditForm({ ...editForm, emergency_contact: e.target.value })}
              placeholder="+91 98765 43210 (Relation: Spouse/Parent)"
              style={{ width: "100%", padding: "8px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            />
          </div>
        </form>
      </FormModal>
    </div>
  );
}
