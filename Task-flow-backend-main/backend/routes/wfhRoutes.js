const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool, logAudit } = require("../config/mysqlDb");

const isUserSuperAdmin = (req) => {
  const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
  return req.user?.email === superEmail || req.user?.role?.name === "Super Admin" || req.user?.role === "Super Admin" || req.user?.role?.name === "Company Owner";
};

// 1. SUBMIT WFH / ON-DUTY REQUEST
router.post("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userName = req.user.name || "Employee";
    const userEmail = req.user.email || "";
    const companyId = req.user.company_id || "default_company";

    const { request_type = "WFH", from_date, to_date, day_type = "Full Day", reason } = req.body;

    if (!from_date) {
      return res.status(400).json({ error: "Plese enter from date", field: "from_date" });
    }
    if (!to_date) {
      return res.status(400).json({ error: "Plese enter to date", field: "to_date" });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Plese enter reason", field: "reason" });
    }

    if (new Date(to_date) < new Date(from_date)) {
      return res.status(400).json({ error: "To date cannot be earlier than from date." });
    }

    // B13: Check for overlapping Pending or Approved WFH/On-Duty requests
    const [overlapRows] = await pool.query(
      `SELECT * FROM wfh_requests
       WHERE user_id = ?
         AND status IN ('Pending', 'Approved')
         AND NOT (to_date < ? OR from_date > ?)
       LIMIT 1`,
      [userId, from_date, to_date]
    );

    if (overlapRows.length > 0) {
      const ex = overlapRows[0];
      return res.status(400).json({
        error: `You already have an existing ${ex.status.toLowerCase()} ${ex.request_type} request for this period (${ex.from_date} to ${ex.to_date})!`
      });
    }

    const id = `wfh_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await pool.query(
      `INSERT INTO wfh_requests 
       (id, company_id, user_id, user_name, user_email, request_type, from_date, to_date, day_type, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [id, companyId, userId, userName, userEmail, request_type, from_date, to_date, day_type, reason.trim()]
    );

    await logAudit({
      companyId,
      actorId: userId,
      actorName: userName,
      actorRole: req.user.role?.name || "Employee",
      module: "wfh",
      action: "wfh_requested",
      targetId: id,
      targetName: `${request_type} from ${from_date} to ${to_date}`,
      details: { request_type, from_date, to_date, day_type, reason },
      ipAddress: req.ip
    });

    const [rows] = await pool.query("SELECT * FROM wfh_requests WHERE id = ?", [id]);
    const created = rows[0];

    const io = req.app.get("io");
    if (io) {
      io.emit("wfhRequestCreated", created);
    }

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET WFH / ON-DUTY REQUESTS
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userEmail = req.user.email || "";
    const companyId = req.user.company_id || "default_company";
    const isSuper = isUserSuperAdmin(req);
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    const { status, type } = req.query;

    let whereClause = "WHERE 1=1";
    const params = [];

    if (!isSuper && !isManager) {
      whereClause += " AND (user_id = ? OR user_email = ?)";
      params.push(userId, userEmail);
    } else {
      if (companyId && companyId !== "default_company") {
        whereClause += " AND company_id = ?";
        params.push(companyId);
      }
    }

    if (status && status !== "All") {
      whereClause += " AND status = ?";
      params.push(status);
    }

    if (type && type !== "All") {
      whereClause += " AND request_type = ?";
      params.push(type);
    }

    const [rows] = await pool.query(
      `SELECT * FROM wfh_requests ${whereClause} ORDER BY created_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. APPROVE WFH / ON-DUTY REQUEST
router.post("/:id/approve", authMiddleware, async (req, res) => {
  try {
    const approverId = req.user._id ? req.user._id.toString() : req.user.id;
    const approverName = req.user.name || "Manager";
    const approverRole = req.user.role?.name || req.user.role || "Manager";
    const isSuper = isUserSuperAdmin(req);
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    if (!isSuper && !isManager) {
      return res.status(403).json({ error: "Access Denied: Only Manager or Admin can approve WFH / OD requests." });
    }

    const { id } = req.params;
    const { comment } = req.body;

    const [rows] = await pool.query("SELECT * FROM wfh_requests WHERE id = ?", [id]);
    if (!rows.length) {
      return res.status(404).json({ error: "Request not found." });
    }

    const reqItem = rows[0];

    if (!isSuper && (reqItem.user_id === approverId || reqItem.user_email === req.user.email)) {
      return res.status(403).json({ error: "You cannot approve your own request." });
    }

    if (reqItem.status !== "Pending") {
      return res.status(400).json({ error: `Request has already been ${reqItem.status}.` });
    }

    await pool.query(
      `UPDATE wfh_requests 
       SET status = 'Approved', approver_id = ?, approver_name = ?, approver_comment = ?, updated_at = NOW() 
       WHERE id = ?`,
      [approverId, approverName, comment || "Approved", id]
    );

    await logAudit({
      companyId: reqItem.company_id,
      actorId: approverId,
      actorName: approverName,
      actorRole: approverRole,
      module: "wfh",
      action: "wfh_approved",
      targetId: id,
      targetName: `Approved ${reqItem.request_type} for ${reqItem.user_name}`,
      details: { comment },
      ipAddress: req.ip
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("wfhRequestUpdated", { id, status: "Approved", approverName });
    }

    res.json({ message: `${reqItem.request_type} request approved successfully!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. REJECT WFH / ON-DUTY REQUEST
router.post("/:id/reject", authMiddleware, async (req, res) => {
  try {
    const approverId = req.user._id ? req.user._id.toString() : req.user.id;
    const approverName = req.user.name || "Manager";
    const approverRole = req.user.role?.name || req.user.role || "Manager";
    const isSuper = isUserSuperAdmin(req);
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    if (!isSuper && !isManager) {
      return res.status(403).json({ error: "Access Denied: Only Manager or Admin can reject WFH / OD requests." });
    }

    const { id } = req.params;
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: "A rejection comment is required." });
    }

    const [rows] = await pool.query("SELECT * FROM wfh_requests WHERE id = ?", [id]);
    if (!rows.length) {
      return res.status(404).json({ error: "Request not found." });
    }

    const reqItem = rows[0];

    if (!isSuper && (reqItem.user_id === approverId || reqItem.user_email === req.user.email)) {
      return res.status(403).json({ error: "You cannot review your own request." });
    }

    if (reqItem.status !== "Pending") {
      return res.status(400).json({ error: `Request has already been ${reqItem.status}.` });
    }

    await pool.query(
      `UPDATE wfh_requests 
       SET status = 'Rejected', approver_id = ?, approver_name = ?, approver_comment = ?, updated_at = NOW() 
       WHERE id = ?`,
      [approverId, approverName, comment.trim(), id]
    );

    await logAudit({
      companyId: reqItem.company_id,
      actorId: approverId,
      actorName: approverName,
      actorRole: approverRole,
      module: "wfh",
      action: "wfh_rejected",
      targetId: id,
      targetName: `Rejected ${reqItem.request_type} for ${reqItem.user_name}`,
      details: { comment: comment.trim() },
      ipAddress: req.ip
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("wfhRequestUpdated", { id, status: "Rejected", approverName, comment });
    }

    res.json({ message: `${reqItem.request_type} request rejected.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. CANCEL / DELETE WFH REQUEST (Requester if Pending, or Super Admin)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const isSuper = isUserSuperAdmin(req);
    const { id } = req.params;

    const [rows] = await pool.query("SELECT * FROM wfh_requests WHERE id = ?", [id]);
    if (!rows.length) {
      return res.status(404).json({ error: "Request not found." });
    }

    const reqItem = rows[0];

    const isOwner = String(reqItem.user_id) === String(userId) || reqItem.user_email === req.user.email;
    if (!isSuper && (!isOwner || reqItem.status !== "Pending")) {
      return res.status(403).json({ error: "Access Denied: You can only cancel your own pending requests." });
    }

    await pool.query("DELETE FROM wfh_requests WHERE id = ?", [id]);

    await logAudit({
      companyId: reqItem.company_id,
      actorId: userId,
      actorName: req.user.name || "Employee",
      actorRole: req.user.role?.name || "Employee",
      module: "wfh",
      action: "wfh_cancelled",
      targetId: id,
      targetName: `Cancelled ${reqItem.request_type} request for ${reqItem.user_name}`,
      details: { startDate: reqItem.start_date, endDate: reqItem.end_date },
      ipAddress: req.ip
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("wfhRequestDeleted", { id });
    }

    res.json({ message: "Request cancelled successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
