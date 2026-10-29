const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { checkPermission } = require("../middleware/permissions");
const { pool, logAudit } = require("../config/mysqlDb");

// Helper: Check if user is Super Admin or Company Owner
const isUserSuperAdmin = (req) => {
  const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
  return req.user?.email === superEmail || req.user?.role?.name === "Super Admin" || req.user?.role === "Super Admin" || req.user?.role?.name === "Company Owner";
};

// Helper: Determine if a specific date is working day considering saturday_rule
const isDayWorkingByRule = (dateObj, scheduleRow) => {
  if (!scheduleRow) return false;
  if (scheduleRow.is_working_day === 0) return false;
  
  const dayOfWeek = dateObj.getDay(); // 0 = Sun, 6 = Sat
  if (dayOfWeek === 6) { // Saturday
    const rule = scheduleRow.saturday_rule || "2nd_4th_off";
    if (rule === "all_off") return false;
    if (rule === "all_working") return true;
    
    // "2nd_4th_off": 2nd and 4th Saturday are company holidays
    const dayOfMonth = dateObj.getDate();
    const satIndex = Math.ceil(dayOfMonth / 7); // 1, 2, 3, 4, 5
    if (satIndex === 2 || satIndex === 4) {
      return false; // Holiday
    }
    return true; // 1st, 3rd, 5th Saturday is working
  }

  return scheduleRow.is_working_day !== 0;
};

// Helper: Get current Date in Asia/Kolkata (IST) timezone
const getISTNow = () => {
  const d = new Date();
  return new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
};

// Helper: Get current Date string (YYYY-MM-DD) in Asia/Kolkata (IST) timezone
const getISTToday = () => {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
};

// Helper: Format minutes since midnight into 12-hour AM/PM string (e.g. 570 -> "09:30 AM")
const formatMinutesTo12Hr = (mins) => {
  let m = mins % (24 * 60);
  if (m < 0) m += 24 * 60;
  let hours = Math.floor(m / 60);
  let minutes = Math.round(m % 60);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutesStr = minutes < 10 ? '0' + minutes : minutes;
  const hoursStr = hours < 10 ? '0' + hours : hours;
  return `${hoursStr}:${minutesStr} ${ampm}`;
};

// Helper: Calculate shift requirements, breaks, and excess break duration
const getShiftAndBreakInfo = async (userId, userEmail, today, now, clockInTime, existingTotalBreak) => {
  // 1. Fetch Today's Work Schedule (default 9 hours)
  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const currentDayName = daysOfWeek[now.getDay()];
  const [schedRows] = await pool.query(
    "SELECT * FROM work_schedules WHERE day_of_week = ? LIMIT 1",
    [currentDayName]
  );

  let standardShiftMinutes = 9 * 60; // Standard 9 hours (540 mins)
  let shiftTiming = "10:00 AM - 07:00 PM";
  if (schedRows.length > 0 && schedRows[0].clock_in_time && schedRows[0].clock_out_time) {
    const [hIn, mIn] = schedRows[0].clock_in_time.split(":").map(Number);
    const [hOut, mOut] = schedRows[0].clock_out_time.split(":").map(Number);
    let diff = (hOut * 60 + mOut) - (hIn * 60 + mIn);
    if (diff < 0) diff += 24 * 60;
    if (diff > 0) standardShiftMinutes = diff;
    shiftTiming = `${schedRows[0].clock_in_time} - ${schedRows[0].clock_out_time}`;
  }

  // 2. Fetch today's break logs and active break policies
  const [todayBreaks] = await pool.query(
    "SELECT * FROM break_logs WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ?",
    [userId, userEmail, today]
  );
  const [breakTypes] = await pool.query(
    "SELECT * FROM break_types WHERE status = 'Active'"
  );

  const policyMap = {};
  let defaultLunchAllowed = 40; // Default Lunch Break is 40 minutes
  for (const bt of breakTypes) {
    policyMap[bt.name.trim().toLowerCase()] = bt.duration_minutes;
    if (bt.name.toLowerCase().includes("lunch")) {
      defaultLunchAllowed = bt.duration_minutes;
    }
  }

  let totalExcessBreakMinutes = 0;
  const excessBreakBreakdown = [];
  let totalBreakMinutesTaken = 0;

  for (const b of todayBreaks) {
    let dur = b.duration_minutes || 0;
    if (!b.end_time && b.start_time) {
      dur = Math.max(1, Math.round((now - new Date(b.start_time)) / 60000));
    }
    totalBreakMinutesTaken += dur;

    const normReason = (b.reason || "").trim().toLowerCase();
    let allowedForThisBreak = policyMap[normReason];
    if (allowedForThisBreak === undefined) {
      const matchedKey = Object.keys(policyMap).find(k => normReason.includes(k) || k.includes(normReason));
      if (matchedKey) {
        allowedForThisBreak = policyMap[matchedKey];
      } else {
        allowedForThisBreak = defaultLunchAllowed;
      }
    }

    if (dur > allowedForThisBreak) {
      const excess = dur - allowedForThisBreak;
      totalExcessBreakMinutes += excess;
      excessBreakBreakdown.push(`${b.reason || "Break"}: took ${dur}m (allowed ${allowedForThisBreak}m, +${excess}m excess)`);
    }
  }

  // Fallback: check against attendance table total_break_minutes
  const overallBreakTaken = Math.max(totalBreakMinutesTaken, existingTotalBreak || 0);
  if (totalExcessBreakMinutes === 0 && overallBreakTaken > defaultLunchAllowed) {
    totalExcessBreakMinutes = overallBreakTaken - defaultLunchAllowed;
    excessBreakBreakdown.push(`Total breaks took ${overallBreakTaken}m (allowed ${defaultLunchAllowed}m, +${totalExcessBreakMinutes}m excess)`);
  }

  // Shift is extended by any excess break taken (e.g. 9 hours + 20 min excess)
  const requiredTotalShiftMinutes = standardShiftMinutes + totalExcessBreakMinutes;

  let elapsedMinutes = 0;
  let remainingMinutes = requiredTotalShiftMinutes;
  if (clockInTime) {
    elapsedMinutes = Math.max(0, Math.floor((now - new Date(clockInTime)) / (1000 * 60)));
    remainingMinutes = Math.max(0, requiredTotalShiftMinutes - elapsedMinutes);
  }

  const sched = schedRows[0] || null;
  const schedFirstHalfHours = sched && sched.first_half_hours ? parseFloat(sched.first_half_hours) : (standardShiftMinutes / 60) / 2;

  return {
    standardShiftMinutes,
    standardShiftHours: (standardShiftMinutes / 60).toFixed(1),
    shiftTiming,
    sched,
    schedFirstHalfHours,
    totalBreakMinutesTaken: overallBreakTaken,
    totalExcessBreakMinutes,
    excessBreakBreakdown,
    requiredTotalShiftMinutes,
    elapsedMinutes,
    remainingMinutes
  };
};

