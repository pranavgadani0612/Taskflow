const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { checkPermission } = require("../middleware/permissions");
const { pool } = require("../config/mysqlDb");
const { sendLeaveDecisionMail } = require("../config/mail");

// Helper: Super Admin or Company Owner check (Only Super Admin can approve/view all leaves)
const isSuperAdminOrManager = (req) => {
  return (
    req.user?.email === "gadanipranav@gmail.com" || 
    req.user?.role?.name === "Super Admin" || 
    req.user?.role === "Super Admin" || 
    req.user?.role?.name === "Company Owner"
  );
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const timeToMins = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
};

// Helper: short leave must be on a working day, not on a full-day leave, and not overlap another short leave
const validateShortLeaveDay = async ({ userId, userEmail, date, startMins, endMins, excludeId }) => {
  const workingDates = await getWorkingLeaveDates(date, date);
  if (workingDates.length === 0) {
    return "Selected date is a company holiday / weekly off. No short leave is required.";
  }

  const [fullLeave] = await pool.query(
    `SELECT leave_type, status FROM leave_requests
     WHERE (user_id = ? OR (user_email = ? AND user_email != ''))
       AND status IN ('Pending', 'Approved')
       AND COALESCE(day_type, 'Full Day') = 'Full Day'
       AND ? BETWEEN from_date AND to_date
     LIMIT 1`,
    [userId, userEmail || "", date]
  );
  if (fullLeave.length > 0) {
    return `You already have a ${fullLeave[0].status.toLowerCase()} full-day ${fullLeave[0].leave_type} on this date.`;
  }

  const [sameDay] = await pool.query(
    `SELECT id, from_time, to_time, status FROM short_leaves
     WHERE user_id = ? AND date = ? AND status IN ('Pending', 'Approved') AND id != ?`,
    [userId, date, excludeId || ""]
  );
  const clash = sameDay.find((s) => startMins < timeToMins(s.to_time) && endMins > timeToMins(s.from_time));
  if (clash) {
    return `You already have a ${clash.status.toLowerCase()} short leave from ${String(clash.from_time).slice(0, 5)} to ${String(clash.to_time).slice(0, 5)} on this date.`;
  }
  return null;
};

// Helper: Super Admin configured max short leave duration (minutes, default 2 hours)
const getMaxShortLeaveMinutes = async () => {
  const [rows] = await pool.query("SELECT max_short_leave_minutes, max_short_leaves_per_month FROM company_leave_settings WHERE id = 'default_policy' LIMIT 1");
  const val = Number(rows[0]?.max_short_leave_minutes);
  return val > 0 ? val : 120;
};

const getMaxShortLeavesPerMonth = async () => {
  const [rows] = await pool.query("SELECT max_short_leaves_per_month FROM company_leave_settings WHERE id = 'default_policy' LIMIT 1");
  const val = Number(rows[0]?.max_short_leaves_per_month);
  return val > 0 ? val : 2; // Default 2 short leaves per month
};

// 90 -> "1 hr 30 min", 120 -> "2 hrs"
const formatShortLeaveLimit = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hPart = h > 0 ? `${h} ${h === 1 ? "hr" : "hrs"}` : "";
  const mPart = m > 0 ? `${m} min` : "";
  return [hPart, mPart].filter(Boolean).join(" ");
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Real calendar date check (DATE_RE alone lets 2026-13-45 through)
const isRealDate = (str) => {
  const d = new Date(`${str}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === str;
};
const LEAVE_TYPES = ["Casual Leave", "Sick Leave", "Privilege Leave", "Comp-Off", "Unpaid Leave"];

const BALANCE_COLUMN = {
  "Casual Leave": "cl_balance",
  "Sick Leave": "sl_balance",
  "Privilege Leave": "pl_balance",
  "Comp-Off": "comp_off"
};

// Helper: is this date a working day as per Weekday Work Shifts (incl. Saturday rule)?
const isWorkingDayBySchedule = (dateObj, sched) => {
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Sun, 6 = Sat
  if (sched && sched.is_working_day === 0) return false;
  if (!sched && dayOfWeek === 0) return false;
  if (dayOfWeek === 6) {
    const rule = sched?.saturday_rule || "2nd_4th_off";
    if (rule === "all_off") return false;
    if (rule === "all_working") return true;
    const satIndex = Math.ceil(dateObj.getUTCDate() / 7);
    return satIndex !== 2 && satIndex !== 4; // 2nd & 4th Saturday off
  }
  return true;
};

// Helper: working dates (YYYY-MM-DD) between from/to - skips weekly offs, holiday Saturdays and company holidays
const getWorkingLeaveDates = async (fromDate, toDate) => {
  const [schedRows] = await pool.query("SELECT * FROM work_schedules");
  const schedMap = {};
  schedRows.forEach((s) => { schedMap[s.day_of_week] = s; });
  const [holidayRows] = await pool.query("SELECT holiday_date FROM company_holidays");
  const holidaySet = new Set(holidayRows.map((h) => String(h.holiday_date).slice(0, 10)));

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dates = [];
  const end = new Date(`${String(toDate).slice(0, 10)}T00:00:00Z`);
  for (let d = new Date(`${String(fromDate).slice(0, 10)}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    if (holidaySet.has(dateStr)) continue;
    if (isWorkingDayBySchedule(d, schedMap[dayNames[d.getUTCDay()]])) dates.push(dateStr);
  }
  return dates;
};

