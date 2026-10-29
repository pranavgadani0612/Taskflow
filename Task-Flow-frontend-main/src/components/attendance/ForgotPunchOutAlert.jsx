import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../api/api";

// Dashboard banner: lists days the system auto clocked the user out (status "Not Punch Out")
// that still need a Forgot Punch Out request. Clicking opens the request form in Attendance.
export default function ForgotPunchOutAlert() {
  const navigate = useNavigate();
  const [days, setDays] = useState([]);

  useEffect(() => {
    API.get("/attendance/forgot-punch-out/mine")
      .then((res) => {
        const records = res.data?.records || [];
        setDays(records.filter((r) => !r.request || r.request.status === "Rejected"));
      })
      .catch(() => setDays([]));
  }, []);

  if (days.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
      {days.map((d) => {
        const dateLabel = new Date(`${String(d.date).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, {
          weekday: "short", month: "short", day: "numeric", year: "numeric"
        });
        return (
          <div
            key={d.id}
            onClick={() => navigate(`/attendance?tab=forgot-punch-out&att=${d.id}`)}
            style={{
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid #ef4444",
              borderRadius: "16px",
              padding: "14px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
              cursor: "pointer"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "36px", height: "36px", borderRadius: "10px", background: "rgba(239, 68, 68, 0.15)", color: "#dc2626" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
              <div>
                <strong style={{ color: "#dc2626", fontSize: "14px", display: "block" }}>
                  You did not clock out on {dateLabel}
                </strong>
                <span style={{ color: "var(--text-main, #1e293b)", fontSize: "13px" }}>
                  {d.request?.status === "Rejected"
                    ? "Your Forgot Punch Out request was rejected. Submit again with the correct clock out time."
                    : "The system clocked you out at 11:00 PM. Submit your actual clock out time for approval."}
                </span>
              </div>
            </div>
            <button
              type="button"
              style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 16px", fontWeight: "600", fontSize: "13px", cursor: "pointer" }}
            >
              Forgot Punch Out
            </button>
          </div>
        );
      })}
    </div>
  );
}
