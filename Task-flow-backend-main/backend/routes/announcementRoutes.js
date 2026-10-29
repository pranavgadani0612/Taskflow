const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool, logAudit } = require("../config/mysqlDb");

const isUserSuperAdmin = (req) => {
  const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
  return req.user?.email === superEmail || req.user?.role?.name === "Super Admin" || req.user?.role === "Super Admin" || req.user?.role?.name === "Company Owner";
};

const getCompanyId = (req) => req.user?.companyId?._id || req.user?.companyId?.id || req.user?.company_id || (typeof req.user?.companyId === 'string' ? req.user.companyId : 'default_company');

// 1. GET ANNOUNCEMENTS (Pinned first, sorted by created_at DESC)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const companyId = getCompanyId(req);

    const [rows] = await pool.query(
      `SELECT a.*,
              (SELECT COUNT(*) FROM announcement_acknowledgments ack WHERE ack.announcement_id = a.id) as ack_count,
              (SELECT COUNT(*) FROM announcement_acknowledgments ack WHERE ack.announcement_id = a.id AND ack.user_id = ?) as user_acknowledged
       FROM announcements a
       WHERE a.company_id = ? OR a.company_id = 'default_company'
       ORDER BY a.pinned DESC, a.created_at DESC`,
      [userId, companyId]
    );

    const formatted = rows.map(r => ({
      ...r,
      pinned: r.pinned === 1,
      requires_acknowledgment: r.requires_acknowledgment === 1,
      user_acknowledged: r.user_acknowledged > 0,
      ack_count: r.ack_count || 0
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. CREATE ANNOUNCEMENT (Admin / HR)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const isSuper = isUserSuperAdmin(req);
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    if (!isSuper && !isManager) {
      return res.status(403).json({ error: "Access Denied: Only Admin or HR can post announcements." });
    }

    const { title, content, priority = "Normal", target_department = "All", pinned = false, requires_acknowledgment = false } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Plese enter notice title", field: "title" });
    }
    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Plese enter content", field: "content" });
    }

    const id = `ann_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const companyId = req.user.company_id || "default_company";
    const authorId = req.user._id ? req.user._id.toString() : req.user.id;
    const authorName = req.user.name || "Admin";

    await pool.query(
      `INSERT INTO announcements (id, company_id, title, content, priority, target_department, pinned, requires_acknowledgment, created_by_id, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        title.trim(),
        content.trim(),
        priority,
        target_department,
        pinned ? 1 : 0,
        requires_acknowledgment ? 1 : 0,
        authorId,
        authorName
      ]
    );

    await logAudit({
      companyId,
      actorId: authorId,
      actorName: authorName,
      actorRole: req.user.role?.name || "Admin",
      module: "announcements",
      action: "announcement_created",
      targetId: id,
      targetName: title.trim(),
      details: { priority, target_department, pinned, requires_acknowledgment },
      ipAddress: req.ip
    });

    const [rows] = await pool.query("SELECT * FROM announcements WHERE id = ?", [id]);
    const created = rows[0];

    const io = req.app.get("io");
    if (io) {
      io.emit("announcementCreated", created);
    }

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. ACKNOWLEDGE ANNOUNCEMENT (Employee)
router.post("/:id/acknowledge", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userName = req.user.name || "Employee";
    const { id } = req.params;

    const [annRows] = await pool.query("SELECT * FROM announcements WHERE id = ?", [id]);
    if (!annRows.length) {
      return res.status(404).json({ error: "Announcement not found." });
    }

    const ackId = `ack_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await pool.query(
      `INSERT INTO announcement_acknowledgments (id, announcement_id, user_id, user_name)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE acknowledged_at = CURRENT_TIMESTAMP`,
      [ackId, id, userId, userName]
    );

    res.json({ message: "Announcement acknowledged!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET ACKNOWLEDGMENTS FOR ANNOUNCEMENT (Admin)
router.get("/:id/acknowledgments", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ack.*, s.department, s.position, s.email, s.image
       FROM announcement_acknowledgments ack
       LEFT JOIN staff s ON ack.user_id = s.id
       WHERE ack.announcement_id = ?
       ORDER BY ack.acknowledged_at DESC`,
      [req.params.id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. DELETE ANNOUNCEMENT (Admin)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const isSuper = isUserSuperAdmin(req);
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    if (!isSuper && !isManager) {
      return res.status(403).json({ error: "Access Denied: Only Admin can delete announcements." });
    }

    const [rows] = await pool.query("SELECT * FROM announcements WHERE id = ?", [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ error: "Announcement not found." });
    }

    await pool.query("DELETE FROM announcements WHERE id = ?", [req.params.id]);
    await pool.query("DELETE FROM announcement_acknowledgments WHERE announcement_id = ?", [req.params.id]);

    await logAudit({
      companyId: rows[0].company_id,
      actorId: req.user._id ? req.user._id.toString() : req.user.id,
      actorName: req.user.name || "Admin",
      actorRole: req.user.role?.name || "Admin",
      module: "announcements",
      action: "announcement_deleted",
      targetId: req.params.id,
      targetName: rows[0].title,
      ipAddress: req.ip
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("announcementDeleted", { id: req.params.id });
    }

    res.json({ message: "Announcement deleted successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. UPDATE ANNOUNCEMENT (Admin)
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const isSuper = isUserSuperAdmin(req);
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    if (!isSuper && !isManager) {
      return res.status(403).json({ error: "Access Denied: Only Admin can edit announcements." });
    }

    const { title, content, priority, target_department, pinned, requires_acknowledgment } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required." });
    }

    const [rows] = await pool.query("SELECT * FROM announcements WHERE id = ?", [req.params.id]);
    if (!rows.length) {
      return res.status(404).json({ error: "Announcement not found." });
    }

    await pool.query(
      `UPDATE announcements 
       SET title = ?, content = ?, priority = ?, target_department = ?, pinned = ?, requires_acknowledgment = ?
       WHERE id = ?`,
      [
        title.trim(),
        content.trim(),
        priority || "Normal",
        target_department || "All",
        pinned ? 1 : 0,
        requires_acknowledgment ? 1 : 0,
        req.params.id
      ]
    );

    await logAudit({
      companyId: rows[0].company_id,
      actorId: req.user._id ? req.user._id.toString() : req.user.id,
      actorName: req.user.name || "Admin",
      actorRole: req.user.role?.name || "Admin",
      module: "announcements",
      action: "announcement_updated",
      targetId: req.params.id,
      targetName: title.trim(),
      details: { priority, target_department, pinned, requires_acknowledgment },
      ipAddress: req.ip
    });

    const [updatedRows] = await pool.query("SELECT * FROM announcements WHERE id = ?", [req.params.id]);
    res.json(updatedRows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
