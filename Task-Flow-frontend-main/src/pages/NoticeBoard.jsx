import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../contexts/PermissionContext";
import FormModal from "../components/common/FormModal";
import ConfirmModal from "../components/common/ConfirmModal";
import { IconBell, IconPin, IconCheck, IconFileText } from "../components/common/Icons";
import "../style/main.css";

export default function NoticeBoard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { hasPermission: ctxHasPermission } = usePermissions();

  const [confirmConfig, setConfirmConfig] = useState({
    show: false,
    title: "Confirmation",
    message: "",
    onConfirm: () => {},
    confirmText: "Delete",
    confirmColor: "var(--danger-color)"
  });

  const askConfirm = (title, message, onConfirm, confirmText = "Delete", confirmColor = "var(--danger-color)") => {
    setConfirmConfig({
      show: true,
      title,
      message,
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, show: false }));
        await onConfirm();
      },
      confirmText,
      confirmColor
    });
  };

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isOwner = isSuperAdmin || user?.role?.name === "Company Owner";
  const hasPermission = (action = "read") => {
    if (isOwner) return true;
    return ctxHasPermission("notice_board", action);
  };

  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingNotice, setEditingNotice] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    priority: "Normal",
    target_department: "All",
    pinned: false,
    requires_acknowledgment: false
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const res = await API.get("/announcements");
      setAnnouncements(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error loading announcements:", err);
      showToast("Failed to load announcements", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const handleOpenAdd = () => {
    setEditingNotice(null);
    setFieldErrors({});
    setFormData({
      title: "",
      content: "",
      priority: "Normal",
      target_department: "All",
      pinned: false,
      requires_acknowledgment: false
    });
    setShowModal(true);
  };

  const handleOpenEdit = (item) => {
    setEditingNotice(item);
    setFieldErrors({});
    setFormData({
      title: item.title || "",
      content: item.content || "",
      priority: item.priority || "Normal",
      target_department: item.target_department || "All",
      pinned: Boolean(item.pinned),
      requires_acknowledgment: Boolean(item.requires_acknowledgment)
    });
    setShowModal(true);
  };

  const handleSave = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!formData.title || !formData.title.trim()) {
      showToast("Announcement title is required", "error");
      return;
    }
    if (!formData.content || !formData.content.trim()) {
      showToast("Announcement content is required", "error");
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      if (editingNotice) {
        await API.put(`/announcements/${editingNotice.id}`, formData);
        showToast("Announcement updated successfully!", "success");
      } else {
        await API.post("/announcements", formData);
        showToast("Announcement published successfully!", "success");
      }
      setShowModal(false);
      setEditingNotice(null);
      setFieldErrors({});
      setFormData({
        title: "",
        content: "",
        priority: "Normal",
        target_department: "All",
        pinned: false,
        requires_acknowledgment: false
      });
      fetchAnnouncements();
    } catch (err) {
      const serverErr = err.response?.data?.error;
      const serverField = err.response?.data?.field;
      if (serverField) {
        setFieldErrors({ [serverField]: serverErr });
      } else if (serverErr) {
        showToast(serverErr, "error");
      } else {
        showToast("Failed to save notice", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async (id) => {
    try {
      await API.post(`/announcements/${id}/acknowledge`);
      showToast("You have acknowledged this announcement", "success");
      fetchAnnouncements();
    } catch (err) {
      showToast(err.response?.data?.error || "Acknowledgment failed", "error");
    }
  };

  const handleDelete = (id) => {
    askConfirm("Delete Announcement", "Are you sure you want to delete this announcement?", async () => {
      try {
        await API.delete(`/announcements/${id}`);
        showToast("Announcement deleted", "info");
        fetchAnnouncements();
      } catch (err) {
        showToast(err.response?.data?.error || "Delete failed", "error");
      }
    });
  };

  const getPriorityStyle = (priority) => {
    switch (priority) {
      case "Urgent":
        return { bg: "rgba(239, 68, 68, 0.12)", color: "#dc2626", border: "rgba(239, 68, 68, 0.3)" };
      case "High":
        return { bg: "rgba(245, 158, 11, 0.12)", color: "#d97706", border: "rgba(245, 158, 11, 0.3)" };
      default:
        return { bg: "rgba(59, 130, 246, 0.1)", color: "#2563eb", border: "rgba(59, 130, 246, 0.25)" };
    }
  };

  return (
    <div style={{ padding: "clamp(16px, 3vw, 28px)", maxWidth: "1200px", margin: "0 auto" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <IconBell size={26} color="#4f46e5" />
            <h1 style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-main, #1e293b)", margin: 0 }}>
              Company Notice Board
            </h1>
          </div>
          <p style={{ color: "var(--text-muted, #64748b)", margin: "6px 0 0", fontSize: "14px" }}>
            Official company news, townhalls, policy updates, and team announcements.
          </p>
        </div>

        {hasPermission("create") && (
          <button
            onClick={handleOpenAdd}
            style={{
              background: "linear-gradient(135deg, #4f46e5, #6366f1)",
              color: "#fff",
              border: "none",
              padding: "10px 20px",
              borderRadius: "10px",
              fontWeight: "700",
              fontSize: "14px",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Post Announcement
          </button>
        )}
      </div>

      {/* ANNOUNCEMENT LIST */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "var(--text-muted, #94a3b8)" }}>
          Loading announcements...
        </div>
      ) : announcements.length === 0 ? (
        <div style={{
          textAlign: "center",
          padding: "60px 20px",
          background: "var(--ui-surface, #fff)",
          borderRadius: "16px",
          border: "1px solid var(--ui-border, #e2e8f0)"
        }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
            <IconFileText size={40} color="#94a3b8" />
          </div>
          <h3 style={{ fontSize: "18px", fontWeight: "700", color: "var(--text-main, #1e293b)", margin: 0 }}>No announcements yet</h3>
          <p style={{ color: "var(--text-muted, #64748b)", fontSize: "13px", marginTop: "6px" }}>
            Check back later for company news and updates.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {announcements.map((item) => {
            const pStyle = getPriorityStyle(item.priority);
            return (
              <div
                key={item.id}
                style={{
                  background: "var(--ui-surface, #ffffff)",
                  borderRadius: "16px",
                  padding: "24px",
                  border: item.pinned ? "2px solid #6366f1" : "1px solid var(--ui-border, #e2e8f0)",
                  boxShadow: item.pinned ? "0 8px 24px -4px rgba(99, 102, 241, 0.12)" : "0 2px 8px rgba(0,0,0,0.03)",
                  position: "relative"
                }}
              >
                {/* TOP META ROW */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    {item.pinned && (
                      <span style={{
                        background: "linear-gradient(135deg, #4f46e5, #6366f1)",
                        color: "#fff",
                        fontSize: "11px",
                        fontWeight: "800",
                        padding: "3px 10px",
                        borderRadius: "20px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px"
                      }}>
                        <IconPin size={12} color="#fff" /> PINNED
                      </span>
                    )}
                    <span style={{
                      background: pStyle.bg,
                      color: pStyle.color,
                      border: `1px solid ${pStyle.border}`,
                      fontSize: "11px",
                      fontWeight: "700",
                      padding: "3px 10px",
                      borderRadius: "20px"
                    }}>
                      {item.priority} Priority
                    </span>
                    <span style={{
                      background: "var(--ui-bg, #f1f5f9)",
                      color: "var(--text-muted, #64748b)",
                      fontSize: "11px",
                      fontWeight: "600",
                      padding: "3px 8px",
                      borderRadius: "6px"
                    }}>
                      Dept: {item.target_department || "All"}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-muted, #94a3b8)" }}>
                      {new Date(item.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    {hasPermission("update") && (
                      <button
                        onClick={() => handleOpenEdit(item)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#4f46e5",
                          cursor: "pointer",
                          padding: "4px",
                          display: "flex",
                          alignItems: "center"
                        }}
                        title="Edit Announcement"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    )}
                    {hasPermission("delete") && (
                      <button
                        onClick={() => handleDelete(item.id)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#ef4444",
                          cursor: "pointer",
                          padding: "4px",
                          display: "flex",
                          alignItems: "center"
                        }}
                        title="Delete Announcement"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* TITLE & CONTENT */}
                <h2 style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-main, #0f172a)", margin: "0 0 10px 0" }}>
                  {item.title}
                </h2>
                <div style={{
                  fontSize: "14px",
                  color: "var(--text-main, #334155)",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap",
                  marginBottom: "18px"
                }}>
                  {item.content}
                </div>

                {/* FOOTER & ACKNOWLEDGMENTS */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTop: "1px solid var(--ui-border, #f1f5f9)",
                  paddingTop: "14px",
                  flexWrap: "wrap",
                  gap: "12px"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                    <div style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "50%",
                      background: "#e0e7ff",
                      color: "#4f46e5",
                      fontWeight: "700",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "11px"
                    }}>
                      {item.created_by_name?.charAt(0) || "A"}
                    </div>
                    <span>Posted by <strong>{item.created_by_name || "Management"}</strong></span>
                    {item.requires_acknowledgment && (
                      <span style={{ marginLeft: "6px", color: "#6366f1", fontWeight: "600" }}>
                        • {item.ack_count} acknowledged
                      </span>
                    )}
                  </div>

                  {item.requires_acknowledgment && (
                    item.user_acknowledged ? (
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        fontWeight: "700",
                        color: "#16a34a",
                        background: "rgba(34, 197, 94, 0.1)",
                        padding: "6px 12px",
                        borderRadius: "8px"
                      }}>
                        <IconCheck size={14} color="#16a34a" /> Acknowledged by you
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAcknowledge(item.id)}
                        style={{
                          background: "#4f46e5",
                          color: "#fff",
                          border: "none",
                          padding: "8px 16px",
                          borderRadius: "8px",
                          fontWeight: "700",
                          fontSize: "12px",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px"
                        }}
                      >
                        <IconCheck size={14} color="#fff" /> Mark as Acknowledged
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* POST / EDIT ANNOUNCEMENT MODAL */}
      <FormModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingNotice(null);
        }}
        title={editingNotice ? "Edit Announcement" : "Post Company Announcement"}
        onSubmit={handleSave}
        loading={submitting}
      >
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Announcement Title <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => {
                setFormData({ ...formData, title: e.target.value });
                if (fieldErrors.title) setFieldErrors({ ...fieldErrors, title: null });
              }}
              placeholder="e.g. Q4 Townhall & Strategic Goals"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: fieldErrors.title ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                borderRadius: "6px",
                background: fieldErrors.title ? "#fff5f5" : "var(--ui-surface, #fff)",
                color: "var(--text-main, #1e293b)"
              }}
            />
            {fieldErrors.title && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {fieldErrors.title}
              </span>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
                Priority
              </label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
                Target Department
              </label>
              <input
                type="text"
                value={formData.target_department}
                onChange={(e) => setFormData({ ...formData, target_department: e.target.value })}
                placeholder="All, Engineering, Product..."
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Announcement Content / Details <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
            </label>
            <textarea
              rows="5"
              required
              value={formData.content}
              onChange={(e) => {
                setFormData({ ...formData, content: e.target.value });
                if (fieldErrors.content) setFieldErrors({ ...fieldErrors, content: null });
              }}
              placeholder="Enter announcement details, date, agenda, policy change..."
              style={{
                width: "100%",
                padding: "10px 12px",
                border: fieldErrors.content ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                borderRadius: "6px",
                background: fieldErrors.content ? "#fff5f5" : "var(--ui-surface, #fff)",
                color: "var(--text-main, #1e293b)",
                resize: "vertical"
              }}
            />
            {fieldErrors.content && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {fieldErrors.content}
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", background: "var(--ui-bg, #f8fafc)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", color: "var(--text-main, #1e293b)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={formData.pinned}
                onChange={(e) => setFormData({ ...formData, pinned: e.target.checked })}
              />
              Pin to Top of Notice Board
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", color: "var(--text-main, #1e293b)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={formData.requires_acknowledgment}
                onChange={(e) => setFormData({ ...formData, requires_acknowledgment: e.target.checked })}
              />
              Require Employee Acknowledgment
            </label>
          </div>
        </form>
      </FormModal>

      <ConfirmModal
        show={confirmConfig.show}
        onClose={() => setConfirmConfig((prev) => ({ ...prev, show: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        confirmColor={confirmConfig.confirmColor}
      />
    </div>
  );
}
