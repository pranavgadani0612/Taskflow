import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import FormModal from "../components/common/FormModal";
import ConfirmModal from "../components/common/ConfirmModal";
import { IconHome, IconBuilding, IconCheck, IconX } from "../components/common/Icons";
import Pagination from "../components/common/Pagination";
import { useTableSort, SortIndicator } from "../utils/tableSort";
import "../style/main.css";

export default function WfhRequests() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isManager = isSuperAdmin || user?.position?.includes("Manager") || user?.role?.name?.includes("Manager");

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { sortedData: sortedRequests, sortConfig, requestSort } = useTableSort(requests, "from_date", "desc");
  const paginatedRequests = sortedRequests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    request_type: "WFH",
    from_date: new Date().toISOString().slice(0, 10),
    to_date: new Date().toISOString().slice(0, 10),
    day_type: "Full Day",
    reason: ""
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const [reviewModal, setReviewModal] = useState({
    show: false,
    item: null,
    action: "approve",
    comment: ""
  });
  const [processingReview, setProcessingReview] = useState(false);

  const [confirmConfig, setConfirmConfig] = useState({
    show: false,
    title: "Confirmation",
    message: "",
    onConfirm: () => {},
    confirmText: "Cancel Request",
    confirmColor: "var(--danger-color)"
  });

  const askConfirm = (title, message, onConfirm, confirmText = "Cancel Request", confirmColor = "var(--danger-color)") => {
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

  const fetchRequests = async () => {
    try {
      setLoading(true);
      let url = "/wfh?";
      if (statusFilter !== "All") url += `status=${statusFilter}&`;
      if (typeFilter !== "All") url += `type=${typeFilter}&`;
      const res = await API.get(url);
      setRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error loading WFH requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchRequests();
  }, [statusFilter, typeFilter]);

  const handleCreate = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.from_date) errs.from_date = "From date is required";
    if (!form.to_date) errs.to_date = "To date is required";
    if (!form.reason || !form.reason.trim()) errs.reason = "Reason / work details are required";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      showToast("Please fill all required fields", "error");
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      await API.post("/wfh", form);
      showToast(`${form.request_type} request submitted successfully!`, "success");
      setShowModal(false);
      setFieldErrors({});
      setForm({
        request_type: "WFH",
        from_date: new Date().toISOString().slice(0, 10),
        to_date: new Date().toISOString().slice(0, 10),
        day_type: "Full Day",
        reason: ""
      });
      fetchRequests();
    } catch (err) {
      const serverErr = err.response?.data?.error;
      const serverField = err.response?.data?.field;
      if (serverField) {
        setFieldErrors({ [serverField]: serverErr });
      } else if (serverErr) {
        showToast(serverErr, "error");
      } else {
        showToast("Submission failed", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewAction = async () => {
    if (!reviewModal.item) return;
    setProcessingReview(true);
    try {
      if (reviewModal.action === "approve") {
        await API.post(`/wfh/${reviewModal.item.id}/approve`, {
          comment: reviewModal.comment || "Approved by Manager"
        });
        showToast("Request approved successfully!", "success");
      } else {
        if (!reviewModal.comment.trim()) {
          showToast("A rejection comment is required", "error");
          setProcessingReview(false);
          return;
        }
        await API.post(`/wfh/${reviewModal.item.id}/reject`, {
          comment: reviewModal.comment.trim()
        });
        showToast("Request rejected", "info");
      }
      setReviewModal({ show: false, item: null, action: "approve", comment: "" });
      fetchRequests();
    } catch (err) {
      showToast(err.response?.data?.error || "Action failed", "error");
    } finally {
      setProcessingReview(false);
    }
  };

  const handleCancelRequest = (reqId) => {
    askConfirm("Cancel Request", "Are you sure you want to cancel this request?", async () => {
      try {
        await API.delete(`/wfh/${reqId}`);
        showToast("Request cancelled successfully", "success");
        fetchRequests();
      } catch (err) {
        showToast(err.response?.data?.error || "Cancel failed", "error");
      }
    });
  };

  const formatDateDisplay = (dStr) => {
    if (!dStr) return "-";
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return String(dStr).slice(0, 10);
    return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div style={{ padding: "clamp(16px, 3vw, 28px)", maxWidth: "1200px", margin: "0 auto" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <IconHome size={26} color="#4f46e5" />
            <h1 style={{ fontSize: "24px", fontWeight: "800", color: "var(--text-main, #1e293b)", margin: 0 }}>
              Work From Home & On-Duty Requests
            </h1>
          </div>
          <p style={{ color: "var(--text-muted, #64748b)", margin: "6px 0 0", fontSize: "14px" }}>
            Apply for remote work days or official duty visits with manager pre-approval.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          style={{
            background: "linear-gradient(135deg, #4f46e5, #6366f1)",
            color: "#fff",
            border: "none",
            padding: "10px 18px",
            borderRadius: "10px",
            fontWeight: "700",
            fontSize: "13px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)"
          }}
        >
          + Request WFH / On-Duty
        </button>
      </div>

      {/* FILTER BAR */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", marginBottom: "20px", background: "var(--ui-surface, #fff)", padding: "14px 18px", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Status filters */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted, #64748b)" }}>Status:</span>
            {["All", "Pending", "Approved", "Rejected"].map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "20px",
                  border: statusFilter === st ? "1px solid #4f46e5" : "1px solid var(--ui-border, #cbd5e1)",
                  background: statusFilter === st ? "#4f46e5" : "var(--ui-bg, #f8fafc)",
                  color: statusFilter === st ? "#fff" : "var(--text-main, #475569)",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Type filters */}
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-muted, #64748b)" }}>Type:</span>
            {["All", "WFH", "On-Duty"].map(tp => (
              <button
                key={tp}
                onClick={() => setTypeFilter(tp)}
                style={{
                  padding: "4px 12px",
                  borderRadius: "20px",
                  border: typeFilter === tp ? "1px solid #0284c7" : "1px solid var(--ui-border, #cbd5e1)",
                  background: typeFilter === tp ? "#0284c7" : "var(--ui-bg, #f8fafc)",
                  color: typeFilter === tp ? "#fff" : "var(--text-main, #475569)",
                  fontSize: "12px",
                  fontWeight: "600",
                  cursor: "pointer"
                }}
              >
                {tp}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={fetchRequests}
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            border: "1px solid var(--ui-border, #cbd5e1)",
            background: "transparent",
            color: "var(--text-main, #475569)",
            fontSize: "12px",
            fontWeight: "600",
            cursor: "pointer"
          }}
        >
          Refresh
        </button>
      </div>

      {/* TABLE */}
      <div style={{ overflowX: "auto", background: "var(--ui-surface, #fff)", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)" }}>
              <th onClick={() => requestSort("user_name")} style={{ padding: "12px 16px", fontWeight: "700", cursor: "pointer", userSelect: "none" }}>
                Employee <SortIndicator sortKey="user_name" currentKey={sortConfig.key} direction={sortConfig.direction} />
              </th>
              <th onClick={() => requestSort("request_type")} style={{ padding: "12px 16px", fontWeight: "700", cursor: "pointer", userSelect: "none" }}>
                Type <SortIndicator sortKey="request_type" currentKey={sortConfig.key} direction={sortConfig.direction} />
              </th>
              <th onClick={() => requestSort("from_date")} style={{ padding: "12px 16px", fontWeight: "700", cursor: "pointer", userSelect: "none" }}>
                Dates <SortIndicator sortKey="from_date" currentKey={sortConfig.key} direction={sortConfig.direction} />
              </th>
              <th onClick={() => requestSort("day_type")} style={{ padding: "12px 16px", fontWeight: "700", cursor: "pointer", userSelect: "none" }}>
                Day Type <SortIndicator sortKey="day_type" currentKey={sortConfig.key} direction={sortConfig.direction} />
              </th>
              <th onClick={() => requestSort("reason")} style={{ padding: "12px 16px", fontWeight: "700", cursor: "pointer", userSelect: "none" }}>
                Reason <SortIndicator sortKey="reason" currentKey={sortConfig.key} direction={sortConfig.direction} />
              </th>
              <th onClick={() => requestSort("status")} style={{ padding: "12px 16px", fontWeight: "700", cursor: "pointer", userSelect: "none" }}>
                Status <SortIndicator sortKey="status" currentKey={sortConfig.key} direction={sortConfig.direction} />
              </th>
              <th style={{ padding: "12px 16px", fontWeight: "700" }}>Reviewer Note</th>
              <th style={{ padding: "12px 16px", fontWeight: "700", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>
                  Loading requests...
                </td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "8px" }}>
                    <IconHome size={32} color="#94a3b8" />
                  </div>
                  <div style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-main, #334155)" }}>No WFH or On-Duty requests found</div>
                </td>
              </tr>
            ) : (
              paginatedRequests.map(r => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)" }}>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ fontWeight: "700", color: "var(--text-main, #1e293b)" }}>{r.user_name || "Employee"}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>{r.user_email}</div>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{
                      padding: "4px 8px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: "700",
                      background: r.request_type === "WFH" ? "rgba(79, 70, 229, 0.1)" : "rgba(2, 132, 199, 0.1)",
                      color: r.request_type === "WFH" ? "#4f46e5" : "#0284c7",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "5px"
                    }}>
                      {r.request_type === "WFH" ? <><IconHome size={13} color="#4f46e5" /> WFH</> : <><IconBuilding size={13} color="#0284c7" /> On-Duty</>}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--text-main, #334155)", fontWeight: "600" }}>
                    {formatDateDisplay(r.from_date)}
                    {r.to_date && r.to_date !== r.from_date && ` → ${formatDateDisplay(r.to_date)}`}
                  </td>
                  <td style={{ padding: "14px 16px", color: "var(--text-muted, #64748b)" }}>
                    {r.day_type || "Full Day"}
                  </td>
                  <td style={{ padding: "14px 16px", maxWidth: "200px" }}>
                    <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--ui-border, #e2e8f0)", fontSize: "12px", color: "var(--text-main, #475569)" }}>
                      "{r.reason}"
                    </div>
                  </td>
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{
                      padding: "4px 10px",
                      borderRadius: "12px",
                      fontSize: "11px",
                      fontWeight: "700",
                      background: r.status === "Approved" ? "rgba(34, 197, 94, 0.15)" : r.status === "Rejected" ? "rgba(239, 68, 68, 0.15)" : "rgba(245, 158, 11, 0.15)",
                      color: r.status === "Approved" ? "#16a34a" : r.status === "Rejected" ? "#dc2626" : "#d97706"
                    }}>
                      {r.status === "Pending" ? "● Pending" : r.status}
                    </span>
                  </td>
                  <td style={{ padding: "14px 16px", fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
                    {r.approver_name ? (
                      <div>
                        <strong>{r.approver_name}:</strong> {r.approver_comment || "-"}
                      </div>
                    ) : "-"}
                  </td>
                  <td style={{ padding: "14px 16px", textAlign: "right" }}>
                    {r.status === "Pending" ? (
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end", alignItems: "center" }}>
                        {isManager && (isSuperAdmin || (String(r.user_id) !== String(user?._id || user?.id) && r.user_email !== user?.email)) && (
                          <>
                            <button
                              onClick={() => setReviewModal({ show: true, item: r, action: "approve", comment: "Approved" })}
                              style={{
                                padding: "5px 10px",
                                borderRadius: "6px",
                                border: "none",
                                background: "#22c55e",
                                color: "#fff",
                                fontSize: "11px",
                                fontWeight: "700",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                            >
                              <IconCheck size={12} color="#fff" /> Approve
                            </button>
                            <button
                              onClick={() => setReviewModal({ show: true, item: r, action: "reject", comment: "" })}
                              style={{
                                padding: "5px 10px",
                                borderRadius: "6px",
                                border: "none",
                                background: "#ef4444",
                                color: "#fff",
                                fontSize: "11px",
                                fontWeight: "700",
                                cursor: "pointer",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px"
                              }}
                            >
                              <IconX size={12} color="#fff" /> Reject
                            </button>
                          </>
                        )}
                        {(String(r.user_id) === String(user?._id || user?.id) || r.user_email === user?.email || isSuperAdmin) && (
                          <button
                            onClick={() => handleCancelRequest(r.id)}
                            style={{
                              padding: "5px 10px",
                              borderRadius: "6px",
                              border: "1px solid var(--ui-border, #cbd5e1)",
                              background: "var(--ui-bg, #f1f5f9)",
                              color: "#ef4444",
                              fontSize: "11px",
                              fontWeight: "700",
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px"
                            }}
                            title="Cancel Request"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: "11px", color: "var(--text-muted, #94a3b8)" }}>Completed</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination
          currentPage={currentPage}
          totalRecords={requests.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* REQUEST MODAL */}
      <FormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Submit WFH / On-Duty Request"
        onSubmit={handleCreate}
        loading={submitting}
      >
        <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Request Type *
            </label>
            <select
              value={form.request_type}
              onChange={(e) => setForm({ ...form, request_type: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            >
              <option value="WFH">Work From Home (WFH)</option>
              <option value="On-Duty">On-Duty / Official Client Visit</option>
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
                From Date <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
              </label>
              <input
                type="date"
                required
                value={form.from_date}
                onChange={(e) => {
                  setForm({ ...form, from_date: e.target.value });
                  if (fieldErrors.from_date) setFieldErrors({ ...fieldErrors, from_date: null });
                }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: fieldErrors.from_date ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                  borderRadius: "6px",
                  background: fieldErrors.from_date ? "#fff5f5" : "var(--ui-surface, #fff)",
                  color: "var(--text-main, #1e293b)"
                }}
              />
              {fieldErrors.from_date && (
                <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                  {fieldErrors.from_date}
                </span>
              )}
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
                To Date <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
              </label>
              <input
                type="date"
                min={form.from_date}
                required
                value={form.to_date}
                onChange={(e) => {
                  setForm({ ...form, to_date: e.target.value });
                  if (fieldErrors.to_date) setFieldErrors({ ...fieldErrors, to_date: null });
                }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  border: fieldErrors.to_date ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                  borderRadius: "6px",
                  background: fieldErrors.to_date ? "#fff5f5" : "var(--ui-surface, #fff)",
                  color: "var(--text-main, #1e293b)"
                }}
              />
              {fieldErrors.to_date && (
                <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                  {fieldErrors.to_date}
                </span>
              )}
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Day Type
            </label>
            <select
              value={form.day_type}
              onChange={(e) => setForm({ ...form, day_type: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            >
              <option value="Full Day">Full Day</option>
              <option value="First Half">First Half</option>
              <option value="Second Half">Second Half</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              Reason / Work Details <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
            </label>
            <textarea
              rows="3"
              required
              value={form.reason}
              onChange={(e) => {
                setForm({ ...form, reason: e.target.value });
                if (fieldErrors.reason) setFieldErrors({ ...fieldErrors, reason: null });
              }}
              placeholder="e.g. Attending on-site client audit; domestic emergency requiring remote setup."
              style={{
                width: "100%",
                padding: "10px 12px",
                border: fieldErrors.reason ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                borderRadius: "6px",
                background: fieldErrors.reason ? "#fff5f5" : "var(--ui-surface, #fff)",
                color: "var(--text-main, #1e293b)",
                resize: "vertical"
              }}
            />
            {fieldErrors.reason && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {fieldErrors.reason}
              </span>
            )}
          </div>
        </form>
      </FormModal>

      {/* REVIEW MODAL */}
      <FormModal
        isOpen={reviewModal.show}
        onClose={() => setReviewModal({ show: false, item: null, action: "approve", comment: "" })}
        title={reviewModal.action === "approve" ? "Approve Request" : "Reject Request"}
        onSubmit={handleReviewAction}
        loading={processingReview}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {reviewModal.item && (
            <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)", fontSize: "13px" }}>
              <div><strong>Employee:</strong> {reviewModal.item.user_name}</div>
              <div style={{ marginTop: "4px" }}>
                <strong>Dates:</strong> {formatDateDisplay(reviewModal.item.from_date)} {reviewModal.item.to_date && reviewModal.item.to_date !== reviewModal.item.from_date ? ` → ${formatDateDisplay(reviewModal.item.to_date)}` : ""} ({reviewModal.item.request_type})
              </div>
              <div style={{ marginTop: "4px" }}><strong>Reason:</strong> "{reviewModal.item.reason}"</div>
            </div>
          )}

          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              {reviewModal.action === "approve" ? "Approval Remarks (Optional)" : "Rejection Reason *"}
            </label>
            <input
              type="text"
              value={reviewModal.comment}
              onChange={(e) => setReviewModal({ ...reviewModal, comment: e.target.value })}
              placeholder={reviewModal.action === "approve" ? "e.g. Approved for remote setup" : "e.g. Critical in-person meeting scheduled"}
              required={reviewModal.action === "reject"}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            />
          </div>
        </div>
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
