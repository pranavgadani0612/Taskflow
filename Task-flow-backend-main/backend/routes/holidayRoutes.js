const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool, logAudit } = require("../config/mysqlDb");

const isUserSuperAdmin = (req) => {
  const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
  return req.user?.email === superEmail || req.user?.role?.name === "Super Admin" || req.user?.role === "Super Admin" || req.user?.role?.name === "Company Owner";
};

const getCompanyId = (req) => req.user?.companyId?._id || req.user?.companyId?.id || req.user?.company_id || (typeof req.user?.companyId === 'string' ? req.user.companyId : 'default_company');

// 1. GET ALL COMPANY HOLIDAYS
router.get("/", authMiddleware, async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { year = new Date().getFullYear() } = req.query;

    const [rows] = await pool.query(
      `SELECT * FROM company_holidays 
       WHERE (company_id = ? OR company_id = 'default_company') 
         AND YEAR(holiday_date) = ?
       ORDER BY holiday_date ASC`,
      [companyId, parseInt(year)]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET TEAM LEAVE & HOLIDAY CALENDAR (Conflict visualization)
router.get("/team-calendar", authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.company_id || "default_company";
    const { month, year = new Date().getFullYear() } = req.query;

    const monthNum = month ? parseInt(month) : new Date().getMonth() + 1;
    const yearNum = parseInt(year);

    // Fetch approved leaves for this month
    const [leaves] = await pool.query(
      `SELECT l.id, l.user_id, l.leave_type, l.from_date, l.to_date, l.total_days as days, l.reason, l.status,
              s.name as user_name, s.department, s.position, s.image
       FROM leave_requests l
       LEFT JOIN staff s ON l.user_id = s.id
       WHERE l.status = 'Approved' 
         AND (
           (YEAR(l.from_date) = ? AND MONTH(l.from_date) = ?) OR
           (YEAR(l.to_date) = ? AND MONTH(l.to_date) = ?)
         )
       ORDER BY l.from_date ASC`,
      [yearNum, monthNum, yearNum, monthNum]
    );

    // Fetch holidays for this month
    const [holidays] = await pool.query(
      `SELECT * FROM company_holidays 
       WHERE (company_id = ? OR company_id = 'default_company')
         AND YEAR(holiday_date) = ? AND MONTH(holiday_date) = ?
       ORDER BY holiday_date ASC`,
      [companyId, yearNum, monthNum]
    );

    res.json({
      month: monthNum,
      year: yearNum,
      leaves,
      holidays
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CREATE HOLIDAY (Admin)
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (!isUserSuperAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can create holidays." });
    }

    const companyId = req.user.company_id || "default_company";
    const { name, holiday_date, description, is_optional } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Plese enter holiday name", field: "name" });
    }
    if (!holiday_date) {
      return res.status(400).json({ error: "Plese enter holiday date", field: "holiday_date" });
    }

    const id = `hol_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await pool.query(
      `INSERT INTO company_holidays (id, company_id, name, holiday_date, description, is_optional)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, companyId, name.trim(), holiday_date, description || null, is_optional ? 1 : 0]
    );

    await logAudit({
      companyId,
      actorId: req.user._id ? req.user._id.toString() : req.user.id,
      actorName: req.user.name || "Admin",
      actorRole: req.user.role?.name || "Admin",
      module: "holidays",
      action: "holiday_created",
      targetId: id,
      targetName: `${name} on ${holiday_date}`,
      ipAddress: req.ip
    });

    const [rows] = await pool.query("SELECT * FROM company_holidays WHERE id = ?", [id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3.5 UPDATE HOLIDAY (Admin)
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isUserSuperAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can update holidays." });
    }

    const { name, holiday_date, description, is_optional } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Plese enter holiday name", field: "name" });
    }
    if (!holiday_date) {
      return res.status(400).json({ error: "Plese enter holiday date", field: "holiday_date" });
    }

    await pool.query(
      `UPDATE company_holidays SET
        name = COALESCE(?, name),
        holiday_date = COALESCE(?, holiday_date),
        description = COALESCE(?, description),
        is_optional = COALESCE(?, is_optional)
       WHERE id = ?`,
      [name.trim(), holiday_date, description || null, is_optional ? 1 : 0, req.params.id]
    );

    const [rows] = await pool.query("SELECT * FROM company_holidays WHERE id = ?", [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. DELETE HOLIDAY (Admin)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isUserSuperAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can delete holidays." });
    }

    const [existing] = await pool.query("SELECT * FROM company_holidays WHERE id = ?", [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ error: "Holiday not found." });
    }

    await pool.query("DELETE FROM company_holidays WHERE id = ?", [req.params.id]);

    await logAudit({
      companyId: existing[0].company_id,
      actorId: req.user._id ? req.user._id.toString() : req.user.id,
      actorName: req.user.name || "Admin",
      actorRole: req.user.role?.name || "Admin",
      module: "holidays",
      action: "holiday_deleted",
      targetId: req.params.id,
      targetName: existing[0].name,
      ipAddress: req.ip
    });

    res.json({ message: "Holiday deleted successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
