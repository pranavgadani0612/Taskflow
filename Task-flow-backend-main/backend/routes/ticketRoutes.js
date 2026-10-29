const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool, logAudit } = require("../config/mysqlDb");
const crypto = require("crypto");

// Helper: Check if user is Super Admin or Company Owner
const isSuperAdminOrOwner = (req) => {
  if (
    req.user?.email === "gadanipranav@gmail.com" ||
    req.user?.role?.name === "Super Admin" ||
    req.user?.role === "Super Admin" ||
    req.user?.role?.name === "Company Owner" ||
    req.user?.role?.name?.toLowerCase().includes("admin")
  ) {
    return true;
  }
  return false;
};

// 1. GET TICKET STATS
router.get("/stats", authMiddleware, async (req, res) => {
  try {
    const isSuper = isSuperAdminOrOwner(req);
    const userId = req.user?.id || req.user?._id;

    let baseQuery = "";
    let params = [];

    if (!isSuper) {
      baseQuery = "WHERE user_id = ?";
      params = [String(userId)];
    }

    const [[total]] = await pool.query(`SELECT COUNT(*) AS count FROM internal_tickets ${baseQuery}`, params);
    const [[open]] = await pool.query(
      `SELECT COUNT(*) AS count FROM internal_tickets ${baseQuery ? baseQuery + " AND" : "WHERE"} status = 'Open'`,
      params
    );
    const [[inProgress]] = await pool.query(
      `SELECT COUNT(*) AS count FROM internal_tickets ${baseQuery ? baseQuery + " AND" : "WHERE"} status = 'In Progress'`,
      params
    );
    const [[resolved]] = await pool.query(
      `SELECT COUNT(*) AS count FROM internal_tickets ${baseQuery ? baseQuery + " AND" : "WHERE"} status = 'Resolved'`,
      params
    );

    res.json({
      total: total?.count || 0,
      open: open?.count || 0,
      inProgress: inProgress?.count || 0,
      resolved: resolved?.count || 0,
    });
  } catch (err) {
    console.error("Error fetching ticket stats:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. GET TICKETS (All for admin, personal for employee)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const isSuper = isSuperAdminOrOwner(req);
    const userId = req.user?.id || req.user?._id;

    let rows;
    if (isSuper) {
      [rows] = await pool.query(`
        SELECT t.* 
        FROM internal_tickets t
        LEFT JOIN staff s ON t.user_id = s.id OR (t.user_email = s.email AND t.user_email != '')
        WHERE (s.status = 'Active' OR s.status IS NULL)
        ORDER BY t.created_at DESC
      `);
    } else {
      [rows] = await pool.query("SELECT * FROM internal_tickets WHERE user_id = ? ORDER BY created_at DESC", [
        String(userId),
      ]);
    }

    res.json(rows);
  } catch (err) {
    console.error("Error fetching tickets:", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. CREATE TICKET (Employee or Admin)
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { category, item_type, title, description, priority } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Plese enter ticket title", field: "title" });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: "Plese enter description", field: "description" });
    }
    if (!category) {
      return res.status(400).json({ error: "Plese enter category", field: "category" });
    }

    const id = crypto.randomUUID();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const ticketNumber = `TCK-${dateStr}-${randomSuffix}`;

    const userId = req.user?.id || req.user?._id;
    const userName = req.user?.name || "Employee";
    const userEmail = req.user?.email || "";

    const insertQuery = `
      INSERT INTO internal_tickets 
      (id, ticket_number, user_id, user_name, user_email, category, item_type, title, description, priority, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open')
    `;

    await pool.query(insertQuery, [
      id,
      ticketNumber,
      String(userId),
      userName,
      userEmail,
      category,
      item_type || "General",
      title,
      description,
      priority || "Medium",
    ]);

    const [[newTicket]] = await pool.query("SELECT * FROM internal_tickets WHERE id = ?", [id]);

    await logAudit({
      companyId: req.user?.companyId?._id || req.user?.companyId || null,
      actorId: String(userId),
      actorName: userName,
      actorRole: req.user?.role?.name || "Staff",
      module: "tickets",
      action: "ticket_created",
      targetId: id,
      targetName: `${ticketNumber} - ${title}`,
      details: { category, item_type, priority },
      ipAddress: req.ip
    });

    // Emit live WebSocket notification if available
    const io = req.app.get("io");
    if (io) {
      io.emit("ticketCreated", newTicket);
    }

    res.status(201).json({ message: "Ticket created successfully", ticket: newTicket });
  } catch (err) {
    console.error("Error creating ticket:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. UPDATE TICKET STATUS / RESOLUTION REMARKS (Admin action)
router.put("/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status, admin_remarks, assigned_to } = req.body;
    const { id } = req.params;

    if (!status) {
      return res.status(400).json({ error: "Status is required." });
    }

    const resolvedAt = status === "Resolved" || status === "Closed" ? new Date() : null;

    await pool.query(
      `UPDATE internal_tickets 
       SET status = ?, admin_remarks = COALESCE(?, admin_remarks), assigned_to = COALESCE(?, assigned_to), resolved_at = ?
       WHERE id = ?`,
      [status, admin_remarks || null, assigned_to || req.user?.name || null, resolvedAt, id]
    );

    const [[updatedTicket]] = await pool.query("SELECT * FROM internal_tickets WHERE id = ?", [id]);

    await logAudit({
      companyId: req.user?.companyId?._id || req.user?.companyId || null,
      actorId: req.user?.id || req.user?._id || "system",
      actorName: req.user?.name || "Admin",
      actorRole: req.user?.role?.name || "Admin",
      module: "tickets",
      action: "ticket_status_updated",
      targetId: id,
      targetName: updatedTicket?.ticket_number || id,
      details: { status, admin_remarks, assigned_to },
      ipAddress: req.ip
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("ticketUpdated", updatedTicket);
    }

    res.json({ message: "Ticket updated successfully", ticket: updatedTicket });
  } catch (err) {
    console.error("Error updating ticket status:", err);
    res.status(500).json({ error: err.message });
  }
});

// 5. DELETE TICKET (Admin action)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdminOrOwner(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can delete tickets." });
    }

    const { id } = req.params;
    const [[ticket]] = await pool.query("SELECT * FROM internal_tickets WHERE id = ?", [id]);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found." });
    }

    await pool.query("DELETE FROM internal_tickets WHERE id = ?", [id]);

    await logAudit({
      companyId: req.user?.companyId?._id || req.user?.companyId || null,
      actorId: req.user?.id || req.user?._id || "system",
      actorName: req.user?.name || "Admin",
      actorRole: req.user?.role?.name || "Admin",
      module: "tickets",
      action: "ticket_deleted",
      targetId: id,
      targetName: ticket.ticket_number || ticket.title,
      details: { title: ticket.title, category: ticket.category },
      ipAddress: req.ip
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("ticketDeleted", { id });
    }

    res.json({ message: "Ticket deleted successfully" });
  } catch (err) {
    console.error("Error deleting ticket:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
