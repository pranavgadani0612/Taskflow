import React, { useCallback, useEffect, useState } from "react";
import API from "../api/api";
import { useToast } from "../contexts/ToastContext";
import { useSocket } from "../contexts/SocketContext";
import ConfirmModal from "../components/common/ConfirmModal";
import Pagination from "../components/common/Pagination";
<<<<<<< HEAD
import WebsiteFaqs from "./WebsiteFaqs";
=======
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
import "../style/main.css";

/* Website enquiries (consultation form + chatbot bookings) and chatbot conversations from padhyasoft.com */

const STATUS_COLORS = {
  New: { bg: "rgba(79, 70, 229, 0.12)", color: "#4f46e5" },
  Contacted: { bg: "rgba(2, 132, 199, 0.12)", color: "#0284c7" },
  "In Progress": { bg: "rgba(245, 158, 11, 0.14)", color: "#b45309" },
  Won: { bg: "rgba(16, 185, 129, 0.14)", color: "#059669" },
  Lost: { bg: "rgba(239, 68, 68, 0.12)", color: "#dc2626" },
  Spam: { bg: "rgba(100, 116, 139, 0.14)", color: "#475569" },
};
const PAGE_SIZE = 25;
const BULK = "__bulk__";

const S = {
  page: { padding: "clamp(16px, 3vw, 28px)", maxWidth: "1280px", margin: "0 auto" },
  card: { background: "var(--ui-surface, #fff)", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)" },
  th: { padding: "12px 14px", fontWeight: 700, whiteSpace: "nowrap" },
  td: { padding: "12px 14px", verticalAlign: "top" },
  muted: { color: "var(--text-muted, #64748b)", fontSize: "12px" },
  main: { color: "var(--text-main, #1e293b)" },
  input: { padding: "7px 12px", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", fontSize: "13px", background: "var(--ui-bg, #f8fafc)", color: "var(--text-main, #1e293b)" },
  btn: { padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", background: "var(--ui-bg, #f8fafc)", color: "var(--text-main, #334155)", fontWeight: 600, fontSize: "12px", cursor: "pointer" },
  btnPrimary: { padding: "6px 12px", borderRadius: "6px", border: "none", background: "#4f46e5", color: "#fff", fontWeight: 700, fontSize: "12px", cursor: "pointer" },
  chip: (on) => ({
    padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
    border: on ? "1px solid #4f46e5" : "1px solid var(--ui-border, #cbd5e1)",
    background: on ? "#4f46e5" : "var(--ui-bg, #f8fafc)", color: on ? "#fff" : "var(--text-main, #475569)",
  }),
};

const formatIST = (dateStr) => {
  if (!dateStr) return { date: "-", time: "-" };
  let d = new Date(String(dateStr).replace(" ", "T"));
  if (isNaN(d.getTime())) d = new Date(dateStr);
  if (isNaN(d.getTime())) return { date: String(dateStr), time: "" };
  return {
    date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
  };
};

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.Spam;
  return <span style={{ padding: "3px 9px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, background: c.bg, color: c.color, whiteSpace: "nowrap" }}>{status}</span>;
}

function SourceBadge({ source }) {
  const chat = source === "Chatbot";
  return (
    <span style={{ padding: "3px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap", background: chat ? "rgba(147, 51, 234, 0.12)" : "rgba(2, 132, 199, 0.12)", color: chat ? "#9333ea" : "#0284c7" }}>
      {chat ? "Chatbot" : "Website form"}
    </span>
  );
}

/* ======================= transcript viewer ======================= */
<<<<<<< HEAD
function Transcript({ sessionId, onSavedCustom }) {
  const { showToast } = useToast();
  const [msgs, setMsgs] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

=======
function Transcript({ sessionId }) {
  const [msgs, setMsgs] = useState(null);
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
  useEffect(() => {
    let alive = true;
    API.get(`/website-enquiries/chats/${encodeURIComponent(sessionId)}`)
      .then((r) => alive && setMsgs(Array.isArray(r.data) ? r.data : []))
      .catch(() => alive && setMsgs([]));
    return () => { alive = false; };
  }, [sessionId]);

<<<<<<< HEAD
  const saveCustomReply = async (msg, body) => {
    setSaving(true);
    try {
      await API.post("/website-enquiries/unanswered/custom", {
        question: body.question,
        answer: body.answer,
        page: msg.page || null,
        sessionId,
      });
      setEditingId(null);
      showToast("Reply saved in DB – chatbot will use this answer!");
      if (onSavedCustom) onSavedCustom();
    } catch (err) {
      showToast(err.response?.data?.error || "Could not save reply", "error");
    } finally {
      setSaving(false);
    }
  };

  if (msgs === null) return <div style={S.muted}>Loading conversation...</div>;
  if (!msgs.length) return <div style={S.muted}>No messages saved for this conversation.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "480px", overflowY: "auto", padding: "4px" }}>
      {msgs.map((m, idx) => {
        const user = m.sender === "user";
        const { date, time } = formatIST(m.created_at);
        let prevUser = null;
        if (!user) {
          for (let j = idx - 1; j >= 0; j--) {
            if (msgs[j].sender === "user") { prevUser = msgs[j]; break; }
          }
        }
        return (
          <div key={m.id} style={{ alignSelf: user ? "flex-end" : "flex-start", maxWidth: "82%" }}>
            <div style={{ padding: "8px 12px", borderRadius: "12px", fontSize: "13px", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", background: user ? "#4f46e5" : "var(--ui-bg, #f1f5f9)", color: user ? "#fff" : "var(--text-main, #1e293b)", border: user ? "none" : "1px solid var(--ui-border, #e2e8f0)" }}>
              {m.text}
            </div>
            <div style={{ ...S.muted, fontSize: "10px", marginTop: "3px", display: "flex", alignItems: "center", gap: "8px", justifyContent: user ? "flex-end" : "flex-start" }}>
              <span>{user ? "Visitor" : "Bot"} · {date} {time}</span>
              {!user && prevUser && (
                <button
                  type="button"
                  onClick={() => setEditingId(editingId === m.id ? null : m.id)}
                  style={{ padding: "2px 7px", borderRadius: "5px", border: "1px solid var(--ui-border, #cbd5e1)", background: "var(--ui-surface, #fff)", color: "#4f46e5", fontSize: "10px", fontWeight: 700, cursor: "pointer" }}
                >
                  {editingId === m.id ? "Close" : "Edit reply"}
                </button>
              )}
            </div>
            {editingId === m.id && prevUser && (
              <div style={{ marginTop: "6px", padding: "10px 12px", borderRadius: "10px", background: "var(--ui-surface, #fff)", border: "1px solid var(--ui-border, #cbd5e1)" }}>
                <ChatbotAnswerForm
                  initialQuestion={prevUser.text}
                  initialAnswer={m.text}
                  onSave={(body) => saveCustomReply(m, body)}
                  onCancel={() => setEditingId(null)}
                  saving={saving}
                />
              </div>
            )}
=======
  if (msgs === null) return <div style={S.muted}>Loading conversation...</div>;
  if (!msgs.length) return <div style={S.muted}>No messages saved for this conversation.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "420px", overflowY: "auto", padding: "4px" }}>
      {msgs.map((m) => {
        const user = m.sender === "user";
        const { date, time } = formatIST(m.created_at);
        return (
          <div key={m.id} style={{ alignSelf: user ? "flex-end" : "flex-start", maxWidth: "78%" }}>
            <div style={{ padding: "8px 12px", borderRadius: "12px", fontSize: "13px", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", background: user ? "#4f46e5" : "var(--ui-bg, #f1f5f9)", color: user ? "#fff" : "var(--text-main, #1e293b)", border: user ? "none" : "1px solid var(--ui-border, #e2e8f0)" }}>
              {m.text}
            </div>
            <div style={{ ...S.muted, fontSize: "10px", marginTop: "2px", textAlign: user ? "right" : "left" }}>
              {user ? "Visitor" : "Bot"} · {date} {time}
            </div>
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
          </div>
        );
      })}
    </div>
  );
}

/* ======================= enquiry detail row ======================= */
<<<<<<< HEAD
function EnquiryDetail({ e, onSaved, onConvert, onDelete }) {
=======
function EnquiryDetail({ e, staff, onSaved, onConvert, onDelete }) {
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
  const { showToast } = useToast();
  const [notes, setNotes] = useState(e.notes || "");
  const [saving, setSaving] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const saveNotes = async () => {
    setSaving(true);
    try {
      const r = await API.put(`/website-enquiries/${e.id}`, { notes });
      onSaved(r.data);
      showToast("Notes saved");
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to save notes", "error");
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, value }) => (
    <div>
      <div style={{ ...S.muted, fontWeight: 700, textTransform: "uppercase", fontSize: "10px", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ ...S.main, fontSize: "13px", marginTop: "2px", wordBreak: "break-word" }}>{value || "-"}</div>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: "16px", padding: "16px", background: "var(--ui-bg, #f8fafc)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "14px" }}>
        <Field label="Service" value={e.service} />
        <Field label="Engagement" value={e.engagement} />
        <Field label="Budget" value={e.budget} />
        <Field label="Timeline" value={e.timeline} />
        <Field label="Company" value={e.company} />
        <Field label="Page" value={e.page} />
        <Field label="IP address" value={e.ip_address} />
        <Field label="Assigned to" value={e.assigned_name} />
      </div>
      <div>
        <div style={{ ...S.muted, fontWeight: 700, textTransform: "uppercase", fontSize: "10px" }}>Project details</div>
        <div style={{ ...S.main, fontSize: "13px", marginTop: "4px", whiteSpace: "pre-wrap", background: "var(--ui-surface, #fff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "8px", padding: "10px 12px" }}>
          {e.message || "No details provided."}
        </div>
      </div>
      <div>
        <div style={{ ...S.muted, fontWeight: 700, textTransform: "uppercase", fontSize: "10px" }}>Internal notes</div>
        <textarea value={notes} onChange={(ev) => setNotes(ev.target.value)} rows={3} placeholder="Call summary, follow-up date, quote sent..." style={{ ...S.input, width: "100%", marginTop: "4px", resize: "vertical", boxSizing: "border-box" }} />
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
          <button style={S.btnPrimary} onClick={saveNotes} disabled={saving}>{saving ? "Saving..." : "Save notes"}</button>
          <a style={{ ...S.btn, textDecoration: "none" }} href={`mailto:${e.email}`}>Email</a>
          <a style={{ ...S.btn, textDecoration: "none" }} href={`tel:${String(e.phone).replace(/[^\d+]/g, "")}`}>Call</a>
          <a style={{ ...S.btn, textDecoration: "none" }} target="_blank" rel="noopener noreferrer" href={`https://wa.me/${String(e.phone).replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${e.name}, this is Padhya Software Technologies regarding your enquiry${e.service ? " for " + e.service : ""}.`)}`}>WhatsApp</a>
          {e.chat_session && <button style={S.btn} onClick={() => setShowChat((v) => !v)}>{showChat ? "Hide chat" : "View chat"}</button>}
          {e.client_id ? (
            <span style={{ ...S.btn, cursor: "default", color: "#059669", borderColor: "rgba(16,185,129,.4)" }}>Client created</span>
          ) : (
            <button style={{ ...S.btn, color: "#059669", borderColor: "rgba(16,185,129,.4)" }} onClick={() => onConvert(e)}>Convert to client</button>
          )}
          <button style={{ ...S.btn, color: "#dc2626", borderColor: "rgba(239,68,68,.35)" }} onClick={() => onDelete(e)}>Delete</button>
        </div>
      </div>
      {showChat && e.chat_session && (
        <div style={{ ...S.card, padding: "12px" }}>
          <Transcript sessionId={e.chat_session} />
        </div>
      )}
    </div>
  );
}

/* ======================= row selection (checkbox + select all + bulk delete) ======================= */
function useSelection(keys) {
  const [picked, setPicked] = useState(() => new Set());
  const keyStr = keys.join("|");
  // keep only rows that are still on screen (page change, filter, reload)
  useEffect(() => {
    setPicked((prev) => {
      const next = new Set([...prev].filter((k) => keys.includes(k)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyStr]);
  const toggle = (k) => setPicked((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const all = keys.length > 0 && keys.every((k) => picked.has(k));
  const some = picked.size > 0 && !all;
  return { picked, count: picked.size, all, some, has: (k) => picked.has(k), toggle, selectAll: () => setPicked(new Set(keys)), clear: () => setPicked(new Set()), toggleAll: () => (all ? setPicked(new Set()) : setPicked(new Set(keys))) };
}

function CheckBox({ checked, indeterminate = false, onChange, label }) {
  const ref = React.useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} onChange={onChange} aria-label={label} style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#4f46e5", verticalAlign: "middle" }} />;
}

function SelectionBar({ sel, total, noun, onDelete }) {
  if (!sel.count) return null;
  return (
    <div role="region" aria-label="Bulk actions" style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "10px 16px", marginBottom: "12px", flexWrap: "wrap", borderColor: "rgba(79,70,229,.35)", background: "rgba(79,70,229,0.05)" }}>
      <span style={{ ...S.main, fontWeight: 700, fontSize: "13px" }}>
        {sel.count} {noun}{sel.count === 1 ? "" : "s"} selected
        {total > sel.count && <span style={{ ...S.muted, fontWeight: 500 }}> · {total} in total</span>}
      </span>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {!sel.all && <button style={S.btn} onClick={sel.selectAll}>Select all on this page</button>}
        <button style={S.btn} onClick={sel.clear}>Clear selection</button>
        <button style={{ ...S.btn, background: "#dc2626", borderColor: "#dc2626", color: "#fff" }} onClick={onDelete}>Delete selected ({sel.count})</button>
      </div>
    </div>
  );
}

/* ======================= Enquiries tab ======================= */
function EnquiriesTab() {
  const { showToast } = useToast();
  const { socket } = useSocket() || {};
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({});
  const [statuses, setStatuses] = useState(Object.keys(STATUS_COLORS));
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("All");
  const [source, setSource] = useState("All");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: 'delete'|'convert'|'bulk', e }
  const sel = useSelection(rows.map((r) => r.id));

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: PAGE_SIZE, status, source };
      if (search.trim()) params.search = search.trim();
      const r = await API.get("/website-enquiries", { params });
      setRows(r.data.enquiries || []);
      setTotal(r.data.total || 0);
      setCounts(r.data.counts || {});
      if (Array.isArray(r.data.statuses)) setStatuses(r.data.statuses);
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to load website enquiries", "error");
    } finally {
      setLoading(false);
    }
  }, [page, status, source, search, showToast]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  useEffect(() => {
    API.get("/staff").then((r) => setStaff(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  // refresh when a new enquiry arrives from the website
  useEffect(() => {
    if (!socket) return;
    const onNew = () => {
      showToast("New website enquiry received");
      load();
    };
    socket.on("website_enquiry_new", onNew);
    return () => socket.off("website_enquiry_new", onNew);
  }, [socket, load, showToast]);

  const replaceRow = (updated) => setRows((list) => list.map((x) => (x.id === updated.id ? updated : x)));

  const update = async (e, body, msg) => {
    try {
      const r = await API.put(`/website-enquiries/${e.id}`, body);
      replaceRow(r.data);
      if (body.status) load();
      showToast(msg);
    } catch (err) {
      showToast(err.response?.data?.error || "Update failed", "error");
    }
  };

  const doConfirm = async () => {
    const { type, e } = confirm;
    setConfirm(null);
    try {
      if (type === "bulk") {
        const ids = [...sel.picked];
        const r = await API.post("/website-enquiries/bulk-delete", { ids });
        showToast(`${r.data.deleted} enquir${r.data.deleted === 1 ? "y" : "ies"} deleted`);
        sel.clear();
        setOpen(null);
      } else if (type === "delete") {
        await API.delete(`/website-enquiries/${e.id}`);
        showToast("Enquiry deleted");
        setOpen(null);
      } else {
        const r = await API.post(`/website-enquiries/${e.id}/convert`);
        showToast(r.data.linkedExisting ? "Linked to existing client (same email)" : "Client created – see Project → Clients");
      }
      load();
    } catch (err) {
      showToast(err.response?.data?.error || "Action failed", "error");
    }
  };

  return (
    <>
      <div style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "14px 18px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {["All", ...statuses].map((s) => (
            <button key={s} style={S.chip(status === s)} onClick={() => { setStatus(s); setPage(1); }}>
              {s} <span style={{ opacity: 0.75 }}>{counts[s] ?? 0}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <select value={source} onChange={(ev) => { setSource(ev.target.value); setPage(1); }} style={S.input}>
            <option value="All">All sources</option>
            <option value="Website form">Website form</option>
            <option value="Chatbot">Chatbot</option>
          </select>
          <input value={search} onChange={(ev) => { setSearch(ev.target.value); setPage(1); }} placeholder="Search name, email, phone, service..." style={{ ...S.input, width: "240px" }} />
        </div>
      </div>

      <SelectionBar sel={sel} total={total} noun="enquiry" onDelete={() => setConfirm({ type: "bulk" })} />

      <div style={{ ...S.card, overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)" }}>
              <th style={{ ...S.th, width: "36px", paddingRight: 0 }}>
                <CheckBox checked={sel.all} indeterminate={sel.some} onChange={sel.toggleAll} label="Select all enquiries on this page" />
              </th>
              <th style={S.th}>Received</th>
              <th style={S.th}>Name</th>
              <th style={S.th}>Contact</th>
              <th style={S.th}>Service</th>
              <th style={S.th}>Source</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Assigned to</th>
              <th style={{ ...S.th, textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? (
              <tr><td colSpan={9} style={{ padding: "40px", textAlign: "center", ...S.muted }}>Loading enquiries...</td></tr>
            ) : !rows.length ? (
              <tr><td colSpan={9} style={{ padding: "40px", textAlign: "center", ...S.muted }}>No website enquiries found.</td></tr>
            ) : (
              rows.map((e) => {
                const { date } = formatIST(e.created_at);
                const isOpen = open === e.id;
                return (
                  <React.Fragment key={e.id}>
                    <tr style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)", background: sel.has(e.id) ? "rgba(79,70,229,0.08)" : e.status === "New" ? "rgba(79,70,229,0.03)" : undefined }}>
                      <td style={{ ...S.td, paddingRight: 0 }}>
                        <CheckBox checked={sel.has(e.id)} onChange={() => sel.toggle(e.id)} label={`Select enquiry from ${e.name}`} />
                      </td>
                      <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                        <div style={{ ...S.main, fontWeight: 600 }}>{date}</div>
                      </td>
                      <td style={S.td}>
                        <div style={{ ...S.main, fontWeight: 700 }}>{e.name}</div>
                        {e.company && <div style={S.muted}>{e.company}</div>}
                      </td>
                      <td style={S.td}>
                        <div><a href={`mailto:${e.email}`} style={{ color: "#4f46e5", textDecoration: "none" }}>{e.email}</a></div>
                        <div style={S.muted}>{e.phone}</div>
                      </td>
                      <td style={{ ...S.td, ...S.main, maxWidth: "200px" }}>{e.service || "-"}</td>
                      <td style={S.td}><SourceBadge source={e.source} /></td>
                      <td style={S.td}>
                        <select value={e.status} onChange={(ev) => update(e, { status: ev.target.value }, "Status updated")} style={{ ...S.input, padding: "4px 8px", fontWeight: 700, color: (STATUS_COLORS[e.status] || {}).color }}>
                          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </td>
                      <td style={S.td}>
                        <select value={e.assigned_to || ""} onChange={(ev) => update(e, { assigned_to: ev.target.value || null }, "Assignment updated")} style={{ ...S.input, padding: "4px 8px", maxWidth: "160px" }}>
                          <option value="">Unassigned</option>
                          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <button style={S.btn} onClick={() => setOpen(isOpen ? null : e.id)}>{isOpen ? "Close" : "View"}</button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0, borderBottom: "1px solid var(--ui-border, #e2e8f0)" }}>
<<<<<<< HEAD
                          <EnquiryDetail e={e} onSaved={replaceRow} onConvert={(x) => setConfirm({ type: "convert", e: x })} onDelete={(x) => setConfirm({ type: "delete", e: x })} />
=======
                          <EnquiryDetail e={e} staff={staff} onSaved={replaceRow} onConvert={(x) => setConfirm({ type: "convert", e: x })} onDelete={(x) => setConfirm({ type: "delete", e: x })} />
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={page} totalRecords={total} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <ConfirmModal
        show={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={doConfirm}
        title={confirm?.type === "bulk" ? "Delete selected enquiries" : confirm?.type === "delete" ? "Delete enquiry" : "Convert to client"}
        message={
          confirm?.type === "bulk"
            ? `Delete ${sel.count} selected enquir${sel.count === 1 ? "y" : "ies"}? This cannot be undone.`
            : confirm?.type === "delete"
            ? `Delete the enquiry from ${confirm?.e?.name}? This cannot be undone.`
            : `Create a client for ${confirm?.e?.name} (${confirm?.e?.email}) and mark this enquiry as Won?`
        }
        confirmText={confirm?.type === "convert" ? "Convert" : "Delete"}
        confirmColor={confirm?.type === "convert" ? "#059669" : "var(--danger-color)"}
      />
    </>
  );
}

/* ======================= Chatbot conversations tab ======================= */
<<<<<<< HEAD
function ChatbotAnswerForm({ initialQuestion, initialAnswer, onSave, onCancel, saving }) {
  const [q, setQ] = useState(initialQuestion || "");
  const [a, setA] = useState(initialAnswer || "");
  const ok = q.trim().length >= 2 && a.trim().length >= 2;
  return (
    <form
      onSubmit={(ev) => { ev.preventDefault(); if (ok) onSave({ question: q.trim(), answer: a.trim() }); }}
      style={{ display: "grid", gap: "10px", marginTop: "10px", paddingTop: "10px", borderTop: "1px solid var(--ui-border, #e2e8f0)" }}
    >
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={{ ...S.muted, fontWeight: 700 }}>Question</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} style={{ ...S.input, width: "100%", boxSizing: "border-box" }} />
      </label>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={{ ...S.muted, fontWeight: 700 }}>Chatbot Reply</span>
        <textarea autoFocus value={a} onChange={(e) => setA(e.target.value)} maxLength={3000} rows={3} placeholder="Write the reply the chatbot should give when a visitor asks this..." style={{ ...S.input, width: "100%", boxSizing: "border-box", resize: "vertical" }} />
      </label>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" style={{ ...S.btnPrimary, opacity: ok && !saving ? 1 : 0.6 }} disabled={!ok || saving}>{saving ? "Saving..." : "Save Chatbot Reply"}</button>
        <button type="button" style={S.btn} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function ChatsTab() {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState("conversations"); // "conversations" | "unanswered"
=======
function ChatsTab() {
  const { showToast } = useToast();
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
  const [chats, setChats] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [toDelete, setToDelete] = useState(null); // a session id, or BULK for the selected ones
  const sel = useSelection(chats.map((c) => c.session_id));

<<<<<<< HEAD
  const [unanswered, setUnanswered] = useState([]);
  const [uqCounts, setUqCounts] = useState({ pending: 0, answered: 0, ignored: 0, all: 0 });
  const [uqStatus, setUqStatus] = useState("pending");
  const [uqLoading, setUqLoading] = useState(false);
  const [answeringId, setAnsweringId] = useState(null);
  const [savingAnswer, setSavingAnswer] = useState(false);

=======
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: PAGE_SIZE };
      if (search.trim()) params.search = search.trim();
      const r = await API.get("/website-enquiries/chats", { params });
      setChats(r.data.chats || []);
      setTotal(r.data.total || 0);
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to load conversations", "error");
    } finally {
      setLoading(false);
    }
  }, [page, search, showToast]);

<<<<<<< HEAD
  const loadUnanswered = useCallback(async (st = uqStatus) => {
    try {
      setUqLoading(true);
      const r = await API.get("/website-enquiries/unanswered", { params: { status: st } });
      setUnanswered(r.data.questions || []);
      setUqCounts(r.data.counts || { pending: 0, answered: 0, ignored: 0, all: 0 });
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to load unanswered questions", "error");
    } finally {
      setUqLoading(false);
    }
  }, [showToast, uqStatus]);

=======
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

<<<<<<< HEAD
  useEffect(() => {
    loadUnanswered(uqStatus);
  }, [loadUnanswered, uqStatus]);

  const saveChatbotAnswer = async (uq, body) => {
    setSavingAnswer(true);
    try {
      await API.post(`/website-enquiries/unanswered/${uq.id}/answer`, body);
      setAnsweringId(null);
      showToast("Reply saved in DB – chatbot will answer this question now!");
      loadUnanswered(uqStatus);
    } catch (err) {
      showToast(err.response?.data?.error || "Could not save reply", "error");
    } finally {
      setSavingAnswer(false);
    }
  };

  const ignoreUnanswered = async (uq) => {
    try {
      await API.put(`/website-enquiries/unanswered/${uq.id}/ignore`);
      showToast("Question ignored");
      loadUnanswered(uqStatus);
    } catch (err) {
      showToast(err.response?.data?.error || "Could not ignore question", "error");
    }
  };

  const deleteUnanswered = async (uq) => {
    try {
      await API.delete(`/website-enquiries/unanswered/${uq.id}`);
      showToast("Question deleted");
      loadUnanswered(uqStatus);
    } catch (err) {
      showToast(err.response?.data?.error || "Could not delete question", "error");
    }
  };

=======
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
  const doDelete = async () => {
    const sid = toDelete;
    setToDelete(null);
    try {
      if (sid === BULK) {
        const r = await API.post("/website-enquiries/chats/bulk-delete", { sessions: [...sel.picked] });
        showToast(`${r.data.conversations} conversation${r.data.conversations === 1 ? "" : "s"} deleted`);
        sel.clear();
        setOpen(null);
        load();
        return;
      }
      await API.delete(`/website-enquiries/chats/${encodeURIComponent(sid)}`);
      showToast("Conversation deleted");
      setOpen(null);
      load();
    } catch (err) {
      showToast(err.response?.data?.error || "Delete failed", "error");
    }
  };

  return (
    <>
<<<<<<< HEAD
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        <button style={S.chip(subTab === "conversations")} onClick={() => setSubTab("conversations")}>
          Conversations <span style={{ opacity: 0.75 }}>{total}</span>
        </button>
        <button style={S.chip(subTab === "unanswered")} onClick={() => setSubTab("unanswered")}>
          Unanswered Questions {uqCounts.pending > 0 && <span style={{ marginLeft: "4px", padding: "1px 6px", borderRadius: "10px", background: subTab === "unanswered" ? "rgba(255,255,255,0.25)" : "#ef4444", color: "#fff", fontSize: "11px" }}>{uqCounts.pending}</span>}
        </button>
      </div>

      {subTab === "unanswered" ? (
        <>
          <div style={{ ...S.card, padding: "14px 18px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {["pending", "answered", "ignored", "all"].map((st) => (
                <button key={st} style={S.chip(uqStatus === st)} onClick={() => { setUqStatus(st); setAnsweringId(null); }}>
                  {st[0].toUpperCase() + st.slice(1)} <span style={{ opacity: 0.75 }}>{uqCounts[st] ?? 0}</span>
                </button>
              ))}
            </div>
            <button style={S.btn} onClick={() => loadUnanswered(uqStatus)}>Refresh</button>
          </div>

          {uqLoading && !unanswered.length ? (
            <div style={{ ...S.card, padding: "40px", textAlign: "center", ...S.muted }}>Loading unanswered questions...</div>
          ) : !unanswered.length ? (
            <div style={{ ...S.card, padding: "40px", textAlign: "center", ...S.muted }}>
              {uqStatus === "pending" ? "No pending unanswered questions right now." : `No ${uqStatus} questions.`}
            </div>
          ) : (
            <div style={{ display: "grid", gap: "10px" }}>
              {unanswered.map((uq) => (
                <div key={uq.id} style={{ ...S.card, padding: "14px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: "220px" }}>
                      <div style={{ ...S.main, fontWeight: 700, fontSize: "14px" }}>{uq.question}</div>
                      {uq.answer && (
                        <div style={{ ...S.main, fontSize: "13px", marginTop: "6px", padding: "8px 10px", borderRadius: "8px", background: "var(--ui-bg, #f8fafc)", border: "1px solid var(--ui-border, #e2e8f0)", whiteSpace: "pre-wrap" }}>
                          <b>Bot reply:</b> {uq.answer}
                        </div>
                      )}
                      <div style={{ ...S.muted, marginTop: "6px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <span>Asked <b>{uq.ask_count}×</b></span>
                        {uq.page && <span>Page: {uq.page}</span>}
                        <span>Status: <b>{uq.status}</b></span>
                        {uq.answered_by && <span>By: {uq.answered_by}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {(uq.status === "pending" || uq.status === "answered") && (
                        <button style={S.btnPrimary} onClick={() => setAnsweringId(answeringId === uq.id ? null : uq.id)}>
                          {answeringId === uq.id ? "Close" : uq.status === "answered" ? "Edit Reply" : "+ Answer"}
                        </button>
                      )}
                      {uq.status === "pending" && (
                        <button style={S.btn} onClick={() => ignoreUnanswered(uq)}>Ignore</button>
                      )}
                      <button style={{ ...S.btn, color: "#dc2626", borderColor: "rgba(239,68,68,.35)" }} onClick={() => deleteUnanswered(uq)}>Delete</button>
                    </div>
                  </div>
                  {answeringId === uq.id && (
                    <ChatbotAnswerForm
                      initialQuestion={uq.question}
                      initialAnswer={uq.answer}
                      onSave={(body) => saveChatbotAnswer(uq, body)}
                      onCancel={() => setAnsweringId(null)}
                      saving={savingAnswer}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
=======
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
      <div style={{ ...S.card, display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "14px 18px", marginBottom: "16px", flexWrap: "wrap" }}>
        <span style={S.muted}>Every message a visitor typed in the website chatbot, with the bot's replies.</span>
        <input value={search} onChange={(ev) => { setSearch(ev.target.value); setPage(1); }} placeholder="Search messages..." style={{ ...S.input, width: "240px" }} />
      </div>

      <SelectionBar sel={sel} total={total} noun="conversation" onDelete={() => setToDelete(BULK)} />

      <div style={{ ...S.card, overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)" }}>
              <th style={{ ...S.th, width: "36px", paddingRight: 0 }}>
                <CheckBox checked={sel.all} indeterminate={sel.some} onChange={sel.toggleAll} label="Select all conversations on this page" />
              </th>
              <th style={S.th}>Last message</th>
              <th style={S.th}>Visitor</th>
              <th style={S.th}>Latest visitor message</th>
              <th style={S.th}>Messages</th>
              <th style={S.th}>Started on page</th>
              <th style={{ ...S.th, textAlign: "right" }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && !chats.length ? (
              <tr><td colSpan={7} style={{ padding: "40px", textAlign: "center", ...S.muted }}>Loading conversations...</td></tr>
            ) : !chats.length ? (
              <tr><td colSpan={7} style={{ padding: "40px", textAlign: "center", ...S.muted }}>No chatbot conversations yet.</td></tr>
            ) : (
              chats.map((c) => {
                const { date } = formatIST(c.last_at);
                const isOpen = open === c.session_id;
                return (
                  <React.Fragment key={c.session_id}>
                    <tr style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)", background: sel.has(c.session_id) ? "rgba(79,70,229,0.08)" : undefined }}>
                      <td style={{ ...S.td, paddingRight: 0 }}>
                        <CheckBox checked={sel.has(c.session_id)} onChange={() => sel.toggle(c.session_id)} label={`Select conversation from ${c.lead_name || "anonymous visitor"}`} />
                      </td>
                      <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                        <div style={{ ...S.main, fontWeight: 600 }}>{date}</div>
                      </td>
                      <td style={S.td}>
                        {c.lead_name ? (
                          <><div style={{ ...S.main, fontWeight: 700 }}>{c.lead_name}</div><div style={{ ...S.muted, color: "#059669", fontWeight: 600 }}>Booked consultation</div></>
                        ) : (
                          <><div style={{ ...S.main, fontWeight: 600 }}>Anonymous visitor</div><div style={S.muted}>{c.ip_address || ""}</div></>
                        )}
                      </td>
                      <td style={{ ...S.td, ...S.main, maxWidth: "340px" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.last_visitor_text || "-"}</div>
                      </td>
                      <td style={{ ...S.td, ...S.main }}>{c.message_count} <span style={S.muted}>({c.visitor_messages} from visitor)</span></td>
                      <td style={{ ...S.td, ...S.muted }}>{c.first_page || "-"}</td>
                      <td style={{ ...S.td, textAlign: "right", whiteSpace: "nowrap" }}>
                        <button style={S.btn} onClick={() => setOpen(isOpen ? null : c.session_id)}>{isOpen ? "Close" : "View chat"}</button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={7} style={{ padding: "14px", background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)" }}>
<<<<<<< HEAD
                          <Transcript sessionId={c.session_id} onSavedCustom={() => loadUnanswered(uqStatus)} />
=======
                          <Transcript sessionId={c.session_id} />
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
                          <div style={{ marginTop: "10px", textAlign: "right" }}>
                            <button style={{ ...S.btn, color: "#dc2626", borderColor: "rgba(239,68,68,.35)" }} onClick={() => setToDelete(c.session_id)}>Delete conversation</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pagination currentPage={page} totalRecords={total} pageSize={PAGE_SIZE} onPageChange={setPage} />

      <ConfirmModal
        show={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={doDelete}
        title={toDelete === BULK ? "Delete selected conversations" : "Delete conversation"}
        message={toDelete === BULK ? `Delete ${sel.count} selected conversation${sel.count === 1 ? "" : "s"} and all their messages? This cannot be undone.` : "Delete this chatbot conversation? This cannot be undone."}
        confirmText="Delete"
      />
<<<<<<< HEAD
        </>
      )}
=======
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
    </>
  );
}

/* ======================= page ======================= */
<<<<<<< HEAD
/* One page per item of the "Padhya Enquiry" sidebar group:
   view="enquiries" → /website-enquiries, view="chats" → /website-chats, view="faqs" → /website-faqs */
const VIEWS = {
  enquiries: { title: "Enquiries", sub: "Consultation requests from the padhyasoft.com form and chatbot bookings." },
  chats: { title: "Chatbot Conversations", sub: "Every conversation visitors had with the padhyasoft.com chatbot." },
  faqs: { title: "Website FAQ", sub: "The questions and answers shown on padhyasoft.com pages – the website chatbot answers from these too." },
};

export default function WebsiteEnquiries({ view = "enquiries" }) {
  const v = VIEWS[view] || VIEWS.enquiries;
=======
export default function WebsiteEnquiries() {
  const [tab, setTab] = useState("enquiries");
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
  return (
    <div style={S.page}>
      <div style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
<<<<<<< HEAD
          <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0, ...S.main }}>{v.title}</h1>
        </div>
        <p style={{ ...S.muted, fontSize: "14px", margin: "6px 0 0" }}>{v.sub}</p>
      </div>

      {view === "faqs" ? <WebsiteFaqs /> : view === "chats" ? <ChatsTab /> : <EnquiriesTab />}
=======
          <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0, ...S.main }}>Website Enquiries</h1>
        </div>
        <p style={{ ...S.muted, fontSize: "14px", margin: "6px 0 0" }}>Consultation requests and chatbot conversations from padhyasoft.com.</p>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <button style={S.chip(tab === "enquiries")} onClick={() => setTab("enquiries")}>Enquiries</button>
        <button style={S.chip(tab === "chats")} onClick={() => setTab("chats")}>Chatbot conversations</button>
      </div>

      {tab === "enquiries" ? <EnquiriesTab /> : <ChatsTab />}
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1
    </div>
  );
}
