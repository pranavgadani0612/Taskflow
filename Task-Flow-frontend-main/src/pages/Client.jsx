import { useEffect, useState } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { useCompany } from "../contexts/CompanyContext";
import { useProject } from "../contexts/ProjectContext";
import DataTable from "../components/common/DataTable";
import FormModal from "../components/common/FormModal";
import PageHeader from "../components/common/PageHeader";
import { TextInput, SelectField } from "../components/common/FormFields";
import { CheckIcon, CloseIcon, TrashIcon } from "../components/common/Icons";
import "../style/main.css";

/* ─── Helpers ──────────────────────────────────────── */
const initForm = {
  name: "",
  email: "",
  phone: "",
  company: "",
  address: "",
  status: "Active",
  notes: "",
  projects: [],
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Client() {
  const { user } = useAuth();
  const { hasPermission: ctxHasPermission } = usePermissions();
  const { selectedCompany } = useCompany();
  const { selectedProject } = useProject();

  const isSuperAdmin =
    user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isOwner =
    isSuperAdmin || user?.role?.name === "Company Owner";

  const hasPermission = (mod, action = "read") => {
    if (isOwner) return true;
    return ctxHasPermission(mod, action);
  };

  const [clients, setClients]       = useState([]);
  const [projects, setProjects]     = useState([]);
  const [showForm, setShowForm]     = useState(false);
  const [editId, setEditId]         = useState(null);
  const [form, setForm]             = useState(initForm);
  const [toast, setToast]           = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [viewClient, setViewClient] = useState(null);
  const [loading, setLoading]       = useState(false);

  /* ─── Toast ──────────────────────────────────────── */
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  /* ─── Load ───────────────────────────────────────── */
  const load = async () => {
    setLoading(true);
    try {
      const res = await API.get("/clients");
      setClients(res.data);
    } catch (err) {
      showToast("Failed to load clients", "error");
    }
    setLoading(false);
  };

  const loadProjects = async () => {
    try {
      const res = await API.get("/projects");
      setProjects(res.data || []);
    } catch {/* silent */}
  };

  useEffect(() => {
    load();
    loadProjects();
  }, [selectedCompany]);

  /* ─── Save ───────────────────────────────────────── */
  const save = async () => {
    if (form.phone && !/^\d{10,15}$/.test(form.phone.trim()))
      return showToast("Phone must be 10–15 digits", "error");

    setFieldErrors({});
    try {
      if (editId) {
        await API.put(`/clients/${editId}`, form);
        showToast("Client updated successfully!");
      } else {
        await API.post("/clients", form);
        showToast("Client added successfully!");
      }
      resetForm();
      setShowForm(false);
      load();
    } catch (err) {
      const serverMsg = err?.response?.data?.error || err?.response?.data?.message;
      const field = err?.response?.data?.field;
      if (field && serverMsg) {
        setFieldErrors({ [field]: serverMsg });
      } else if (serverMsg && serverMsg.toLowerCase().includes("client name")) {
        setFieldErrors({ name: serverMsg });
      } else if (serverMsg && serverMsg.toLowerCase().includes("email")) {
        setFieldErrors({ email: serverMsg });
      } else {
        showToast(serverMsg || "Error saving client", "error");
      }
    }
  };

  /* ─── Reset ──────────────────────────────────────── */
  const resetForm = () => {
    setForm(initForm);
    setEditId(null);
    setFieldErrors({});
  };

  /* ─── Edit ───────────────────────────────────────── */
  const edit = (item) => {
    setForm({
      name:     item.name || "",
      email:    item.email || "",
      phone:    item.phone || "",
      company:  item.company || "",
      address:  item.address || "",
      status:   item.status || "Active",
      notes:    item.notes || "",
      projects: (item.projects || []).map((p) => p._id || p),
    });
    setEditId(item._id);
    setShowForm(true);
  };

  /* ─── Delete ─────────────────────────────────────── */
  const remove = async (id) => {
    try {
      await API.delete(`/clients/${id}`);
      showToast("Client deleted", "delete");
      load();
    } catch (err) {
      showToast(err?.response?.data?.message || "Error deleting client", "error");
    }
  };

  /* ─── Project multi-select toggle ───────────────── */
  const toggleProject = (pid) => {
    setForm((prev) => ({
      ...prev,
      projects: prev.projects.includes(pid)
        ? prev.projects.filter((x) => x !== pid)
        : [...prev.projects, pid],
    }));
  };

  /* ─── Table columns ──────────────────────────────── */
  const columns = [
    { header: "Name",         key: "name" },
    { header: "Email",        key: "email" },
    { header: "Phone",        key: "phone" },
    { header: "Company",      key: "company" },
    {
      header: "Projects",
      key: "projects",
      render: (v) =>
        Array.isArray(v) && v.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {v.map((p) => (
              <span
                key={p._id || p}
                style={{
                  background: "rgba(99,102,241,0.1)",
                  color: "#6366f1",
                  borderRadius: 6,
                  padding: "2px 8px",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {p.name || p}
              </span>
            ))}
          </div>
        ) : (
          <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
        ),
    },
    {
      header: "Status",
      key: "status",
      render: (v) => (
        <span className={`badge badge-${v?.toLowerCase() === "active" ? "active" : "inactive"}`}>
          {v || "Active"}
        </span>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Client Management"
        buttonText={hasPermission("client_management", "create") ? "+ Add Client" : null}
        onButtonClick={() => { resetForm(); setShowForm(true); }}
      />

      {/* ── FORM MODAL ── */}
      <FormModal
        show={showForm}
        onClose={() => { setShowForm(false); resetForm(); }}
        title={editId ? "Edit Client" : "Add Client"}
        onSave={save}
        saveText={editId ? "Update" : "Save"}
        maxWidth="800px"
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '10px 10px 30px 10px' }}>
          <TextInput
            label="Full Name"
            type="text"
            placeholder="e.g. Rahul Sharma"
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
            placeholder="client@example.com"
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
            placeholder="10-digit phone number"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, "") })}
            maxLength={15}
          />

          <TextInput
            label="Client's Company / Organisation"
            type="text"
            placeholder="e.g. Acme Corp"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />

          <TextInput
            label="Address"
            type="text"
            placeholder="Enter address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />

          <SelectField
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            options={[
              { value: "Active",   label: "Active" },
              { value: "Inactive", label: "Inactive" },
            ]}
          />

          {/* Projects multi-select */}
          {projects.length > 0 && (
            <div className="form-group">
              <label style={{ display: "block", marginBottom: 8, fontWeight: 700, color: "#374151", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.025em" }}>
                Linked Projects
              </label>
              <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                padding: "10px 12px",
                border: "1.5px solid #e5e7eb",
                borderRadius: 10,
                background: "#fafbfc",
                maxHeight: 160,
                overflowY: "auto",
              }}>
                {projects.map((p) => {
                  const selected = form.projects.includes(p._id);
                  return (
                    <button
                      key={p._id}
                      type="button"
                      onClick={() => toggleProject(p._id)}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 20,
                        border: selected ? "1.5px solid #6366f1" : "1.5px solid #e5e7eb",
                        background: selected ? "rgba(99,102,241,0.1)" : "#fff",
                        color: selected ? "#6366f1" : "#6b7280",
                        fontSize: 13,
                        fontWeight: selected ? 700 : 500,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {selected && <CheckIcon size={12} color="currentColor" style={{ marginRight: 4, verticalAlign: "middle" }} />}{p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="form-group">
            <label style={{ display: "block", marginBottom: 8, fontWeight: 700, color: "#374151", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.025em" }}>
              Notes
            </label>
            <textarea
              placeholder="Any additional notes..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1.5px solid #e5e7eb",
                borderRadius: 10,
                fontSize: 14,
                color: "#111827",
                resize: "vertical",
                outline: "none",
                fontFamily: "inherit",
                background: "#fff",
              }}
            />
          </div>
        </div>
      </FormModal>

      {/* ── VIEW DETAIL MODAL ── */}
      {viewClient && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(15,23,42,0.45)",
            backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setViewClient(null)}
        >
          <div
            style={{
              background: "var(--ui-surface)",
              border: "1px solid var(--ui-border)",
              borderRadius: 18,
              width: 480,
              maxWidth: "95vw",
              boxShadow: "0 24px 60px rgba(0,0,0,0.18)",
              padding: 28,
              animation: "fadeUpIn 0.2s ease",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: 22, fontWeight: 800,
              }}>
                {viewClient.name?.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-main)" }}>{viewClient.name}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{viewClient.email}</div>
              </div>
              <button
                onClick={() => setViewClient(null)}
                style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              ><CloseIcon size={18} /></button>
            </div>

            {/* Details grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 24px", marginBottom: 18 }}>
              {[
                { label: "Phone",   value: viewClient.phone   || "—" },
                { label: "Company", value: viewClient.company || "—" },
                { label: "Status",  value: viewClient.status  || "Active" },
                { label: "Address", value: viewClient.address || "—" },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-main)" }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Projects */}
            {viewClient.projects?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Linked Projects</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {viewClient.projects.map((p) => (
                    <span key={p._id} style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 600 }}>
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {viewClient.notes && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Notes</div>
                <div style={{ fontSize: 14, color: "var(--text-main)", background: "var(--ui-bg)", padding: "10px 14px", borderRadius: 8, border: "1px solid var(--ui-border)" }}>
                  {viewClient.notes}
                </div>
              </div>
            )}

            {/* Actions */}
            {(hasPermission("client_management", "update") || hasPermission("client_management", "delete")) && (
              <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
                {hasPermission("client_management", "update") && (
                  <button
                    onClick={() => { setViewClient(null); edit(viewClient); }}
                    style={{ padding: "8px 20px", borderRadius: 9, border: "1px solid var(--ui-border)", background: "var(--ui-surface)", color: "var(--text-main)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                  >Edit</button>
                )}
                {hasPermission("client_management", "delete") && (
                  <button
                    onClick={() => { setViewClient(null); remove(viewClient._id); }}
                    style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: "#ef4444", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                  >Delete</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DATA TABLE ── */}
      <DataTable
        data={selectedProject 
          ? clients.filter(c => (c.projects || []).some(p => (p._id || p) === selectedProject._id))
          : clients
        }
        columns={columns}
        onEdit={hasPermission("client_management", "update") ? edit : null}
        onDelete={hasPermission("client_management", "delete") ? remove : null}
      />

      {/* ── TOAST ── */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 20, right: 20,
          padding: "14px 22px",
          borderRadius: 10,
          background: toast.type === "success" ? "#10b981" : toast.type === "delete" ? "#ef4444" : toast.type === "error" ? "#ef4444" : "#f59e0b",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          zIndex: 9999,
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          animation: "slideInRight 0.3s ease-out",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            {toast.type === "success" ? <CheckIcon size={15} color="#fff" /> : toast.type === "delete" ? <TrashIcon size={15} color="#fff" /> : <CloseIcon size={15} color="#fff" />}
          </span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
