import React, { useState, useEffect } from "react";
import API from "../../api/api";
import { useToast } from "../../contexts/ToastContext";
import FormModal from "../common/FormModal";
import TimeSelect12h from "../common/TimeSelect12h";
import ConfirmModal from "../common/ConfirmModal";

// "YYYY-MM-DD HH:mm:ss" (MySQL dateStrings) -> Date
const toDate = (val) => (val ? new Date(String(val).replace(" ", "T")) : null);
const fmtTime = (val) => {
  const d = toDate(val);
  return d && !isNaN(d) ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-";
};
const fmtDate = (val) => {
  if (!val) return "-";
  const d = new Date(`${String(val).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

const STATUS_STYLE = {
  Pending: { background: "#fef3c7", color: "#b45309" },
  Approved: { background: "#dcfce7", color: "#15803d" },
  Rejected: { background: "#fee2e2", color: "#b91c1c" }
};

const cell = { padding: "12px 16px" };
const th = { padding: "12px 16px", fontWeight: "700" };
const inputStyle = { padding: "7px 10px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" };
const card = { background: "var(--ui-surface, #fff)", borderRadius: "10px", border: "1px solid var(--ui-border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", overflowX: "auto", marginBottom: "24px" };

export default function ForgotPunchOutTab({ isAdmin, highlightId, onChanged }) {
  const { showToast } = useToast();

  const [myRecords, setMyRecords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState(isAdmin ? "Pending" : "All");
  const [forms, setForms] = useState({}); // { [attendanceId]: { time, reason, error } }
  const [submittingId, setSubmittingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState({ show: false, item: null, action: "approve", comment: "" });
  const [processing, setProcessing] = useState(false);
  const [edit, setEdit] = useState({ show: false, item: null, time: "", reason: "", error: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);

  // Employee can change own request only while Pending; Admin can change any
  const canModify = (r) => isAdmin || r.status === "Pending";

  const fetchMine = async () => {
    try {
      const res = await API.get("/attendance/forgot-punch-out/mine");
      const records = res.data?.records || [];
      setMyRecords(records);
      setForms((prev) => {
        const next = { ...prev };
        records.forEach((r) => {
          if (!next[r.id]) next[r.id] = { time: "", reason: "", error: "" };
        });
        return next;
      });
    } catch (err) {
      console.error("Error loading Not Punch Out days:", err);
    }
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await API.get(`/attendance/forgot-punch-out/requests?status=${statusFilter}`);
      setRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error loading Forgot Punch Out requests:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMine();
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [statusFilter]);

  const updateForm = (id, patch) => setForms((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const handleSubmit = async (rec) => {
    const form = forms[rec.id] || {};
    if (!form.time) {
      updateForm(rec.id, { error: "Plese enter clock out time" });
      return;
    }
    setSubmittingId(rec.id);
    try {
      await API.post("/attendance/forgot-punch-out", {
        attendance_id: rec.id,
        clock_out_time: form.time,
        reason: form.reason
      });
      showToast("Forgot Punch Out request submitted for approval!", "success");
      updateForm(rec.id, { error: "" });
      fetchMine();
      fetchRequests();
    } catch (err) {
      updateForm(rec.id, { error: err.response?.data?.error || "Failed to submit request" });
    } finally {
      setSubmittingId(null);
    }
  };

  const handleReview = async () => {
    if (!review.item) return;
    if (review.action === "reject" && !review.comment.trim()) {
      showToast("A rejection reason is required", "error");
      return;
    }
    setProcessing(true);
    try {
      const res = await API.post(`/attendance/forgot-punch-out/${review.item.id}/${review.action}`, {
        comment: review.comment.trim()
      });
      showToast(res.data?.message || "Done", review.action === "approve" ? "success" : "info");
      setReview({ show: false, item: null, action: "approve", comment: "" });
      fetchRequests();
      fetchMine();
      onChanged && onChanged();
    } catch (err) {
      showToast(err.response?.data?.error || "Review action failed", "error");
    } finally {
      setProcessing(false);
    }
  };

  const openEdit = (r) => {
    setEdit({
      show: true,
      item: r,
      time: String(r.requested_clock_out || "").slice(11, 16),
      reason: r.reason || "",
      error: ""
    });
  };

  const handleSaveEdit = async () => {
    if (!edit.item) return;
    if (!edit.time) {
      setEdit((prev) => ({ ...prev, error: "Plese enter clock out time" }));
      return;
    }
    setSavingEdit(true);
    try {
      const res = await API.put(`/attendance/forgot-punch-out/${edit.item.id}`, {
        clock_out_time: edit.time,
        reason: edit.reason
      });
      showToast(res.data?.message || "Request updated", "success");
      setEdit({ show: false, item: null, time: "", reason: "", error: "" });
      fetchRequests();
      fetchMine();
      if (edit.item.status === "Approved" && onChanged) onChanged();
    } catch (err) {
      setEdit((prev) => ({ ...prev, error: err.response?.data?.error || "Failed to update request" }));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    const item = deleteItem;
    setDeleteItem(null);
    if (!item) return;
    try {
      const res = await API.delete(`/attendance/forgot-punch-out/${item.id}`);
      showToast(res.data?.message || "Request deleted", "success");
      fetchRequests();
      fetchMine();
      if (item.status === "Approved" && onChanged) onChanged();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to delete request", "error");
    }
  };

  return (
    <div>
      {/* EMPLOYEE: MY NOT PUNCH OUT DAYS */}
      {(!isAdmin || myRecords.length > 0) && (
        <>
          <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main, #1e293b)", margin: "0 0 4px" }}>My Not Punch Out Days</h3>
          <p style={{ fontSize: "13px", color: "var(--text-muted, #64748b)", margin: "0 0 12px" }}>
            You forgot to clock out on these days and the system clocked you out at 11:00 PM. Enter your actual clock out time and submit it for Admin approval.
          </p>
          <div style={card}>
            <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)" }}>
                  <th style={th}>Date</th>
                  <th style={th}>Clock In</th>
                  <th style={th}>Clock Out Time</th>
                  <th style={th}>Reason</th>
                  <th style={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {myRecords.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>
                      No missed punch outs. You're all clear!
                    </td>
                  </tr>
                ) : (
                  myRecords.map((rec) => {
                    const form = forms[rec.id] || {};
                    const req = rec.request;
                    const locked = req && (req.status === "Pending" || req.status === "Approved");
                    const highlighted = highlightId && highlightId === rec.id;
                    return (
                      <tr key={rec.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)", background: highlighted ? "rgba(79, 70, 229, 0.06)" : "transparent" }}>
                        <td style={{ ...cell, fontWeight: "600", color: "var(--text-main, #334155)" }}>{fmtDate(rec.date)}</td>
                        <td style={{ ...cell, color: "#16a34a", fontWeight: "700" }}>{fmtTime(rec.clock_in)}</td>
                        <td style={cell}>
                          {locked ? (
                            <span style={{ fontWeight: "700", color: "var(--text-main, #1e293b)" }}>{fmtTime(req.requested_clock_out)}</span>
                          ) : (
                            <>
                              <TimeSelect12h
                                value={form.time || ""}
                                hasError={Boolean(form.error)}
                                onChange={(time) => updateForm(rec.id, { time, error: "" })}
                              />
                              {form.error && <div style={{ color: "#dc2626", fontSize: "11px", marginTop: "4px" }}>{form.error}</div>}
                            </>
                          )}
                        </td>
                        <td style={cell}>
                          {locked ? (
                            <span style={{ color: "var(--text-muted, #64748b)" }}>{req.reason || "-"}</span>
                          ) : (
                            <input
                              type="text"
                              value={form.reason || ""}
                              placeholder="e.g. Forgot to clock out"
                              onChange={(e) => updateForm(rec.id, { reason: e.target.value })}
                              style={{ ...inputStyle, width: "100%", minWidth: "180px" }}
                            />
                          )}
                        </td>
                        <td style={cell}>
                          {locked ? (
                            <span style={{ padding: "4px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "700", ...STATUS_STYLE[req.status] }}>
                              {req.status === "Pending" ? "Pending Approval" : req.status}
                            </span>
                          ) : (
                            <div>
                              <button
                                type="button"
                                disabled={submittingId === rec.id}
                                onClick={() => handleSubmit(rec)}
                                style={{ background: "#4f46e5", color: "#fff", border: "none", borderRadius: "6px", padding: "7px 14px", fontWeight: "600", fontSize: "12px", cursor: "pointer", opacity: submittingId === rec.id ? 0.6 : 1 }}
                              >
                                {submittingId === rec.id ? "Saving..." : "Save"}
                              </button>
                              {req?.status === "Rejected" && (
                                <div style={{ fontSize: "11px", color: "#b91c1c", marginTop: "4px" }}>
                                  Rejected{req.approver_comment ? `: ${req.approver_comment}` : ""}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* REQUESTS LIST (Admin: approve / reject) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-main, #1e293b)", margin: 0 }}>
          {isAdmin ? "Forgot Punch Out Requests" : "My Requests"}
        </h3>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {["All", "Pending", "Approved", "Rejected"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              style={{
                padding: "7px 14px",
                borderRadius: "6px",
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
      </div>
      <div style={card}>
        <table style={{ width: "100%", minWidth: "860px", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)" }}>
              <th style={th}>Employee</th>
              <th style={th}>Date</th>
              <th style={th}>Clock In</th>
              <th style={th}>Requested Clock Out</th>
              <th style={th}>Reason</th>
              <th style={th}>Status</th>
              <th style={th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && requests.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>Loading requests...</td>
              </tr>
            ) : requests.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "30px", textAlign: "center", color: "var(--text-muted, #94a3b8)" }}>No Forgot Punch Out requests found.</td>
              </tr>
            ) : (
              requests.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)" }}>
                  <td style={cell}>
                    <div style={{ fontWeight: "700", color: "var(--text-main, #1e293b)" }}>{r.user_name || "Employee"}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>{r.user_email}</div>
                  </td>
                  <td style={{ ...cell, fontWeight: "600", color: "var(--text-main, #334155)" }}>{fmtDate(r.target_date)}</td>
                  <td style={{ ...cell, color: "#16a34a", fontWeight: "700" }}>{fmtTime(r.clock_in)}</td>
                  <td style={{ ...cell, color: "#dc2626", fontWeight: "700" }}>{fmtTime(r.requested_clock_out)}</td>
                  <td style={{ ...cell, color: "var(--text-muted, #64748b)", maxWidth: "220px" }}>{r.reason || "-"}</td>
                  <td style={cell}>
                    <span style={{ padding: "4px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: "700", ...STATUS_STYLE[r.status] }}>{r.status}</span>
                    {r.approver_name && r.status !== "Pending" && (
                      <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "4px" }}>
                        by {r.approver_name}{r.approver_comment ? ` — ${r.approver_comment}` : ""}
                      </div>
                    )}
                  </td>
                  <td style={cell}>
                    <div className="action-buttons" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      {isAdmin && r.status === "Pending" && (
                        <>
                          <button
                            type="button"
                            onClick={() => setReview({ show: true, item: r, action: "approve", comment: "" })}
                            style={{ background: "#dcfce7", border: "1px solid #bbf7d0", color: "#15803d", borderRadius: "6px", padding: "5px 10px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setReview({ show: true, item: r, action: "reject", comment: "" })}
                            style={{ background: "#fee2e2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: "6px", padding: "5px 10px", fontSize: "12px", fontWeight: "600", cursor: "pointer" }}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {canModify(r) ? (
                        <>
                          <button className="action-btn" type="button" onClick={() => openEdit(r)} title="Edit Request">
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                          </button>
                          <button className="action-btn delete" type="button" onClick={() => setDeleteItem(r)} title="Delete Request">
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        </>
                      ) : !isAdmin && "-"}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: APPROVE / REJECT */}
      <FormModal
        isOpen={review.show}
        onClose={() => setReview({ show: false, item: null, action: "approve", comment: "" })}
        title={review.action === "approve" ? "Approve Forgot Punch Out" : "Reject Forgot Punch Out"}
        onSubmit={handleReview}
        loading={processing}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {review.item && (
            <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)", fontSize: "13px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div><strong>Employee:</strong> {review.item.user_name} ({review.item.user_email})</div>
              <div><strong>Date:</strong> {fmtDate(review.item.target_date)}</div>
              <div><strong>Clock In:</strong> {fmtTime(review.item.clock_in)} &nbsp; <strong>Requested Clock Out:</strong> {fmtTime(review.item.requested_clock_out)}</div>
              {review.item.reason && <div><strong>Reason:</strong> "{review.item.reason}"</div>}
              <div style={{ marginTop: "4px", color: review.action === "approve" ? "#15803d" : "#b91c1c", fontWeight: "600" }}>
                {review.action === "approve"
                  ? "On approval this day will be marked Present with the requested clock out time."
                  : "On rejection this day stays as Not Punch Out."}
              </div>
            </div>
          )}
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>
              {review.action === "approve" ? "Approval Remarks (Optional)" : "Rejection Reason *"}
            </label>
            <input
              type="text"
              value={review.comment}
              onChange={(e) => setReview({ ...review, comment: e.target.value })}
              placeholder={review.action === "approve" ? "e.g. Verified with team lead" : "e.g. Clock out time could not be verified"}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border, #cbd5e1)", borderRadius: "6px", background: "var(--ui-surface, #fff)", color: "var(--text-main, #1e293b)" }}
            />
          </div>
        </div>
      </FormModal>

      {/* MODAL: EDIT REQUEST */}
      <FormModal
        isOpen={edit.show}
        onClose={() => setEdit({ show: false, item: null, time: "", reason: "", error: "" })}
        title="Edit Forgot Punch Out"
        onSubmit={handleSaveEdit}
        loading={savingEdit}
      >
        {edit.item && (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ background: "var(--ui-bg, #f8fafc)", padding: "12px 14px", borderRadius: "8px", border: "1px solid var(--ui-border, #e2e8f0)", fontSize: "13px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <div><strong>Employee:</strong> {edit.item.user_name} ({edit.item.user_email})</div>
              <div><strong>Date:</strong> {fmtDate(edit.item.target_date)} &nbsp; <strong>Clock In:</strong> {fmtTime(edit.item.clock_in)}</div>
              {edit.item.status === "Approved" && (
                <div style={{ color: "#b45309", fontWeight: "600" }}>This request is already approved — the attendance record will be updated too.</div>
              )}
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>Clock Out Time *</label>
              <TimeSelect12h
                value={edit.time}
                hasError={Boolean(edit.error)}
                onChange={(time) => setEdit((prev) => ({ ...prev, time, error: "" }))}
              />
              {edit.error && <div style={{ color: "#dc2626", fontSize: "12px", marginTop: "4px" }}>{edit.error}</div>}
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "var(--text-main, #1e293b)", marginBottom: "4px" }}>Reason</label>
              <input
                type="text"
                value={edit.reason}
                onChange={(e) => setEdit({ ...edit, reason: e.target.value })}
                placeholder="e.g. Forgot to clock out"
                style={{ ...inputStyle, width: "100%", padding: "10px 12px" }}
              />
            </div>
          </div>
        )}
      </FormModal>

      <ConfirmModal
        show={Boolean(deleteItem)}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        title="Delete Forgot Punch Out"
        message={
          deleteItem?.status === "Approved"
            ? "This request is approved. Deleting it will revert the day back to Not Punch Out. Continue?"
            : "Are you sure you want to delete this Forgot Punch Out request?"
        }
        confirmText="Delete"
        confirmColor="var(--danger-color)"
      />
    </div>
  );
}
