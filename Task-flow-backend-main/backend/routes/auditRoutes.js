const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool } = require("../config/mysqlDb");

const isUserSuperAdmin = (req) => {
  const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
  return req.user?.email === superEmail || req.user?.role?.name === "Super Admin" || req.user?.role === "Super Admin" || req.user?.role?.name === "Company Owner";
};

// 1. GET AUDIT LOGS (Admin only)
router.get("/", authMiddleware, async (req, res) => {
  try {
    if (!isUserSuperAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Universal Audit Logs are restricted to Administrators." });
    }

    const { module, actor_id, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = "WHERE 1=1";
    const params = [];

    if (module && module !== "All") {
      whereClause += " AND module = ?";
      params.push(module);
    }

    if (actor_id) {
      whereClause += " AND actor_id = ?";
      params.push(actor_id);
    }

    if (search) {
      whereClause += " AND (actor_name LIKE ? OR target_name LIKE ? OR action LIKE ?)";
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    const [rows] = await pool.query(
      `SELECT * FROM audit_logs 
       ${whereClause} 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`,
      params
    );

    const formatted = rows.map(r => ({
      ...r,
      details: typeof r.details === "string" ? JSON.parse(r.details || "null") : r.details
    }));

    res.json({
      logs: formatted,
      total: countRows[0]?.total || 0,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET DISTINCT MODULES
router.get("/modules", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT DISTINCT module FROM audit_logs ORDER BY module ASC");
    res.json(rows.map(r => r.module));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
