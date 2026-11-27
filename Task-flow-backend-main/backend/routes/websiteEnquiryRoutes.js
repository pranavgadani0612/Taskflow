/* =====================================================================
/* =====================================================================
   WEBSITE ENQUIRIES – leads + chatbot conversations from padhyasoft.com
   ---------------------------------------------------------------------
   Public  (no login, called by the website):
     POST /api/public/website-enquiry     consultation form / chatbot booking
     POST /api/public/website-chat        one chatbot message (visitor or bot)
     GET  /api/public/website-faqs        active FAQs for every website page (website build + live refresh)
   Admin   (login + "website_enquiries" permission; Super Admin always):
     GET    /api/website-enquiries                 list + filters + status counts
     PUT    /api/website-enquiries/:id             status / assignee / notes
     DELETE /api/website-enquiries/:id
     POST   /api/website-enquiries/:id/convert     create a Client from the lead
     GET    /api/website-enquiries/chats           chatbot conversations (one row per visitor session)
     GET    /api/website-enquiries/chats/:session  full transcript
     DELETE /api/website-enquiries/chats/:session
     GET    /api/website-enquiries/faqs            all website FAQs (active + hidden)
     POST   /api/website-enquiries/faqs            add a FAQ
     PUT    /api/website-enquiries/faqs/:id        edit / show / hide
     DELETE /api/website-enquiries/faqs/:id
     POST   /api/website-enquiries/faqs/reorder    new order for one page
   ===================================================================== */
const express = require("express");
const authMiddleware = require("../middleware/auth");
const { checkPermission } = require("../middleware/permissions");
const { pool, logAudit } = require("../config/mysqlDb");

const PERM = "website_enquiries";
const STATUSES = ["New", "Contacted", "In Progress", "Won", "Lost", "Spam"];

const newId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
const clean = (v, max) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
};
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v || "");
const validPhone = (v) => String(v || "").replace(/\D/g, "").length >= 8;
const clientIp = (req) => String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim().slice(0, 50) || null;

/* ---- simple in-memory rate limiter (per IP) ---- */
function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const ip = clientIp(req) || "unknown";
    const n = (hits.get(ip) || 0) + 1;
    hits.set(ip, n);
    if (n > max) return res.status(429).json({ ok: false, error: "Too many requests. Please try again later." });
    next();
  };
}

/* =====================================================================
   PUBLIC ROUTES
   ===================================================================== */
const publicRouter = express.Router();

