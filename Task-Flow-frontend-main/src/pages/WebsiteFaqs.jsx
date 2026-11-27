import React, { useCallback, useEffect, useMemo, useState } from "react";
import API from "../api/api";
import { useToast } from "../contexts/ToastContext";
import ConfirmModal from "../components/common/ConfirmModal";

/* =====================================================================
   Website FAQ manager (Padhya Enquiry → FAQ)
   The FAQs of every padhyasoft.com page live in the website_faqs table.
   The website reads them from GET /api/public/website-faqs:
     - when a visitor opens a page (changes show within about a minute)
     - when the website is built (the copy Google reads)
   The website chatbot answers from the same FAQs.
   ===================================================================== */

const SITE = "https://www.padhyasoft.com";
const LABELS = {
  home: ["Home", "/"],
  about: ["About", "/about"],
  services: ["Services", "/services"],
  contact: ["Contact", "/contact"],
  trackandtracesystem: ["Track & Trace System", "/service/trackandtracesystem"],
  softwaredevelopment: ["Software Development", "/service/softwaredevelopment"],
  mobileappdevelopment: ["Mobile App Development", "/service/mobileappdevelopment"],
  qrcodesolution: ["QR Code Solutions", "/service/qrcodesolution"],
  industryautomationsolutions: ["Industry Automation", "/service/industryautomationsolutions"],
  webdevelopment: ["Web Development", "/service/webdevelopment"],
  webdesign: ["Web Design", "/service/webdesign"],
  ecommercesystem: ["E-commerce Development", "/service/ecommercesystem"],
  digitalmarketing: ["Digital Marketing", "/service/digitalmarketing"],
  graphicdesignservices: ["Graphic Design Services", "/service/graphicdesignservices"],
  videoeditingservices: ["Video Editing Services", "/service/videoeditingservices"],
};
const label = (k) => LABELS[k]?.[0] || k;
const pageUrl = (k) => SITE + (LABELS[k]?.[1] || (["home", "about", "services", "contact"].includes(k) ? `/${k}` : `/service/${k}`));

