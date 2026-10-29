import React, { useEffect, useState } from "react";
import "../style/main.css";
import DataTable from "../components/common/DataTable";
import FormModal from "../components/common/FormModal";
import PageHeader from "../components/common/PageHeader";
import API from "../api/api";
import { TextInput } from "../components/common/FormFields";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";

export default function Permission() {
  const [permissions, setPermissions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState(null);
  const { user } = useAuth();
  const { hasPermission: ctxHasPermission } = usePermissions();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isCompanyOwner = user?.role?.name === "Company Owner";

  const hasPermission = (module, action = "read") => {
    if (isSuperAdmin || isCompanyOwner) return true;
    return ctxHasPermission(module, action);
  };

  const [form, setForm] = useState({
    name: "",
    value: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});

  // Toast notification
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 1000);
  };

  // Generate value from name (convert to lowercase with underscores)
  const generateValue = (name) => {
    return name.toLowerCase().replace(/\s+/g, '_');
  };

  // LOAD PERMISSIONS
  const load = async () => {
    try {
      const res = await API.get("/permissions");
      setPermissions(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error loading permissions:", error);
      setPermissions([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // SAVE
  const save = async () => {
    if (!form.name || !form.name.trim()) {
      setFieldErrors({ name: "Plese enter permission name" });
      return;
    }
    // Validation
    const nameRegex = /^[a-zA-Z\s]+$/;
    if (form.name.length > 50) {
      showToast("Permission name must be 50 characters or less", "error");
      return;
    }
    if (!nameRegex.test(form.name.trim())) {
      showToast("Permission name can only contain letters and spaces", "error");
      return;
    }

    try {
      setFieldErrors({});
      if (editId) {
        await API.put(`/permissions/${editId}`, form);
        showToast("Permission updated successfully!");
      } else {
        await API.post("/permissions", form);
        showToast("Permission added successfully!");
      }

      resetForm();
      setShowForm(false);
      load();
    } catch (error) {
      console.error("Error saving permission:", error);
      const serverErr = error.response?.data?.error;
      const serverField = error.response?.data?.field;
      if (serverField) {
        setFieldErrors({ [serverField]: serverErr });
      } else {
        showToast(serverErr || "Error saving permission", "error");
      }
    }
  };

  // RESET FORM
  const resetForm = () => {
    setForm({
      name: "",
      value: "",
    });
    setFieldErrors({});
    setEditId(null);
  };

  // EDIT
  const edit = (item) => {
    setForm({
      name: item.name,
      value: item.value,
    });
    setEditId(item._id);
    setShowForm(true);
  };

  // DELETE
  const remove = async (id) => {
    try {
      await API.delete(`/permissions/${id}`);
      showToast("Permission deleted successfully!", "delete");
      load();
    } catch (error) {
      console.error("Error deleting permission:", error);
      showToast("Error deleting permission", "error");
    }
  };

  // Handle name change and auto-generate value
  const handleNameChange = (e) => {
    const name = e.target.value;
    const value = generateValue(name);
    setForm({
      ...form,
      name: name,
      value: value,
    });
  };

  // TABLE COLUMNS
  const columns = [
    { header: "Name", key: "name" },
    { header: "Value", key: "value" },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Permission Management"
        buttonText={hasPermission("permission_management", "create") ? "+ Add Permission" : null}
        onButtonClick={() => setShowForm(true)}
      />

      {/* FORM MODAL */}
      <FormModal
        show={showForm}
        onClose={() => {
          setShowForm(false);
          resetForm();
        }}
        title={editId ? "Edit Permission" : "Add Permission"}
        onSave={save}
        saveText={editId ? "Update" : "Save"}
      >
        <TextInput
          label="Permission Name *"
          type="text"
          placeholder="Enter permission name (e.g., User Create)"
          value={form.name}
          onChange={(e) => {
            handleNameChange(e);
            if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: null }));
          }}
          maxLength={50}
          error={fieldErrors.name}
        />

        <TextInput
          label="Permission Value"
          type="text"
          placeholder="Auto-generated value"
          value={form.value}
          readOnly
          style={{ opacity: 0.6 }}
          hint="Automatically generated from name (lowercase with underscores)"
        />
      </FormModal>

      {/* DATA TABLE */}
      <DataTable
        data={permissions}
        columns={columns}
        onEdit={hasPermission("permission_management", "update") ? edit : null}
        onDelete={hasPermission("permission_management", "delete") ? remove : null}
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