publicRouter.post("/website-enquiry", limiter(10, 10 * 60 * 1000), async (req, res) => {
  try {
    const b = req.body || {};
    if (b.website) return res.json({ ok: true }); // honeypot field filled → bot

    const d = {
      name: clean(b.name, 150),
      email: clean(b.email, 255),
      phone: clean(b.phone, 50),
      company: clean(b.company, 150),
      service: clean(b.service, 150),
      engagement: clean(b.engagement, 100),
      budget: clean(b.budget, 100),
      timeline: clean(b.timeline, 100),
      message: clean(b.message, 5000),
      page: clean(b.page, 255),
      chatSession: clean(b.chatSession, 80),
    };
    const isChat = b.source === "Chatbot";

    const errors = {};
    if (!d.name || d.name.length < 2) errors.name = "Enter your full name.";
    if (!validEmail(d.email)) errors.email = "Enter a valid email address.";
    if (!validPhone(d.phone)) errors.phone = "Enter a valid phone number.";
    if (Object.keys(errors).length) return res.status(400).json({ ok: false, errors });

    const id = newId("wenq");
    await pool.query(
      `INSERT INTO website_enquiries
        (id, type, name, email, phone, company, service, engagement, budget, timeline, message, source, page, chat_session, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        isChat ? "chatbot_lead" : "consultation",
        d.name, d.email.toLowerCase(), d.phone, d.company, d.service, d.engagement, d.budget, d.timeline, d.message,
        isChat ? "Chatbot" : "Website form",
        d.page, d.chatSession, clientIp(req), clean(req.get("user-agent"), 255),
      ]
    );

    // live "refresh" signal for the Website Enquiries page (no personal data in the broadcast)
    const io = req.app.get("io");
    if (io) io.emit("website_enquiry_new", { id });

    res.json({ ok: true, id });
  } catch (err) {
    console.error("website-enquiry error:", err.message);
    res.status(500).json({ ok: false, error: "Could not save your enquiry." });
  }
});

publicRouter.post("/website-chat", limiter(200, 10 * 60 * 1000), async (req, res) => {
  try {
    const b = req.body || {};
    const sessionId = clean(b.sessionId, 80);
    const text = clean(b.text, 4000);
    const sender = b.sender === "bot" ? "bot" : "user";
    if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId) || !text) return res.status(400).json({ ok: false });

    await pool.query(
      `INSERT INTO website_chat_messages (id, session_id, sender, text, page, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [newId("wmsg"), sessionId, sender, text, clean(b.page, 255), clientIp(req), clean(req.get("user-agent"), 255)]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("website-chat error:", err.message);
    res.status(500).json({ ok: false });
  }
});

/* ---------- website FAQs (read by padhyasoft.com when it is built and when a visitor opens a page) ---------- */
const FAQ_DEFAULTS = require("../config/websiteFaqDefaults.json");
const FAQ_PAGE_KEYS = Object.keys(FAQ_DEFAULTS.pages || {});            // home, about, services, contact
const FAQ_SERVICE_KEYS = Object.keys(FAQ_DEFAULTS.services || {});      // trackandtracesystem, ...
const FAQ_KEYS = [...FAQ_PAGE_KEYS, ...FAQ_SERVICE_KEYS];

publicRouter.get("/website-faqs", limiter(300, 10 * 60 * 1000), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT page_key, question, answer FROM website_faqs WHERE is_active = 1 ORDER BY page_key, sort_order, created_at"
    );
    // same shape as the website's site.js: { pages: { home: [[q, a], ...] }, services: { slug: [[q, a], ...] } }
    const pages = Object.fromEntries(FAQ_PAGE_KEYS.map((k) => [k, []]));
    const services = Object.fromEntries(FAQ_SERVICE_KEYS.map((k) => [k, []]));
    rows.forEach((r) => {
      const target = FAQ_PAGE_KEYS.includes(r.page_key) ? pages : services;
      (target[r.page_key] = target[r.page_key] || []).push([r.question, r.answer]);
    });
    const [chatbotRows] = await pool.query(
      "SELECT question, answer FROM website_unanswered_questions WHERE status = 'answered' AND answer IS NOT NULL AND answer <> '' ORDER BY updated_at DESC"
    );
    const [[m]] = await pool.query("SELECT MAX(updated_at) AS u, COUNT(*) AS n FROM website_faqs");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({
      ok: true,
      updatedAt: m?.u || null,
      pages,
      services,
      chatbotQa: chatbotRows.map((r) => [r.question, r.answer]),
    });
  } catch (err) {
    console.error("website-faqs error:", err.message);
    res.status(500).json({ ok: false });
  }
});

publicRouter.post("/website-unanswered", limiter(100, 10 * 60 * 1000), async (req, res) => {
  try {
    const b = req.body || {};
    const question = clean(b.question, 500);
    if (!question || question.length < 3) return res.status(400).json({ ok: false });
    const norm = question.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
    const page = clean(b.page, 255);
    const sessionId = clean(b.sessionId, 80);

    const [existing] = await pool.query(
      "SELECT id FROM website_unanswered_questions WHERE normalized_question = ? AND status = 'pending' LIMIT 1",
      [norm]
    );
    if (existing.length) {
      await pool.query(
        "UPDATE website_unanswered_questions SET ask_count = ask_count + 1, page = COALESCE(?, page), session_id = COALESCE(?, session_id) WHERE id = ?",
        [page, sessionId, existing[0].id]
      );
      return res.json({ ok: true, id: existing[0].id, deduplicated: true });
    }

    const id = newId("wuq");
    await pool.query(
      "INSERT INTO website_unanswered_questions (id, question, normalized_question, page, session_id) VALUES (?, ?, ?, ?, ?)",
      [id, question, norm, page, sessionId]
    );
    const io = req.app.get("io");
    if (io) io.emit("website_unanswered_new", { id });
    res.json({ ok: true, id });
  } catch (err) {
    console.error("website-unanswered error:", err.message);
    res.status(500).json({ ok: false });
  }
});

