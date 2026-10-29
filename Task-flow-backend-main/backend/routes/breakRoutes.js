const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool } = require("../config/mysqlDb");

const getISTNow = () => {
  const d = new Date();
  return new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

const getISTToday = () => {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
};

// Helper: Check if user is Super Admin or Company Owner/Admin
const isUserAdmin = (req) => {
  const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
  const userEmail = req.user?.email || "";
  const roleName = String(req.user?.role?.name || req.user?.role || "").toLowerCase().trim();
  const roleId = String(req.user?.role?.id || req.user?.role?._id || req.user?.role || "").toLowerCase().trim();
  const position = String(req.user?.position || "").toLowerCase().trim();
  return (
    userEmail.toLowerCase() === superEmail.toLowerCase() ||
    roleName.includes("admin") ||
    roleName.includes("owner") ||
    roleName.includes("manager") ||
    roleId === "role_owner" ||
    roleId === "role_superadmin" ||
    position.includes("manager") ||
    position.includes("owner") ||
    position.includes("admin")
  );
};

// 1. GET CURRENT BREAK STATUS (For the logged in employee or specific user)
router.get("/status", authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.query.userId || (req.user._id ? req.user._id.toString() : req.user.id);
    const filterDate = req.query.date || getISTToday();

    // Look for any active break (end_time is NULL)
    const [active] = await pool.query(
      "SELECT * FROM break_logs WHERE user_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1",
      [targetUserId]
    );

    // Look for today's completed breaks specifically (so cards know if already taken today)
    const today = getISTToday();
    const [todayCompleted] = await pool.query(
      "SELECT * FROM break_logs WHERE user_id = ? AND date = ?",
      [targetUserId, today]
    );

    // Get breaks for the selected date filter
    const [selectedBreaks] = await pool.query(
      "SELECT * FROM break_logs WHERE user_id = ? AND date = ? ORDER BY start_time DESC",
      [targetUserId, filterDate]
    );

    const totalMinutes = selectedBreaks.reduce((acc, b) => acc + (b.duration_minutes || 0), 0);

    res.json({
      isOnBreak: active.length > 0,
      activeBreak: active[0] || null,
      todayBreaks: selectedBreaks,
      todayCompletedBreaks: todayCompleted,
      totalBreakMinutes: totalMinutes,
      filterDate,
    });
  } catch (err) {
    console.error("Error in /breaks/status:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. START BREAK (Employee)
router.post("/start", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userName = req.user.name || "Employee";
    const userEmail = req.user.email || "";
    const companyId = req.user.companyId?._id?.toString() || req.user.companyId?.toString() || "";
    const today = getISTToday();
    const now = getISTNow();
    const reason = req.body.reason || "Tea / Lunch Break";

    // Verify user has clocked in today before taking a break
    const [att] = await pool.query(
      "SELECT * FROM attendance WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ? AND clock_in IS NOT NULL LIMIT 1",
      [userId, userEmail, today]
    );

    if (att.length === 0) {
      return res.status(400).json({ error: "You must Clock In before taking any break!" });
    }

    // Check if already on an ongoing break
    const [ongoing] = await pool.query(
      "SELECT * FROM break_logs WHERE user_id = ? AND end_time IS NULL LIMIT 1",
      [userId]
    );

    if (ongoing.length > 0) {
      return res.status(400).json({ error: "You are already on an active break!" });
    }

    // Check if this specific break (e.g. Lunch Break) has already been taken today
    const [alreadyTaken] = await pool.query(
      "SELECT * FROM break_logs WHERE user_id = ? AND date = ? AND reason = ? LIMIT 1",
      [userId, today, reason]
    );

    if (alreadyTaken.length > 0) {
      return res.status(400).json({ error: `You have already completed ${reason} for today!` });
    }

    const breakId = `brk_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    await pool.query(
      `INSERT INTO break_logs (id, user_id, user_name, user_email, company_id, date, start_time, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'On Break')`,
      [breakId, userId, userName, userEmail, companyId, today, now, reason]
    );

    // Also sync to attendance table if clock_in exists for today
    await pool.query(
      "UPDATE attendance SET break_start = ? WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ?",
      [now, userId, userEmail, today]
    );

    res.json({
      message: "Break started successfully",
      breakRecord: {
        id: breakId,
        user_id: userId,
        user_name: userName,
        date: today,
        start_time: now,
        reason,
        status: "On Break",
      },
    });
  } catch (err) {
    console.error("Error in /breaks/start:", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. END BREAK (Employee)
router.post("/end", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userEmail = req.user.email || "";
    const today = getISTToday();
    const now = getISTNow();

    // Find the active break
    const [active] = await pool.query(
      "SELECT * FROM break_logs WHERE user_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1",
      [userId]
    );

    if (!active.length) {
      return res.status(400).json({ error: "No active break found to end!" });
    }

    const breakItem = active[0];
    const startTime = new Date(breakItem.start_time);
    const durationMinutes = Math.max(1, Math.round((now - startTime) / 60000));

    await pool.query(
      `UPDATE break_logs 
       SET end_time = ?, duration_minutes = ?, status = 'Completed' 
       WHERE id = ?`,
      [now, durationMinutes, breakItem.id]
    );

    // Update attendance record's total_break_minutes and clear break_start
    const [attRows] = await pool.query(
      "SELECT * FROM attendance WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ?",
      [userId, userEmail, today]
    );

    if (attRows.length > 0) {
      const totalBreak = (attRows[0].total_break_minutes || 0) + durationMinutes;
      await pool.query(
        "UPDATE attendance SET break_start = NULL, break_end = ?, total_break_minutes = ? WHERE id = ?",
        [now, totalBreak, attRows[0].id]
      );
    }

    res.json({
      message: "Break ended successfully",
      durationMinutes,
      breakRecord: {
        ...breakItem,
        end_time: now,
        duration_minutes: durationMinutes,
        status: "Completed",
      },
    });
  } catch (err) {
    console.error("Error in /breaks/end:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. GET ALL BREAK RECORDS (Admin or Super Admin monitoring)
router.get("/all", authMiddleware, async (req, res) => {
  try {
    const { date, userId, status } = req.query;
    let query = `
      SELECT b.* 
      FROM break_logs b
      LEFT JOIN staff s ON b.user_id = s.id OR (b.user_email = s.email AND b.user_email != '')
      WHERE (s.status = 'Active' OR s.status IS NULL)
    `;
    const params = [];

    // Filter by company unless super admin
    const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
    const isSuper = req.user?.email === superEmail || req.user?.role?.name === "Super Admin";
    const companyId = req.user.companyId?._id?.toString() || req.user.companyId?.toString();

    if (!isSuper && companyId) {
      query += " AND b.company_id = ?";
      params.push(companyId);
    }

    if (date) {
      query += " AND b.date = ?";
      params.push(date);
    }

    if (userId) {
      query += " AND b.user_id = ?";
      params.push(userId);
    }

    if (status) {
      query += " AND b.status = ?";
      params.push(status);
    }

    query += " ORDER BY b.start_time DESC";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Error in /breaks/all:", err);
    res.status(500).json({ error: err.message });
  }
});

// 5. ADMIN FORCE END BREAK (Admin can end a forgotten break for an employee)
router.put("/:id/force-end", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can force end breaks." });
    }

    const { id } = req.params;
    const now = new Date();

    const [rows] = await pool.query("SELECT * FROM break_logs WHERE id = ?", [id]);
    if (!rows.length) {
      return res.status(404).json({ error: "Break record not found." });
    }

    const breakItem = rows[0];
    const startTime = new Date(breakItem.start_time);
    const durationMinutes = Math.max(1, Math.round((now - startTime) / 60000));

    await pool.query(
      `UPDATE break_logs 
       SET end_time = ?, duration_minutes = ?, status = 'Completed (Admin Closed)' 
       WHERE id = ?`,
      [now, durationMinutes, id]
    );

    // Also sync to attendance
    await pool.query(
      "UPDATE attendance SET break_start = NULL, break_end = ? WHERE user_id = ? AND date = ?",
      [now, breakItem.user_id, breakItem.date]
    );

    res.json({ message: "Break ended by admin successfully", durationMinutes });
  } catch (err) {
    console.error("Error in force-end:", err);
    res.status(500).json({ error: err.message });
  }
});

// 6. ADMIN / SUPER ADMIN: UPDATE BREAK LOG
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin or Super Admin can edit break logs." });
    }

    const { id } = req.params;
    let { reason, date, start_time, end_time, duration_minutes, status } = req.body;

    const [existing] = await pool.query("SELECT * FROM break_logs WHERE id = ?", [id]);
    if (!existing.length) {
      return res.status(404).json({ error: "Break record not found." });
    }

    const formatSqlDatetime = (val) => {
      if (!val) return null;
      if (typeof val === "string" && val.length === 19 && val.includes(" ")) return val;
      const d = new Date(val);
      if (isNaN(d.getTime())) return val;
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const formattedStart = start_time !== undefined ? (start_time ? formatSqlDatetime(start_time) : null) : existing[0].start_time;
    const formattedEnd = end_time !== undefined ? (end_time ? formatSqlDatetime(end_time) : null) : existing[0].end_time;
    const finalDate = date || (formattedStart ? String(formattedStart).slice(0, 10) : existing[0].date);

    let calcDuration = duration_minutes !== undefined ? parseInt(duration_minutes, 10) : existing[0].duration_minutes;
    if (formattedStart && formattedEnd && (duration_minutes === undefined || duration_minutes === null)) {
      const s = new Date(formattedStart);
      const e = new Date(formattedEnd);
      if (!isNaN(s.getTime()) && !isNaN(e.getTime()) && e >= s) {
        calcDuration = Math.round((e - s) / 60000);
      }
    }

    const finalStatus = status || existing[0].status;

    await pool.query(
      `UPDATE break_logs 
       SET reason = COALESCE(?, reason),
           date = COALESCE(?, date),
           start_time = COALESCE(?, start_time),
           end_time = COALESCE(?, end_time),
           duration_minutes = COALESCE(?, duration_minutes),
           status = COALESCE(?, status)
       WHERE id = ?`,
      [reason, finalDate, formattedStart, formattedEnd, calcDuration, finalStatus, id]
    );

    // Sync to attendance table total_break_minutes
    const targetUserId = existing[0].user_id;
    const [allBreaks] = await pool.query(
      "SELECT SUM(duration_minutes) as total FROM break_logs WHERE user_id = ? AND date = ? AND status != 'On Break'",
      [targetUserId, finalDate]
    );
    const newTotal = (allBreaks[0] && allBreaks[0].total) || 0;
    await pool.query(
      "UPDATE attendance SET total_break_minutes = ? WHERE (user_id = ? OR user_email = ?) AND date = ?",
      [newTotal, targetUserId, existing[0].user_email || "", finalDate]
    );

    res.json({ message: "Break log updated successfully" });
  } catch (err) {
    console.error("Error updating break log:", err);
    res.status(500).json({ error: err.message });
  }
});

// 6.5 ADMIN / SUPER ADMIN: DELETE BREAK LOG
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin or Super Admin can delete break logs." });
    }

    const { id } = req.params;
    const [existing] = await pool.query("SELECT * FROM break_logs WHERE id = ?", [id]);
    if (!existing.length) {
      return res.status(404).json({ error: "Break record not found." });
    }

    // If deleting an active break, clear break_start on attendance
    if (existing[0].status === "On Break" || !existing[0].end_time) {
      await pool.query(
        "UPDATE attendance SET break_start = NULL WHERE user_id = ? AND date = ?",
        [existing[0].user_id, existing[0].date]
      );
    }

    await pool.query("DELETE FROM break_logs WHERE id = ?", [id]);
    res.json({ message: "Break log deleted successfully" });
  } catch (err) {
    console.error("Error deleting break log:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7. GET ALL CONFIGURED BREAK TYPES (For employee selection and admin management)
router.get("/types", authMiddleware, async (req, res) => {
  try {
    const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
    const isSuper = req.user?.email === superEmail || req.user?.role?.name === "Super Admin";
    const companyId = req.user.companyId?._id?.toString() || req.user.companyId?.toString();

    let query = "SELECT * FROM break_types WHERE status = 'Active'";
    const params = [];

    if (!isSuper && companyId) {
      query += " AND (company_id IS NULL OR company_id = ?)";
      params.push(companyId);
    }

    query += " ORDER BY duration_minutes ASC";
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching break types:", err);
    res.status(500).json({ error: err.message });
  }
});

// 8. CREATE BREAK TYPE (Admin only)
router.post("/types", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can configure break types." });
    }

    const { name, duration_minutes, window_start, window_end } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Plese enter break name" });
    }
    const mins = parseInt(duration_minutes);
    if (isNaN(mins) || mins <= 0) {
      return res.status(400).json({ error: "Plese enter duration" });
    }
    // B40: Enforce maximum break limit (180 mins)
    if (mins > 180) {
      return res.status(400).json({ error: "Break duration cannot exceed 180 minutes (3 hours)" });
    }

    let companyId = req.user.companyId?._id?.toString() || req.user.companyId?.toString() || null;
    const id = `brk_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    await pool.query(
      `INSERT INTO break_types (id, name, duration_minutes, window_start, window_end, company_id, status)
       VALUES (?, ?, ?, ?, ?, ?, 'Active')`,
      [id, name.trim(), mins, window_start || "00:00", window_end || "23:59", companyId]
    );

    res.status(201).json({ message: "Break type created successfully", id });
  } catch (err) {
    console.error("Error creating break type:", err);
    res.status(500).json({ error: err.sqlMessage || err.message || "Failed to create break type" });
  }
});

// 9. UPDATE BREAK TYPE (Admin only)
router.put("/types/:id", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can update break types." });
    }

    const { name, duration_minutes, window_start, window_end, status } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: "Plese enter break name" });
    }
    let mins = undefined;
    if (duration_minutes !== undefined) {
      mins = parseInt(duration_minutes);
      if (isNaN(mins) || mins <= 0) {
        return res.status(400).json({ error: "Plese enter duration" });
      }
      if (mins > 180) {
        return res.status(400).json({ error: "Break duration cannot exceed 180 minutes (3 hours)" });
      }
    }

    await pool.query(
      `UPDATE break_types 
       SET name = COALESCE(?, name),
           duration_minutes = COALESCE(?, duration_minutes),
           window_start = COALESCE(?, window_start),
           window_end = COALESCE(?, window_end),
           status = COALESCE(?, status)
       WHERE id = ?`,
      [name ? name.trim() : null, mins, window_start, window_end, status, req.params.id]
    );

    res.json({ message: "Break type updated successfully" });
  } catch (err) {
    console.error("Error updating break type:", err);
    res.status(500).json({ error: err.message });
  }
});

// 10. DELETE BREAK TYPE (Admin only)
router.delete("/types/:id", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can delete break types." });
    }

    await pool.query("DELETE FROM break_types WHERE id = ?", [req.params.id]);
    res.json({ message: "Break type removed successfully" });
  } catch (err) {
    console.error("Error deleting break type:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