// 1. GET TODAY'S ATTENDANCE STATUS (For employee Clock In/Out widget)
router.get("/today", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userEmail = req.user.email || "";
    const today = getISTToday();

    // Auto close past forgotten clock-ins
    await autoClosePastUnclosedAttendance(userId, userEmail, today);

    // Check if there is any past missed clock out that needs Second Half leave
    const [pendingMissed] = await pool.query(
      `SELECT * FROM attendance 
       WHERE (user_id = ? OR (user_email = ? AND user_email != '')) 
         AND date < ? 
         AND missed_clock_out = 1 
       ORDER BY date DESC LIMIT 1`,
      [userId, userEmail, today]
    );

    // Clear any past missed clock out flags without blocking
    if (pendingMissed.length > 0) {
      await pool.query("UPDATE attendance SET missed_clock_out = 0 WHERE id = ?", [pendingMissed[0].id]);
    }
    const requiredLeaveNotice = null;

    const [rows] = await pool.query(
      "SELECT * FROM attendance WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ? ORDER BY (clock_out IS NOT NULL) DESC, updated_at DESC, clock_in DESC LIMIT 1",
      [userId, userEmail, today]
    );

    // Also fetch today's work schedule and calculate break details
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const now = new Date();
    const currentDayName = daysOfWeek[now.getDay()];

    const shiftDetails = await getShiftAndBreakInfo(
      userId,
      userEmail,
      today,
      now,
      rows[0]?.clock_in,
      rows[0]?.total_break_minutes
    );

    const sched = shiftDetails.sched;
    const isWorkingDay = isDayWorkingByRule(now, sched);
    let dayNote = "";
    if (now.getDay() === 6) {
      const satIndex = Math.ceil(now.getDate() / 7);
      if (!isWorkingDay) {
        dayNote = `Company Holiday (${satIndex === 2 ? "2nd" : satIndex === 4 ? "4th" : ""} Saturday)`;
      } else {
        dayNote = `Working Saturday (${satIndex === 1 ? "1st" : satIndex === 3 ? "3rd" : "5th"} Saturday)`;
      }
    }

    // Fetch attendance settings & current month's late instance tracking
    const [settingRows] = await pool.query("SELECT * FROM attendance_settings WHERE id = 'default_settings' LIMIT 1");
    const attSettings = settingRows[0] || { monthly_late_instances: 3, late_grace_minutes: 30 };

    const currentMonthPrefix = today.slice(0, 7);
    const [monthLateRows] = await pool.query(
      `SELECT COUNT(*) as late_count, COALESCE(SUM(first_half_deducted), 0) as half_days_deducted
       FROM attendance 
       WHERE (user_id = ? OR (user_email = ? AND user_email != '')) 
         AND date LIKE ? 
         AND is_late_instance = 1`,
      [userId, userEmail, `${currentMonthPrefix}%`]
    );

    const lateCount = monthLateRows[0]?.late_count || 0;
    const monthlyLimit = attSettings.monthly_late_instances;
    const remainingInstances = Math.max(0, monthlyLimit - lateCount);

    res.json({ 
      attendance: rows[0] || null,
      requiredLeaveNotice,
      remainingShiftMinutes: shiftDetails.requiredTotalShiftMinutes > shiftDetails.elapsedMinutes 
        ? Math.max(0, shiftDetails.requiredTotalShiftMinutes - shiftDetails.elapsedMinutes) 
        : 0,
      elapsedWorkingMinutes: shiftDetails.elapsedMinutes,
      late_instances: {
        used: lateCount,
        limit: monthlyLimit,
        remaining: remainingInstances,
        grace_minutes: attSettings.late_grace_minutes,
        is_exhausted: lateCount >= monthlyLimit,
        half_days_deducted: monthLateRows[0]?.half_days_deducted || 0
      },
      schedule: {
        day: currentDayName,
        timing: shiftDetails.shiftTiming,
        standardShiftHours: shiftDetails.standardShiftHours,
        standardShiftMinutes: shiftDetails.standardShiftMinutes,
        requiredShiftMinutes: shiftDetails.requiredTotalShiftMinutes,
        excessBreakMinutes: shiftDetails.totalExcessBreakMinutes,
        excessBreakBreakdown: shiftDetails.excessBreakBreakdown,
        totalBreakMinutes: shiftDetails.totalBreakMinutesTaken,
        clock_in_time: sched?.clock_in_time || "09:30",
        clock_out_time: sched?.clock_out_time || "18:30",
        is_working_day: isWorkingDay,
        saturday_rule: sched?.saturday_rule || "2nd_4th_off",
        day_note: dayNote
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: Run auto clock-out for unclosed shifts from previous days.
// Pass userId/userEmail = null to close for all employees (used by admin listings).
const autoClosePastUnclosedAttendance = async (userId, userEmail, today) => {
  // Find any attendance record before today where user clocked in but never clocked out
  let query = `SELECT * FROM attendance
     WHERE date < ?
       AND clock_in IS NOT NULL
       AND clock_out IS NULL`;
  const params = [today];
  if (userId || userEmail) {
    query += " AND (user_id = ? OR (user_email = ? AND user_email != ''))";
    params.push(userId, userEmail);
  }
  const [unclosed] = await pool.query(query + " ORDER BY date DESC", params);

  for (const rec of unclosed) {
    const clockInDate = new Date(rec.clock_in);
    // Auto clock-out set to 11:00 PM (23:00) on the day of attendance
    const autoClockOut = new Date(clockInDate);
    autoClockOut.setHours(23, 0, 0, 0);

    let finalClockOut = autoClockOut;
    if (finalClockOut <= clockInDate) {
      finalClockOut = new Date(clockInDate.getTime() + 30 * 60 * 1000);
    }

    const elapsedMs = Math.max(0, finalClockOut.getTime() - clockInDate.getTime());
    const totalHours = (elapsedMs / (1000 * 60 * 60)).toFixed(2);

    await pool.query(
      `UPDATE attendance 
       SET clock_out = ?, total_hours = ?, status = IF(status = 'On Leave', 'On Leave', 'Not Punch Out'), auto_clock_out = 1, missed_clock_out = 1,
           notes = CONCAT(COALESCE(notes, ''), ' [Auto clocked out at 11:00 PM by system - Forgot Punch Out request required]')
       WHERE id = ?`,
      [finalClockOut, totalHours, rec.id]
    );
  }
};

// Helper: Check if user has unregularized past absence working days between their last attendance and today
const checkUnregularizedPastAbsences = async (userId, userEmail, todayStr) => {
  try {
    // 1. Fetch work schedules & company holidays
    const [schedRows] = await pool.query("SELECT * FROM work_schedules");
    const schedMap = {};
    for (const s of schedRows) {
      schedMap[s.day_of_week] = s;
    }

    const [holidayRows] = await pool.query("SELECT holiday_date FROM company_holidays");
    const holidaySet = new Set(
      holidayRows.map(h => {
        try {
          return new Date(h.holiday_date).toISOString().slice(0, 10);
        } catch (_) {
          return String(h.holiday_date).slice(0, 10);
        }
      })
    );

    // 2. Find the last attendance date for this user before today
    const [lastAttRows] = await pool.query(
      `SELECT date FROM attendance 
       WHERE (user_id = ? OR (user_email = ? AND user_email != '')) 
         AND date < ? 
         AND clock_in IS NOT NULL 
       ORDER BY date DESC LIMIT 1`,
      [userId, userEmail, todayStr]
    );

    const todayDate = new Date(`${todayStr}T00:00:00`);
    let startDate;

    if (lastAttRows.length > 0) {
      const lastDate = new Date(lastAttRows[0].date);
      startDate = new Date(lastDate);
      startDate.setDate(startDate.getDate() + 1); // Start from day after last attendance
    } else {
      // If no past attendance found, look back at most 7 days
      startDate = new Date(todayDate);
      startDate.setDate(startDate.getDate() - 7);
    }

    // Limit lookback window to max 30 days to avoid infinite/unnecessary blocking for old accounts
    const maxLookback = new Date(todayDate);
    maxLookback.setDate(maxLookback.getDate() - 30);
    if (startDate < maxLookback) {
      startDate = maxLookback;
    }

    const missingDays = [];
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    const curr = new Date(startDate);
    while (curr < todayDate) {
      const currStr = curr.toISOString().slice(0, 10);
      const dayName = daysOfWeek[curr.getDay()];
      const sched = schedMap[dayName];
      const isWorkingDay = isDayWorkingByRule(curr, sched);

      // Check if it's not a holiday and is a working day
      if (isWorkingDay && !holidaySet.has(currStr)) {
        // Check if there is an attendance record for this day
        const [hasAtt] = await pool.query(
          `SELECT id FROM attendance 
           WHERE (user_id = ? OR (user_email = ? AND user_email != '')) 
             AND date = ? 
             AND clock_in IS NOT NULL 
           LIMIT 1`,
          [userId, userEmail, currStr]
        );

        if (hasAtt.length === 0) {
          // Check if there is an approved or pending leave for this day
          const [hasLeave] = await pool.query(
            `SELECT id FROM leave_requests 
             WHERE (user_id = ? OR (user_email = ? AND user_email != '')) 
               AND (? BETWEEN from_date AND to_date)
               AND status != 'Rejected'
             LIMIT 1`,
            [userId, userEmail, currStr]
          );

          if (hasLeave.length === 0) {
            missingDays.push(currStr);
          }
        }
      }
      curr.setDate(curr.getDate() + 1);
    }

    return missingDays;
  } catch (err) {
    console.error("Error in checkUnregularizedPastAbsences:", err);
    return [];
  }
};

// 2. CLOCK IN (Employee)
router.post("/clock-in", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userName = req.user.name || "Employee";
    const userEmail = req.user.email || "";
    const today = getISTToday();
    const now = getISTNow();
    const workMode = req.body.workMode || "Office";

    // Automatically close any forgotten / unclosed attendance from previous days (cutoff at 11:00 AM)
    await autoClosePastUnclosedAttendance(userId, userEmail, today);

    // Clear any past missed clock out flags without blocking
    await pool.query(
      "UPDATE attendance SET missed_clock_out = 0 WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date < ? AND missed_clock_out = 1",
      [userId, userEmail, today]
    );

    // Check if already has an attendance entry for today
    const [existing] = await pool.query(
      "SELECT * FROM attendance WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ? ORDER BY only_admin_clock_out DESC LIMIT 1",
      [userId, userEmail, today]
    );

    if (existing.length > 0 && existing[0].clock_in) {
      return res.status(400).json({ error: "Already clocked in for today!" });
    }

    let isLateInstance = 0;
    let lateMinutes = 0;
    let firstHalfDeducted = 0;
    let attendanceStatus = "Present";
    let lateNoticeMsg = null;

    // Clock-in is allowed on an approved leave day, but the day stays 'On Leave'
    // (Super Admin can change it to Present from Attendance -> Edit)
    const [approvedLeave] = await pool.query(
      `SELECT leave_type, day_type FROM leave_requests
       WHERE (user_id = ? OR (user_email = ? AND user_email != ''))
         AND status = 'Approved'
         AND ? BETWEEN from_date AND to_date
       LIMIT 1`,
      [userId, userEmail, today]
    );
    const isOnLeave = approvedLeave.length > 0 || (existing.length > 0 && existing[0].status === "On Leave");
    let leaveNotice = null;
    if (isOnLeave) {
      attendanceStatus = "On Leave";
      const leaveType = approvedLeave[0]?.leave_type || "leave";
      leaveNotice = `You have an approved ${leaveType} for today. You are clocked in, but today's attendance will stay "On Leave" until the Admin changes it.`;
    }

    if (existing.length > 0) {
      // Update existing record (preserving only_admin_clock_out that admin created!)
      await pool.query(
        `UPDATE attendance 
         SET user_id = ?, user_name = ?, user_email = ?, clock_in = ?, work_mode = ?, status = ?,
             is_late_instance = ?, late_minutes = ?, first_half_deducted = ?,
             notes = CONCAT(COALESCE(notes, ''), ?)
         WHERE id = ?`,
        [userId, userName, userEmail, now, workMode, attendanceStatus, isLateInstance, lateMinutes, firstHalfDeducted, lateNoticeMsg ? ` [${lateNoticeMsg}]` : '', existing[0].id]
      );
    } else {
      const attendanceId = `att_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      await pool.query(
        `INSERT INTO attendance (id, user_id, user_name, user_email, date, clock_in, work_mode, status, is_late_instance, late_minutes, first_half_deducted, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [attendanceId, userId, userName, userEmail, today, now, workMode, attendanceStatus, isLateInstance, lateMinutes, firstHalfDeducted, lateNoticeMsg || null]
      );
    }

    const [updated] = await pool.query(
      "SELECT * FROM attendance WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ? ORDER BY only_admin_clock_out DESC LIMIT 1",
      [userId, userEmail, today]
    );

    res.json({
      message: lateNoticeMsg ? lateNoticeMsg : "Clock In successful!",
      attendance: updated[0],
      on_leave: isOnLeave,
      leaveNotice,
      lateNotice: lateNoticeMsg,
      is_late: isLateInstance === 1,
      first_half_deducted: firstHalfDeducted === 1
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CLOCK OUT (Employee)
router.post("/clock-out", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userEmail = req.user.email || "";
    const today = getISTToday();
    const now = getISTNow();

    const [existing] = await pool.query(
      "SELECT * FROM attendance WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ? ORDER BY only_admin_clock_out DESC LIMIT 1",
      [userId, userEmail, today]
    );

    if (!existing.length || !existing[0].clock_in) {
      return res.status(400).json({ error: "No clock-in record found for today!" });
    }

    if (existing[0].clock_out) {
      return res.status(400).json({ error: "You have already clocked out for today!" });
    }

    // Check if clock-out is restricted to Admin only
    if (Boolean(existing[0].only_admin_clock_out)) {
      return res.status(403).json({ 
        error: "Clock-out restricted: Only your Admin / Super Admin can clock you out for today." 
      });
    }

    // 1. Calculate shift & break requirements
    const shiftDetails = await getShiftAndBreakInfo(
      userId,
      userEmail,
      today,
      now,
      existing[0].clock_in,
      existing[0].total_break_minutes
    );

    const {
      standardShiftMinutes,
      schedFirstHalfHours,
      totalExcessBreakMinutes,
      excessBreakBreakdown,
      requiredTotalShiftMinutes,
      elapsedMinutes
    } = shiftDetails;

    const remainingMinutes = Math.max(0, requiredTotalShiftMinutes - elapsedMinutes);

    // 2. Timesheet Check: employee must fill their timesheet before leaving
    const [tsRows] = await pool.query(
      "SELECT COALESCE(SUM(hours), 0) AS total_logged FROM timesheets WHERE (user_id = ? OR user_email = ?) AND date = ?",
      [userId, userEmail, today]
    );
    const loggedTimesheetHours = parseFloat(tsRows[0]?.total_logged || 0);
    if (loggedTimesheetHours <= 0) {
      return res.status(400).json({
        error: `Daily Timesheet Incomplete! You must fill your Timesheet entries for today before you can Clock Out. Please open Timesheet and log your project work.`
      });
    }

    // 3. Total Effective Working Hours (elapsed minus excess break)
    const effectiveWorkingMs = Math.max(0, (elapsedMinutes - totalExcessBreakMinutes) * 60 * 1000);
    const totalHours = (effectiveWorkingMs / (1000 * 60 * 60)).toFixed(2);

    let status = "Present";
    if (existing[0].status === "On Leave") {
      status = "On Leave"; // approved leave day stays On Leave until Admin edits it
    } else if (parseFloat(totalHours) < (standardShiftMinutes / 60) * 0.5) {
      status = "Half Day";
    }

    await pool.query(
      `UPDATE attendance 
       SET clock_out = ?, total_hours = ?, status = ?
       WHERE id = ?`,
      [now, totalHours, status, existing[0].id]
    );

    const [updated] = await pool.query("SELECT * FROM attendance WHERE id = ?", [existing[0].id]);
    res.json({ 
      message: "Clock Out successful!", 
      attendance: updated[0],
      remainingMinutes,
      totalHours
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. BREAK START / END (Employee)
router.post("/break-toggle", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userEmail = req.user.email || "";
    const today = getISTToday();
    const now = getISTNow();

    const [existing] = await pool.query(
      "SELECT * FROM attendance WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ? ORDER BY only_admin_clock_out DESC LIMIT 1",
      [userId, userEmail, today]
    );

    if (!existing.length || !existing[0].clock_in) {
      return res.status(400).json({ error: "You must Clock In before taking a break." });
    }

    const record = existing[0];
    if (!record.break_start) {
      // Start break
      await pool.query(
        "UPDATE attendance SET break_start = ? WHERE id = ?",
        [now, record.id]
      );
      res.json({ message: "Break started", isOnBreak: true });
    } else {
      // End break
      const breakStart = new Date(record.break_start);
      const breakDurationMinutes = Math.round((now - breakStart) / 60000);
      const totalBreak = (record.total_break_minutes || 0) + breakDurationMinutes;

      await pool.query(
        "UPDATE attendance SET break_start = NULL, break_end = ?, total_break_minutes = ? WHERE id = ?",
        [now, totalBreak, record.id]
      );
      res.json({ message: "Break ended", isOnBreak: false, totalBreakMinutes: totalBreak });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET ALL ATTENDANCE RECORDS (READ PERMISSION)
router.get("/all", authMiddleware, checkPermission("attendance_management", "read"), async (req, res) => {
  try {
    const { date, month, status, userId, employee, pendingClockOut, startDate, endDate, fromDate, toDate } = req.query;

    // Mark past shifts without a clock-out as 'Not Punch Out' before listing
    await autoClosePastUnclosedAttendance(null, null, getISTToday());

    let query = `
      SELECT a.* 
      FROM attendance a
      LEFT JOIN staff s ON a.user_id = s.id OR (a.user_email = s.email AND a.user_email != '')
      WHERE (s.status = 'Active' OR s.status IS NULL)
    `;
    const params = [];

    // If user is not superadmin/company owner, restrict to their own records only (e.g. Rahul sees only his records)
    if (!isUserSuperAdmin(req)) {
      const currentUserId = req.user._id ? req.user._id.toString() : req.user.id;
      const currentUserEmail = req.user.email || "";
      query += " AND (a.user_id = ? OR (a.user_email = ? AND a.user_email != ''))";
      params.push(currentUserId, currentUserEmail);
    } else {
      const filterEmp = employee || userId;
      if (filterEmp) {
        query += " AND (a.user_id = ? OR a.user_email = ?)";
        params.push(filterEmp, filterEmp);
      }
    }

    const start = startDate || fromDate;
    const end = endDate || toDate;

    if (start && end) {
      query += " AND a.date BETWEEN ? AND ?";
      params.push(start, end);
    } else if (start) {
      query += " AND a.date >= ?";
      params.push(start);
    } else if (end) {
      query += " AND a.date <= ?";
      params.push(end);
    } else if (date) {
      query += " AND a.date = ?";
      params.push(date);
    }
    if (month) {
      query += " AND a.date LIKE ?";
      params.push(`${month}%`);
    }
    if (status) {
      query += " AND a.status = ?";
      params.push(status);
    }
    if (pendingClockOut === "true") {
      // Missing Clock Out: clocked in but clock_out IS NULL
      query += " AND a.clock_in IS NOT NULL AND a.clock_out IS NULL";
    }

    query += " ORDER BY a.date DESC, a.clock_in DESC";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5.5 ADMIN CLOCK OUT AN EMPLOYEE
router.put("/:id/clock-out", authMiddleware, async (req, res) => {
  try {
    if (!isUserSuperAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can clock out staff." });
    }

    const { id } = req.params;
    const now = getISTNow();

    const [rows] = await pool.query("SELECT * FROM attendance WHERE id = ?", [id]);
    if (!rows.length || !rows[0].clock_in) {
      return res.status(404).json({ error: "Attendance clock-in record not found." });
    }

    const clockIn = new Date(rows[0].clock_in);
    const diffHours = Math.max(0.5, ((now - clockIn) / (1000 * 60 * 60))).toFixed(2);

    await pool.query(
      `UPDATE attendance 
       SET clock_out = ?, total_hours = ?, notes = CONCAT(COALESCE(notes, ''), ' [Clocked out by Admin]')
       WHERE id = ?`,
      [now, diffHours, id]
    );

    res.json({ message: "Employee clocked out successfully by Admin", total_hours: diffHours });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5.6 WORK SCHEDULES / WEEKDAY SHIFTS (GET & UPDATE)
router.get("/schedules", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM work_schedules ORDER BY FIELD(day_of_week, 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/schedules/:id", authMiddleware, checkPermission("attendance_management", "update"), async (req, res) => {
  try {
    const { is_working_day, clock_in_time, clock_out_time, first_half_hours, second_half_hours, saturday_rule } = req.body;

    // Fetch existing schedule
    const [existing] = await pool.query("SELECT * FROM work_schedules WHERE id = ? LIMIT 1", [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: "Work schedule not found" });
    }

    const current = existing[0];
    const newClockIn = clock_in_time || current.clock_in_time;
    const newClockOut = clock_out_time || current.clock_out_time;

    // Calculate total shift hours if both clock times are available
    let totalShiftHours = 9.0;
    if (newClockIn && newClockOut && newClockIn !== "00:00" && newClockOut !== "00:00") {
      const [hIn, mIn] = newClockIn.split(":").map(Number);
      const [hOut, mOut] = newClockOut.split(":").map(Number);
      const inMinutes = hIn * 60 + mIn;
      const outMinutes = hOut * 60 + mOut;
      const shiftMinutes = outMinutes > inMinutes ? (outMinutes - inMinutes) : (24 * 60 - inMinutes + outMinutes);
      totalShiftHours = parseFloat((shiftMinutes / 60).toFixed(2));
    }

    let parsedFirstHalf = first_half_hours !== undefined && first_half_hours !== null && first_half_hours !== "" 
      ? parseFloat(first_half_hours) 
      : (current.first_half_hours !== null ? parseFloat(current.first_half_hours) : null);

    let parsedSecondHalf = second_half_hours !== undefined && second_half_hours !== null && second_half_hours !== "" 
      ? parseFloat(second_half_hours) 
      : (current.second_half_hours !== null ? parseFloat(current.second_half_hours) : null);

    // If one half was supplied or both need auto-balancing against shift hours (B41)
    if (parsedFirstHalf !== null && (parsedSecondHalf === null || isNaN(parsedSecondHalf))) {
      parsedSecondHalf = parseFloat(Math.max(0, totalShiftHours - parsedFirstHalf).toFixed(2));
    } else if (parsedSecondHalf !== null && (parsedFirstHalf === null || isNaN(parsedFirstHalf))) {
      parsedFirstHalf = parseFloat(Math.max(0, totalShiftHours - parsedSecondHalf).toFixed(2));
    }

    await pool.query(
      `UPDATE work_schedules 
       SET is_working_day = COALESCE(?, is_working_day),
           clock_in_time = COALESCE(?, clock_in_time),
           clock_out_time = COALESCE(?, clock_out_time),
           first_half_hours = COALESCE(?, first_half_hours),
           second_half_hours = COALESCE(?, second_half_hours),
           saturday_rule = COALESCE(?, saturday_rule)
       WHERE id = ?`,
      [
        is_working_day !== undefined ? (is_working_day ? 1 : 0) : null,
        clock_in_time,
        clock_out_time,
        parsedFirstHalf,
        parsedSecondHalf,
        saturday_rule !== undefined ? saturday_rule : null,
        req.params.id
      ]
    );

    res.json({ message: "Work schedule updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. UPDATE / REGULARIZE ATTENDANCE
router.put("/:id", authMiddleware, checkPermission("attendance_management", "update"), async (req, res) => {
  try {
    const { id } = req.params;
    let { status, total_hours, notes, is_regularized, work_mode, only_admin_clock_out, clock_in, clock_out } = req.body;

    if (clock_in && clock_out) {
      const inDate = new Date(clock_in);
      const outDate = new Date(clock_out);
      if (!isNaN(inDate.getTime()) && !isNaN(outDate.getTime()) && outDate > inDate) {
        total_hours = parseFloat(((outDate - inDate) / (1000 * 60 * 60)).toFixed(2));
      }
    } else if (clock_in && !clock_out && (status === "Present" || !status)) {
      total_hours = 0.00;
    }

    await pool.query(
      `UPDATE attendance 
       SET status = COALESCE(?, status), 
           total_hours = COALESCE(?, total_hours), 
           clock_in = COALESCE(?, clock_in),
           clock_out = COALESCE(?, clock_out),
           notes = COALESCE(?, notes), 
           is_regularized = COALESCE(?, is_regularized),
           work_mode = COALESCE(?, work_mode),
           only_admin_clock_out = COALESCE(?, only_admin_clock_out)
       WHERE id = ?`,
      [
        status, 
        total_hours !== undefined ? total_hours : null, 
        clock_in || null,
        clock_out || null,
        notes, 
        is_regularized, 
        work_mode, 
        only_admin_clock_out !== undefined ? (only_admin_clock_out ? 1 : 0) : null, 
        id
      ]
    );

    res.json({ message: "Attendance updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. MANUAL ATTENDANCE ENTRY
router.post("/manual", authMiddleware, checkPermission("attendance_management", "create"), async (req, res) => {
  try {
    const { user_id, user_name, user_email, date, clock_in, clock_out, status, work_mode, notes, only_admin_clock_out } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: "Plese enter employee", field: "user_id" });
    }
    if (!date) {
      return res.status(400).json({ error: "Plese enter date", field: "date" });
    }
    let { total_hours } = req.body;
    const id = `att_manual_${Date.now()}`;

    // Derive hours from times if provided
    if (clock_in && clock_out) {
      const inDate = new Date(clock_in);
      const outDate = new Date(clock_out);
      if (!isNaN(inDate.getTime()) && !isNaN(outDate.getTime()) && outDate > inDate) {
        total_hours = parseFloat(((outDate - inDate) / (1000 * 60 * 60)).toFixed(2));
      }
    } else if (clock_in && !clock_out) {
      total_hours = 0.00;
    } else if (total_hours === undefined || total_hours === null || total_hours === "") {
      total_hours = 0.00;
    } else {
      total_hours = Number(total_hours);
    }

    await pool.query(
      `INSERT INTO attendance (id, user_id, user_name, user_email, date, clock_in, clock_out, status, total_hours, work_mode, notes, is_regularized, only_admin_clock_out)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE 
         status = VALUES(status), 
         total_hours = VALUES(total_hours),
         clock_in = VALUES(clock_in),
         clock_out = VALUES(clock_out),
         work_mode = VALUES(work_mode),
         notes = VALUES(notes),
         only_admin_clock_out = VALUES(only_admin_clock_out),
         is_regularized = 1`,
      [id, user_id, user_name, user_email, date, clock_in || null, clock_out || null, status || "Present", total_hours, work_mode || "Office", notes || "Manual entry", only_admin_clock_out ? 1 : 0]
    );

    res.json({ message: "Attendance record added/updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. DELETE ATTENDANCE ENTRY
router.delete("/:id", authMiddleware, checkPermission("attendance_management", "delete"), async (req, res) => {
  try {
    await pool.query("DELETE FROM attendance WHERE id = ?", [req.params.id]);
    res.json({ message: "Attendance record deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. GET ATTENDANCE SETTINGS (Monthly Late Instances, Grace Minutes, Half Day Cutoff)
router.get("/settings", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM attendance_settings WHERE id = 'default_settings' LIMIT 1");
    if (rows.length > 0) {
      res.json({
        ...rows[0],
        half_day_late_minutes: rows[0].half_day_late_minutes !== undefined && rows[0].half_day_late_minutes !== null ? rows[0].half_day_late_minutes : 120
      });
    } else {
      res.json({ monthly_late_instances: 3, late_grace_minutes: 30, half_day_late_minutes: 120 });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. UPDATE ATTENDANCE SETTINGS (Admin only)
router.put("/settings", authMiddleware, async (req, res) => {
  try {
    const isSuper = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const isOwner = req.user.role?.name === "Company Owner";
    if (!isSuper && !isOwner) {
      return res.status(403).json({ error: "Only Admin can update attendance settings." });
    }

    const { monthly_late_instances, late_grace_minutes, half_day_late_minutes } = req.body;
    const instances = parseInt(monthly_late_instances) >= 0 ? parseInt(monthly_late_instances) : 3;
    const grace = parseInt(late_grace_minutes) >= 0 ? parseInt(late_grace_minutes) : 30;
    const halfDay = parseInt(half_day_late_minutes) >= 0 ? parseInt(half_day_late_minutes) : 120;

    await pool.query(
      `INSERT INTO attendance_settings (id, monthly_late_instances, late_grace_minutes, half_day_late_minutes)
       VALUES ('default_settings', ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         monthly_late_instances = VALUES(monthly_late_instances), 
         late_grace_minutes = VALUES(late_grace_minutes),
         half_day_late_minutes = VALUES(half_day_late_minutes)`,
      [instances, grace, halfDay]
    );

    res.json({ 
      message: "Attendance settings updated successfully", 
      settings: { monthly_late_instances: instances, late_grace_minutes: grace, half_day_late_minutes: halfDay } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 11. TIMING & INSTANCE MANAGER ENDPOINTS
// ==========================================

// GET DAILY STAFF ATTENDANCE TIMINGS & INSTANCES
router.get("/manager/daily", authMiddleware, checkPermission("time_instances_management", "read"), async (req, res) => {
  try {
    const targetDate = req.query.date || new Date().toISOString().slice(0, 10);
    const dateObj = new Date(targetDate + "T00:00:00");
    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayName = daysOfWeek[dateObj.getDay()];

    // Work schedule for the day
    const [schedRows] = await pool.query("SELECT * FROM work_schedules WHERE day_of_week = ? LIMIT 1", [dayName]);
    const schedule = schedRows[0] || { clock_in_time: "10:00", clock_out_time: "19:00", is_working_day: 1 };

    // Attendance settings
    const [settingRows] = await pool.query("SELECT * FROM attendance_settings WHERE id = 'default_settings' LIMIT 1");
    const attSettings = settingRows[0] || { monthly_late_instances: 3, late_grace_minutes: 30, half_day_late_minutes: 120 };

    // Active staff members
    const [staffList] = await pool.query(
      `SELECT s.id, s.name, s.email, COALESCE(r.name, s.role, 'Staff') as role, s.position, s.status 
       FROM staff s
       LEFT JOIN roles r ON s.role = r.id OR s.role = r.name
       WHERE s.status = 'Active' OR s.status IS NULL 
       ORDER BY s.name ASC`
    );

    // Attendance for targetDate
    const [attRows] = await pool.query("SELECT * FROM attendance WHERE date = ?", [targetDate]);

    // Month prefix for instance calculation
    const monthPrefix = targetDate.slice(0, 7);
    const [monthLateRows] = await pool.query(
      `SELECT user_id, user_email, 
              COUNT(*) as late_count, 
              COALESCE(SUM(first_half_deducted), 0) as half_days_deducted 
       FROM attendance 
       WHERE date LIKE ? 
         AND is_late_instance = 1 
         AND (waived_instance = 0 OR waived_instance IS NULL)
       GROUP BY user_id, user_email`,
      [`${monthPrefix}%`]
    );

    const lateStatsMap = {};
    for (const row of monthLateRows) {
      const key = row.user_id || row.user_email;
      if (key) {
        lateStatsMap[key] = {
          late_count: row.late_count || 0,
          half_days_deducted: row.half_days_deducted || 0
        };
      }
    }

    // Breaks for targetDate
    const [breakRows] = await pool.query(
      `SELECT user_id, SUM(duration_minutes) as total_break_mins 
       FROM break_logs 
       WHERE date = ? 
       GROUP BY user_id`,
      [targetDate]
    );
    const breakMap = {};
    for (const b of breakRows) {
      breakMap[b.user_id] = b.total_break_mins || 0;
    }

    let presentCount = 0;
    let onTimeCount = 0;
    let lateInstanceCount = 0;
    let directHalfDayCount = 0;
    let officialDutyCount = 0;
    let notClockedInCount = 0;

    const records = staffList.map(st => {
      const att = attRows.find(a => a.user_id === st.id || (a.user_email && a.user_email === st.email));
      const stats = lateStatsMap[st.id] || lateStatsMap[st.email] || { late_count: 0, half_days_deducted: 0 };
      const breakMins = breakMap[st.id] || 0;

      const monthlyLimit = attSettings.monthly_late_instances ?? 3;
      const usedInstances = stats.late_count;
      const remainingInstances = Math.max(0, monthlyLimit - usedInstances);

      let timingStatus = "Not Clocked In";
      if (att && att.clock_in) {
        if (att.is_official_duty === 1) {
          timingStatus = "Official Duty";
          officialDutyCount++;
          presentCount++;
        } else if (att.first_half_deducted === 1) {
          timingStatus = "Direct Half Day";
          directHalfDayCount++;
          presentCount++;
        } else if (att.is_late_instance === 1) {
          timingStatus = "Late Instance";
          lateInstanceCount++;
          presentCount++;
        } else {
          timingStatus = "On Time";
          onTimeCount++;
          presentCount++;
        }
      } else {
        notClockedInCount++;
      }

      return {
        staff_id: st.id,
        name: st.name,
        email: st.email,
        role: st.role || "Staff",
        designation: st.position || "",
        department: st.position || "",
        attendance: att ? {
          id: att.id,
          clock_in: att.clock_in,
          clock_out: att.clock_out,
          total_hours: att.total_hours,
          status: att.status,
          work_mode: att.work_mode || "Office",
          is_late_instance: att.is_late_instance || 0,
          late_minutes: att.late_minutes || 0,
          first_half_deducted: att.first_half_deducted || 0,
          is_official_duty: att.is_official_duty || 0,
          waived_instance: att.waived_instance || 0,
          notes: att.notes || "",
          adjustment_reason: att.adjustment_reason || "",
          manual_adjusted_by: att.manual_adjusted_by || ""
        } : null,
        timing_status: timingStatus,
        break_minutes: breakMins,
        monthly_instances: {
          used: usedInstances,
          limit: monthlyLimit,
          remaining: remainingInstances,
          half_days_deducted: stats.half_days_deducted
        }
      };
    });

    res.json({
      date: targetDate,
      day_name: dayName,
      schedule,
      settings: attSettings,
      summary: {
        total_staff: staffList.length,
        present_count: presentCount,
        on_time_count: onTimeCount,
        late_instance_count: lateInstanceCount,
        direct_half_day_count: directHalfDayCount,
        official_duty_count: officialDutyCount,
        not_clocked_in_count: notClockedInCount
      },
      records
    });
  } catch (err) {
    console.error("Manager daily error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ADJUST TIME & INSTANCE FOR AN EMPLOYEE
router.post("/manager/adjust-time", authMiddleware, checkPermission("time_instances_management", "update"), async (req, res) => {
  try {
    const {
      userId,
      userName,
      userEmail,
      date,
      clock_in,
      clock_out,
      status,
      work_mode,
      is_official_duty,
      waived_instance,
      adjustment_reason
    } = req.body;

    if (!userId || !date) {
      return res.status(400).json({ error: "userId and date are required" });
    }

    const adminName = req.user?.name || req.user?.email || "Admin";

    // Format clock_in and clock_out as local MySQL datetime string (YYYY-MM-DD HH:mm:ss)
    let finalClockIn = null;
    let inMs = null;
    if (clock_in) {
      if (clock_in.includes("T")) {
        const dObj = new Date(clock_in);
        const y = dObj.getFullYear();
        const m = String(dObj.getMonth() + 1).padStart(2, "0");
        const d = String(dObj.getDate()).padStart(2, "0");
        const hh = String(dObj.getHours()).padStart(2, "0");
        const mm = String(dObj.getMinutes()).padStart(2, "0");
        const ss = String(dObj.getSeconds()).padStart(2, "0");
        finalClockIn = `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
        inMs = dObj.getTime();
      } else if (clock_in.includes(":")) {
        const timePart = clock_in.length === 5 ? `${clock_in}:00` : clock_in.slice(0, 8);
        finalClockIn = `${date} ${timePart}`;
        inMs = new Date(`${date}T${timePart}`).getTime();
      }
    }

    let finalClockOut = null;
    let outMs = null;
    if (clock_out) {
      if (clock_out.includes("T")) {
        const dObj = new Date(clock_out);
        const y = dObj.getFullYear();
        const m = String(dObj.getMonth() + 1).padStart(2, "0");
        const d = String(dObj.getDate()).padStart(2, "0");
        const hh = String(dObj.getHours()).padStart(2, "0");
        const mm = String(dObj.getMinutes()).padStart(2, "0");
        const ss = String(dObj.getSeconds()).padStart(2, "0");
        finalClockOut = `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
        outMs = dObj.getTime();
      } else if (clock_out.includes(":")) {
        const timePart = clock_out.length === 5 ? `${clock_out}:00` : clock_out.slice(0, 8);
        finalClockOut = `${date} ${timePart}`;
        outMs = new Date(`${date}T${timePart}`).getTime();
      }
    }

    let totalHours = 0.00;
    if (inMs && outMs && outMs > inMs) {
      totalHours = Math.max(0, parseFloat(((outMs - inMs) / (1000 * 60 * 60)).toFixed(2)));
    } else {
      totalHours = 0.00;
    }

    const isOD = is_official_duty ? 1 : 0;
    const isWaived = waived_instance ? 1 : 0;
    const finalStatus = isOD || isWaived ? (status || "Present") : (status || "Present");
    const isLateInstance = isOD || isWaived ? 0 : 0;
    const firstHalfDeducted = isOD || isWaived ? 0 : (finalStatus === "Half Day" ? 1 : 0);

    const [existing] = await pool.query(
      "SELECT * FROM attendance WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ? LIMIT 1",
      [userId, userEmail, date]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE attendance 
         SET clock_in = ?, clock_out = ?, total_hours = ?, status = ?, work_mode = ?,
             is_official_duty = ?, waived_instance = ?, is_late_instance = ?, first_half_deducted = ?,
             manual_adjusted_by = ?, adjustment_reason = ?,
             notes = CONCAT(COALESCE(notes, ''), ?)
         WHERE id = ?`,
        [
          finalClockIn, finalClockOut, totalHours, finalStatus, work_mode || "Office",
          isOD, isWaived, isLateInstance, firstHalfDeducted,
          adminName, adjustment_reason || "",
          adjustment_reason ? ` [Adjusted by ${adminName}: ${adjustment_reason}]` : "",
          existing[0].id
        ]
      );
    } else {
      const attendanceId = `att_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      await pool.query(
        `INSERT INTO attendance 
         (id, user_id, user_name, user_email, date, clock_in, clock_out, total_hours, status, work_mode, 
          is_official_duty, waived_instance, is_late_instance, first_half_deducted, manual_adjusted_by, adjustment_reason, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          attendanceId, userId, userName || "Staff", userEmail || "", date, finalClockIn, finalClockOut, totalHours,
          finalStatus, work_mode || "Office", isOD, isWaived, isLateInstance, firstHalfDeducted,
          adminName, adjustment_reason || "", adjustment_reason ? `[Adjusted by ${adminName}: ${adjustment_reason}]` : ""
        ]
      );
    }

    res.json({ message: "Attendance timing & instance successfully updated!" });
  } catch (err) {
    console.error("Adjust time error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 1-CLICK WAIVE LATE INSTANCE / RESTORE BALANCE
router.post("/manager/waive-instance", authMiddleware, async (req, res) => {
  try {
    const { attendanceId, reason } = req.body;
    if (!attendanceId) return res.status(400).json({ error: "attendanceId is required" });

    const adminName = req.user?.name || req.user?.email || "Admin";
    const waiveNote = reason || "Waived by Admin with Sir's approval";

    await pool.query(
      `UPDATE attendance 
       SET waived_instance = 1, is_late_instance = 0, first_half_deducted = 0, status = 'Present',
           manual_adjusted_by = ?, adjustment_reason = ?,
           notes = CONCAT(COALESCE(notes, ''), ?)
       WHERE id = ?`,
      [adminName, waiveNote, ` [Instance Waived by ${adminName}: ${waiveNote}]`, attendanceId]
    );

    res.json({ message: "Late instance waived! Employee instance balance restored." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 1-CLICK TOGGLE OFFICIAL DUTY (OD)
router.post("/manager/official-duty", authMiddleware, async (req, res) => {
  try {
    const { attendanceId, isOfficialDuty, reason } = req.body;
    if (!attendanceId) return res.status(400).json({ error: "attendanceId is required" });

    const adminName = req.user?.name || req.user?.email || "Admin";
    const odVal = isOfficialDuty ? 1 : 0;
    const odNote = reason || (odVal ? "Marked as Official Duty (Company Work)" : "Official Duty removed");

    await pool.query(
      `UPDATE attendance 
       SET is_official_duty = ?,
           work_mode = IF(? = 1, 'On-site (Official Duty)', work_mode),
           first_half_deducted = IF(? = 1, 0, first_half_deducted),
           is_late_instance = IF(? = 1, 0, is_late_instance),
           status = IF(? = 1, 'Present', status),
           manual_adjusted_by = ?, adjustment_reason = ?,
           notes = CONCAT(COALESCE(notes, ''), ?)
       WHERE id = ?`,
      [odVal, odVal, odVal, odVal, odVal, adminName, odNote, ` [${odNote} by ${adminName}]`, attendanceId]
    );

    res.json({ message: odVal ? "Marked as Official Duty! Late penalties waived." : "Official Duty status removed." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// ATTENDANCE REGULARIZATION (PUNCH CORRECTION WORKFLOW)
// ══════════════════════════════════════════════════════════════════

// 1. SUBMIT REGULARIZATION REQUEST
router.post("/regularize", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userName = req.user.name || "Employee";
    const userEmail = req.user.email || "";
    const companyId = req.user.company_id || "default_company";

    const { target_date, requested_clock_in, requested_clock_out, reason } = req.body;

    if (!target_date) {
      return res.status(400).json({ error: "Plese enter target date", field: "target_date" });
    }
    if (!requested_clock_in) {
      return res.status(400).json({ error: "Plese enter clock in", field: "requested_clock_in" });
    }
    if (!requested_clock_out) {
      return res.status(400).json({ error: "Plese enter clock out", field: "requested_clock_out" });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Plese enter reason", field: "reason" });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (target_date > todayStr) {
      return res.status(400).json({ error: "Cannot request regularization for future dates." });
    }

    const reqInDate = new Date(requested_clock_in);
    const reqOutDate = new Date(requested_clock_out);
    if (isNaN(reqInDate.getTime()) || isNaN(reqOutDate.getTime()) || reqOutDate <= reqInDate) {
      return res.status(400).json({ error: "Requested clock-out must be after requested clock-in." });
    }

    // Check if there is already a pending request for this date
    const [existingPending] = await pool.query(
      `SELECT id FROM attendance_regularizations 
       WHERE (user_id = ? OR user_email = ?) AND target_date = ? AND status = 'Pending' LIMIT 1`,
      [userId, userEmail, target_date]
    );

    if (existingPending.length > 0) {
      return res.status(400).json({ error: "A regularization request for this date is already pending approval." });
    }

    // Check if attendance row exists for this date
    const [attRows] = await pool.query(
      `SELECT id, clock_in, clock_out FROM attendance 
       WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ? 
       ORDER BY only_admin_clock_out DESC LIMIT 1`,
      [userId, userEmail, target_date]
    );

    const attRec = attRows[0] || null;
    const regId = `reg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await pool.query(
      `INSERT INTO attendance_regularizations 
       (id, company_id, user_id, user_name, user_email, attendance_id, target_date, original_clock_in, original_clock_out, requested_clock_in, requested_clock_out, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        regId,
        companyId,
        userId,
        userName,
        userEmail,
        attRec?.id || null,
        target_date,
        attRec?.clock_in || null,
        attRec?.clock_out || null,
        reqInDate,
        reqOutDate,
        reason.trim()
      ]
    );

    // Universal Audit Log
    await logAudit({
      companyId,
      actorId: userId,
      actorName: userName,
      actorRole: req.user.role?.name || req.user.role || "Employee",
      module: "attendance",
      action: "regularize_requested",
      targetId: regId,
      targetName: `Regularization for ${target_date}`,
      details: { target_date, requested_clock_in, requested_clock_out, reason: reason.trim() },
      ipAddress: req.ip
    });

    const [createdRows] = await pool.query("SELECT * FROM attendance_regularizations WHERE id = ?", [regId]);
    const createdReg = createdRows[0];

    // Real-time broadcast
    const io = req.app.get("io");
    if (io) {
      io.emit("regularizationCreated", createdReg);
    }

    res.status(201).json({
      message: "Attendance regularization request submitted successfully!",
      regularization: createdReg
    });
  } catch (err) {
    console.error("Regularization error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. GET REGULARIZATIONS / PUNCH TRACKING (Scoped by role: Staff sees own, Manager/Admin sees company)
router.get("/regularizations", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userEmail = req.user.email || "";
    const isSuper = isUserSuperAdmin(req);
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    const { status, target_date, startDate, endDate, employee, userId: filterUser, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    await autoClosePastUnclosedAttendance(null, null, getISTToday());

    let whereClause = "WHERE (s.status = 'Active' OR s.status IS NULL)";
    const params = [];

    if (!isSuper && !isManager) {
      // Regular staff only sees their own
      whereClause += " AND (a.user_id = ? OR (a.user_email = ? AND a.user_email != ''))";
      params.push(userId, userEmail);
    } else {
      if (employee || filterUser) {
        const empVal = employee || filterUser;
        whereClause += " AND (a.user_id = ? OR a.user_email = ?)";
        params.push(empVal, empVal);
      }
    }

    const start = startDate;
    const end = endDate;

    if (start && end) {
      whereClause += " AND a.date BETWEEN ? AND ?";
      params.push(start, end);
    } else if (start) {
      whereClause += " AND a.date >= ?";
      params.push(start);
    } else if (end) {
      whereClause += " AND a.date <= ?";
      params.push(end);
    } else if (target_date) {
      whereClause += " AND a.date = ?";
      params.push(target_date);
    } else {
      // By default, do not show future records (e.g. upcoming leaves) in punch records
      whereClause += " AND a.date <= ?";
      params.push(getISTToday());
    }

    // Status filter: "Not Punch Out", "Punch In", "Punch Out", "Present", "On Leave", "Absent", "Half Day"
    if (status && status !== "All") {
      if (status === "Not Punch Out") {
        whereClause += " AND a.clock_in IS NOT NULL AND (a.clock_out IS NULL OR a.status = 'Not Punch Out')";
      } else if (status === "Punch Out") {
        whereClause += " AND a.clock_out IS NOT NULL AND a.status != 'Not Punch Out'";
      } else if (status === "Punch In") {
        whereClause += " AND a.clock_in IS NOT NULL";
      } else {
        whereClause += " AND a.status = ?";
        params.push(status);
      }
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.user_id, a.user_name, a.user_email, a.date, a.clock_in, a.clock_out, a.total_hours, a.status,
              a.work_mode, a.notes, a.created_at, a.updated_at,
              CASE 
                WHEN a.clock_in IS NOT NULL AND (a.clock_out IS NULL OR a.status = 'Not Punch Out') THEN 'Not Punch Out'
                WHEN a.clock_in IS NOT NULL AND a.clock_out IS NOT NULL THEN 'Punch Out'
                ELSE COALESCE(a.status, 'Absent')
              END AS punch_status
       FROM attendance a
       LEFT JOIN staff s ON a.user_id = s.id OR (a.user_email = s.email AND a.user_email != '')
       ${whereClause} 
       ORDER BY a.date DESC, a.clock_in DESC 
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total 
       FROM attendance a
       LEFT JOIN staff s ON a.user_id = s.id OR (a.user_email = s.email AND a.user_email != '')
       ${whereClause}`,
      params
    );

    // Compute stats for overview cards
    let statsWhere = "WHERE (s.status = 'Active' OR s.status IS NULL)";
    const statsParams = [];
    if (!isSuper && !isManager) {
      statsWhere += " AND (a.user_id = ? OR (a.user_email = ? AND a.user_email != ''))";
      statsParams.push(userId, userEmail);
    } else if (employee || filterUser) {
      const empVal = employee || filterUser;
      statsWhere += " AND (a.user_id = ? OR a.user_email = ?)";
      statsParams.push(empVal, empVal);
    }
    if (start && end) {
      statsWhere += " AND a.date BETWEEN ? AND ?";
      statsParams.push(start, end);
    } else if (start) {
      statsWhere += " AND a.date >= ?";
      statsParams.push(start);
    } else if (end) {
      statsWhere += " AND a.date <= ?";
      statsParams.push(end);
    }

    const [statsRows] = await pool.query(
      `SELECT 
         COUNT(*) as total_records,
         SUM(CASE WHEN a.clock_in IS NOT NULL AND (a.clock_out IS NULL OR a.status = 'Not Punch Out') THEN 1 ELSE 0 END) as not_punch_out,
         SUM(CASE WHEN a.clock_in IS NOT NULL AND a.clock_out IS NOT NULL AND a.status != 'Not Punch Out' THEN 1 ELSE 0 END) as completed_punch,
         SUM(CASE WHEN a.clock_in IS NOT NULL THEN 1 ELSE 0 END) as punched_in
       FROM attendance a
       LEFT JOIN staff s ON a.user_id = s.id OR (a.user_email = s.email AND a.user_email != '')
       ${statsWhere}`,
      statsParams
    );

    res.json({
      regularizations: rows,
      total: countRows[0]?.total || 0,
      stats: statsRows[0] || { total_records: 0, not_punch_out: 0, completed_punch: 0, punched_in: 0 },
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. APPROVE REGULARIZATION REQUEST (Admin / Manager)
router.post("/regularize/:id/approve", authMiddleware, async (req, res) => {
  try {
    const approverId = req.user._id ? req.user._id.toString() : req.user.id;
    const approverName = req.user.name || "Manager";
    const approverRole = req.user.role?.name || req.user.role || "Manager";
    const isSuper = isUserSuperAdmin(req);
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    if (!isSuper && !isManager) {
      return res.status(403).json({ error: "Access Denied: Only Manager or Admin can approve regularizations." });
    }

    const { id } = req.params;
    const { comment } = req.body;

    const [rows] = await pool.query("SELECT * FROM attendance_regularizations WHERE id = ?", [id]);
    if (!rows.length) {
      return res.status(404).json({ error: "Regularization request not found." });
    }

    const reg = rows[0];

    // Prevent self-approval unless Super Admin
    if (!isSuper && (reg.user_id === approverId || reg.user_email === req.user.email)) {
      return res.status(403).json({ error: "You cannot approve your own regularization request." });
    }

    if (reg.status !== "Pending") {
      return res.status(400).json({ error: `Request has already been ${reg.status}.` });
    }

    // 1. Update regularization status
    await pool.query(
      `UPDATE attendance_regularizations 
       SET status = 'Approved', approver_id = ?, approver_name = ?, approver_comment = ?, updated_at = NOW() 
       WHERE id = ?`,
      [approverId, approverName, comment || "Approved by Manager", id]
    );

    // 2. Calculate hours between requested clock in and clock out
    const reqIn = new Date(reg.requested_clock_in);
    const reqOut = new Date(reg.requested_clock_out);
    const totalHours = Math.max(0.5, ((reqOut - reqIn) / (1000 * 60 * 60))).toFixed(2);
    const targetDateStr = new Date(reg.target_date).toISOString().slice(0, 10);

    // 3. Check if attendance row exists for (user_id/email, target_date)
    const [attRows] = await pool.query(
      `SELECT * FROM attendance 
       WHERE (id = ? OR ((user_id = ? OR (user_email = ? AND user_email != '')) AND date = ?))
       ORDER BY only_admin_clock_out DESC LIMIT 1`,
      [reg.attendance_id || "", reg.user_id, reg.user_email, targetDateStr]
    );

    const notesAppend = ` [Punch regularized to ${reqIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${reqOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by ${approverName}]`;

    if (attRows.length > 0) {
      await pool.query(
        `UPDATE attendance 
         SET clock_in = ?, clock_out = ?, total_hours = ?, status = 'Present',
             is_regularized = 1, missed_clock_out = 0, auto_clock_out = 0,
             notes = CONCAT(COALESCE(notes, ''), ?)
         WHERE id = ?`,
        [reqIn, reqOut, totalHours, notesAppend, attRows[0].id]
      );
    } else {
      const newAttId = `att_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      await pool.query(
        `INSERT INTO attendance 
         (id, user_id, user_name, user_email, date, clock_in, clock_out, total_hours, status, is_regularized, missed_clock_out, auto_clock_out, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Present', 1, 0, 0, ?)`,
        [newAttId, reg.user_id, reg.user_name, reg.user_email, targetDateStr, reqIn, reqOut, totalHours, notesAppend]
      );
    }

    // 4. Log Universal Audit
    await logAudit({
      companyId: reg.company_id,
      actorId: approverId,
      actorName: approverName,
      actorRole: approverRole,
      module: "attendance",
      action: "regularize_approved",
      targetId: id,
      targetName: `Approved punch correction for ${reg.user_name} on ${targetDateStr}`,
      details: { comment, totalHours, requested_clock_in: reg.requested_clock_in, requested_clock_out: reg.requested_clock_out },
      ipAddress: req.ip
    });

    // Real-time broadcast
    const io = req.app.get("io");
    if (io) {
      io.emit("regularizationUpdated", { id, status: "Approved", approverName });
      io.emit("attendanceUpdated");
    }

    res.json({ message: "Regularization request approved and attendance record updated to Present!" });
  } catch (err) {
    console.error("Approve regularization error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. REJECT REGULARIZATION REQUEST (Admin / Manager)
router.post("/regularize/:id/reject", authMiddleware, async (req, res) => {
  try {
    const approverId = req.user._id ? req.user._id.toString() : req.user.id;
    const approverName = req.user.name || "Manager";
    const approverRole = req.user.role?.name || req.user.role || "Manager";
    const isSuper = isUserSuperAdmin(req);
    const isManager = req.user.position?.includes("Manager") || req.user.role?.name?.includes("Manager");

    if (!isSuper && !isManager) {
      return res.status(403).json({ error: "Access Denied: Only Manager or Admin can reject regularizations." });
    }

    const { id } = req.params;
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: "A rejection reason / comment is required." });
    }

    const [rows] = await pool.query("SELECT * FROM attendance_regularizations WHERE id = ?", [id]);
    if (!rows.length) {
      return res.status(404).json({ error: "Regularization request not found." });
    }

    const reg = rows[0];

    if (!isSuper && (reg.user_id === approverId || reg.user_email === req.user.email)) {
      return res.status(403).json({ error: "You cannot review your own regularization request." });
    }

    if (reg.status !== "Pending") {
      return res.status(400).json({ error: `Request has already been ${reg.status}.` });
    }

    await pool.query(
      `UPDATE attendance_regularizations 
       SET status = 'Rejected', approver_id = ?, approver_name = ?, approver_comment = ?, updated_at = NOW() 
       WHERE id = ?`,
      [approverId, approverName, comment.trim(), id]
    );

    // Universal Audit Log
    await logAudit({
      companyId: reg.company_id,
      actorId: approverId,
      actorName: approverName,
      actorRole: approverRole,
      module: "attendance",
      action: "regularize_rejected",
      targetId: id,
      targetName: `Rejected punch correction for ${reg.user_name}`,
      details: { comment: comment.trim(), target_date: reg.target_date },
      ipAddress: req.ip
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("regularizationUpdated", { id, status: "Rejected", approverName, comment: comment.trim() });
    }

    res.json({ message: "Regularization request rejected." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// FORGOT PUNCH OUT (System auto clock-out -> employee request -> admin approval)
// ══════════════════════════════════════════════════════════════════

// Helper: "YYYY-MM-DD HH:mm:ss" (dateStrings) -> Date in server local time
const parseDbDateTime = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  return new Date(String(val).replace(" ", "T"));
};

// 1. GET MY "NOT PUNCH OUT" DAYS (Employee dashboard alert + request form)
router.get("/forgot-punch-out/mine", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userEmail = req.user.email || "";
    const today = getISTToday();

    await autoClosePastUnclosedAttendance(userId, userEmail, today);

    const [records] = await pool.query(
      `SELECT id, user_id, user_name, user_email, date, clock_in, clock_out, total_hours, status
       FROM attendance
       WHERE (user_id = ? OR (user_email = ? AND user_email != ''))
         AND status = 'Not Punch Out'
       ORDER BY date DESC`,
      [userId, userEmail]
    );

    const [requests] = await pool.query(
      `SELECT * FROM forgot_punch_out_requests
       WHERE (user_id = ? OR (user_email = ? AND user_email != ''))
       ORDER BY created_at DESC`,
      [userId, userEmail]
    );

    // Attach latest request (if any) to each Not Punch Out day
    const data = records.map(r => ({
      ...r,
      request: requests.find(q => q.attendance_id === r.id) || null
    }));

    res.json({ records: data, requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. SUBMIT FORGOT PUNCH OUT REQUEST (Employee)
router.post("/forgot-punch-out", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userName = req.user.name || "Employee";
    const userEmail = req.user.email || "";
    const companyId = req.user.company_id || "default_company";
    const { attendance_id, clock_out_time, reason } = req.body;

    if (!attendance_id) {
      return res.status(400).json({ error: "Attendance record is required", field: "attendance_id" });
    }
    if (!clock_out_time || !/^\d{2}:\d{2}$/.test(clock_out_time)) {
      return res.status(400).json({ error: "Plese enter clock out time", field: "clock_out_time" });
    }

    const [attRows] = await pool.query(
      `SELECT * FROM attendance WHERE id = ? AND (user_id = ? OR (user_email = ? AND user_email != '')) LIMIT 1`,
      [attendance_id, userId, userEmail]
    );
    if (!attRows.length) {
      return res.status(404).json({ error: "Attendance record not found." });
    }
    const att = attRows[0];
    if (att.status !== "Not Punch Out") {
      return res.status(400).json({ error: "This day is not marked as Not Punch Out." });
    }

    const dateStr = String(att.date).slice(0, 10);
    const requestedOut = `${dateStr} ${clock_out_time}:00`;
    const clockIn = parseDbDateTime(att.clock_in);
    if (clockIn && parseDbDateTime(requestedOut) <= clockIn) {
      return res.status(400).json({ error: "Clock out time must be after your clock in time.", field: "clock_out_time" });
    }

    const [existing] = await pool.query(
      "SELECT id, status FROM forgot_punch_out_requests WHERE attendance_id = ? AND status IN ('Pending', 'Approved') LIMIT 1",
      [attendance_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: `A request for this date is already ${existing[0].status}.` });
    }

    const reqId = `fpo_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await pool.query(
      `INSERT INTO forgot_punch_out_requests
       (id, company_id, attendance_id, user_id, user_name, user_email, target_date, clock_in, requested_clock_out, reason, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [reqId, companyId, attendance_id, userId, userName, userEmail, dateStr, att.clock_in, requestedOut, (reason || "").trim() || null]
    );

    await logAudit({
      companyId,
      actorId: userId,
      actorName: userName,
      actorRole: req.user.role?.name || req.user.role || "Employee",
      module: "attendance",
      action: "forgot_punch_out_requested",
      targetId: reqId,
      targetName: `Forgot Punch Out for ${dateStr}`,
      details: { attendance_id, requested_clock_out: requestedOut, reason },
      ipAddress: req.ip
    });

    const [created] = await pool.query("SELECT * FROM forgot_punch_out_requests WHERE id = ?", [reqId]);
    const io = req.app.get("io");
    if (io) io.emit("forgotPunchOutCreated", created[0]);

    res.status(201).json({ message: "Forgot Punch Out request submitted for approval!", request: created[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. LIST FORGOT PUNCH OUT REQUESTS (Admin sees all, staff sees own)
router.get("/forgot-punch-out/requests", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const userEmail = req.user.email || "";
    const { status } = req.query;

    let query = "SELECT * FROM forgot_punch_out_requests WHERE 1=1";
    const params = [];
    if (!isUserSuperAdmin(req)) {
      query += " AND (user_id = ? OR (user_email = ? AND user_email != ''))";
      params.push(userId, userEmail);
    }
    if (status && status !== "All") {
      query += " AND status = ?";
      params.push(status);
    }
    query += " ORDER BY FIELD(status, 'Pending') DESC, created_at DESC";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: load a request the current user may modify (owner while Pending, Admin always)
const getEditableForgotPunchOut = async (req, res) => {
  const userId = req.user._id ? req.user._id.toString() : req.user.id;
  const userEmail = req.user.email || "";
  const isAdmin = isUserSuperAdmin(req);

  const [rows] = await pool.query("SELECT * FROM forgot_punch_out_requests WHERE id = ?", [req.params.id]);
  if (!rows.length) {
    res.status(404).json({ error: "Request not found." });
    return null;
  }
  const fpo = rows[0];
  const isOwner = fpo.user_id === userId || (userEmail && fpo.user_email === userEmail);
  if (!isAdmin && !isOwner) {
    res.status(403).json({ error: "Access Denied." });
    return null;
  }
  if (!isAdmin && fpo.status !== "Pending") {
    res.status(400).json({ error: `Request has already been ${fpo.status} and can no longer be changed.` });
    return null;
  }
  return fpo;
};

// 3b. EDIT FORGOT PUNCH OUT REQUEST (Owner while Pending, Admin any)
router.put("/forgot-punch-out/:id", authMiddleware, async (req, res) => {
  try {
    const fpo = await getEditableForgotPunchOut(req, res);
    if (!fpo) return;
    const { clock_out_time, reason } = req.body;

    if (!clock_out_time || !/^\d{2}:\d{2}$/.test(clock_out_time)) {
      return res.status(400).json({ error: "Plese enter clock out time", field: "clock_out_time" });
    }
    const dateStr = String(fpo.target_date).slice(0, 10);
    const requestedOut = `${dateStr} ${clock_out_time}:00`;
    const clockIn = parseDbDateTime(fpo.clock_in);
    const clockOut = parseDbDateTime(requestedOut);
    if (clockIn && clockOut <= clockIn) {
      return res.status(400).json({ error: "Clock out time must be after clock in time.", field: "clock_out_time" });
    }

    await pool.query(
      "UPDATE forgot_punch_out_requests SET requested_clock_out = ?, reason = ? WHERE id = ?",
      [requestedOut, (reason || "").trim() || null, fpo.id]
    );

    // Already approved -> keep the attendance record in sync
    if (fpo.status === "Approved") {
      const totalHours = clockIn ? Math.max(0, (clockOut - clockIn) / (1000 * 60 * 60)).toFixed(2) : 0;
      await pool.query(
        "UPDATE attendance SET clock_out = ?, total_hours = ? WHERE id = ?",
        [requestedOut, totalHours, fpo.attendance_id]
      );
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("forgotPunchOutUpdated", { id: fpo.id, status: fpo.status });
      if (fpo.status === "Approved") io.emit("attendanceUpdated");
    }

    res.json({ message: "Forgot Punch Out request updated." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3c. DELETE FORGOT PUNCH OUT REQUEST (Owner while Pending, Admin any)
router.delete("/forgot-punch-out/:id", authMiddleware, async (req, res) => {
  try {
    const fpo = await getEditableForgotPunchOut(req, res);
    if (!fpo) return;

    // Deleting an approved request reverts the day to the system auto clock-out
    if (fpo.status === "Approved") {
      const dateStr = String(fpo.target_date).slice(0, 10);
      const autoOut = `${dateStr} 23:00:00`;
      const clockIn = parseDbDateTime(fpo.clock_in);
      const totalHours = clockIn ? Math.max(0, (parseDbDateTime(autoOut) - clockIn) / (1000 * 60 * 60)).toFixed(2) : 0;
      await pool.query(
        `UPDATE attendance
         SET clock_out = ?, total_hours = ?, status = 'Not Punch Out', auto_clock_out = 1, is_regularized = 0,
             notes = CONCAT(COALESCE(notes, ''), ' [Forgot Punch Out approval removed - reverted to Not Punch Out]')
         WHERE id = ?`,
        [autoOut, totalHours, fpo.attendance_id]
      );
    }

    await pool.query("DELETE FROM forgot_punch_out_requests WHERE id = ?", [fpo.id]);

    await logAudit({
      companyId: fpo.company_id,
      actorId: req.user._id ? req.user._id.toString() : req.user.id,
      actorName: req.user.name || "User",
      actorRole: req.user.role?.name || req.user.role || "Employee",
      module: "attendance",
      action: "forgot_punch_out_deleted",
      targetId: fpo.id,
      targetName: `Deleted Forgot Punch Out for ${fpo.user_name} on ${String(fpo.target_date).slice(0, 10)}`,
      details: { previous_status: fpo.status },
      ipAddress: req.ip
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("forgotPunchOutUpdated", { id: fpo.id, status: "Deleted" });
      if (fpo.status === "Approved") io.emit("attendanceUpdated");
    }

    res.json({ message: "Forgot Punch Out request deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. APPROVE FORGOT PUNCH OUT (Super Admin) -> attendance becomes Present with the requested clock out
router.post("/forgot-punch-out/:id/approve", authMiddleware, async (req, res) => {
  try {
    if (!isUserSuperAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can approve Forgot Punch Out requests." });
    }
    const approverId = req.user._id ? req.user._id.toString() : req.user.id;
    const approverName = req.user.name || "Admin";
    const { comment } = req.body;

    const [rows] = await pool.query("SELECT * FROM forgot_punch_out_requests WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Request not found." });
    const fpo = rows[0];
    if (fpo.status !== "Pending") {
      return res.status(400).json({ error: `Request has already been ${fpo.status}.` });
    }

    const [attRows] = await pool.query("SELECT * FROM attendance WHERE id = ?", [fpo.attendance_id]);
    if (!attRows.length) return res.status(404).json({ error: "Attendance record not found." });
    const att = attRows[0];

    const clockIn = parseDbDateTime(att.clock_in);
    const clockOut = parseDbDateTime(fpo.requested_clock_out);
    const totalHours = clockIn ? Math.max(0, (clockOut - clockIn) / (1000 * 60 * 60)).toFixed(2) : 0;
    const outLabel = clockOut.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

    await pool.query(
      `UPDATE attendance
       SET clock_out = ?, total_hours = ?, status = 'Present',
           auto_clock_out = 0, missed_clock_out = 0, is_regularized = 1,
           notes = CONCAT(COALESCE(notes, ''), ?)
       WHERE id = ?`,
      [fpo.requested_clock_out, totalHours, ` [Forgot Punch Out approved by ${approverName}: clock out ${outLabel}]`, att.id]
    );

    await pool.query(
      `UPDATE forgot_punch_out_requests
       SET status = 'Approved', approver_id = ?, approver_name = ?, approver_comment = ?
       WHERE id = ?`,
      [approverId, approverName, comment || "Approved", fpo.id]
    );

    await logAudit({
      companyId: fpo.company_id,
      actorId: approverId,
      actorName: approverName,
      actorRole: req.user.role?.name || req.user.role || "Admin",
      module: "attendance",
      action: "forgot_punch_out_approved",
      targetId: fpo.id,
      targetName: `Approved Forgot Punch Out for ${fpo.user_name} on ${String(fpo.target_date).slice(0, 10)}`,
      details: { requested_clock_out: fpo.requested_clock_out, totalHours, comment },
      ipAddress: req.ip
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("forgotPunchOutUpdated", { id: fpo.id, status: "Approved" });
      io.emit("attendanceUpdated");
    }

    res.json({ message: "Forgot Punch Out approved. Attendance marked as Present." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. REJECT FORGOT PUNCH OUT (Super Admin) -> attendance stays 'Not Punch Out'
router.post("/forgot-punch-out/:id/reject", authMiddleware, async (req, res) => {
  try {
    if (!isUserSuperAdmin(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can reject Forgot Punch Out requests." });
    }
    const approverId = req.user._id ? req.user._id.toString() : req.user.id;
    const approverName = req.user.name || "Admin";
    const { comment } = req.body;

    const [rows] = await pool.query("SELECT * FROM forgot_punch_out_requests WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Request not found." });
    const fpo = rows[0];
    if (fpo.status !== "Pending") {
      return res.status(400).json({ error: `Request has already been ${fpo.status}.` });
    }

    await pool.query(
      `UPDATE forgot_punch_out_requests
       SET status = 'Rejected', approver_id = ?, approver_name = ?, approver_comment = ?
       WHERE id = ?`,
      [approverId, approverName, (comment || "").trim() || "Rejected", fpo.id]
    );

    await logAudit({
      companyId: fpo.company_id,
      actorId: approverId,
      actorName: approverName,
      actorRole: req.user.role?.name || req.user.role || "Admin",
      module: "attendance",
      action: "forgot_punch_out_rejected",
      targetId: fpo.id,
      targetName: `Rejected Forgot Punch Out for ${fpo.user_name}`,
      details: { comment },
      ipAddress: req.ip
    });

    const io = req.app.get("io");
    if (io) io.emit("forgotPunchOutUpdated", { id: fpo.id, status: "Rejected" });

    res.json({ message: "Forgot Punch Out request rejected. Day remains Not Punch Out." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

