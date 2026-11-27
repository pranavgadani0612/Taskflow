/* =====================================================================
   SIDEBAR MANAGER – order, names and show/hide of the sidebar modules
   ---------------------------------------------------------------------
   Stored per company in sidebar_settings.config as JSON:
     { items: [ { key, label?, hidden?, children?: [ { key, label?, hidden? } ] } ] }
   The array order is the sidebar order (1, 2, 3 ...). Module keys come from the
   frontend list (config/sidebarModules.jsx); modules missing here keep their default place.

     GET    /api/sidebar-settings    every logged-in user (their company's sidebar)
     PUT    /api/sidebar-settings    save   – "sidebar_management" update (Super Admin / Company Owner always)
     DELETE /api/sidebar-settings    reset to default – same permission
   ===================================================================== */
const express = require("express");
const authMiddleware = require("../middleware/auth");
const { checkPermission } = require("../middleware/permissions");
const { pool, logAudit } = require("../config/mysqlDb");

const router = express.Router();
router.use(authMiddleware);

const PERM = "sidebar_management";
const KEY_RE = /^[a-z0-9_-]{1,60}$/;

const isSuperAdmin = (u) =>
  u?.email === "gadanipranav@gmail.com" ||
  (process.env.SUPERADMIN_EMAIL && u?.email === process.env.SUPERADMIN_EMAIL) ||
  u?.role?.name === "Super Admin";

// Super Admin may work on the company selected in the header (?companyId=...); everyone else only on their own
const companyOf = (req) => {
  const own = String(req.user?.companyId?._id || req.user?.companyId || "default_company");
  const picked = typeof req.query.companyId === "string" ? req.query.companyId.trim().slice(0, 100) : "";
  return isSuperAdmin(req.user) && picked ? picked : own;
};

const cleanLabel = (v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).replace(/\s+/g, " ").trim().slice(0, 40);
  return s || undefined;
};

/* validate + normalise the config sent by the Sidebar Manager page */
function sanitize(body) {
  const items = Array.isArray(body?.items) ? body.items : null;
  if (!items) return { error: "items must be a list" };
  if (items.length > 100) return { error: "Too many modules" };

  const seen = new Set();
  const cleanItem = (it, depth) => {
    if (!it || typeof it !== "object" || !KEY_RE.test(String(it.key || ""))) throw new Error("Invalid module key");
    const key = String(it.key);
    if (seen.has(key)) throw new Error(`Module "${key}" is listed twice`);
    seen.add(key);
    const out = { key };
    const label = cleanLabel(it.label);
    if (label) out.label = label;
    if (it.hidden) out.hidden = true;
    if (depth === 0 && Array.isArray(it.children)) {
      if (it.children.length > 50) throw new Error("Too many sub-modules");
      out.children = it.children.map((c) => cleanItem(c, 1));
    }
    return out;
  };

  try {
    return { config: { items: items.map((it) => cleanItem(it, 0)) } };
  } catch (e) {
    return { error: e.message };
  }
}

const audit = (req, action, details) =>
  logAudit({
    companyId: companyOf(req),
    actorId: req.user?.id,
    actorName: req.user?.name,
    actorRole: req.user?.role?.name,
    module: PERM,
    action,
    targetId: companyOf(req),
    targetName: "Sidebar",
    details,
    ipAddress: String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim().slice(0, 50) || null,
  });

const notifyCompany = (req, companyId) => {
  const io = req.app.get("io");
  if (io) io.emit("sidebar_settings_updated", { companyId });
};

router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT config, updated_by, updated_at FROM sidebar_settings WHERE company_id = ? LIMIT 1", [companyOf(req)]);
    if (!rows.length) return res.json({ config: null, updatedBy: null, updatedAt: null });
    const raw = rows[0].config;
    let config = null;
    try { config = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { config = null; }
    res.json({ config, updatedBy: rows[0].updated_by, updatedAt: rows[0].updated_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/", checkPermission(PERM, "update"), async (req, res) => {
  try {
    const { config, error } = sanitize(req.body || {});
    if (error) return res.status(400).json({ error });
    const cid = companyOf(req);
    await pool.query(
      `INSERT INTO sidebar_settings (company_id, config, updated_by) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE config = VALUES(config), updated_by = VALUES(updated_by)`,
      [cid, JSON.stringify(config), req.user?.name || null]
    );
    await audit(req, "SIDEBAR_UPDATE", {
      order: config.items.map((i) => i.key),
      hidden: config.items.flatMap((i) => [i, ...(i.children || [])]).filter((i) => i.hidden).map((i) => i.key),
      renamed: config.items.flatMap((i) => [i, ...(i.children || [])]).filter((i) => i.label).map((i) => ({ key: i.key, label: i.label })),
    });
    notifyCompany(req, cid);
    const [rows] = await pool.query("SELECT updated_by, updated_at FROM sidebar_settings WHERE company_id = ?", [cid]);
    res.json({ ok: true, config, updatedBy: rows[0]?.updated_by, updatedAt: rows[0]?.updated_at });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/", checkPermission(PERM, "update"), async (req, res) => {
  try {
    const cid = companyOf(req);
    await pool.query("DELETE FROM sidebar_settings WHERE company_id = ?", [cid]);
    await audit(req, "SIDEBAR_RESET", {});
    notifyCompany(req, cid);
    res.json({ ok: true, config: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
