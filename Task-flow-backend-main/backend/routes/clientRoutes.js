const express = require("express");
const router = express.Router();
const { pool } = require("../config/mysqlDb");
const authMiddleware = require("../middleware/auth");

const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";

// Helper: resolve company ID safely
const resolveCid = (req) => {
  if (req.query?.companyId && req.query.companyId !== "undefined") return req.query.companyId;
  if (req.body?.companyId && req.body.companyId !== "undefined") return req.body.companyId;
  const userCid = req.user?.companyId?._id || req.user?.companyId;
  return userCid ? String(userCid) : "default_company";
};

// Helper: load projects map for populating client.projects
async function getProjectMap() {
  const map = {};
  try {
    const [rows] = await pool.query("SELECT id, name FROM projects");
    rows.forEach((p) => {
      map[p.id] = p;
    });
  } catch (_) {}
  return map;
}

// Helper: format client row for frontend
function formatClient(row, projectMap = {}) {
  let projectList = [];
  if (row.projects) {
    try {
      const parsed = typeof row.projects === "string" ? JSON.parse(row.projects) : row.projects;
      if (Array.isArray(parsed)) {
        projectList = parsed.map((item) => {
          const pid = typeof item === "object" ? (item._id || item.id) : item;
          const p = projectMap[pid];
          return {
            _id: pid,
            id: pid,
            name: p ? p.name : (item.name || "Project"),
          };
        });
      }
    } catch (_) {
      projectList = [];
    }
  }

  return {
    _id: row.id,
    id: row.id,
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    company: row.company || "",
    address: row.address || "",
    status: row.status || "Active",
    notes: row.notes || "",
    projects: projectList,
    companyId: row.company_id || "default_company",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ================= GET ALL CLIENTS =================
router.get("/", authMiddleware, async (req, res) => {
  try {
    const cid = resolveCid(req);
    const isSuperAdmin =
      req.user?.email === SUPERADMIN_EMAIL ||
      req.user?.role?.name === "Super Admin";

    const projectMap = await getProjectMap();

    let query = "SELECT * FROM clients";
    let params = [];

    if (!isSuperAdmin) {
      query += " WHERE company_id = ? OR company_id IS NULL OR company_id = 'default_company'";
      params.push(cid);
    } else if (cid && cid !== "default_company") {
      query += " WHERE company_id = ?";
      params.push(cid);
    }

    query += " ORDER BY created_at DESC";

    const [rows] = await pool.query(query, params);
    const formatted = rows.map((r) => formatClient(r, projectMap));
    res.json(formatted);
  } catch (err) {
    console.error("❌ CLIENT_GET_ERROR:", err);
    res.status(500).json({ message: "DB Error: " + err.message });
  }
});

// ================= CREATE CLIENT =================
router.post("/", authMiddleware, async (req, res) => {
  try {
    const cid = resolveCid(req);
    const { name, email, phone, company, address, status, notes, projects } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Plese enter client name", field: "name" });
    }
    if (!email || !email.trim()) {
      return res.status(400).json({ error: "Plese enter email", field: "email" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: "Plese enter valid email address", field: "email" });
    }

    // B11: Phone validation
    let cleanPhone = "";
    if (phone) {
      cleanPhone = String(phone).trim();
      const phoneRegex = /^[0-9+\-\s]{7,15}$/;
      if (cleanPhone && !phoneRegex.test(cleanPhone)) {
        return res.status(400).json({ error: "Please enter a valid phone number (digits only, 7-15 numbers)" });
      }
    }

    // B7: Check duplicate client email
    const [dup] = await pool.query(
      "SELECT id FROM clients WHERE email = ? AND (company_id = ? OR company_id = 'default_company') LIMIT 1",
      [cleanEmail, cid]
    );
    if (dup.length > 0) {
      return res.status(409).json({ error: `A client with email '${cleanEmail}' already exists!` });
    }

    const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const projectsJson = JSON.stringify(Array.isArray(projects) ? projects : []);

    await pool.query(
      `INSERT INTO clients (
        id, name, email, phone, company, address, status, notes, projects, company_id, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        name.trim(),
        cleanEmail,
        cleanPhone,
        company ? company.trim() : "",
        address ? address.trim() : "",
        status || "Active",
        notes || "",
        projectsJson,
        cid,
        req.user?.id || req.user?._id || "system",
      ]
    );

    const projectMap = await getProjectMap();
    const [createdRows] = await pool.query("SELECT * FROM clients WHERE id = ?", [clientId]);
    res.status(201).json(formatClient(createdRows[0], projectMap));
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "A client with this email already exists!" });
    }
    console.error("❌ CLIENT_POST_ERROR:", err);
    res.status(500).json({ error: "Save Error: " + err.message });
  }
});

// ================= UPDATE CLIENT =================
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { name, email, phone, company, address, status, notes, projects } = req.body;

    const [existing] = await pool.query("SELECT * FROM clients WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ message: "Client not found" });
    }
    const old = existing[0];

    const projectsJson = projects !== undefined
      ? JSON.stringify(Array.isArray(projects) ? projects : [])
      : old.projects;

    await pool.query(
      `UPDATE clients SET
        name = ?,
        email = ?,
        phone = ?,
        company = ?,
        address = ?,
        status = ?,
        notes = ?,
        projects = ?
       WHERE id = ?`,
      [
        name !== undefined ? name.trim() : old.name,
        email !== undefined ? email.trim().toLowerCase() : old.email,
        phone !== undefined ? phone : old.phone,
        company !== undefined ? company : old.company,
        address !== undefined ? address : old.address,
        status !== undefined ? status : old.status,
        notes !== undefined ? notes : old.notes,
        projectsJson,
        req.params.id,
      ]
    );

    const projectMap = await getProjectMap();
    const [updatedRows] = await pool.query("SELECT * FROM clients WHERE id = ?", [req.params.id]);
    res.json(formatClient(updatedRows[0], projectMap));
  } catch (err) {
    console.error("❌ CLIENT_PUT_ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

// ================= DELETE CLIENT =================
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM clients WHERE id = ?", [req.params.id]);
    res.json({ success: true, message: "Client deleted" });
  } catch (err) {
    console.error("❌ CLIENT_DELETE_ERROR:", err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
