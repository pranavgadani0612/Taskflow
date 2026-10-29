const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool } = require("../config/mysqlDb");

// ─── 1. LOG / SUBMIT TIMESHEET ──────────────────────────────────────────────
router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      project_id,
      project_name,
      task_id,
      task_title,
      subtask_id,
      subtask_title,
      date,
      hours,
      description,
      task_status,
      is_billable
    } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: "Plese enter project" });
    }
    if (!date) {
      return res.status(400).json({ error: "Plese enter date" });
    }
    if (!hours) {
      return res.status(400).json({ error: "Plese enter hours" });
    }
    const numHours = parseFloat(hours);
    if (isNaN(numHours) || numHours <= 0 || numHours > 24) {
      return res.status(400).json({ error: "Hours must be a positive number up to 24" });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: "Plese enter description" });
    }

    const id = `ts_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const userId = req.user._id.toString();
    const userName = req.user.name || "Employee";
    const userEmail = req.user.email || "";
    const cleanTaskStatus = ["Pending", "In Process", "Complete"].includes(task_status) ? task_status : "In Process";

    await pool.query(
      `INSERT INTO timesheets 
       (id, user_id, user_name, user_email, project_id, project_name, task_id, task_title, subtask_id, subtask_title, date, hours, description, is_billable, task_status, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Submitted')`,
      [
        id,
        userId,
        userName,
        userEmail,
        project_id,
        project_name || "General",
        task_id || null,
        task_title || "",
        subtask_id || null,
        subtask_title || "",
        date,
        numHours,
        description,
        is_billable !== undefined ? (is_billable ? 1 : 0) : 1,
        cleanTaskStatus
      ]
    );

    // Sync subtask status to MySQL subtasks table if applicable
    if (task_id && subtask_id && cleanTaskStatus) {
      try {
        await pool.query(
          "UPDATE subtasks SET status = ? WHERE id = ? AND task_id = ?",
          [cleanTaskStatus, subtask_id, task_id]
        );
      } catch (e) {
        console.error("Subtask status sync error:", e);
      }
    }

    res.status(201).json({
      message: "Timesheet logged successfully!",
      id,
      hours: numHours,
      date
    });
  } catch (err) {
    console.error("Timesheet create error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. GET CURRENT USER'S TIMESHEETS ───────────────────────────────────────
router.get("/my-timesheets", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { startDate, endDate, date } = req.query;

    let query = `SELECT * FROM timesheets WHERE user_id = ?`;
    const params = [userId];

    if (date) {
      query += ` AND date = ?`;
      params.push(date);
    } else if (startDate && endDate) {
      query += ` AND date BETWEEN ? AND ?`;
      params.push(startDate, endDate);
    }

    query += ` ORDER BY date DESC, created_at DESC`;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 2.1 SUBMIT DAY FOR APPROVAL ───────────────────────────────────────────
router.post("/submit-day", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { date } = req.body;
    if (!date) return res.status(400).json({ error: "Date is required" });

    await pool.query(
      `UPDATE timesheets SET status = 'Submitted' WHERE user_id = ? AND date = ? AND status != 'Approved'`,
      [userId, date]
    );

    res.json({ message: "Daily timesheet submitted for Admin approval!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. GET ALL TIMESHEETS (ADMIN / MANAGER) ────────────────────────────────
router.get("/all", authMiddleware, async (req, res) => {
  try {
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    if (!isSuperAdmin && !isManager) {
      return res.status(403).json({ error: "Access denied. Only managers/admins can review all timesheets." });
    }

    const { projectId, status, userId, date } = req.query;
    let query = `
      SELECT t.* 
      FROM timesheets t
      LEFT JOIN staff s ON t.user_id = s.id OR (t.user_email = s.email AND t.user_email != '')
      WHERE (s.status = 'Active' OR s.status IS NULL)
    `;
    const params = [];

    if (projectId) {
      query += ` AND t.project_id = ?`;
      params.push(projectId);
    }
    if (status) {
      query += ` AND t.status = ?`;
      params.push(status);
    }
    if (userId) {
      query += ` AND t.user_id = ?`;
      params.push(userId);
    }
    if (date) {
      query += ` AND t.date = ?`;
      params.push(date);
    }

    query += ` ORDER BY t.date DESC, t.created_at DESC LIMIT 200`;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. SUMMARY STATS (PROJECT-WISE & TOTAL HOURS) ───────────────────────────
router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    // Project-wise total hours
    let projQuery = `
      SELECT project_name, SUM(hours) as total_hours, COUNT(*) as log_count
      FROM timesheets
    `;
    let userFilter = [];
    if (!isSuperAdmin && !isManager) {
      projQuery += ` WHERE user_id = ?`;
      userFilter.push(userId);
    }
    projQuery += ` GROUP BY project_name ORDER BY total_hours DESC`;

    const [projectSummary] = await pool.query(projQuery, userFilter);

    // Today's total logged hours for this user
    const today = new Date().toISOString().slice(0, 10);
    const [todayRows] = await pool.query(
      `SELECT COALESCE(SUM(hours), 0) as today_hours FROM timesheets WHERE user_id = ? AND date = ?`,
      [userId, today]
    );

    // This week total logged hours for this user
    const [weekRows] = await pool.query(
      `SELECT COALESCE(SUM(hours), 0) as week_hours FROM timesheets WHERE user_id = ? AND YEARWEEK(date, 1) = YEARWEEK(CURDATE(), 1)`,
      [userId]
    );

    res.json({
      projectSummary,
      todayHours: parseFloat(todayRows[0]?.today_hours || 0),
      weekHours: parseFloat(weekRows[0]?.week_hours || 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 5. APPROVE / REJECT TIMESHEET (ADMIN / MANAGER) ────────────────────────
router.patch("/:id/action", authMiddleware, async (req, res) => {
  try {
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    if (!isSuperAdmin && !isManager) {
      return res.status(403).json({ error: "Only admins and managers can approve/reject timesheets" });
    }

    const { action, reason } = req.body; // action: 'Approved' | 'Rejected'
    if (!["Approved", "Rejected"].includes(action)) {
      return res.status(400).json({ error: "Action must be 'Approved' or 'Rejected'" });
    }

    const approverName = req.user.name || "Manager";

    await pool.query(
      `UPDATE timesheets 
       SET status = ?, approved_by = ?, rejection_reason = ?
       WHERE id = ?`,
      [action, approverName, reason || null, req.params.id]
    );

    res.json({ message: `Timesheet entry ${action} successfully!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 6. UPDATE / EDIT TIMESHEET ─────────────────────────────────────────────
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = (req.user._id || req.user.id).toString();
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    const { project_id, project_name, task_id, task_title, subtask_id, subtask_title, date, hours, description, is_billable, task_status } = req.body;

    const [existing] = await pool.query(`SELECT * FROM timesheets WHERE id = ?`, [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: "Timesheet entry not found" });
    }

    if (existing[0].status === "Approved" && !isSuperAdmin) {
      return res.status(400).json({ error: "Cannot edit an approved timesheet" });
    }

    // Ensure staff can only edit their own timesheet
    if (!isSuperAdmin && !isManager && existing[0].user_id !== userId && existing[0].user_email !== req.user.email) {
      return res.status(403).json({ error: "You can only edit your own timesheet" });
    }

    const cleanTaskStatus = ["Pending", "In Process", "Complete"].includes(task_status) ? task_status : (existing[0].task_status || "In Process");

    await pool.query(
      `UPDATE timesheets 
       SET project_id = ?, project_name = ?, task_id = ?, task_title = ?, subtask_id = ?, subtask_title = ?, date = ?, hours = ?, description = ?, is_billable = ?, task_status = ?, status = 'Submitted'
       WHERE id = ?`,
      [
        project_id,
        project_name,
        task_id || null,
        task_title || "",
        subtask_id || null,
        subtask_title || "",
        date,
        parseFloat(hours),
        description,
        is_billable ? 1 : 0,
        cleanTaskStatus,
        req.params.id
      ]
    );

    // Sync subtask status to MySQL subtasks table if applicable
    if (task_id && subtask_id && cleanTaskStatus) {
      try {
        await pool.query(
          "UPDATE subtasks SET status = ? WHERE id = ? AND task_id = ?",
          [cleanTaskStatus, subtask_id, task_id]
        );
      } catch (e) {
        console.error("Subtask status sync error:", e);
      }
    }

    res.json({ message: "Timesheet updated successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 7. DELETE TIMESHEET ────────────────────────────────────────────────────
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";

    if (isSuperAdmin) {
      await pool.query(`DELETE FROM timesheets WHERE id = ?`, [req.params.id]);
    } else {
      await pool.query(`DELETE FROM timesheets WHERE id = ? AND user_id = ? AND status != 'Approved'`, [req.params.id, userId]);
    }

    res.json({ message: "Timesheet entry deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