const S = {
  card: { background: "var(--ui-surface, #fff)", borderRadius: "12px", border: "1px solid var(--ui-border, #e2e8f0)" },
  muted: { color: "var(--text-muted, #64748b)", fontSize: "12px" },
  main: { color: "var(--text-main, #1e293b)" },
  input: { padding: "8px 12px", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", fontSize: "13px", background: "var(--ui-bg, #f8fafc)", color: "var(--text-main, #1e293b)", width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
  btn: { padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", background: "var(--ui-bg, #f8fafc)", color: "var(--text-main, #334155)", fontWeight: 600, fontSize: "12px", cursor: "pointer" },
  btnPrimary: { padding: "7px 14px", borderRadius: "6px", border: "none", background: "#4f46e5", color: "#fff", fontWeight: 700, fontSize: "12px", cursor: "pointer" },
  icon: { padding: "4px 8px", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", background: "var(--ui-bg, #f8fafc)", color: "var(--text-main, #334155)", fontSize: "12px", cursor: "pointer", lineHeight: 1 },
  chip: (on) => ({
    padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
    border: on ? "1px solid #4f46e5" : "1px solid var(--ui-border, #cbd5e1)",
    background: on ? "#4f46e5" : "var(--ui-bg, #f8fafc)", color: on ? "#fff" : "var(--text-main, #475569)",
  }),
  groupTitle: { fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted, #64748b)", marginBottom: "8px" },
};

/* ---------- add / edit form ---------- */
function FaqForm({ initial, onSave, onCancel, saving }) {
  const [q, setQ] = useState(initial?.question || "");
  const [a, setA] = useState(initial?.answer || "");
  const ok = q.trim().length >= 5 && a.trim().length >= 5;
  return (
    <form
      onSubmit={(ev) => { ev.preventDefault(); if (ok) onSave({ question: q.trim(), answer: a.trim() }); }}
      style={{ display: "grid", gap: "10px" }}
    >
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={{ ...S.muted, fontWeight: 700 }}>Question</span>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="e.g. How long does it take to set up a track and trace system?" style={S.input} />
      </label>
      <label style={{ display: "grid", gap: "4px" }}>
        <span style={{ ...S.muted, fontWeight: 700 }}>Answer <span style={{ fontWeight: 500 }}>– put the direct answer in the first sentence (Google and AI assistants quote it)</span></span>
        <textarea value={a} onChange={(e) => setA(e.target.value)} maxLength={3000} rows={4} style={{ ...S.input, resize: "vertical" }} />
      </label>
      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" style={{ ...S.btnPrimary, opacity: ok && !saving ? 1 : 0.6 }} disabled={!ok || saving}>{saving ? "Saving..." : "Save"}</button>
        <button type="button" style={S.btn} onClick={onCancel}>Cancel</button>
        <span style={S.muted}>{a.length}/3000</span>
      </div>
    </form>
  );
}

export default function WebsiteFaqs() {
  const { showToast } = useToast();
  const [faqs, setFaqs] = useState([]);
  const [pageKeys, setPageKeys] = useState([]);
  const [serviceKeys, setServiceKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState("home");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // faq id, or "new"
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const r = await API.get("/website-enquiries/faqs");
      setFaqs(r.data.faqs || []);
      setPageKeys(r.data.pages || []);
      setServiceKeys(r.data.services || []);
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to load FAQs", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = {};
    faqs.forEach((f) => {
      c[f.page_key] = c[f.page_key] || { all: 0, shown: 0 };
      c[f.page_key].all++;
      if (f.is_active) c[f.page_key].shown++;
    });
    return c;
  }, [faqs]);

  const term = search.trim().toLowerCase();
  const list = useMemo(
    () => (term
      ? faqs.filter((f) => (f.question + " " + f.answer).toLowerCase().includes(term))
      : faqs.filter((f) => f.page_key === current)
    ).sort((x, y) => (x.page_key === y.page_key ? x.sort_order - y.sort_order : x.page_key.localeCompare(y.page_key))),
    [faqs, current, term]
  );

  const replace = (row) => setFaqs((all) => all.map((f) => (f.id === row.id ? row : f)));

  const create = async (body) => {
    setSaving(true);
    try {
      const r = await API.post("/website-enquiries/faqs", { ...body, page_key: current });
      setFaqs((all) => [...all, r.data]);
      setEditing(null);
      showToast("FAQ added – it shows on the website within about a minute");
    } catch (err) {
      showToast(err.response?.data?.error || "Could not add the FAQ", "error");
    } finally {
      setSaving(false);
    }
  };

  const save = async (f, body, msg = "FAQ saved") => {
    setSaving(true);
    try {
      const r = await API.put(`/website-enquiries/faqs/${f.id}`, body);
      replace(r.data);
      setEditing(null);
      showToast(msg);
    } catch (err) {
      showToast(err.response?.data?.error || "Could not save the FAQ", "error");
    } finally {
      setSaving(false);
    }
  };

  const move = async (f, dir) => {
    const same = faqs.filter((x) => x.page_key === f.page_key).sort((a, b) => a.sort_order - b.sort_order);
    const i = same.findIndex((x) => x.id === f.id);
    const j = i + dir;
    if (j < 0 || j >= same.length) return;
    [same[i], same[j]] = [same[j], same[i]];
    const ids = same.map((x) => x.id);
    // show the new order straight away, then save it
    setFaqs((all) => all.map((x) => (x.page_key === f.page_key ? { ...x, sort_order: (ids.indexOf(x.id) + 1) * 10 } : x)));
    try {
      await API.post("/website-enquiries/faqs/reorder", { page_key: f.page_key, ids });
    } catch (err) {
      showToast(err.response?.data?.error || "Could not save the new order", "error");
      load();
    }
  };

  const doDelete = async () => {
    const f = toDelete;
    setToDelete(null);
    try {
      await API.delete(`/website-enquiries/faqs/${f.id}`);
      setFaqs((all) => all.filter((x) => x.id !== f.id));
      showToast("FAQ deleted");
    } catch (err) {
      showToast(err.response?.data?.error || "Could not delete the FAQ", "error");
    }
  };

  const PageChips = ({ title, keys }) => (
    <div>
      <div style={S.groupTitle}>{title}</div>
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {keys.map((k) => (
          <button key={k} style={S.chip(!term && current === k)} onClick={() => { setCurrent(k); setSearch(""); setEditing(null); }}>
            {label(k)} <span style={{ opacity: 0.75 }}>{counts[k]?.shown ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div style={{ ...S.card, padding: "16px 18px", marginBottom: "16px", display: "grid", gap: "14px" }}>
        <PageChips title="Main pages" keys={pageKeys} />
        <PageChips title="Service pages" keys={serviceKeys} />
        <input value={search} onChange={(e) => { setSearch(e.target.value); setEditing(null); }} placeholder="Search all FAQs..." style={{ ...S.input, maxWidth: "320px" }} />
      </div>

      <div style={{ ...S.card, padding: "16px 18px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ ...S.main, fontWeight: 800, fontSize: "16px" }}>
            {term ? `Search results (${list.length})` : `${label(current)} page`}
          </div>
          {!term && (
            <div style={S.muted}>
              {counts[current]?.shown ?? 0} shown on the website{counts[current] && counts[current].all !== counts[current].shown ? ` · ${counts[current].all - counts[current].shown} hidden` : ""} ·{" "}
              <a href={pageUrl(current)} target="_blank" rel="noopener noreferrer" style={{ color: "#4f46e5" }}>open page ↗</a>
            </div>
          )}
        </div>
        {!term && editing !== "new" && (
          <button style={S.btnPrimary} onClick={() => setEditing("new")}>+ Add FAQ</button>
        )}
      </div>

      {editing === "new" && (
        <div style={{ ...S.card, padding: "16px 18px", marginBottom: "12px", borderColor: "rgba(79,70,229,.45)" }}>
          <div style={{ ...S.main, fontWeight: 700, marginBottom: "10px" }}>New FAQ for the {label(current)} page</div>
          <FaqForm onSave={create} onCancel={() => setEditing(null)} saving={saving} />
        </div>
      )}

      {loading && !faqs.length ? (
        <div style={{ ...S.card, padding: "40px", textAlign: "center", ...S.muted }}>Loading FAQs...</div>
      ) : !list.length ? (
        <div style={{ ...S.card, padding: "40px", textAlign: "center", ...S.muted }}>
          {term ? "No FAQ matches your search." : "No FAQs on this page yet. The FAQ section is hidden on the website until you add one."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {list.map((f, idx) => {
            const same = term ? null : list;
            return (
              <div key={f.id} style={{ ...S.card, padding: "14px 16px", opacity: f.is_active ? 1 : 0.6 }}>
                {editing === f.id ? (
                  <FaqForm initial={f} onSave={(body) => save(f, body)} onCancel={() => setEditing(null)} saving={saving} />
                ) : (
                  <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
                    <div style={{ ...S.muted, fontWeight: 800, minWidth: "22px", paddingTop: "2px" }}>{term ? "" : idx + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {term && <div style={{ ...S.muted, fontWeight: 700, marginBottom: "2px" }}>{label(f.page_key)}</div>}
                      <div style={{ ...S.main, fontWeight: 700, fontSize: "14px" }}>{f.question}</div>
                      <div style={{ ...S.main, fontSize: "13px", marginTop: "4px", whiteSpace: "pre-wrap", lineHeight: 1.55, opacity: 0.85 }}>{f.answer}</div>
                      <div style={{ ...S.muted, fontSize: "11px", marginTop: "6px" }}>
                        <span style={{ padding: "2px 7px", borderRadius: "5px", fontWeight: 700, marginRight: "6px", background: f.is_active ? "rgba(16,185,129,.14)" : "rgba(100,116,139,.14)", color: f.is_active ? "#059669" : "#475569" }}>
                          {f.is_active ? "Shown" : "Hidden"}
                        </span>
                        {f.updated_by ? `Last change: ${f.updated_by}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "flex-end", maxWidth: "260px" }}>
                      {same && (
                        <>
                          <button style={S.icon} title="Move up" aria-label="Move up" disabled={idx === 0} onClick={() => move(f, -1)}>↑</button>
                          <button style={S.icon} title="Move down" aria-label="Move down" disabled={idx === list.length - 1} onClick={() => move(f, 1)}>↓</button>
                        </>
                      )}
                      <button style={S.btn} onClick={() => setEditing(f.id)}>Edit</button>
                      <button style={S.btn} onClick={() => save(f, { is_active: !f.is_active }, f.is_active ? "FAQ hidden from the website" : "FAQ shown on the website")}>
                        {f.is_active ? "Hide" : "Show"}
                      </button>
                      <button style={{ ...S.btn, color: "#dc2626", borderColor: "rgba(239,68,68,.35)" }} onClick={() => setToDelete(f)}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p style={{ ...S.muted, marginTop: "14px", lineHeight: 1.6 }}>
        Changes show on padhyasoft.com within about a minute and the website chatbot answers from them straight away.
        Google's copy of the page (the FAQ rich data) updates the next time the website is redeployed.
        Hide a FAQ instead of deleting it if you may need it again.
      </p>

      <ConfirmModal
        show={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={doDelete}
        title="Delete FAQ"
        message={`Delete "${toDelete?.question}" from the ${label(toDelete?.page_key)} page? This cannot be undone – use Hide to keep it for later.`}
        confirmText="Delete"
      />
    </>
  );
}