/* =====================================================================
   ADMIN ROUTES
   ===================================================================== */
const adminRouter = express.Router();
adminRouter.use(authMiddleware);

const audit = (req, action, targetId, targetName, details) =>
  logAudit({
    companyId: req.user?.companyId || "default_company",
    actorId: req.user?.id,
    actorName: req.user?.name,
    actorRole: req.user?.role?.name,
    module: "website_enquiries",
    action,
    targetId,
    targetName,
    details,
    ipAddress: clientIp(req),
  });

/* ---------- chatbot conversations (defined before /:id routes) ---------- */
adminRouter.get("/chats", checkPermission(PERM, "read"), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const search = clean(req.query.search, 100);

    let where = "";
    const params = [];
    if (search) {
      where = "WHERE session_id IN (SELECT DISTINCT session_id FROM website_chat_messages WHERE text LIKE ?)";
      params.push(`%${search}%`);
    }

    const [rows] = await pool.query(
      `SELECT m.session_id,
              MIN(m.created_at) AS started_at,
              MAX(m.created_at) AS last_at,
              COUNT(*) AS message_count,
              SUM(m.sender = 'user') AS visitor_messages,
              SUBSTRING_INDEX(GROUP_CONCAT(m.page ORDER BY m.created_at SEPARATOR '\\n'), '\\n', 1) AS first_page,
              SUBSTRING_INDEX(GROUP_CONCAT(CASE WHEN m.sender='user' THEN m.text END ORDER BY m.created_at DESC SEPARATOR '\\n'), '\\n', 1) AS last_visitor_text,
              MAX(m.ip_address) AS ip_address,
              (SELECT e.name FROM website_enquiries e WHERE e.chat_session = m.session_id ORDER BY e.created_at DESC LIMIT 1) AS lead_name,
              (SELECT e.id FROM website_enquiries e WHERE e.chat_session = m.session_id ORDER BY e.created_at DESC LIMIT 1) AS lead_id
       FROM website_chat_messages m
       ${where}
       GROUP BY m.session_id
       ORDER BY last_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    const [cnt] = await pool.query(`SELECT COUNT(DISTINCT session_id) AS total FROM website_chat_messages ${where}`, params);

    res.json({
      chats: rows.map((r) => ({ ...r, message_count: Number(r.message_count), visitor_messages: Number(r.visitor_messages) })),
      total: Number(cnt[0]?.total || 0),
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/chats/:session", checkPermission(PERM, "read"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, sender, text, page, created_at FROM website_chat_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC",
      [req.params.session]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.delete("/chats/:session", checkPermission(PERM, "delete"), async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM website_chat_messages WHERE session_id = ?", [req.params.session]);
    await audit(req, "DELETE_CHAT", req.params.session, `Chat ${req.params.session}`, { deletedMessages: r.affectedRows });
    res.json({ ok: true, deleted: r.affectedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* list of ids from the request body: strings only, de-duplicated, max 500 per call */
const idList = (v) => [...new Set((Array.isArray(v) ? v : []).filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim().slice(0, 100)))].slice(0, 500);

// delete several chatbot conversations at once
adminRouter.post("/chats/bulk-delete", checkPermission(PERM, "delete"), async (req, res) => {
  try {
    const sessions = idList(req.body?.sessions);
    if (!sessions.length) return res.status(400).json({ error: "No conversations selected" });
    const [r] = await pool.query("DELETE FROM website_chat_messages WHERE session_id IN (?)", [sessions]);
    await audit(req, "BULK_DELETE_CHATS", null, `${sessions.length} conversations`, { sessions, deletedMessages: r.affectedRows });
    res.json({ ok: true, conversations: sessions.length, deletedMessages: r.affectedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- website FAQs (defined before /:id routes) ---------- */
const faqInput = (b, partial) => {
  const out = {};
  if (!partial || b.page_key !== undefined) {
    if (!FAQ_KEYS.includes(b.page_key)) return { error: "Choose a valid website page" };
    out.page_key = b.page_key;
  }
  if (!partial || b.question !== undefined) {
    const q = clean(b.question, 500);
    if (!q || q.length < 5) return { error: "Question must be at least 5 characters" };
    out.question = q;
  }
  if (!partial || b.answer !== undefined) {
    const a = clean(b.answer, 3000);
    if (!a || a.length < 5) return { error: "Answer must be at least 5 characters" };
    out.answer = a;
  }
  if (b.is_active !== undefined) out.is_active = b.is_active ? 1 : 0;
  return { data: out };
};

// all FAQs (active and hidden) + the list of website pages they can belong to
adminRouter.get("/faqs", checkPermission(PERM, "read"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM website_faqs ORDER BY page_key, sort_order, created_at");
    res.json({
      faqs: rows.map((r) => ({ ...r, is_active: !!r.is_active })),
      pages: FAQ_PAGE_KEYS,
      services: FAQ_SERVICE_KEYS,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/faqs", checkPermission(PERM, "create"), async (req, res) => {
  try {
    const { data, error } = faqInput(req.body || {}, false);
    if (error) return res.status(400).json({ error });
    const [[mx]] = await pool.query("SELECT COALESCE(MAX(sort_order), 0) AS m FROM website_faqs WHERE page_key = ?", [data.page_key]);
    const id = newId("wfaq");
    await pool.query(
      "INSERT INTO website_faqs (id, page_key, question, answer, sort_order, is_active, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, data.page_key, data.question, data.answer, Number(mx.m) + 10, data.is_active ?? 1, req.user?.name || null]
    );
    await audit(req, "FAQ_CREATE", id, data.question, { page: data.page_key });
    const [rows] = await pool.query("SELECT * FROM website_faqs WHERE id = ?", [id]);
    res.status(201).json({ ...rows[0], is_active: !!rows[0].is_active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// change the order of the FAQs on one page: { page_key, ids: [first, second, ...] }
adminRouter.post("/faqs/reorder", checkPermission(PERM, "update"), async (req, res) => {
  try {
    const key = req.body?.page_key;
    const ids = idList(req.body?.ids);
    if (!FAQ_KEYS.includes(key) || !ids.length) return res.status(400).json({ error: "Nothing to reorder" });
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (let i = 0; i < ids.length; i++) {
        await conn.query("UPDATE website_faqs SET sort_order = ?, updated_by = ? WHERE id = ? AND page_key = ?", [(i + 1) * 10, req.user?.name || null, ids[i], key]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    await audit(req, "FAQ_REORDER", null, key, { ids });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.put("/faqs/:id", checkPermission(PERM, "update"), async (req, res) => {
  try {
    const [found] = await pool.query("SELECT * FROM website_faqs WHERE id = ? LIMIT 1", [req.params.id]);
    if (!found.length) return res.status(404).json({ error: "FAQ not found" });
    const { data, error } = faqInput(req.body || {}, true);
    if (error) return res.status(400).json({ error });
    if (!Object.keys(data).length) return res.status(400).json({ error: "Nothing to update" });
    const cols = Object.keys(data);
    await pool.query(
      `UPDATE website_faqs SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_by = ? WHERE id = ?`,
      [...cols.map((c) => data[c]), req.user?.name || null, req.params.id]
    );
    await audit(req, "FAQ_UPDATE", req.params.id, found[0].question, { fields: cols, page: found[0].page_key });
    const [rows] = await pool.query("SELECT * FROM website_faqs WHERE id = ?", [req.params.id]);
    res.json({ ...rows[0], is_active: !!rows[0].is_active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.delete("/faqs/:id", checkPermission(PERM, "delete"), async (req, res) => {
  try {
    const [found] = await pool.query("SELECT id, page_key, question FROM website_faqs WHERE id = ? LIMIT 1", [req.params.id]);
    if (!found.length) return res.status(404).json({ error: "FAQ not found" });
    await pool.query("DELETE FROM website_faqs WHERE id = ?", [req.params.id]);
    await audit(req, "FAQ_DELETE", found[0].id, found[0].question, { page: found[0].page_key });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- unanswered chatbot questions ---------- */
adminRouter.get("/unanswered", checkPermission(PERM, "read"), async (req, res) => {
  try {
    const status = ["pending", "answered", "ignored", "all"].includes(req.query.status) ? req.query.status : "pending";
    const where = status === "all" ? "" : "WHERE status = ?";
    const params = status === "all" ? [] : [status];
    const [rows] = await pool.query(
      `SELECT * FROM website_unanswered_questions ${where} ORDER BY ask_count DESC, updated_at DESC LIMIT 200`,
      params
    );
    const [cntRows] = await pool.query("SELECT status, COUNT(*) AS n FROM website_unanswered_questions GROUP BY status");
    const counts = { pending: 0, answered: 0, ignored: 0, all: 0 };
    cntRows.forEach((r) => {
      counts[r.status] = Number(r.n);
      counts.all += Number(r.n);
    });
    res.json({ questions: rows, counts, pages: FAQ_PAGE_KEYS, services: FAQ_SERVICE_KEYS });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/unanswered/custom", checkPermission(PERM, "update"), async (req, res) => {
  try {
    const q = clean(req.body?.question, 500);
    const a = clean(req.body?.answer, 3000);
    if (!q || q.length < 2) return res.status(400).json({ error: "Question is required" });
    if (!a || a.length < 2) return res.status(400).json({ error: "Answer is required" });

    const norm = q.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
    const actor = req.user?.name || null;
    const [existing] = await pool.query(
      "SELECT id FROM website_unanswered_questions WHERE normalized_question = ? LIMIT 1",
      [norm]
    );

    let targetId;
    if (existing.length) {
      targetId = existing[0].id;
      await pool.query(
        "UPDATE website_unanswered_questions SET question = ?, answer = ?, status = 'answered', answered_by = ? WHERE id = ?",
        [q, a, actor, targetId]
      );
    } else {
      targetId = newId("wuq");
      await pool.query(
        "INSERT INTO website_unanswered_questions (id, question, normalized_question, page, session_id, ask_count, status, answer, answered_by) VALUES (?, ?, ?, ?, ?, 1, 'answered', ?, ?)",
        [targetId, q, norm, clean(req.body?.page, 255), clean(req.body?.sessionId, 80), a, actor]
      );
    }
    await audit(req, "CHATBOT_QA_CUSTOM", targetId, q, {});
    const [uqRows] = await pool.query("SELECT * FROM website_unanswered_questions WHERE id = ?", [targetId]);
    res.json({ ok: true, question: uqRows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/unanswered/:id/answer", checkPermission(PERM, "update"), async (req, res) => {
  try {
    const [found] = await pool.query("SELECT * FROM website_unanswered_questions WHERE id = ? LIMIT 1", [req.params.id]);
    if (!found.length) return res.status(404).json({ error: "Question not found" });

    const q = clean(req.body?.question ?? found[0].question, 500);
    const a = clean(req.body?.answer, 3000);
    if (!q || q.length < 2) return res.status(400).json({ error: "Question is required" });
    if (!a || a.length < 2) return res.status(400).json({ error: "Answer is required" });

    const norm = q.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
    const actor = req.user?.name || null;
    await pool.query(
      "UPDATE website_unanswered_questions SET question = ?, normalized_question = ?, answer = ?, status = 'answered', answered_by = ? WHERE id = ?",
      [q, norm, a, actor, req.params.id]
    );
    await audit(req, "CHATBOT_QA_ANSWER", req.params.id, q, {});

    const [uqRows] = await pool.query("SELECT * FROM website_unanswered_questions WHERE id = ?", [req.params.id]);
    res.json({ ok: true, question: uqRows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.put("/unanswered/:id/ignore", checkPermission(PERM, "update"), async (req, res) => {
  try {
    const [found] = await pool.query("SELECT id, question FROM website_unanswered_questions WHERE id = ? LIMIT 1", [req.params.id]);
    if (!found.length) return res.status(404).json({ error: "Question not found" });
    await pool.query("UPDATE website_unanswered_questions SET status = 'ignored', answered_by = ? WHERE id = ?", [req.user?.name || null, req.params.id]);
    await audit(req, "UNANSWERED_IGNORE", req.params.id, found[0].question, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.delete("/unanswered/:id", checkPermission(PERM, "delete"), async (req, res) => {
  try {
    const [found] = await pool.query("SELECT id, question FROM website_unanswered_questions WHERE id = ? LIMIT 1", [req.params.id]);
    if (!found.length) return res.status(404).json({ error: "Question not found" });
    await pool.query("DELETE FROM website_unanswered_questions WHERE id = ?", [req.params.id]);
    await audit(req, "UNANSWERED_DELETE", req.params.id, found[0].question, {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------- enquiries ---------- */
// delete several enquiries at once
adminRouter.post("/bulk-delete", checkPermission(PERM, "delete"), async (req, res) => {
  try {
    const ids = idList(req.body?.ids);
    if (!ids.length) return res.status(400).json({ error: "No enquiries selected" });
    const [rows] = await pool.query("SELECT id, name, email FROM website_enquiries WHERE id IN (?)", [ids]);
    if (!rows.length) return res.status(404).json({ error: "Enquiries not found" });
    const [r] = await pool.query("DELETE FROM website_enquiries WHERE id IN (?)", [rows.map((x) => x.id)]);
    await audit(req, "BULK_DELETE", null, `${r.affectedRows} enquiries`, { deleted: rows.map((x) => ({ id: x.id, name: x.name, email: x.email })) });
    res.json({ ok: true, deleted: r.affectedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/", checkPermission(PERM, "read"), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const { status, source } = req.query;
    const search = clean(req.query.search, 100);

    let where = "WHERE 1=1";
    const params = [];
    if (status && status !== "All") {
      where += " AND status = ?";
      params.push(status);
    }
    if (source && source !== "All") {
      where += " AND source = ?";
      params.push(source);
    }
    if (search) {
      where += " AND (name LIKE ? OR email LIKE ? OR phone LIKE ? OR company LIKE ? OR service LIKE ? OR message LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s, s, s, s);
    }

    const [rows] = await pool.query(
      `SELECT * FROM website_enquiries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    const [cnt] = await pool.query(`SELECT COUNT(*) AS total FROM website_enquiries ${where}`, params);
    const [byStatus] = await pool.query("SELECT status, COUNT(*) AS n FROM website_enquiries GROUP BY status");

    const counts = { All: 0 };
    STATUSES.forEach((s) => (counts[s] = 0));
    byStatus.forEach((r) => {
      counts[r.status] = Number(r.n);
      counts.All += Number(r.n);
    });

    res.json({ enquiries: rows, total: Number(cnt[0]?.total || 0), page, limit, counts, statuses: STATUSES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.put("/:id", checkPermission(PERM, "update"), async (req, res) => {
  try {
    const [found] = await pool.query("SELECT * FROM website_enquiries WHERE id = ? LIMIT 1", [req.params.id]);
    if (!found.length) return res.status(404).json({ error: "Enquiry not found" });
    const before = found[0];

    const sets = [];
    const params = [];
    const changes = {};
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });
      sets.push("status = ?");
      params.push(req.body.status);
      changes.status = { from: before.status, to: req.body.status };
    }
    if (req.body.assigned_to !== undefined) {
      let assignedName = null;
      const assignedTo = clean(req.body.assigned_to, 100);
      if (assignedTo) {
        const [st] = await pool.query("SELECT name FROM staff WHERE id = ? LIMIT 1", [assignedTo]);
        if (!st.length) return res.status(400).json({ error: "Staff member not found" });
        assignedName = st[0].name;
      }
      sets.push("assigned_to = ?", "assigned_name = ?");
      params.push(assignedTo, assignedName);
      changes.assigned = { from: before.assigned_name, to: assignedName };
    }
    if (req.body.notes !== undefined) {
      sets.push("notes = ?");
      params.push(clean(req.body.notes, 5000));
      changes.notes = "updated";
    }
    if (!sets.length) return res.status(400).json({ error: "Nothing to update" });

    await pool.query(`UPDATE website_enquiries SET ${sets.join(", ")} WHERE id = ?`, [...params, req.params.id]);
    await audit(req, "UPDATE", before.id, before.name, changes);
    const [rows] = await pool.query("SELECT * FROM website_enquiries WHERE id = ?", [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.delete("/:id", checkPermission(PERM, "delete"), async (req, res) => {
  try {
    const [found] = await pool.query("SELECT id, name, email FROM website_enquiries WHERE id = ? LIMIT 1", [req.params.id]);
    if (!found.length) return res.status(404).json({ error: "Enquiry not found" });
    await pool.query("DELETE FROM website_enquiries WHERE id = ?", [req.params.id]);
    await audit(req, "DELETE", found[0].id, found[0].name, { email: found[0].email });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/:id/convert", checkPermission(PERM, "update"), checkPermission("client_management", "create"), async (req, res) => {
  try {
    const [found] = await pool.query("SELECT * FROM website_enquiries WHERE id = ? LIMIT 1", [req.params.id]);
    if (!found.length) return res.status(404).json({ error: "Enquiry not found" });
    const e = found[0];
    if (e.client_id) return res.status(409).json({ error: "This enquiry is already converted to a client.", clientId: e.client_id });

    const cid = String(req.user?.companyId?._id || req.user?.companyId || "default_company");
    const email = String(e.email).trim().toLowerCase();
    const [dup] = await pool.query("SELECT id FROM clients WHERE email = ? LIMIT 1", [email]);

    let clientId;
    if (dup.length) {
      clientId = dup[0].id; // client with this email already exists – just link it
    } else {
      clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const notes = [
        `From website enquiry (${e.source}) on ${e.created_at}`,
        e.service && `Service: ${e.service}`,
        e.engagement && `Engagement: ${e.engagement}`,
        e.budget && `Budget: ${e.budget}`,
        e.timeline && `Timeline: ${e.timeline}`,
        e.message && `Details: ${e.message}`,
      ].filter(Boolean).join("\n");
      await pool.query(
        `INSERT INTO clients (id, name, email, phone, company, status, notes, projects, company_id, created_by)
         VALUES (?, ?, ?, ?, ?, 'Active', ?, '[]', ?, ?)`,
        [clientId, e.name, email, String(e.phone || "").replace(/[^0-9+\-\s]/g, "").slice(0, 50), e.company, notes, cid, req.user?.id || null]
      );
    }

    await pool.query("UPDATE website_enquiries SET client_id = ?, status = 'Won' WHERE id = ?", [clientId, e.id]);
    await audit(req, "CONVERT_TO_CLIENT", e.id, e.name, { clientId, linkedExisting: dup.length > 0 });
    res.json({ ok: true, clientId, linkedExisting: dup.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { publicRouter, adminRouter };
