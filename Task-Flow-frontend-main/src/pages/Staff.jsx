import React, { useEffect, useState } from "react";
import "../style/main.css";
import DataTable from "../components/common/DataTable";
import FormModal from "../components/common/FormModal";
import PageHeader from "../components/common/PageHeader";
import ProtectedRoute from "../components/ProtectedRoute";
import API from "../api/api";
import { SelectField, TextInput } from "../components/common/FormFields";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { useCompany } from "../contexts/CompanyContext";
import { IconStar } from "../components/common/Icons";

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState(null);
  const { user } = useAuth();
  const { hasPermission: ctxHasPermission } = usePermissions();
  const { selectedCompany } = useCompany();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isCompanyOwner = user?.role?.name === "Company Owner";

  const hasPermission = (module, action = "read") => {
    if (isSuperAdmin || isCompanyOwner) return true;
    return ctxHasPermission(module, action);
  };

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    status: "Active",
    role: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});

  // Toast notification
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  };

  const [ratingMap, setRatingMap] = useState({});

  // LOAD STAFF (Include inactive so admin can manage or activate them)
  const load = async () => {
    const res = await API.get("/staff?includeInactive=true");
    setStaff(res.data.staff || res.data);
  };

  // LOAD ROLES
  const loadRoles = async () => {
    const res = await API.get("/roles");
    setRoles(Array.isArray(res.data) ? res.data : []);
  };

  // LOAD RATINGS
  const loadRatings = async () => {
    try {
      const res = await API.get("/ratings/summary");
      if (Array.isArray(res.data)) {
        const map = {};
        res.data.forEach((item) => {
          if (item.employee?._id) {
            map[item.employee._id] = item.averageScore;
          }
        });
        setRatingMap(map);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    loadRoles();
    loadRatings();
  }, [selectedCompany]);

  // SAVE
  const save = async () => {
    // Client-side validation: Populate inline field errors directly under inputs
    const errors = {};
    const nameRegex = /^[a-zA-Z\s]+$/;
    if (!form.name || !form.name.trim()) {
      errors.name = "Plese enter name";
    } else if (!nameRegex.test(form.name.trim())) {
      errors.name = "Name must contain only letters and spaces";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.email || !form.email.trim()) {
      errors.email = "Plese enter email";
    } else if (form.email.length > 255) {
      errors.email = "Email must be less than 255 characters";
    } else if (!emailRegex.test(form.email.trim())) {
      errors.email = "Please enter a valid email address";
    }

    const phoneRegex = /^\d{10}$/;
    if (!form.phone || !String(form.phone).trim()) {
      errors.phone = "Plese enter phone";
    } else if (!phoneRegex.test(String(form.phone).trim())) {
      errors.phone = "Phone must contain 10 digits only";
    }

    if (!editId && (!form.password || form.password.trim().length < 6)) {
      errors.password = "Plese enter password";
    } else if (editId && form.password && form.password.trim().length < 6) {
      errors.password = "Password must be at least 6 characters";
    }

    if (!form.status) {
      errors.status = "Plese enter status";
    }

    if (!form.role) {
      errors.role = "Plese enter role";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      setFieldErrors({});
      if (editId) {
        const originalStaff = staff.find(s => s._id === editId);
        if (originalStaff) {
          const isSameName = originalStaff.name === form.name.trim();
          const isSameEmail = originalStaff.email === form.email.trim();
          const isSamePhone = String(originalStaff.phone || "").trim() === String(form.phone || "").trim();
          const isSameStatus = originalStaff.status === form.status;
          const isSameRole = (originalStaff.role?._id || originalStaff.role || "") === form.role;
          const hasNoPasswordChange = !form.password || !form.password.trim();

          if (isSameName && isSameEmail && isSamePhone && isSameStatus && isSameRole && hasNoPasswordChange) {
            showToast("No changes detected.", "info");
            resetForm();
            setShowForm(false);
            return;
          }
        }
        await API.put(
          `/staff/${editId}`,
          form
        );
        showToast("Staff updated successfully!");
      } else {
        await API.post(
          "/staff",
          form
        );
        showToast("Staff added successfully!");
      }

      resetForm();
      setShowForm(false);
      load();
    } catch (error) {
      console.error("Error saving staff:", error);
      const serverMsg = error.response?.data?.error || error.response?.data?.message;
      const field = error.response?.data?.field;
      if (field && serverMsg) {
        setFieldErrors({ [field]: serverMsg });
      } else if (serverMsg && serverMsg.toLowerCase().includes("email")) {
        setFieldErrors({ email: serverMsg });
      } else if (serverMsg && serverMsg.toLowerCase().includes("name")) {
        setFieldErrors({ name: serverMsg });
      } else if (serverMsg && serverMsg.toLowerCase().includes("password")) {
        setFieldErrors({ password: serverMsg });
      } else if (serverMsg && serverMsg.toLowerCase().includes("phone")) {
        setFieldErrors({ phone: serverMsg });
      } else {
        showToast(serverMsg || "Error saving staff", "error");
      }
    }
  };

  // RESET FORM
  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      phone: "",
      password: "",
      status: "Active",
      role: "",
    });
    setEditId(null);
    setFieldErrors({});
  };

  // EDIT
  const edit = (item) => {
    if (item.email === "gadanipranav@gmail.com" || (item.role && item.role.name === "Super Admin")) {
      showToast("Super Admin cannot be edited", "error");
      return;
    }
    setForm({
      ...item,
      password: "",
      role: item.role ? (item.role._id || item.role.id || item.role) : ""
    });
    setEditId(item._id);
    setShowForm(true);
  };

  // DELETE
  const remove = async (id) => {
    const item = staff.find(s => s._id === id);
    if (item && (item.email === "gadanipranav@gmail.com" || (item.role && item.role.name === "Super Admin"))) {
      showToast("Super Admin cannot be deleted", "error");
      return;
    }
    try {
      await API.delete(`/staff/${id}`);
      showToast("Staff deleted successfully!", "delete");
      load();
    } catch (error) {
      console.error("Error deleting staff:", error);
      showToast("Error deleting staff", "error");
    }
  };

  // TABLE COLUMNS
  const columns = [
    { 
      header: "Name", 
      key: "name",
      render: (v) => (
        <span 
          title={v} 
          style={{ 
            display: "inline-block", 
            maxWidth: "180px", 
            overflow: "hidden", 
            textOverflow: "ellipsis", 
            whiteSpace: "nowrap",
            verticalAlign: "middle",
            fontWeight: "600"
          }}
        >
          {v}
        </span>
      )
    },
    { header: "Email", key: "email" },
    { header: "Phone", key: "phone" },
    {
      header: "Status",
      key: "status",
      render: (v) => (
        <span className={`badge badge-${v?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>
          {v || "Active"}
        </span>
      )
    },
    { header: "Role", key: "role" },
    {
      header: "Rating",
      key: "_id",
      render: (id) => {
        const score = ratingMap[id];
        if (!score) return <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>No reviews</span>;
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontWeight: "700", color: "#f59e0b" }}>
            <IconStar size={13} color="#f59e0b" /> {score}
          </span>
        );
      }
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Staff Management"
        buttonText={hasPermission("staff_management", "create") ? "+ Add Staff" : null}
        onButtonClick={() => setShowForm(true)}
      />

      {/* FORM MODAL */}

        <FormModal
          show={showForm}
          onClose={() => {
            setShowForm(false);
            resetForm();
          }}
          title={editId ? "Edit Staff" : "Add Staff"}
          onSave={save}
          saveText={editId ? "Update" : "Save"}
        >
          <form onSubmit={(e) => { e.preventDefault(); save(); }}>
            <TextInput
              label="Name"
              type="text"
              placeholder="Enter name"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: "" }));
              }}
              error={fieldErrors.name}
              required
            />

            <TextInput
              label="Email"
              type="email"
              placeholder="Enter email"
              value={form.email}
              onChange={(e) => {
                setForm({ ...form, email: e.target.value });
                if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: "" }));
              }}
              maxLength={255}
              error={fieldErrors.email}
              required
            />

            <TextInput
              label="Phone"
              type="text"
              placeholder="Enter phone (10 digits)"
              value={form.phone}
              onChange={(e) => {
                setForm({ ...form, phone: e.target.value.replace(/\D/g, '') });
                if (fieldErrors.phone) setFieldErrors(prev => ({ ...prev, phone: "" }));
              }}
              maxLength={10}
              error={fieldErrors.phone}
              required
            />

            <TextInput
              label={editId ? "Password (Leave blank to keep current)" : "Password"}
              type="password"
              placeholder={editId ? "Enter new password (optional)" : "Enter password (min 6 characters)"}
              value={form.password}
              onChange={(e) => {
                setForm({ ...form, password: e.target.value });
                if (fieldErrors.password) setFieldErrors(prev => ({ ...prev, password: "" }));
              }}
              error={fieldErrors.password}
              required={!editId}
            />

            <SelectField
              label="Status"
              value={form.status}
              onChange={(e) => {
                setForm({ ...form, status: e.target.value });
                if (fieldErrors.status) setFieldErrors(prev => ({ ...prev, status: "" }));
              }}
              options={[
                { value: "", label: "Select Status" },
                { value: "Active", label: "Active" },
                { value: "Inactive", label: "Inactive" },
              ]}
              error={fieldErrors.status}
              required
            />

            <SelectField
              label="Role"
              value={form.role}
              onChange={(e) => {
                setForm({ ...form, role: e.target.value });
                if (fieldErrors.role) setFieldErrors(prev => ({ ...prev, role: "" }));
              }}
              error={fieldErrors.role}
              required
            >
              <option value="">Select a Role</option>
              {roles.filter(r => r.name !== "Super Admin").map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name}
                </option>
              ))}
            </SelectField>
          </form>
        </FormModal>


      {/* DATA TABLE */}

        <DataTable
          data={staff}
          columns={columns}
          onEdit={hasPermission("staff_management", "update") ? edit : null}
          onDelete={hasPermission("staff_management", "delete") ? remove : null}
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