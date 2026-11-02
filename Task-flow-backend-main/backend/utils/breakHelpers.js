const { pool } = require("../config/mysqlDb");

// Helper: Format a DATE column value as YYYY-MM-DD
const toDateStr = (d) => (d instanceof Date ? new Intl.DateTimeFormat("en-CA").format(d) : String(d).slice(0, 10));

// Helper: Close breaks left running from previous days (e.g. employee clocked out while on break).
// Each is ended at that day's clock-out, or at its own start time if there is no clock-out, so no
// overnight time is ever counted as break.
const closeStaleBreaks = async (userId, userEmail, today) => {
  const [stale] = await pool.query(
    "SELECT * FROM break_logs WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND end_time IS NULL AND date < ?",
    [userId, userEmail || "", today]
  );

  for (const b of stale) {
    const [att] = await pool.query(
      "SELECT clock_out FROM attendance WHERE (user_id = ? OR (user_email = ? AND user_email != '')) AND date = ? AND clock_out IS NOT NULL LIMIT 1",
      [userId, userEmail || "", toDateStr(b.date)]
    );
    const start = new Date(b.start_time);
    const clockOut = att[0]?.clock_out ? new Date(att[0].clock_out) : null;
    const end = clockOut && clockOut > start ? clockOut : start;
    const dur = Math.max(0, Math.round((end - start) / 60000));

    await pool.query(
      "UPDATE break_logs SET end_time = ?, duration_minutes = ?, status = 'Completed' WHERE id = ?",
      [end, dur, b.id]
    );
  }
};

module.exports = { toDateStr, closeStaleBreaks };
