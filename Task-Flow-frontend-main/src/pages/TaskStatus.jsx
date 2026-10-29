import React, { useEffect, useState } from "react";
import "../style/main.css";
import DataTable from "../components/common/DataTable";
import FormModal from "../components/common/FormModal";
import PageHeader from "../components/common/PageHeader";
import API from "../api/api";
import { getStatusBadgeClass, formatStatusText } from "../utils/statusHelper";
import { useProject } from "../contexts/ProjectContext";
import { SelectField, TextInput } from "../components/common/FormFields";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { useCompany } from "../contexts/CompanyContext";

export default function TaskStatus() {
  const { selectedProject } = useProject();
  const { selectedCompany } = useCompany();
  const [statuses, setStatuses] = useState([]);
  const [toast, setToast] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    name: "",
    status: "",
    project: "",
  });
  const [editId, setEditId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const { user } = useAuth();
  const { hasPermission: ctxHasPermission } = usePermissions();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isCompanyOwner = user?.role?.name === "Company Owner";

  const hasPermission = (module, action = "read") => {
    if (isSuperAdmin || isCompanyOwner) return true;
    return ctxHasPermission(module, action);
  };

  // Toast notification
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 1000);
  };

  const fetchStatus = async () => {
    const url = selectedProject
      ? `/task-status?project=${selectedProject._id}`
      : "/task-status";
    const res = await API.get(url);
    setStatuses(res.data);
  };

  useEffect(() => {
    fetchStatus();
  }, [selectedProject, selectedCompany]);

  const resetForm = () => {
    setForm({ name: "", status: "", project: selectedProject?._id || "" });
    setFieldErrors({});
    setEditId(null);
  };

  const handleSave = async () => {
    setFieldErrors({});
    // Validation
    const errors = {};
    if (!form.name.trim()) {
      errors.name = "Plese enter status name";
    }
    if (!form.status) {
      errors.status = "Plese enter status";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    try {
      const payload = {
        ...form,
        project: form.project || selectedProject?._id || ""
      };

      if (editId) {
        const originalStatus = statuses.find(s => s._id === editId);
        if (originalStatus) {
            const isSameName = originalStatus.name === form.name.trim();
            const isSameStatus = originalStatus.status === form.status;
            
            if (isSameName && isSameStatus) {
                showToast("No changes detected.", "info");
                setShowModal(false);
                resetForm();
                return;
            }
        }
        await API.put(
          `/task-status/${editId}`,
          payload
        );
        showToast("Task status updated successfully!");
      } else {
        await API.post("/task-status", payload);
        showToast("Task status added successfully!");
      }

      fetchStatus();
      resetForm();
      setShowModal(false);
    } catch (error) {
      console.error("Error saving task status:", error);
      const errMsg = error.response?.data?.error || error.response?.data?.message || error.message || "Error saving task status";
      if (errMsg.toLowerCase().includes("status name") || errMsg.toLowerCase().includes("name")) {
        setFieldErrors({ name: "Plese enter status name" });
      } else {
        showToast(errMsg, "error");
      }
    }
  };

  const handleAddClick = () => {
    resetForm();
    setShowModal(true);
  };

  const handleCloseModal = () => {
    resetForm();
    setShowModal(false);
  };

  const handleEdit = (item) => {
    setForm({
      name: item.name,
      status: item.status,
      project: item.project?._id || item.project || "",
    });
    setFieldErrors({});
    setEditId(item._id);
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    try {
      await API.delete(`/task-status/${id}`);
      showToast("Task status deleted successfully!", "delete");
      fetchStatus();
    } catch (error) {
      console.error("Error deleting task status:", error);
      showToast("Error deleting task status", "error");
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={selectedProject ? `${selectedProject.name} — Task Status` : "Task Status"}
        buttonText={hasPermission("task_status_management", "create") ? "Add Status" : null}
        onButtonClick={handleAddClick}
      />

      <FormModal
        show={showModal}
        onClose={handleCloseModal}
        title={editId ? "Edit Task Status" : "Add Task Status"}
        onSave={handleSave}
        saveText={editId ? "Update" : "Save"}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <TextInput
            label="Status Name"
            type="text"
            placeholder="Status Name"
            value={form.name}
            onChange={(e) => {
              setForm({ ...form, name: e.target.value });
              if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: null }));
            }}
            required
            error={fieldErrors.name}
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
          />
        </form>
      </FormModal>

      <div style={{ marginTop: "20px" }}>
        <DataTable
          data={statuses}
          columns={[
            { key: "name", header: "Status Name" },
            {
              key: "status",
              header: "Status",
              render: (value) => (
                <span className={`badge badge-${value?.toLowerCase()}`}>
                  {value}
                </span>
              ),
            },
          ]}
          onEdit={hasPermission("task_status_management", "update") ? handleEdit : null}
          onDelete={hasPermission("task_status_management", "delete") ? handleDelete : null}
        />
      </div>

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