const getLeaveWeekdays = (leave) => getWorkingLeaveDates(leave.from_date, leave.to_date);

// Helper: validate leave dates -> { totalDays, dates } or { error }
// Rejects ranges with no working day and days the employee already clocked in
const validateLeaveDates = async ({ userId, userEmail, from_date, to_date, day_type }) => {
  const dates = await getWorkingLeaveDates(from_date, to_date);
  if (dates.length === 0) {
    return { error: "Selected date(s) are company holidays / weekly off. No leave is required for these days." };
  }

  const [worked] = await pool.query(
    `SELECT date FROM attendance
     WHERE (user_id = ? OR (user_email = ? AND user_email != ''))
       AND date IN (?)
       AND clock_in IS NOT NULL
       AND status != 'On Leave'
     ORDER BY date`,
    [userId, userEmail || "", dates]
  );
  if (worked.length > 0) {
    const list = worked
      .map((w) => new Date(`${String(w.date).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB"))
      .join(", ");
    return { error: `You have already clocked in on ${list}. Leave cannot be applied for a day you worked.` };
  }

  let totalDays = dates.length;
  if (day_type === "Half Day" || day_type === "First Half" || day_type === "Second Half") {
    totalDays = totalDays * 0.5;
  }
  return { totalDays, dates };
};

// Helper: DECIMAL balance columns come back as strings ("11.5") -> numbers
const numericBalance = (b) => b && ({
  ...b,
  cl_balance: Number(b.cl_balance),
  sl_balance: Number(b.sl_balance),
  pl_balance: Number(b.pl_balance),
  comp_off: Number(b.comp_off)
});

// Helper: side-effects of an approved leave -> deduct balance + mark attendance 'On Leave'
const applyApprovedLeave = async (leave) => {
  const col = BALANCE_COLUMN[leave.leave_type];
  const leaveYear = leave.from_date ? new Date(leave.from_date).getFullYear() : new Date().getFullYear();
  if (col) {
    // Ensure the employee has a balance record for that year
    const [policyRows] = await pool.query("SELECT * FROM company_leave_settings WHERE id = 'default_policy' LIMIT 1");
    const policy = policyRows[0] || { cl_default: 12, sl_default: 8, pl_default: 15, comp_off_default: 2 };
    await pool.query(
      `INSERT INTO leave_balances (id, user_id, user_name, user_email, cl_balance, sl_balance, pl_balance, comp_off, year)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE user_name = VALUES(user_name), user_email = VALUES(user_email)`,
      [`bal_${leave.user_id}_${leaveYear}`, leave.user_id, leave.user_name, leave.user_email || '', policy.cl_default, policy.sl_default, policy.pl_default, policy.comp_off_default, leaveYear]
    );

    await pool.query(
      `UPDATE leave_balances 
       SET ${col} = ${col} - ? 
       WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND year = ?`, 
      [parseFloat(leave.total_days), leave.user_id, leave.user_email || '', leaveYear]
    );
  }
  for (const dateStr of await getLeaveWeekdays(leave)) {
    const attId = `att_leave_${leave.user_id}_${dateStr}`;
    await pool.query(
      `INSERT INTO attendance (id, user_id, user_name, user_email, date, status, notes)
       VALUES (?, ?, ?, ?, ?, 'On Leave', ?)
       ON DUPLICATE KEY UPDATE status = 'On Leave', notes = VALUES(notes)`,
      [attId, leave.user_id, leave.user_name, leave.user_email, dateStr, `Approved ${leave.leave_type}`]
    );
  }
};

// Helper: undo an approved leave (used when Super Admin edits/deletes it) -> refund balance + clear 'On Leave'
const revertApprovedLeave = async (leave) => {
  const col = BALANCE_COLUMN[leave.leave_type];
  const leaveYear = leave.from_date ? new Date(leave.from_date).getFullYear() : new Date().getFullYear();
  if (col) {
    await pool.query(
      `UPDATE leave_balances 
       SET ${col} = ${col} + ? 
       WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND year = ?`, 
      [parseFloat(leave.total_days), leave.user_id, leave.user_email || '', leaveYear]
    );
  }
  for (const dateStr of await getLeaveWeekdays(leave)) {
    // Days the employee never clocked in are removed; days they worked become Present
    await pool.query("DELETE FROM attendance WHERE user_id = ? AND date = ? AND status = 'On Leave' AND clock_in IS NULL", [leave.user_id, dateStr]);
    await pool.query("UPDATE attendance SET status = 'Present' WHERE user_id = ? AND date = ? AND status = 'On Leave'", [leave.user_id, dateStr]);
  }
};

// 0. ADMIN LEAVE OVERVIEW / STATS
router.get("/admin-summary", authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdminOrManager(req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const today = new Date().toISOString().slice(0, 10);

    // 1. Pending Approvals (both full leaves and short leaves)
    const [[pendingRes]] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM leave_requests lr
      LEFT JOIN staff s ON lr.user_id = s.id OR (lr.user_email = s.email AND lr.user_email != '')
      WHERE lr.status = 'Pending' AND (s.status = 'Active' OR s.status IS NULL)
    `);
    const [[pendingShortRes]] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM short_leaves sl
      LEFT JOIN staff s ON sl.user_id = s.id OR (sl.user_email = s.email AND sl.user_email != '')
      WHERE sl.status = 'Pending' AND (s.status = 'Active' OR s.status IS NULL)
    `);
    // 2. Approved this month
    const [[approvedRes]] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM leave_requests lr
      LEFT JOIN staff s ON lr.user_id = s.id OR (lr.user_email = s.email AND lr.user_email != '')
      WHERE lr.status = 'Approved' 
        AND MONTH(lr.from_date) = MONTH(CURRENT_DATE()) 
        AND YEAR(lr.from_date) = YEAR(CURRENT_DATE())
        AND (s.status = 'Active' OR s.status IS NULL)
    `);
    // 3. Rejected
    const [[rejectedRes]] = await pool.query(`
      SELECT COUNT(*) AS count 
      FROM leave_requests lr
      LEFT JOIN staff s ON lr.user_id = s.id OR (lr.user_email = s.email AND lr.user_email != '')
      WHERE lr.status = 'Rejected' AND (s.status = 'Active' OR s.status IS NULL)
    `);
    // 4. Employees currently on leave today
    const [[onLeaveTodayRes]] = await pool.query(
      `SELECT COUNT(DISTINCT lr.user_id) AS count 
       FROM leave_requests lr
       LEFT JOIN staff s ON lr.user_id = s.id OR (lr.user_email = s.email AND lr.user_email != '')
       WHERE lr.status = 'Approved' 
         AND (? BETWEEN DATE(lr.from_date) AND DATE(lr.to_date))
         AND (s.status = 'Active' OR s.status IS NULL)`,
      [today]
    );

    res.json({
      pendingCount: (pendingRes?.count || 0) + (pendingShortRes?.count || 0),
      approvedThisMonth: approvedRes?.count || 0,
      rejectedCount: rejectedRes?.count || 0,
      onLeaveToday: onLeaveTodayRes?.count || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 0.1 SUPER ADMIN & MANAGERS: GET ALL EMPLOYEE LEAVE BALANCES
router.get("/admin/balances", authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdminOrManager(req)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const targetYear = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear();

    // Auto-initialize any active staff that don't have a balance record for this targetYear
    const [policyRows] = await pool.query("SELECT * FROM company_leave_settings WHERE id = 'default_policy' LIMIT 1");
    const policy = policyRows[0] || { cl_default: 12, sl_default: 8, pl_default: 15, comp_off_default: 2 };

    const [activeStaff] = await pool.query("SELECT id, name, email FROM staff WHERE status = 'Active'");
    for (const staff of activeStaff) {
      await pool.query(
        `INSERT INTO leave_balances (id, user_id, user_name, user_email, cl_balance, sl_balance, pl_balance, comp_off, year)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE user_name = VALUES(user_name), user_email = VALUES(user_email)`,
        [`bal_${staff.id}_${targetYear}`, staff.id, staff.name, staff.email || '', policy.cl_default, policy.sl_default, policy.pl_default, policy.comp_off_default, targetYear]
      );
    }

    const [rows] = await pool.query(
      `SELECT b.* 
       FROM leave_balances b
       INNER JOIN staff s ON b.user_id = s.id
       WHERE s.status = 'Active' AND b.year = ?
       ORDER BY b.user_name ASC`,
      [targetYear]
    );
    res.json(rows.map(numericBalance));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 0.2 SUPER ADMIN & MANAGERS: UPDATE ANY EMPLOYEE LEAVE BALANCE DYNAMICALLY
router.put("/admin/balances/:id", authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdminOrManager(req)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const { cl_balance, sl_balance, pl_balance, comp_off } = req.body;
    const [existing] = await pool.query("SELECT * FROM leave_balances WHERE id = ?", [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ error: "Leave balance record not found" });
    }

    for (const [key, val] of Object.entries({ cl_balance, sl_balance, pl_balance, comp_off })) {
      if (val === undefined || val === null) continue; // not sent -> keep current value
      const num = Number(val);
      // An unchanged value is allowed (balance can already be negative after a forced approval)
      const unchanged = Number.isFinite(num) && num === Number(existing[0][key]);
      if (val === "" || !Number.isFinite(num) || (num < 0 && !unchanged)) {
        return res.status(400).json({ error: "Please enter a valid non-negative number", field: key });
      }
    }

    await pool.query(
      `UPDATE leave_balances 
       SET cl_balance = COALESCE(?, cl_balance),
           sl_balance = COALESCE(?, sl_balance),
           pl_balance = COALESCE(?, pl_balance),
           comp_off = COALESCE(?, comp_off)
       WHERE id = ?`,
      [cl_balance, sl_balance, pl_balance, comp_off, req.params.id]
    );
    res.json({ message: "Employee leave balance updated successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 0.3 GET COMPANY-WIDE LEAVE POLICY
router.get("/company-policy", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM company_leave_settings WHERE id = 'default_policy' LIMIT 1");
    if (rows.length === 0) {
      return res.json({ cl_default: 12, sl_default: 8, pl_default: 15, comp_off_default: 2, max_cl_per_month: 1, max_pl_per_month: 5 });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 0.4 UPDATE COMPANY-WIDE LEAVE POLICY (Option 1)
router.put("/company-policy", authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdminOrManager(req)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const { applyToExisting } = req.body;

    // 0 is a valid default; only missing/blank values fall back. Non-numeric or negative -> 400
    const policyValues = {};
    const fallbacks = { cl_default: 12, sl_default: 8, pl_default: 15, comp_off_default: 0, max_cl_per_month: 1, max_pl_per_month: 5 };
    for (const [key, fallback] of Object.entries(fallbacks)) {
      const raw = req.body[key];
      const isMax = key.startsWith("max_");
      if (raw === undefined || (!isMax && (raw === null || raw === ""))) {
        policyValues[key] = fallback;
        continue;
      }
      const num = Number(raw);
      if (!Number.isFinite(num) || num < 0) {
        return res.status(400).json({ error: "Please enter a valid non-negative number", field: key });
      }
      policyValues[key] = num;
    }

    await pool.query(
      `INSERT INTO company_leave_settings (id, cl_default, sl_default, pl_default, comp_off_default, max_cl_per_month, max_pl_per_month)
       VALUES ('default_policy', ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         cl_default = VALUES(cl_default),
         sl_default = VALUES(sl_default),
         pl_default = VALUES(pl_default),
         comp_off_default = VALUES(comp_off_default),
         max_cl_per_month = VALUES(max_cl_per_month),
         max_pl_per_month = VALUES(max_pl_per_month)`,
      [
        policyValues.cl_default,
        policyValues.sl_default,
        policyValues.pl_default,
        policyValues.comp_off_default,
        policyValues.max_cl_per_month,
        policyValues.max_pl_per_month
      ]
    );

    // If super admin wants this policy to apply to all current employees
    if (applyToExisting) {
      const targetYear = req.body.year ? parseInt(req.body.year, 10) : new Date().getFullYear();
      await pool.query(
        `UPDATE leave_balances 
         SET cl_balance = ?, sl_balance = ?, pl_balance = ?, comp_off = ?
         WHERE year = ?`,
        [policyValues.cl_default, policyValues.sl_default, policyValues.pl_default, policyValues.comp_off_default, targetYear]
      );
    }

    res.json({ message: "Company-Wide Leave Policy updated successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 0.5 SHORT LEAVE SETTINGS (max hours per short leave - set by Super Admin)
router.get("/short-leave-settings", authMiddleware, async (req, res) => {
  try {
    const maxMinutes = await getMaxShortLeaveMinutes();
    const maxPerMonth = await getMaxShortLeavesPerMonth();
    res.json({
      max_short_leave_minutes: maxMinutes,
      max_short_leave_hours: maxMinutes / 60,
      max_short_leaves_per_month: maxPerMonth
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/short-leave-settings", authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdminOrManager(req)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const hours = parseFloat(req.body.max_short_leave_hours);
    const maxPerMonth = req.body.max_short_leaves_per_month !== undefined ? parseInt(req.body.max_short_leaves_per_month) : null;

    if (isNaN(hours) || hours <= 0 || hours > 12) {
      return res.status(400).json({ error: "Plese enter valid hours (between 0.5 and 12)", field: "max_short_leave_hours" });
    }
    if (maxPerMonth !== null && (isNaN(maxPerMonth) || maxPerMonth < 1 || maxPerMonth > 31)) {
      return res.status(400).json({ error: "Please enter a valid monthly short leave count (between 1 and 31)", field: "max_short_leaves_per_month" });
    }

    const minutes = Math.round(hours * 60);
    const countLimit = maxPerMonth !== null ? maxPerMonth : 2;

    await pool.query(
      `INSERT INTO company_leave_settings (id, max_short_leave_minutes, max_short_leaves_per_month) 
       VALUES ('default_policy', ?, ?)
       ON DUPLICATE KEY UPDATE 
         max_short_leave_minutes = VALUES(max_short_leave_minutes),
         max_short_leaves_per_month = VALUES(max_short_leaves_per_month)`,
      [minutes, countLimit]
    );

    res.json({
      message: `Short leave settings updated: ${formatShortLeaveLimit(minutes)} per short leave, max ${countLimit} per month.`,
      max_short_leave_minutes: minutes,
      max_short_leave_hours: minutes / 60,
      max_short_leaves_per_month: countLimit
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1. GET USER LEAVE BALANCE
router.get("/balance", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userName = req.user.name || "Employee";
    const userEmail = req.user.email || "";

    const targetYear = req.query.year ? parseInt(req.query.year, 10) : new Date().getFullYear();
    // Query balance by (user_id OR user_email) AND year
    let [rows] = await pool.query(
      "SELECT * FROM leave_balances WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND year = ? LIMIT 1",
      [userId, userEmail, targetYear]
    );

    // If no balance record exists yet, initialize using Company-Wide Policy defaults
    if (rows.length === 0) {
      const [policyRows] = await pool.query("SELECT * FROM company_leave_settings WHERE id = 'default_policy' LIMIT 1");
      const policy = policyRows[0] || { cl_default: 12, sl_default: 8, pl_default: 15, comp_off_default: 2 };

      const id = `bal_${userId}_${targetYear}`;
      await pool.query(
        "INSERT INTO leave_balances (id, user_id, user_name, user_email, cl_balance, sl_balance, pl_balance, comp_off, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_name = VALUES(user_name)",
        [id, userId, userName, userEmail, policy.cl_default, policy.sl_default, policy.pl_default, policy.comp_off_default, targetYear]
      );
      [rows] = await pool.query("SELECT * FROM leave_balances WHERE id = ?", [id]);
    } else if (rows[0].user_id !== userId && userEmail) {
      // Sync user_id if matched via email
      await pool.query("UPDATE leave_balances SET user_id = ? WHERE id = ?", [userId, rows[0].id]);
    }

    res.json(numericBalance(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET MY LEAVE REQUESTS
router.get("/my-leaves", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userEmail = req.user.email || "";
    const [rows] = await pool.query(
      "SELECT * FROM leave_requests WHERE user_id = ? OR (user_email = ? AND user_email != '') ORDER BY created_at DESC",
      [userId, userEmail]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. APPLY FOR LEAVE
router.post("/apply", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userName = req.user.name || "Employee";
    const userEmail = req.user.email || "";
    const { leave_type, from_date, to_date, day_type, reason } = req.body;
    if (!from_date) {
      return res.status(400).json({ error: "Plese enter from date", field: "from_date" });
    }
    if (!to_date) {
      return res.status(400).json({ error: "Plese enter to date", field: "to_date" });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Plese enter reason", field: "reason" });
    }
    if (!LEAVE_TYPES.includes(leave_type)) {
      return res.status(400).json({ error: "Plese select leave type", field: "leave_type" });
    }
    if (!DATE_RE.test(from_date) || !DATE_RE.test(to_date)) {
      return res.status(400).json({ error: "Invalid date format." });
    }
    if (!isRealDate(from_date)) {
      return res.status(400).json({ error: "Please enter a valid date", field: "from_date" });
    }
    if (!isRealDate(to_date)) {
      return res.status(400).json({ error: "Please enter a valid date", field: "to_date" });
    }

    const start = new Date(from_date);
    const end = new Date(to_date);

    if (end < start) {
      return res.status(400).json({ error: "'To Date' cannot be earlier than 'From Date'!" });
    }

    // Working days as per company schedule (weekly off, 2nd/4th Saturday, holidays) + no leave on worked days
    const dateCheck = await validateLeaveDates({ userId, userEmail, from_date, to_date, day_type });
    if (dateCheck.error) {
      return res.status(400).json({ error: dateCheck.error });
    }
    const totalDays = dateCheck.totalDays;

    // Check for Overlapping Leaves (Pending or Approved)
    const [overlapRows] = await pool.query(
      `SELECT * FROM leave_requests 
       WHERE user_id = ? 
       AND status IN ('Pending', 'Approved')
       AND NOT (to_date < ? OR from_date > ?)
       LIMIT 1`,
      [userId, from_date, to_date]
    );

    if (overlapRows.length > 0) {
      const existing = overlapRows[0];
      const exFrom = new Date(existing.from_date).toLocaleDateString();
      const exTo = new Date(existing.to_date).toLocaleDateString();
      return res.status(400).json({
        error: `You already have a ${existing.status.toLowerCase()} leave request for this period (${exFrom} to ${exTo})!`
      });
    }

    // No balance check here: employees can apply any leave; Admin gets a low-balance warning on approval
    const id = `lve_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    await pool.query(
      `INSERT INTO leave_requests (id, user_id, user_name, user_email, leave_type, from_date, to_date, day_type, total_days, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [id, userId, userName, userEmail, leave_type, from_date, to_date, day_type || "Full Day", totalDays, reason]
    );

    const [created] = await pool.query("SELECT * FROM leave_requests WHERE id = ?", [id]);
    res.json({ message: "Leave applied successfully!", leave: created[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3.1 UPDATE APPLIED LEAVE (Only for pending leaves, owner or Super Admin)
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const isSuperAdmin = isSuperAdminOrManager(req);
    const { id } = req.params;
    const { leave_type, from_date, to_date, day_type, reason } = req.body;

    const [rows] = await pool.query("SELECT * FROM leave_requests WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Leave request not found" });

    const leave = rows[0];
    if (!isSuperAdmin && leave.user_id !== userId) {
      return res.status(403).json({ error: "Access denied: You can only edit your own leave applications." });
    }

    if (leave.status !== "Pending" && !isSuperAdmin) {
      return res.status(400).json({ error: "Only Pending leave applications can be edited." });
    }

    if (!from_date) {
      return res.status(400).json({ error: "Plese enter from date", field: "from_date" });
    }
    if (!to_date) {
      return res.status(400).json({ error: "Plese enter to date", field: "to_date" });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Plese enter reason", field: "reason" });
    }
    if (!LEAVE_TYPES.includes(leave_type) && leave_type !== leave.leave_type) {
      return res.status(400).json({ error: "Plese select leave type", field: "leave_type" });
    }
    if (!DATE_RE.test(from_date) || !DATE_RE.test(to_date)) {
      return res.status(400).json({ error: "Invalid date format." });
    }
    if (!isRealDate(from_date)) {
      return res.status(400).json({ error: "Please enter a valid date", field: "from_date" });
    }
    if (!isRealDate(to_date)) {
      return res.status(400).json({ error: "Please enter a valid date", field: "to_date" });
    }

    const start = new Date(from_date);
    const end = new Date(to_date);

    if (end < start) {
      return res.status(400).json({ error: "'To Date' cannot be earlier than 'From Date'!" });
    }

    const dateCheck = await validateLeaveDates({ userId: leave.user_id, userEmail: leave.user_email, from_date, to_date, day_type });
    if (dateCheck.error) {
      return res.status(400).json({ error: dateCheck.error });
    }
    const totalDays = dateCheck.totalDays;

    // Check for Overlapping Leaves (excluding current editing leave)
    const [overlapRows] = await pool.query(
      `SELECT * FROM leave_requests 
       WHERE user_id = ? 
       AND id != ?
       AND status IN ('Pending', 'Approved')
       AND NOT (to_date < ? OR from_date > ?)
       LIMIT 1`,
      [leave.user_id, id, from_date, to_date]
    );

    if (overlapRows.length > 0) {
      const existing = overlapRows[0];
      const exFrom = new Date(existing.from_date).toLocaleDateString();
      const exTo = new Date(existing.to_date).toLocaleDateString();
      return res.status(400).json({
        error: `You already have a ${existing.status.toLowerCase()} leave request for this period (${exFrom} to ${exTo})!`
      });
    }

    // Editing an approved leave: undo the old dates/balance first, then re-apply with the new values
    if (leave.status === "Approved") {
      await revertApprovedLeave(leave);
    }

    await pool.query(
      `UPDATE leave_requests
       SET leave_type = ?, from_date = ?, to_date = ?, day_type = ?, total_days = ?, reason = ?
       WHERE id = ?`,
      [leave_type, from_date, to_date, day_type || "Full Day", totalDays, reason, id]
    );

    const [updated] = await pool.query("SELECT * FROM leave_requests WHERE id = ?", [id]);
    if (leave.status === "Approved") {
      await applyApprovedLeave(updated[0]);
    }
    res.json({ message: "Leave application updated successfully!", leave: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3.2 DELETE / CANCEL APPLIED LEAVE (Only for pending leaves, owner or Super Admin)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const isSuperAdmin = isSuperAdminOrManager(req);
    const { id } = req.params;

    const [rows] = await pool.query("SELECT * FROM leave_requests WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Leave request not found" });

    const leave = rows[0];
    if (!isSuperAdmin && leave.user_id !== userId) {
      return res.status(403).json({ error: "Access denied: You can only delete your own leave applications." });
    }

    if (leave.status !== "Pending" && !isSuperAdmin) {
      return res.status(400).json({ error: "Only Pending leave applications can be cancelled/deleted." });
    }

    if (leave.status === "Approved") {
      await revertApprovedLeave(leave);
    }

    await pool.query("DELETE FROM leave_requests WHERE id = ?", [id]);
    res.json({ message: "Leave application deleted successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET ALL LEAVES (FOR SUPER ADMIN / MANAGER APPROVALS)
router.get("/all", authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdminOrManager(req)) {
      return res.status(403).json({ error: "Access denied" });
    }

    const { status, upcomingDays } = req.query;
    let query = `
      SELECT lr.* 
      FROM leave_requests lr
      LEFT JOIN staff s ON lr.user_id = s.id OR (lr.user_email = s.email AND lr.user_email != '')
      WHERE (s.status = 'Active' OR s.status IS NULL)
    `;
    const params = [];

    if (status) {
      query += " AND lr.status = ?";
      params.push(status);
    }

    if (upcomingDays) {
      const days = parseInt(upcomingDays, 10) || 10;
      query += " AND lr.to_date >= CURDATE() AND lr.from_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)";
      params.push(days);
      query += " ORDER BY lr.from_date ASC";
    } else {
      query += " ORDER BY lr.created_at DESC";
    }

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. APPROVE OR REJECT LEAVE (Super Admin only)
router.patch("/:id/action", authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdminOrManager(req)) {
      return res.status(403).json({ error: "Access denied: Only Super Admin can approve or reject leaves." });
    }

    const { id } = req.params;
    const { action, rejection_reason, force } = req.body; // action: 'Approved' | 'Rejected'
    const approved_by = req.user.name || "Admin";
    if (!["Approved", "Rejected"].includes(action)) {
      return res.status(400).json({ error: "Action must be 'Approved' or 'Rejected'" });
    }

    const [reqRows] = await pool.query("SELECT * FROM leave_requests WHERE id = ?", [id]);
    if (reqRows.length === 0) return res.status(404).json({ error: "Leave request not found" });

    const leave = reqRows[0];

    // Balance lower than the leave -> ask Admin to confirm (balance will go negative)
    const col = BALANCE_COLUMN[leave.leave_type];
    if (action === "Approved" && leave.status !== "Approved" && col && !force) {
      const leaveYear = leave.from_date ? new Date(leave.from_date).getFullYear() : new Date().getFullYear();
      const [balRows] = await pool.query(
        `SELECT ${col} AS bal FROM leave_balances WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND year = ? LIMIT 1`,
        [leave.user_id, leave.user_email || '', leaveYear]
      );
      const available = Number(balRows[0]?.bal ?? 0);
      const required = Number(leave.total_days);
      if (available < required) {
        return res.status(409).json({
          insufficientBalance: true,
          available,
          required,
          afterApproval: Number((available - required).toFixed(1)),
          message: `${leave.user_name}'s ${leave.leave_type} balance is only ${available} day(s), but this leave request is for ${required} day(s). Approving will result in a negative balance of ${Number((available - required).toFixed(1))} day(s). Do you still want to approve?`
        });
      }
    }

    if (action === "Approved" && leave.status !== "Approved") {
      // Deduct balance + mark attendance "On Leave"
      await applyApprovedLeave(leave);
    } else if (action === "Rejected" && leave.status === "Approved") {
      await revertApprovedLeave(leave);
    }

    await pool.query(
      "UPDATE leave_requests SET status = ?, approved_by = ?, rejection_reason = ? WHERE id = ?",
      [action, approved_by, rejection_reason || null, id]
    );

    // Send email notification to the employee
    const targetEmail = leave.user_email;
    if (targetEmail) {
      sendLeaveDecisionMail({
        to: targetEmail,
        recipientName: leave.user_name || "Team Member",
        leaveType: leave.leave_type,
        fromDate: leave.from_date,
        toDate: leave.to_date,
        totalDays: leave.total_days,
        dayType: leave.day_type,
        action,
        approvedBy: approved_by,
        rejectionReason: rejection_reason || "",
        isShortLeave: false
      }).catch(e => console.error("Leave mail send error:", e));
    }

    res.json({ message: `Leave ${action} successfully!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. APPLY SHORT LEAVE
router.post("/short-leave", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userName = req.user.name || "Employee";
    const userEmail = req.user.email || "";
    const { date, from_time, to_time, reason } = req.body;
    if (!date) {
      return res.status(400).json({ error: "Plese enter date", field: "date" });
    }
    if (!from_time) {
      return res.status(400).json({ error: "Plese enter from time", field: "from_time" });
    }
    if (!to_time) {
      return res.status(400).json({ error: "Plese enter to time", field: "to_time" });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Plese enter reason", field: "reason" });
    }
    if (!DATE_RE.test(date)) {
      return res.status(400).json({ error: "Invalid date format.", field: "date" });
    }
    if (!TIME_RE.test(from_time)) {
      return res.status(400).json({ error: "Invalid from time.", field: "from_time" });
    }
    if (!TIME_RE.test(to_time)) {
      return res.status(400).json({ error: "Invalid to time.", field: "to_time" });
    }

    const [fromH, fromM] = from_time.split(":").map(Number);
    const [toH, toM] = to_time.split(":").map(Number);
    const startMins = fromH * 60 + fromM;
    const endMins = toH * 60 + toM;

    if (endMins <= startMins) {
      return res.status(400).json({ error: "To Time must be later than From Time." });
    }

    const diffMinutes = endMins - startMins;
    const maxShortMinutes = await getMaxShortLeaveMinutes();
    if (diffMinutes > maxShortMinutes) {
      return res.status(400).json({ error: `Short leave cannot exceed ${formatShortLeaveLimit(maxShortMinutes)}!` });
    }

    const dayError = await validateShortLeaveDay({ userId, userEmail, date, startMins, endMins });
    if (dayError) {
      return res.status(400).json({ error: dayError });
    }

    // Check Monthly Short Leave Count Limit
    const maxPerMonth = await getMaxShortLeavesPerMonth();
    const monthPrefix = String(date).slice(0, 7); // e.g. "2026-10"
    const [monthCountRows] = await pool.query(
      `SELECT COUNT(*) as count FROM short_leaves 
       WHERE user_id = ? 
         AND date LIKE ? 
         AND status IN ('Pending', 'Approved')`,
      [userId, `${monthPrefix}%`]
    );
    const currentMonthCount = monthCountRows[0]?.count || 0;
    if (currentMonthCount >= maxPerMonth) {
      return res.status(400).json({
        error: `Monthly short leave limit reached! You can take a maximum of ${maxPerMonth} short leave(s) per month (Already applied/approved: ${currentMonthCount}).`
      });
    }

    const calculatedHours = Number((diffMinutes / 60).toFixed(1));
    const id = `shl_${Date.now()}`;
    await pool.query(
      `INSERT INTO short_leaves (id, user_id, user_name, user_email, date, from_time, to_time, hours, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [id, userId, userName, userEmail, date, from_time, to_time, calculatedHours, reason]
    );

    res.json({ message: "Short leave applied successfully! Pending Super Admin approval." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. GET MY SHORT LEAVES
router.get("/my-short-leaves", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const [rows] = await pool.query("SELECT * FROM short_leaves WHERE user_id = ? ORDER BY date DESC", [userId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. UPDATE SHORT LEAVE
router.put("/short-leave/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const isSuperAdmin = isSuperAdminOrManager(req);
    const { id } = req.params;
    const { date, from_time, to_time, reason } = req.body;

    const [rows] = await pool.query("SELECT * FROM short_leaves WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Short leave not found" });

    if (!isSuperAdmin && rows[0].user_id !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!isSuperAdmin && rows[0].status !== "Pending") {
      return res.status(400).json({ error: `Cannot edit short leave that is already ${rows[0].status.toLowerCase()}.` });
    }

    if (!date) {
      return res.status(400).json({ error: "Plese enter date", field: "date" });
    }
    if (!from_time) {
      return res.status(400).json({ error: "Plese enter from time", field: "from_time" });
    }
    if (!to_time) {
      return res.status(400).json({ error: "Plese enter to time", field: "to_time" });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Plese enter reason", field: "reason" });
    }
    if (!DATE_RE.test(date)) {
      return res.status(400).json({ error: "Invalid date format.", field: "date" });
    }
    if (!TIME_RE.test(from_time)) {
      return res.status(400).json({ error: "Invalid from time.", field: "from_time" });
    }
    if (!TIME_RE.test(to_time)) {
      return res.status(400).json({ error: "Invalid to time.", field: "to_time" });
    }

    const [fromH, fromM] = from_time.split(":").map(Number);
    const [toH, toM] = to_time.split(":").map(Number);
    const startMins = fromH * 60 + fromM;
    const endMins = toH * 60 + toM;

    if (endMins <= startMins) {
      return res.status(400).json({ error: "To Time must be later than From Time." });
    }

    const diffMinutes = endMins - startMins;
    const maxShortMinutes = await getMaxShortLeaveMinutes();
    if (diffMinutes > maxShortMinutes) {
      return res.status(400).json({ error: `Short leave cannot exceed ${formatShortLeaveLimit(maxShortMinutes)}!` });
    }

    const dayError = await validateShortLeaveDay({
      userId: rows[0].user_id,
      userEmail: rows[0].user_email,
      date,
      startMins,
      endMins,
      excludeId: id
    });
    if (dayError) {
      return res.status(400).json({ error: dayError });
    }

    const calculatedHours = Number((diffMinutes / 60).toFixed(1));

    await pool.query(
      `UPDATE short_leaves 
       SET date = ?, from_time = ?, to_time = ?, hours = ?, reason = ?
       WHERE id = ?`,
      [date, from_time, to_time, calculatedHours, reason, id]
    );

    const [updated] = await pool.query("SELECT * FROM short_leaves WHERE id = ?", [id]);
    res.json({ message: "Short leave updated successfully!", shortLeave: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. DELETE SHORT LEAVE
router.delete("/short-leave/:id", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const isSuperAdmin = isSuperAdminOrManager(req);
    const { id } = req.params;

    const [rows] = await pool.query("SELECT * FROM short_leaves WHERE id = ?", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Short leave not found" });

    if (!isSuperAdmin && rows[0].user_id !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!isSuperAdmin && rows[0].status !== "Pending") {
      return res.status(400).json({ error: `Cannot delete short leave that is already ${rows[0].status.toLowerCase()}.` });
    }

    await pool.query("DELETE FROM short_leaves WHERE id = ?", [id]);
    res.json({ message: "Short leave deleted successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. GET ALL SHORT LEAVES (FOR SUPER ADMIN APPROVALS)
router.get("/short-leaves/all", authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdminOrManager(req)) {
      return res.status(403).json({ error: "Access denied" });
    }
    const [rows] = await pool.query(`
      SELECT sl.* 
      FROM short_leaves sl
      LEFT JOIN staff s ON sl.user_id = s.id OR (sl.user_email = s.email AND sl.user_email != '')
      WHERE (s.status = 'Active' OR s.status IS NULL)
      ORDER BY sl.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. APPROVE OR REJECT SHORT LEAVE (Super Admin only)
router.patch("/short-leave/:id/action", authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdminOrManager(req)) {
      return res.status(403).json({ error: "Access denied: Only Super Admin can approve or reject short leaves." });
    }

    const { id } = req.params;
    const { action } = req.body; // action: 'Approved' | 'Rejected'
    const approved_by = req.user.name || "Admin";

    const [reqRows] = await pool.query("SELECT * FROM short_leaves WHERE id = ?", [id]);
    if (reqRows.length === 0) return res.status(404).json({ error: "Short leave request not found" });

    const sl = reqRows[0];

    await pool.query(
      "UPDATE short_leaves SET status = ?, approved_by = ? WHERE id = ?",
      [action, approved_by, id]
    );

    // Send email notification to employee
    const targetEmail = sl.user_email;
    if (targetEmail) {
      sendLeaveDecisionMail({
        to: targetEmail,
        recipientName: sl.user_name || "Team Member",
        leaveType: "Short Leave",
        fromDate: sl.date,
        toDate: sl.date,
        totalDays: sl.hours,
        action,
        approvedBy: approved_by,
        isShortLeave: true,
        shortLeaveTime: `${sl.from_time} - ${sl.to_time}`
      }).catch(e => console.error("Short leave mail send error:", e));
    }

    res.json({ message: `Short leave ${action} successfully!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
