const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool, logAudit } = require("../config/mysqlDb");

const isUserAdminOrManager = (req) => {
  const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
  const roleName = req.user?.role?.name || req.user?.role || "";
  const position = req.user?.position || "";
  return req.user?.email === superEmail ||
    roleName === "Super Admin" ||
    roleName === "Company Owner" ||
    roleName.includes("Admin") ||
    position.includes("Manager") ||
    position.includes("Lead");
};

const getCompanyId = (req) => req.user?.companyId?._id || req.user?.companyId?.id || req.user?.company_id || (typeof req.user?.companyId === 'string' ? req.user.companyId : 'default_company');

// 1. GET ALL OVERTIME REQUESTS
router.get("/", authMiddleware, async (req, res) => {
  try {
    const isSuper = isUserAdminOrManager(req);
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const companyId = getCompanyId(req);
    const { status } = req.query;

    let query = `SELECT * FROM overtime_requests WHERE (company_id = ? OR company_id = 'default_company')`;
    const params = [companyId];

    if (!isSuper) {
      query += ` AND user_id = ?`;
      params.push(userId);
    }

    if (status && status !== "All") {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY date DESC, created_at DESC`;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. SUBMIT OVERTIME CLAIM
router.post("/claim", authMiddleware, async (req, res) => {
  try {
    const { date, ot_hours, reason, action_type = "Pay Overtime" } = req.body;
    if (!date) {
      return res.status(400).json({ error: "Plese enter date", field: "date" });
    }
    if (!ot_hours) {
      return res.status(400).json({ error: "Plese enter overtime hours", field: "ot_hours" });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Plese enter reason", field: "reason" });
    }

    const companyId = getCompanyId(req);
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const id = `ot_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await pool.query(
      `INSERT INTO overtime_requests (
        id, company_id, user_id, user_name, date, ot_hours, reason, action_type, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [id, companyId, userId, req.user.name, date, ot_hours, reason, action_type]
    );

    await logAudit({
      companyId,
      actorId: userId,
      actorName: req.user.name,
      actorRole: req.user.role?.name || req.user.role,
      module: "Overtime",
      action: "Submitted Overtime Claim",
      targetId: id,
      targetName: `${ot_hours}h Overtime on ${date}`,
      details: { action_type, reason }
    });

    res.status(201).json({ message: "Overtime claim submitted successfully for approval!", id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. APPROVE OVERTIME CLAIM
router.post("/:id/approve", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrManager(req)) {
      return res.status(403).json({ error: "Access Denied: Only Manager or Admin can approve overtime." });
    }

    const { id } = req.params;
    const { comment } = req.body;

    const [rows] = await pool.query(`SELECT * FROM overtime_requests WHERE id = ?`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Overtime request not found." });
    const claim = rows[0];

    const actorId = req.user._id ? req.user._id.toString() : req.user.id;

    await pool.query(
      `UPDATE overtime_requests SET
        status = 'Approved', approver_id = ?, approver_name = ?, approver_comment = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [actorId, req.user.name, comment || "Approved", id]
    );

    // If action_type is "Credit Comp-Off", add compensatory off to employee leave balance
    if (claim.action_type === "Credit Comp-Off") {
      try {
        const compOffCredit = parseFloat(claim.ot_hours) >= 8 ? 1.0 : (parseFloat(claim.ot_hours) >= 4 ? 0.5 : 0.25);
        await pool.query(
          `UPDATE leave_balances SET total_days = total_days + ? WHERE user_id = ? AND leave_type = 'Compensatory Off'`,
          [compOffCredit, claim.user_id]
        );
      } catch (_) {}
    }

    const companyId = getCompanyId(req);
    await logAudit({
      companyId,
      actorId,
      actorName: req.user.name,
      actorRole: req.user.role?.name || req.user.role,
      module: "Overtime",
      action: "Approved Overtime",
      targetId: id,
      targetName: `${claim.ot_hours}h for ${claim.user_name}`,
      details: { action_type: claim.action_type, comment }
    });

    res.json({ message: `Overtime claim approved successfully! ${claim.action_type === "Credit Comp-Off" ? "Comp-off leave credited." : ""}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. REJECT OVERTIME CLAIM
router.post("/:id/reject", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrManager(req)) {
      return res.status(403).json({ error: "Access Denied." });
    }

    const { id } = req.params;
    const { comment } = req.body;
    const actorId = req.user._id ? req.user._id.toString() : req.user.id;

    await pool.query(
      `UPDATE overtime_requests SET
        status = 'Rejected', approver_id = ?, approver_name = ?, approver_comment = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [actorId, req.user.name, comment || "Rejected", id]
    );

    res.json({ message: "Overtime claim rejected." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
