import React, { useState, useEffect } from "react";
import API from "../../api/api";
import { useToast } from "../../contexts/ToastContext";
import { IconGift, IconStar } from "./Icons";

export default function CelebrationsWidget() {
  const [data, setData] = useState({
    todayBirthdays: [],
    upcomingBirthdays: [],
    todayAnniversaries: [],
    upcomingAnniversaries: []
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("today"); // "today" | "upcoming"
  const { showToast } = useToast();

  useEffect(() => {
    const fetchCelebrations = async () => {
      try {
        setLoading(true);
        const res = await API.get("/staff/celebrations");
        setData(res.data || {});
      } catch (err) {
        console.error("Failed to fetch celebrations:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCelebrations();
  }, []);

  const totalToday = (data.todayBirthdays?.length || 0) + (data.todayAnniversaries?.length || 0);
  const totalUpcoming = (data.upcomingBirthdays?.length || 0) + (data.upcomingAnniversaries?.length || 0);

  const handleWish = (name, type) => {
    showToast(`Wished ${name} a wonderful ${type}!`, "success");
  };

  return (
    <div style={{
      background: "var(--ui-surface, #ffffff)",
      borderRadius: "16px",
      border: "1px solid var(--ui-border, #e2e8f0)",
      padding: "20px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      height: "100%"
    }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            background: "linear-gradient(135deg, #f59e0b, #ec4899)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff"
          }}>
            <IconGift size={20} color="#fff" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "700", color: "var(--text-main, #0f172a)" }}>
              Team Celebrations
            </h3>
            <span style={{ fontSize: "12px", color: "var(--text-muted, #64748b)" }}>
              Birthdays & Work Milestones
            </span>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", background: "var(--ui-bg, #f1f5f9)", borderRadius: "8px", padding: "3px" }}>
          <button
            onClick={() => setActiveTab("today")}
            style={{
              padding: "4px 12px",
              borderRadius: "6px",
              border: "none",
              background: activeTab === "today" ? "var(--ui-surface, #fff)" : "transparent",
              color: activeTab === "today" ? "#4f46e5" : "var(--text-muted, #64748b)",
              fontWeight: "700",
              fontSize: "11px",
              cursor: "pointer",
              boxShadow: activeTab === "today" ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
            }}
          >
            Today ({totalToday})
          </button>
          <button
            onClick={() => setActiveTab("upcoming")}
            style={{
              padding: "4px 12px",
              borderRadius: "6px",
              border: "none",
              background: activeTab === "upcoming" ? "var(--ui-surface, #fff)" : "transparent",
              color: activeTab === "upcoming" ? "#4f46e5" : "var(--text-muted, #64748b)",
              fontWeight: "700",
              fontSize: "11px",
              cursor: "pointer",
              boxShadow: activeTab === "upcoming" ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
            }}
          >
            Next 14 Days ({totalUpcoming})
          </button>
        </div>
      </div>

      {/* CONTENT BODY */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: "180px", maxHeight: "260px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "30px", color: "var(--text-muted, #94a3b8)", fontSize: "13px" }}>
            Loading celebrations...
          </div>
        ) : activeTab === "today" ? (
          totalToday === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "var(--text-muted, #94a3b8)" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "6px" }}>
                <IconGift size={30} color="#f59e0b" />
              </div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main, #334155)" }}>No celebrations today</div>
              <div style={{ fontSize: "11px", marginTop: "2px" }}>Check the upcoming tab to see milestones this month!</div>
            </div>
          ) : (
            <>
              {/* Today's Birthdays */}
              {data.todayBirthdays?.map((b) => (
                <div
                  key={`b_${b.id}`}
                  style={{
                    background: "linear-gradient(135deg, rgba(236, 72, 153, 0.08), rgba(245, 158, 11, 0.08))",
                    border: "1px solid rgba(236, 72, 153, 0.25)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "50%",
                      background: "#ec4899",
                      color: "#fff",
                      fontWeight: "700",
                      fontSize: "14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid #fbcfe8"
                    }}>
                      {b.name?.charAt(0) || "U"}
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-main, #0f172a)" }}>
                        {b.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "#ec4899", fontWeight: "600" }}>
                        Birthday Today! • {b.department}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleWish(b.name, "Birthday")}
                    style={{
                      background: "linear-gradient(135deg, #ec4899, #f43f5e)",
                      color: "#fff",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      fontSize: "11px",
                      fontWeight: "700",
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(236, 72, 153, 0.3)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <IconGift size={12} color="#fff" /> Wish
                  </button>
                </div>
              ))}

              {/* Today's Anniversaries */}
              {data.todayAnniversaries?.map((a) => (
                <div
                  key={`a_${a.id}`}
                  style={{
                    background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(34, 197, 94, 0.08))",
                    border: "1px solid rgba(99, 102, 241, 0.25)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "38px",
                      height: "38px",
                      borderRadius: "50%",
                      background: "#6366f1",
                      color: "#fff",
                      fontWeight: "700",
                      fontSize: "14px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "2px solid #c7d2fe"
                    }}>
                      {a.name?.charAt(0) || "U"}
                    </div>
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-main, #0f172a)" }}>
                        {a.name}
                      </div>
                      <div style={{ fontSize: "11px", color: "#4f46e5", fontWeight: "600" }}>
                        {a.yearsCompleted} {a.yearsCompleted === 1 ? "Year" : "Years"} Work Anniversary! • {a.department}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleWish(a.name, "Work Anniversary")}
                    style={{
                      background: "linear-gradient(135deg, #6366f1, #4f46e5)",
                      color: "#fff",
                      border: "none",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      fontSize: "11px",
                      fontWeight: "700",
                      cursor: "pointer",
                      boxShadow: "0 2px 6px rgba(99, 102, 241, 0.3)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    }}
                  >
                    <IconStar size={12} color="#fff" /> Congrats
                  </button>
                </div>
              ))}
            </>
          )
        ) : (
          totalUpcoming === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 10px", color: "var(--text-muted, #94a3b8)" }}>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main, #334155)" }}>No upcoming milestones in next 14 days</div>
            </div>
          ) : (
            <>
              {/* Upcoming Birthdays */}
              {data.upcomingBirthdays?.map((b) => (
                <div
                  key={`up_b_${b.id}`}
                  style={{
                    background: "var(--ui-bg, #f8fafc)",
                    border: "1px solid var(--ui-border, #e2e8f0)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <IconGift size={16} color="#ec4899" />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main, #1e293b)" }}>{b.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>{b.department}</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: "700",
                    background: "rgba(236, 72, 153, 0.12)",
                    color: "#db2777",
                    padding: "3px 8px",
                    borderRadius: "10px"
                  }}>
                    In {b.daysLeft} {b.daysLeft === 1 ? "day" : "days"}
                  </span>
                </div>
              ))}

              {/* Upcoming Anniversaries */}
              {data.upcomingAnniversaries?.map((a) => (
                <div
                  key={`up_a_${a.id}`}
                  style={{
                    background: "var(--ui-bg, #f8fafc)",
                    border: "1px solid var(--ui-border, #e2e8f0)",
                    borderRadius: "10px",
                    padding: "10px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <IconStar size={16} color="#f59e0b" />
                    <div>
                      <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main, #1e293b)" }}>{a.name}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)" }}>{a.yearsCompleted} Years Anniversary</div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: "700",
                    background: "rgba(99, 102, 241, 0.12)",
                    color: "#4f46e5",
                    padding: "3px 8px",
                    borderRadius: "10px"
                  }}>
                    In {a.daysLeft} {a.daysLeft === 1 ? "day" : "days"}
                  </span>
                </div>
              ))}
            </>
          )
        )}
      </div>
    </div>
  );
}
