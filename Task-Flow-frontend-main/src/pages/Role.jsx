import React, { useEffect, useState } from "react";
import "../style/main.css";
import DataTable from "../components/common/DataTable";
import FormModal from "../components/common/FormModal";
import PageHeader from "../components/common/PageHeader";
import API from "../api/api";
import { TextInput, SelectField } from "../components/common/FormFields";
import { SearchIcon } from "../components/common/Icons";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { useCompany } from "../contexts/CompanyContext";

export default function Role() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [permissionSearch, setPermissionSearch] = useState("");
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

  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    name: "",
    status: "Active",
    permissions: []
  });

  // Toast notification
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 1000);
  };

  // LOAD ROLES
  const load = async () => {
    try {
      const res = await API.get("/roles");
      setRoles(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Error loading roles:", error);
      setRoles([]);
    }
  };

  // LOAD PERMISSIONS
  const loadPermissions = async () => {
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
    loadPermissions();
  }, [selectedCompany]);

  // SAVE
  const save = async () => {
    setFieldErrors({});
    // Validation
    const nameRegex = /^[a-zA-Z0-9\s]+$/;
    if (!form.name.trim()) {
      setFieldErrors({ name: "Plese enter role name" });
      return;
    }
    if (form.name.length > 50) {
      setFieldErrors({ name: "Role name must be 50 characters or less" });
      return;
    }
    if (!nameRegex.test(form.name.trim())) {
      setFieldErrors({ name: "Role name can only contain letters, numbers and spaces" });
      return;
    }
    if (!form.status) {
      showToast("Please select a status", "error");
      return;
    }
    if (form.permissions.length === 0) {
      showToast("Please assign at least one permission", "error");
      return;
    }

    try {
      // LOG: Show what we're sending to backend
      console.log("=== SAVING ROLE ===");
      console.log("Role ID:", editId);
      console.log("Form data:", JSON.stringify(form, null, 2));

      if (editId) {
        const originalRole = roles.find(r => r._id === editId);
        if (originalRole) {
            const isSameName = originalRole.name === form.name.trim();
            const isSameStatus = originalRole.status === form.status;
            
            // Basic deep comparison of permissions
            let isSamePermissions = false;
            if (originalRole.permissions && form.permissions) {
                const orgPerms = [...originalRole.permissions].sort((a,b) => a.value?.localeCompare(b.value));
                const formPerms = [...form.permissions].sort((a,b) => a.value?.localeCompare(b.value));
                isSamePermissions = JSON.stringify(orgPerms) === JSON.stringify(formPerms);
            }
            // For older records or missing perms
            if (!originalRole.permissions && form.permissions.length === 0) isSamePermissions = true;

            if (isSameName && isSameStatus && isSamePermissions) {
                showToast("No changes detected.", "info");
                resetForm();
                setShowForm(false);
                return;
            }
        }
        await API.put(`/roles/${editId}`, form);
        showToast("Role updated successfully!");
      } else {
        await API.post("/roles", form);
        showToast("Role added successfully!");
      }

      resetForm();
      setShowForm(false);
      load();
    } catch (error) {
      console.error("Error saving role:", error);
      const errMsg = error.response?.data?.error || error.response?.data?.msg || error.message || "Error saving role";
      if (errMsg.toLowerCase().includes("role name") || errMsg.toLowerCase().includes("name")) {
        setFieldErrors({ name: "Plese enter role name" });
      } else {
        showToast(errMsg, "error");
      }
    }
  };

  // RESET FORM
  const resetForm = () => {
    setForm({
      name: "",
      status: "Active",
      permissions: []
    });
    setFieldErrors({});
    setPermissionSearch("");
    setEditId(null);
  };

  // EDIT
  const edit = (item) => {
    if (item.name === "Super Admin") {
      showToast("Super Admin role cannot be edited", "error");
      return;
    }
    // Convert old permission format to new format if needed
    const convertedPermissions = (item.permissions || []).map(perm => {
      if (perm.permissionId) {
        // Old format - need to convert to new format
        const permission = permissions.find(p => p._id === perm.permissionId);
        return {
          name: permission?.name || '',
          value: permission?.value || '',
          all: perm.all || false,
          create: perm.create || false,
          read: perm.read || false,
          update: perm.update || false,
          delete: perm.delete || false
        };
      }
      return perm; // Already in new format
    });

    setForm({
      name: item.name,
      status: item.status,
      permissions: convertedPermissions
    });
    setEditId(item._id);
    setShowForm(true);
  };

  // DELETE
  const remove = async (id) => {
    const item = roles.find(r => r._id === id);
    if (item && item.name === "Super Admin") {
      showToast("Super Admin role cannot be deleted", "error");
      return;
    }
    try {
      await API.delete(`/roles/${id}`);
      showToast("Role deleted successfully!", "delete");
      load();
    } catch (error) {
      console.error("Error deleting role:", error);
      showToast("Error deleting role", "error");
    }
  };

  // HANDLE PERMISSION CHANGE
  const handlePermissionChange = (permissionId, action, value) => {
    const updatedPermissions = [...form.permissions];
    const permission = permissions.find(p => p._id === permissionId);
    if (!permission) return;

    const existingPermissionIndex = updatedPermissions.findIndex(
      p => p.value === permission.value
    );

    if (existingPermissionIndex >= 0) {
      // Update existing permission
      updatedPermissions[existingPermissionIndex] = {
        ...updatedPermissions[existingPermissionIndex],
        [action]: value
      };

      // If "all" is checked, check all other actions. If unchecked, uncheck all.
      if (action === 'all') {
        updatedPermissions[existingPermissionIndex] = {
          ...updatedPermissions[existingPermissionIndex],
          all: value,
          create: value,
          read: value,
          update: value,
          delete: value
        };
      } else {
        // Update individual action
        updatedPermissions[existingPermissionIndex] = {
          ...updatedPermissions[existingPermissionIndex],
          [action]: value
        };
        
        // Auto-check "all" if all individual actions are true
        const p = updatedPermissions[existingPermissionIndex];
        if (p.create && p.read && p.update && p.delete) {
          p.all = true;
        } else {
          p.all = false;
        }
      }
    } else {
      // Add new permission with name and value
      const newPermission = {
        name: permission.name,
        value: permission.value,
        all: action === 'all' ? value : false,
        create: (action === 'all' && value) || (action === 'create' && value),
        read: (action === 'all' && value) || (action === 'read' && value),
        update: (action === 'all' && value) || (action === 'update' && value),
        delete: (action === 'all' && value) || (action === 'delete' && value)
      };
      
      // Secondary check for new permission auto-all
      if (newPermission.create && newPermission.read && newPermission.update && newPermission.delete) {
        newPermission.all = true;
      }

      updatedPermissions.push(newPermission);
    }

    // LOG: Show permission change
    console.log(`=== PERMISSION CHANGED ===`);
    console.log(`Permission: ${permission.name} (${permission.value})`);
    console.log(`Action: ${action} = ${value}`);
    console.log(`Updated permissions:`, updatedPermissions);

    setForm({ ...form, permissions: updatedPermissions });
  };

  // TABLE COLUMNS
  const columns = [
    { header: "Name", key: "name", width: "60%" },
    {
      header: "Status",
      key: "status",
      render: (v) => (
        <span className={`badge badge-${v?.toLowerCase() === 'active' ? 'active' : 'inactive'}`}>
          {v || "Active"}
        </span>
      )
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Role Management"
        buttonText={hasPermission("role_management", "create") ? "+ Add Role" : null}
        onButtonClick={() => setShowForm(true)}
      />

      {/* FORM MODAL */}
      <FormModal
        show={showForm}
        onClose={() => {
          setShowForm(false);
          resetForm();
        }}
        title={editId ? "Edit Role" : "Add Role"}
        onSave={save}
        saveText={editId ? "Update" : "Save"}
        maxWidth="800px"
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '10px 10px 30px 10px' }}>
          <div style={{ display: 'flex', gap: '30px', marginBottom: '15px' }}>
            <TextInput
              label="Role Name"
              placeholder="Enter role name"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: null }));
              }}
              maxLength={50}
              required
              error={fieldErrors.name}
              className="role-name-field"
              style={{ flex: 1 }}
            />

            <SelectField
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={[
                { value: "", label: "Select Status" },
                { value: "Active", label: "Active" },
                { value: "Inactive", label: "Inactive" },
              ]}
              required
              style={{ flex: 1 }}
            />
          </div>

          <div className="form-group" style={{ marginTop: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Permissions Matrix {permissionSearch && `(Filtered: ${permissions.filter(p => p.name?.toLowerCase().includes(permissionSearch.toLowerCase())).length})`}
              </label>
              
              {/* Permission Matrix Search Bar */}
              <div style={{ position: 'relative', width: '240px' }}>
                <input
                  type="text"
                  placeholder="Search module..."
                  value={permissionSearch}
                  onChange={(e) => setPermissionSearch(e.target.value)}
                  style={{
                    width: '100%',
                    height: '34px',
                    padding: '0 30px 0 10px',
                    fontSize: '12.5px',
                    borderRadius: '8px',
                    border: '1px solid var(--ui-border, #cbd5e1)',
                    background: 'var(--ui-surface, #fff)',
                    color: 'var(--text-main, #1e293b)',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                {permissionSearch ? (
                  <button
                    type="button"
                    onClick={() => setPermissionSearch("")}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      fontSize: '14px',
                      color: 'var(--text-muted, #94a3b8)',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    ×
                  </button>
                ) : (
                  <span style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted, #94a3b8)',
                    display: 'flex',
                    alignItems: 'center',
                    pointerEvents: 'none'
                  }}>
                    <SearchIcon size={14} color="var(--text-muted, #94a3b8)" />
                  </span>
                )}
              </div>
            </div>

            <div className="permissions-table-container" style={{
              background: 'var(--ui-surface)',
              borderRadius: '12px',
              overflowX: 'auto',
              maxHeight: '360px',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              border: '1px solid var(--ui-border)',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <table style={{
                width: '100%',
                minWidth: '520px',
                borderCollapse: 'collapse',
              }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-bg)', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{
                      padding: '14px 20px',
                      textAlign: 'left',
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}>
                      Module
                    </th>
                    <th style={{ padding: '14px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>All</th>
                    <th style={{ padding: '14px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Read</th>
                    <th style={{ padding: '14px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Create</th>
                    <th style={{ padding: '14px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Update</th>
                    <th style={{ padding: '14px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase' }}>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {permissions
                    .filter(p => {
                      const trimmed = (permissionSearch || "").trim().toLowerCase();
                      if (!trimmed || trimmed.length < 3) return true;
                      return p.name?.toLowerCase().includes(trimmed);
                    })
                    .map(permission => {
                    const currentPermission = form.permissions.find(p => p.value === permission.value);
                    return (
                      <tr key={permission._id} style={{ borderBottom: '1px solid var(--ui-border)' }}>
                        <td style={{
                          padding: '12px 20px',
                          color: 'var(--text-main)',
                          fontWeight: '500',
                          fontSize: '13.5px',
                        }}>
                          {permission.name}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={currentPermission?.all || false}
                            onChange={(e) => handlePermissionChange(permission._id, 'all', e.target.checked)}
                            style={{ accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={currentPermission?.read || false}
                            onChange={(e) => handlePermissionChange(permission._id, 'read', e.target.checked)}
                            style={{ accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          <input
                             type="checkbox"
                             checked={currentPermission?.create || false}
                             onChange={(e) => handlePermissionChange(permission._id, 'create', e.target.checked)}
                             style={{ accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={currentPermission?.update || false}
                            onChange={(e) => handlePermissionChange(permission._id, 'update', e.target.checked)}
                            style={{ accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                          />
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                           <input
                             type="checkbox"
                             checked={currentPermission?.delete || false}
                             onChange={(e) => handlePermissionChange(permission._id, 'delete', e.target.checked)}
                             style={{ accentColor: 'var(--primary-color)', cursor: 'pointer' }}
                           />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </FormModal>

      {/* DATA TABLE */}
      <DataTable
        data={roles}
        columns={columns}
        onEdit={hasPermission("role_management", "update") ? edit : null}
        onDelete={hasPermission("role_management", "delete") ? remove : null}
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
