// Decimal hours -> "7 h 30 min" (7.5), "8 h" (8), "45 min" (0.75), "-1 h 30 min" (-1.5)
export const formatDuration = (hours) => {
  const totalMins = Math.round(Math.abs(Number(hours) || 0) * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const sign = Number(hours) < 0 && totalMins > 0 ? "-" : "";

  if (h === 0) return `${sign}${m} min`;
  if (m === 0) return `${sign}${h} h`;
  return `${sign}${h} h ${m} min`;
};
