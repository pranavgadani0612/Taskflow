import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useCompany } from "../contexts/CompanyContext";
import { useToast } from "../contexts/ToastContext";
import PageHeader from "../components/common/PageHeader";
import FormModal from "../components/common/FormModal";
import DataTable from "../components/common/DataTable";
import { SelectField, TextInput } from "../components/common/FormFields";
import { IconStar } from "../components/common/Icons";
import "../style/main.css";
import "../style/table.css";

export default function PerformanceRating() {
  const { user } = useAuth();
  const { selectedCompany } = useCompany();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState("all"); // "all" | "summary"
  const [ratings, setRatings] = useState([]);
  const [summaries, setSummaries] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [projectList, setProjectList] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState("");

  const [form, setForm] = useState({
    employeeId: "",
    projectId: "",
    score: 5,
    category: "Overall Performance",
    reviewPeriod: "Monthly Review",
    feedback: "",
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isCompanyOwner = user?.role?.name === "Company Owner";
  const isManagerOrAdmin = isSuperAdmin || isCompanyOwner || user?.role?.name?.toLowerCase().includes("admin") || user?.role?.name?.toLowerCase().includes("manager");

  // Fetch ratings
  const fetchRatings = async () => {
    try {
      setLoading(true);
      const url = filterEmployee ? `/ratings?employeeId=${filterEmployee}` : "/ratings";
      const res = await API.get(url);
      setRatings(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load ratings:", err);
      showToast(err.response?.data?.message || "Failed to load ratings", "error");
    } finally {
      setLoading(false);
    }
  };

  // Fetch summary
  const fetchSummary = async () => {
    try {
      const res = await API.get("/ratings/summary");
      setSummaries(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load summary:", err);
    }
  };

  // Fetch dropdown dependencies (Staff & Projects)
  const fetchDependencies = async () => {
    try {
      const [staffRes, projRes] = await Promise.all([
        API.get("/staff"),
        API.get("/projects")
      ]);
      const sData = staffRes.data.staff || staffRes.data;
      setStaffList(Array.isArray(sData) ? sData : []);
      setProjectList(Array.isArray(projRes.data) ? projRes.data : []);
    } catch (err) {
      console.error("Failed to load staff/projects:", err);
    }
  };

  useEffect(() => {
    fetchDependencies();
  }, [selectedCompany]);

  useEffect(() => {
    fetchRatings();
    fetchSummary();
  }, [filterEmployee, selectedCompany]);

  // Handle Save Rating
  const handleSave = async () => {
    setFieldErrors({});
    try {
      setSubmitting(true);
      const payload = {
        ...form,
        companyId: selectedCompany?._id || user?.companyId?._id || user?.companyId || undefined,
      };
      await API.post("/ratings", payload);
      showToast("Performance rating submitted successfully!");
      setShowModal(false);
      setFieldErrors({});
      setForm({
        employeeId: "",
        projectId: "",
        score: 5,
        category: "Overall Performance",
        reviewPeriod: "Monthly Review",
        feedback: "",
      });
      fetchRatings();
      fetchSummary();
    } catch (err) {
      const serverErr = err.response?.data?.error || err.response?.data?.message;
      const serverField = err.response?.data?.field;
      if (serverField) {
        setFieldErrors({ [serverField]: serverErr });
      } else if (serverErr) {
        showToast(serverErr, "error");
      } else {
        showToast("Failed to save rating", "error");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Rating
  const handleDelete = async (id) => {
    try {
      await API.delete(`/ratings/${id}`);
      showToast("Rating deleted successfully", "delete");
      fetchRatings();
      fetchSummary();
    } catch (err) {
      showToast(err.response?.data?.message || "Error deleting rating", "error");
    }
  };

  // Render Stars Component
  const renderStars = (score) => {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            style={{
              display: "inline-flex",
              userSelect: "none",
              marginRight: "2px"
            }}
          >
            <IconStar
              size={16}
              filled={star <= Math.round(score)}
              color={star <= Math.round(score) ? "#f59e0b" : "#d1d5db"}
            />
          </span>
        ))}
        <span style={{ marginLeft: "6px", fontWeight: "700", color: "var(--text-main)", fontSize: "13px" }}>
          {Number(score).toFixed(1)}
        </span>
      </div>
    );
  };

  const ratingColumns = [
    {
      header: "Employee",
      key: "employeeId",
      render: (_, row) => (
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "34px",
              height: "34px",
              borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "bold",
              fontSize: "13px"
            }}
          >
            {row.employeeId?.name ? row.employeeId.name.charAt(0).toUpperCase() : "E"}
          </div>
          <div>
            <div style={{ fontWeight: "600", color: "var(--text-main)" }}>
              {row.employeeId?.name || "Unknown"}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {row.employeeId?.email}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: "Score",
      key: "score",
      render: (score) => renderStars(score),
    },
    {
      header: "Category",
      key: "category",
      render: (cat) => (
        <span
          style={{
            background: "rgba(99, 102, 241, 0.1)",
            color: "#6366f1",
            padding: "4px 8px",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: "600"
          }}
        >
          {cat}
        </span>
      ),
    },
    {
      header: "Period",
      key: "reviewPeriod",
    },
    {
      header: "Project",
      key: "projectId",
      render: (proj) => proj?.title || proj?.name || "—",
    },
    {
      header: "Rated By",
      key: "ratedBy",
      render: (rBy) => rBy?.name || "System",
    },
    {
      header: "Feedback",
      key: "feedback",
      render: (fb) => (
        <span
          title={fb}
          style={{
            maxWidth: "240px",
            display: "inline-block",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: "var(--text-muted)",
            fontSize: "13px"
          }}
        >
          {fb || "No comments"}
        </span>
      ),
    },
  ];

  return (
    <div className="page" style={{ padding: "24px" }}>
      <PageHeader
        title="Employee Rating & Performance"
        buttonText={isManagerOrAdmin ? "+ Rate Employee" : null}
        onButtonClick={() => setShowModal(true)}
      />

      {/* Top Metric Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            padding: "20px",
            borderRadius: "14px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
            border: "1px solid var(--border-color, #e5e7eb)"
          }}
        >
          <div style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: "600" }}>Total Reviews Given</div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#6366f1", marginTop: "4px" }}>
            {ratings.length}
          </div>
        </div>

        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            padding: "20px",
            borderRadius: "14px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
            border: "1px solid var(--border-color, #e5e7eb)"
          }}
        >
          <div style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: "600" }}>Company Average Score</div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#f59e0b", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
            {ratings.length > 0
              ? (ratings.reduce((acc, r) => acc + (r.score || 0), 0) / ratings.length).toFixed(1)
              : "0.0"} <IconStar size={22} color="#f59e0b" filled={true} />
          </div>
        </div>

        <div
          style={{
            background: "var(--card-bg, #ffffff)",
            padding: "20px",
            borderRadius: "14px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.04)",
            border: "1px solid var(--border-color, #e5e7eb)"
          }}
        >
          <div style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: "600" }}>Employees Evaluated</div>
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#10b981", marginTop: "4px" }}>
            {summaries.length}
          </div>
        </div>
      </div>

      {/* Tabs and Filters */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setActiveTab("all")}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
              background: activeTab === "all" ? "var(--primary, #6366f1)" : "var(--neu-bg, #f3f4f6)",
              color: activeTab === "all" ? "#fff" : "var(--text-main, #374151)",
              transition: "0.2s"
            }}
          >
            Review Log
          </button>
          <button
            onClick={() => setActiveTab("summary")}
            style={{
              padding: "8px 18px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "14px",
              background: activeTab === "summary" ? "var(--primary, #6366f1)" : "var(--neu-bg, #f3f4f6)",
              color: activeTab === "summary" ? "#fff" : "var(--text-main, #374151)",
              transition: "0.2s"
            }}
          >
            Employee Scorecards
          </button>
        </div>

        {activeTab === "all" && (
          <div style={{ minWidth: "220px" }}>
            <select
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #d1d5db)",
                background: "var(--input-bg, #fff)",
                color: "var(--text-main)",
                fontSize: "14px"
              }}
            >
              <option value="">Filter by Employee (All)</option>
              {staffList.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name} ({s.email})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tab 1: Detailed Reviews Table */}
      {activeTab === "all" && (
        <DataTable
          data={ratings}
          columns={ratingColumns}
          onDelete={isManagerOrAdmin ? handleDelete : null}
          emptyText="No performance ratings submitted yet."
        />
      )}

      {/* Tab 2: Employee Scorecards */}
      {activeTab === "summary" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "20px" }}>
          {summaries.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)", gridColumn: "1 / -1" }}>
              No scorecards available yet. Submit a rating to see aggregated employee performance.
            </div>
          ) : (
            summaries.map((item) => (
              <div
                key={item.employee?._id || Math.random()}
                style={{
                  background: "var(--card-bg, #fff)",
                  borderRadius: "14px",
                  padding: "20px",
                  border: "1px solid var(--border-color, #e5e7eb)",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "50%",
                      background: "linear-gradient(135deg, #6366f1, #3b82f6)",
                      color: "#fff",
                      fontWeight: "700",
                      fontSize: "16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {item.employee?.name ? item.employee.name.charAt(0).toUpperCase() : "E"}
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: "16px", color: "var(--text-main)" }}>
                      {item.employee?.name}
                    </h4>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {item.employee?.position || item.employee?.email}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(99, 102, 241, 0.05)",
                    padding: "12px",
                    borderRadius: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)" }}>
                    Average Rating
                  </span>
                  <div>{renderStars(item.averageScore)}</div>
                </div>

                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                  Total Evaluations: <strong style={{ color: "var(--text-main)" }}>{item.totalRatings}</strong>
                </div>

                {item.latestFeedback && (
                  <div
                    style={{
                      background: "var(--neu-bg, #f9fafb)",
                      padding: "10px 12px",
                      borderRadius: "8px",
                      fontSize: "12px",
                      fontStyle: "italic",
                      color: "var(--text-muted)"
                    }}
                  >
                    "{item.latestFeedback}"
                  </div>
                )}

                <button
                  onClick={() => {
                    setFilterEmployee(item.employee?._id);
                    setActiveTab("all");
                  }}
                  style={{
                    marginTop: "auto",
                    padding: "8px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-color, #d1d5db)",
                    background: "transparent",
                    color: "var(--text-main)",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: "600"
                  }}
                >
                  View Review Details →
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* RATE EMPLOYEE MODAL */}
      <FormModal
        show={showModal}
        onClose={() => setShowModal(false)}
        title="Rate Employee Performance"
        onSave={handleSave}
        saveText={submitting ? "Saving..." : "Submit Rating"}
      >
        <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <SelectField
            label="Employee"
            value={form.employeeId}
            onChange={(e) => {
              setForm({ ...form, employeeId: e.target.value });
              if (fieldErrors.employeeId) setFieldErrors({ ...fieldErrors, employeeId: null });
            }}
            error={fieldErrors.employeeId}
            required
          >
            <option value="">Select Employee to rate</option>
            {staffList.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name} ({s.email})
              </option>
            ))}
          </SelectField>

          {/* Star Selector */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "6px", color: "var(--text-main)" }}>
              Rating Score (1 - 5 Stars) <span style={{ color: "var(--danger-color)" }}>*</span>
            </label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setForm({ ...form, score: star })}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px",
                    display: "inline-flex",
                    alignItems: "center",
                    transition: "transform 0.1s"
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1.0)")}
                >
                  <IconStar
                    size={28}
                    filled={star <= form.score}
                    color={star <= form.score ? "#f59e0b" : "#d1d5db"}
                  />
                </button>
              ))}
              <span style={{ marginLeft: "12px", fontWeight: "700", fontSize: "15px", color: "var(--text-main)" }}>
                {form.score} / 5
              </span>
            </div>
          </div>

          <SelectField
            label="Evaluation Category"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="Overall Performance">Overall Performance</option>
            <option value="Work Quality">Work Quality</option>
            <option value="Timeliness & Punctuality">Timeliness & Punctuality</option>
            <option value="Problem Solving">Problem Solving</option>
            <option value="Communication & Teamwork">Communication & Teamwork</option>
          </SelectField>

          <SelectField
            label="Review Period"
            value={form.reviewPeriod}
            onChange={(e) => setForm({ ...form, reviewPeriod: e.target.value })}
          >
            <option value="Monthly Review">Monthly Review</option>
            <option value="Quarterly Review (Q1/Q2/Q3/Q4)">Quarterly Review</option>
            <option value="Sprint / Project Review">Sprint / Project Review</option>
            <option value="Annual Performance Review">Annual Performance Review</option>
          </SelectField>

          <SelectField
            label="Associated Project (Optional)"
            value={form.projectId}
            onChange={(e) => setForm({ ...form, projectId: e.target.value })}
          >
            <option value="">None (Company Wide)</option>
            {projectList.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title || p.name}
              </option>
            ))}
          </SelectField>

          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "14px", fontWeight: "600", marginBottom: "6px", color: "var(--text-main)" }}>
              Feedback & Comments
            </label>
            <textarea
              rows={4}
              placeholder="Provide constructive feedback, achievements, or areas for improvement..."
              value={form.feedback}
              onChange={(e) => setForm({ ...form, feedback: e.target.value })}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid var(--border-color, #d1d5db)",
                background: "var(--input-bg, #fff)",
                color: "var(--text-main)",
                fontSize: "14px",
                resize: "vertical"
              }}
            />
          </div>
        </form>
      </FormModal>
    </div>
  );
}
