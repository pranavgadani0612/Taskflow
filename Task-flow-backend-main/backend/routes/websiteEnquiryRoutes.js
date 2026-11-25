/* =====================================================================
   WEBSITE ENQUIRIES – leads + chatbot conversations from padhyasoft.com
   ---------------------------------------------------------------------
   Public  (no login, called by the website):
     POST /api/public/website-enquiry     consultation form / chatbot booking
     POST /api/public/website-chat        one chatbot message (visitor or bot)
   Admin   (login + "website_enquiries" permission; Super Admin always):
     GET    /api/website-enquiries                 list + filters + status counts
     PUT    /api/website-enquiries/:id             status / assignee / notes
     DELETE /api/website-enquiries/:id
     POST   /api/website-enquiries/:id/convert     create a Client from the lead
     GET    /api/website-enquiries/chats           chatbot conversations (one row per visitor session)
     GET    /api/website-enquiries/chats/:session  full transcript
     DELETE /api/website-enquiries/chats/:session
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
