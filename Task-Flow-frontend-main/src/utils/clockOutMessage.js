import { formatDuration } from "./formatDuration";

// Formats minutes as "1 h 20 min" / "45 min"
export const formatMinutes = (totalMins) => formatDuration(Math.max(0, Math.round(totalMins || 0)) / 60);

// Builds the clock-out confirmation message from the /attendance/today response.
// Returns null when the shift (plus any extra break time) is already complete.
export const buildEarlyClockOutMessage = (todayData) => {
  const remaining = todayData?.remainingShiftMinutes || 0;
  if (remaining <= 0) return null;

  const schedule = todayData?.schedule || {};
  const excessBreak = schedule.excessBreakMinutes || 0;
  const shiftStr = formatMinutes(schedule.standardShiftMinutes || 540);

  let msg = `Your company working hours (${shiftStr}) are not complete yet. You still have ${formatMinutes(remaining)} remaining.`;
  if (excessBreak > 0) {
    const totalBreak = schedule.totalBreakMinutes || 0;
    const allowedBreak = Math.max(0, totalBreak - excessBreak);
    msg += ` This includes ${formatMinutes(excessBreak)} of extra break time (you took ${formatMinutes(totalBreak)} of break, allowed is ${formatMinutes(allowedBreak)}).`;
  }

  // Same rule as the backend: first half not complete -> Absent, otherwise Half Day
  const firstHalf = schedule.firstHalfMinutes || Math.round((schedule.standardShiftMinutes || 540) / 2);
  const worked = Math.max(0, (todayData?.elapsedWorkingMinutes || 0) - excessBreak);
  if (worked < firstHalf) {
    msg += ` Your first half (${formatMinutes(firstHalf)}) is not complete, so if you Clock Out now today will be marked as Absent (full day leave).`;
  } else {
    msg += " If you Clock Out now, today will be marked as Half Day.";
  }
  msg += " Do you still want to Clock Out?";
  return msg;
};
