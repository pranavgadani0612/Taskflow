import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../contexts/PermissionContext";
import FormModal from "../components/common/FormModal";
import { IconMoney, IconSettings, IconZap, IconFileText, IconPrinter, IconX, IconAlert, IconCheck } from "../components/common/Icons";
import Pagination from "../components/common/Pagination";
import { useTableSort, SortIndicator } from "../utils/tableSort";
import "../style/main.css";

export default function Payroll() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { hasPermission: ctxHasPermission } = usePermissions();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isOwner = isSuperAdmin || user?.role?.name === "Company Owner";
  const hasPermission = (action = "read") => {
    if (isOwner) return true;
    return ctxHasPermission("payroll_management", action);
  };
  const isHRorAdmin = isOwner || hasPermission("create") || hasPermission("update") || user?.position?.includes("HR") || user?.role?.name?.includes("HR");

  const [runs, setRuns] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState("2026-10");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { sortedData: sortedPayslips, sortConfig, requestSort } = useTableSort(payslips, "user_name", "asc");
  const paginatedPayslips = sortedPayslips.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Selected Payslip for printable PDF view
  const [viewingSlip, setViewingSlip] = useState(null);

  // Salary Structure Modal
  const [salaryModal, setSalaryModal] = useState({
    show: false,
    user_id: "",
    user_name: "",
    ctc_annual: "",
    basic_monthly: "",
    hra_monthly: "",
    special_allowance: "",
    conveyance: "",
    pf_deduction: "",
    pt_deduction: "200",
    tds_monthly: ""
  });
  const [salaryFieldErrors, setSalaryFieldErrors] = useState({});
  const [savingSalary, setSavingSalary] = useState(false);

  // Run Payroll Modal
  const [showRunModal, setShowRunModal] = useState(false);
  const [runMonthInput, setRunMonthInput] = useState("2026-10");
  const [generatingRun, setGeneratingRun] = useState(false);

  const fetchPayrollData = async () => {
    try {
      setLoading(true);
      const [runsRes, slipsRes] = await Promise.all([
        API.get("/payroll/runs"),
        API.get(`/payroll/payslips?month_year=${selectedMonth}`)
      ]);
      setRuns(Array.isArray(runsRes.data) ? runsRes.data : []);
      setPayslips(Array.isArray(slipsRes.data) ? slipsRes.data : []);
    } catch (err) {
      console.error("Error loading payroll:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await API.get("/staff");
      setEmployees(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error loading staff:", err);
    }
  };

  useEffect(() => {
    fetchPayrollData();
  }, [selectedMonth]);

  useEffect(() => {
    if (isHRorAdmin) {
      fetchEmployees();
    }
  }, [isHRorAdmin]);

  // Execute Monthly Payroll Run
  const handleGenerateRun = async (e) => {
    e.preventDefault();
    setGeneratingRun(true);
    try {
      const res = await API.post("/payroll/generate-run", { month_year: runMonthInput });
      showToast(res.data?.message || "Payroll run executed successfully!", "success");
      setShowRunModal(false);
      setSelectedMonth(runMonthInput);
      fetchPayrollData();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to generate payroll run", "error");
    } finally {
      setGeneratingRun(false);
    }
  };

  // Open Salary Structure Editor
  const openSalaryConfig = async (emp) => {
    try {
      const res = await API.get(`/payroll/salary-structure/${emp.id}`);
      const data = res.data || {};
      setSalaryModal({
        show: true,
        user_id: emp.id,
        user_name: emp.name,
        ctc_annual: data.ctc_annual || "",
        basic_monthly: data.basic_monthly || "",
        hra_monthly: data.hra_monthly || "",
        special_allowance: data.special_allowance || "",
        conveyance: data.conveyance || "",
        pf_deduction: data.pf_deduction || "",
        pt_deduction: data.pt_deduction || "200",
        tds_monthly: data.tds_monthly || ""
      });
    } catch (err) {
      showToast("Could not load salary structure", "error");
    }
  };

  // Helper: Auto-calculate monthly components from Annual CTC
  const handleCtcChange = (annualVal) => {
    const annual = parseFloat(annualVal) || 0;
    if (annual <= 0) {
      setSalaryModal((prev) => ({
        ...prev,
        ctc_annual: annualVal,
        basic_monthly: "",
        hra_monthly: "",
        special_allowance: ""
      }));
      return;
    }
    const monthlyTotal = Math.round(annual / 12);
    const basic = Math.round(monthlyTotal * 0.50); // 50% Basic
    const hra = Math.round(basic * 0.50); // 50% of Basic as HRA (25% of total)
    const conveyance = parseFloat(salaryModal.conveyance) || 0;
    const specialAllowance = Math.max(0, monthlyTotal - (basic + hra + conveyance)); // Balancing figure so sum === monthlyTotal exactly

    setSalaryModal((prev) => ({
      ...prev,
      ctc_annual: annualVal,
      basic_monthly: basic,
      hra_monthly: hra,
      special_allowance: specialAllowance
    }));
  };

  // Helper: Auto-recalculate Annual CTC when components are changed manually
  const handleComponentChange = (field, val) => {
    setSalaryModal((prev) => {
      const updated = { ...prev, [field]: val };
      const basic = parseFloat(updated.basic_monthly) || 0;
      const hra = parseFloat(updated.hra_monthly) || 0;
      const special = parseFloat(updated.special_allowance) || 0;
      const conv = parseFloat(updated.conveyance) || 0;
      const monthlySum = basic + hra + special + conv;
      if (monthlySum > 0) {
        updated.ctc_annual = Math.round(monthlySum * 12);
      }
      return updated;
    });
  };

  // Save Salary Structure
  const handleSaveSalary = async (e) => {
    e.preventDefault();
    if (!salaryModal.ctc_annual || parseFloat(salaryModal.ctc_annual) <= 0) {
      showToast("Valid Annual CTC is required", "error");
      return;
    }
    if (!salaryModal.basic_monthly || parseFloat(salaryModal.basic_monthly) <= 0) {
      showToast("Valid Basic Monthly salary is required", "error");
      return;
    }
    setSalaryFieldErrors({});
    setSavingSalary(true);
    try {
      await API.post(`/payroll/salary-structure/${salaryModal.user_id}`, salaryModal);
      showToast("Salary structure updated!", "success");
      setSalaryModal({ ...salaryModal, show: false });
      setSalaryFieldErrors({});
    } catch (err) {
      const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || "";
      let matched = false;
      if (errMsg.toLowerCase().includes("ctc")) {
        setSalaryFieldErrors(prev => ({ ...prev, ctc_annual: "Plese enter annual ctc" }));
        matched = true;
      }
      if (errMsg.toLowerCase().includes("basic")) {
        setSalaryFieldErrors(prev => ({ ...prev, basic_monthly: "Plese enter basic salary" }));
        matched = true;
      }
      if (!matched) {
        showToast(errMsg || "Failed to update salary", "error");
      }
    } finally {
      setSavingSalary(false);
    }
  };

  // KPI calculations
  const totalNetPayout = payslips.reduce((sum, p) => sum + parseFloat(p.net_salary || 0), 0);
  const totalReimbursements = payslips.reduce((sum, p) => sum + parseFloat(p.reimbursements_total || 0), 0);
  const totalDeductions = payslips.reduce((sum, p) => sum + parseFloat(p.total_deductions || 0), 0);

  return (
    <div className="main-content-container" style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "var(--text-main, #0f172a)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <IconMoney size={28} color="#10b981" /> Payroll & Compensation Management
          </h1>
          <p style={{ color: "var(--text-muted, #64748b)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Automated salary calculations, attendance deductions, expense reimbursements & payslip generation
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          {isHRorAdmin && (
            <>
              <button
                onClick={() => {
                  if (employees.length > 0) openSalaryConfig(employees[0]);
                }}
                style={{
                  background: "#fff",
                  color: "#2563eb",
                  border: "1px solid #bfdbfe",
                  borderRadius: "8px",
                  padding: "0.6rem 1rem",
                  fontWeight: "600",
                  fontSize: "0.85rem",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <IconSettings size={15} color="#2563eb" /> Configure Salary CTC
              </button>

              <button
                onClick={() => setShowRunModal(true)}
                style={{
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "0.6rem 1.2rem",
                  fontWeight: "600",
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(16,185,129,0.25)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px"
                }}
              >
                <IconZap size={16} color="#fff" /> Run Monthly Payroll
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Monthly Net Disbursement</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#10b981", marginTop: "0.25rem" }}>
            ₹{totalNetPayout.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Total Deductions (PF, PT, TDS, LOP)</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#ef4444", marginTop: "0.25rem" }}>
            ₹{totalDeductions.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Approved Expense Reimbursements</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#3b82f6", marginTop: "0.25rem" }}>
            ₹{totalReimbursements.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Employees Processed</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#6366f1", marginTop: "0.25rem" }}>
            {payslips.length}
          </div>
        </div>
      </div>

      {/* Month Selector Bar */}
      <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1rem", marginBottom: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontWeight: "600", fontSize: "0.9rem", color: "var(--text-main, #334155)" }}>Select Payroll Month:</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{ padding: "0.45rem 0.75rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", fontSize: "0.85rem", fontWeight: "600" }}
          />
        </div>

        {isHRorAdmin && (
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)" }}>
            <strong style={{ color: "#2563eb" }}>Note:</strong> Expense reimbursements approved in <strong>{selectedMonth}</strong> are automatically added to Net Pay!
          </div>
        )}
      </div>

      {/* Payslips Table */}
      <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading payroll records...</div>
        ) : payslips.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
              <IconMoney size={40} color="#94a3b8" />
            </div>
            <p style={{ marginTop: "0.5rem", fontWeight: "600" }}>No payslips generated for {selectedMonth} yet.</p>
            {isHRorAdmin && (
              <button
                onClick={() => setShowRunModal(true)}
                style={{ padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "#2563eb", color: "#fff", fontWeight: "600", cursor: "pointer", marginTop: "0.5rem" }}
              >
                Execute Payroll Run for {selectedMonth}
              </button>
            )}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)", fontWeight: "600", fontSize: "0.8rem", textTransform: "uppercase" }}>
                  <th onClick={() => requestSort("user_name")} style={{ padding: "0.85rem 1.25rem", cursor: "pointer", userSelect: "none" }}>
                    Employee Name <SortIndicator sortKey="user_name" currentKey={sortConfig.key} direction={sortConfig.direction} />
                  </th>
                  <th onClick={() => requestSort("present_days")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Days (Present / LOP) <SortIndicator sortKey="present_days" currentKey={sortConfig.key} direction={sortConfig.direction} />
                  </th>
                  <th onClick={() => requestSort("gross_salary")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Gross Salary <SortIndicator sortKey="gross_salary" currentKey={sortConfig.key} direction={sortConfig.direction} />
                  </th>
                  <th onClick={() => requestSort("total_deductions")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Total Deductions <SortIndicator sortKey="total_deductions" currentKey={sortConfig.key} direction={sortConfig.direction} />
                  </th>
                  <th onClick={() => requestSort("reimbursements")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Reimbursements <SortIndicator sortKey="reimbursements" currentKey={sortConfig.key} direction={sortConfig.direction} />
                  </th>
                  <th onClick={() => requestSort("net_salary")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Net Payable <SortIndicator sortKey="net_salary" currentKey={sortConfig.key} direction={sortConfig.direction} />
                  </th>
                  <th onClick={() => requestSort("payment_status")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Status <SortIndicator sortKey="payment_status" currentKey={sortConfig.key} direction={sortConfig.direction} />
                  </th>
                  <th style={{ padding: "0.85rem 1.25rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedPayslips.map(slip => (
                  <tr key={slip.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)" }}>
                    <td style={{ padding: "1rem 1.25rem" }}>
                      <div style={{ fontWeight: "700", color: "var(--text-main, #0f172a)" }}>{slip.user_name}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted, #64748b)" }}>{slip.designation || slip.department}</div>
                    </td>
                    <td style={{ padding: "1rem" }}>
                      <div style={{ fontWeight: "600", color: "#059669" }}>{slip.present_days} Days Present</div>
                      {parseFloat(slip.unpaid_leave_days) > 0 && (
                        <div style={{ fontSize: "0.75rem", color: "#dc2626", display: "flex", alignItems: "center", gap: "3px" }}>
                          <IconAlert size={12} color="#dc2626" /> {slip.unpaid_leave_days} Days LOP
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "1rem", fontWeight: "600" }}>
                      ₹{parseFloat(slip.gross_salary || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "1rem", color: "#dc2626" }}>
                      -₹{parseFloat(slip.total_deductions || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "1rem", color: "#2563eb", fontWeight: "600" }}>
                      +₹{parseFloat(slip.reimbursements_total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "1rem", fontWeight: "800", color: "#0f172a", fontSize: "1.05rem" }}>
                      ₹{parseFloat(slip.net_salary || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "1rem" }}>
                      <span style={{
                        padding: "0.25rem 0.65rem",
                        borderRadius: "9999px",
                        fontSize: "0.75rem",
                        fontWeight: "700",
                        background: slip.payment_status === "Paid" ? "#ecfdf5" : "#fffbeb",
                        color: slip.payment_status === "Paid" ? "#059669" : "#d97706",
                        border: `1px solid ${slip.payment_status === "Paid" ? "#a7f3d0" : "#fde68a"}`
                      }}>
                        {slip.payment_status}
                      </span>
                    </td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "right" }}>
                      <button
                        onClick={() => setViewingSlip(slip)}
                        style={{
                          padding: "0.4rem 0.85rem",
                          borderRadius: "6px",
                          border: "1px solid #2563eb",
                          background: "#eff6ff",
                          color: "#2563eb",
                          fontWeight: "700",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "5px"
                        }}
                      >
                        <IconFileText size={14} /> View Payslip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              currentPage={currentPage}
              totalRecords={payslips.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
            />
          </div>
        )}
      </div>

      {/* ─── RUN MONTHLY PAYROLL MODAL ─── */}
      <FormModal
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
        title="Execute Monthly Payroll Run"
        onSubmit={handleGenerateRun}
        submitText={generatingRun ? "Calculating Payroll..." : "Execute Automated Run"}
      >
        <p style={{ margin: "0 0 1rem 0", color: "var(--text-muted, #64748b)", fontSize: "0.9rem" }}>
          The payroll engine will automatically compute CTC structures, calculate Loss of Pay (LOP) from approved leaves, aggregate approved Expense reimbursements, and produce payslips for all active team members.
        </p>

        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Select Month & Year *</label>
          <input
            type="month"
            required
            value={runMonthInput}
            onChange={(e) => setRunMonthInput(e.target.value)}
            style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
          />
        </div>
      </FormModal>

      {/* ─── CONFIGURE SALARY STRUCTURE MODAL ─── */}
      <FormModal
        isOpen={salaryModal.show}
        onClose={() => setSalaryModal({ ...salaryModal, show: false })}
        title={`Configure Salary CTC: ${salaryModal.user_name}`}
        onSubmit={handleSaveSalary}
        submitText={savingSalary ? "Saving..." : "Save Salary Breakdown"}
      >
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Select Employee</label>
          <select
            value={salaryModal.user_id}
            onChange={(e) => {
              const emp = employees.find(ep => ep.id === e.target.value);
              if (emp) openSalaryConfig(emp);
            }}
            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", marginBottom: "1rem" }}
          >
            {employees.map(emp => {
              const displayRole = emp.position && emp.position !== "role_staff" && emp.position !== "role_superadmin"
                ? emp.position
                : (emp.role?.name || (emp.role === "role_staff" ? "Staff" : emp.role === "role_superadmin" ? "Super Admin" : (emp.role || emp.department || "Staff")));
              return (
                <option key={emp.id} value={emp.id}>{emp.name} ({displayRole})</option>
              );
            })}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>
              Annual CTC (₹) <span style={{ color: "#ef4444" }}>*</span> <span style={{ fontSize: "0.72rem", color: "#6366f1", fontWeight: "normal" }}>(Auto-calculates breakdown)</span>
            </label>
            <input
              type="number"
              value={salaryModal.ctc_annual}
              onChange={(e) => {
                handleCtcChange(e.target.value);
                if (salaryFieldErrors.ctc_annual) setSalaryFieldErrors(prev => ({ ...prev, ctc_annual: null }));
              }}
              placeholder="e.g. 1200000"
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "6px",
                border: salaryFieldErrors.ctc_annual ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)"
              }}
            />
            {salaryFieldErrors.ctc_annual && (
              <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                {salaryFieldErrors.ctc_annual}
              </div>
            )}
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>
              Basic Salary / Month (₹) <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="number"
              value={salaryModal.basic_monthly}
              onChange={(e) => {
                handleComponentChange("basic_monthly", e.target.value);
                if (salaryFieldErrors.basic_monthly) setSalaryFieldErrors(prev => ({ ...prev, basic_monthly: null }));
              }}
              placeholder="e.g. 50000"
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "6px",
                border: salaryFieldErrors.basic_monthly ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)"
              }}
            />
            {salaryFieldErrors.basic_monthly && (
              <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                {salaryFieldErrors.basic_monthly}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "0.85rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>HRA / Month (₹)</label>
            <input
              type="number"
              value={salaryModal.hra_monthly}
              onChange={(e) => handleComponentChange("hra_monthly", e.target.value)}
              placeholder="e.g. 25000"
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Special Allowance (₹)</label>
            <input
              type="number"
              value={salaryModal.special_allowance}
              onChange={(e) => handleComponentChange("special_allowance", e.target.value)}
              placeholder="e.g. 20000"
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>

        {/* Live Monthly Reconcile Summary */}
        <div style={{
          marginTop: "0.85rem",
          padding: "0.6rem 0.85rem",
          borderRadius: "6px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          fontSize: "0.78rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div>
            <span style={{ color: "#64748b" }}>Monthly Gross Sum: </span>
            <strong style={{ color: "#0f172a" }}>
              ₹{((parseFloat(salaryModal.basic_monthly) || 0) + (parseFloat(salaryModal.hra_monthly) || 0) + (parseFloat(salaryModal.special_allowance) || 0) + (parseFloat(salaryModal.conveyance) || 0)).toLocaleString("en-IN")}
            </strong>
            <span style={{ color: "#64748b", marginLeft: "8px" }}>
              (Target: ₹{Math.round((parseFloat(salaryModal.ctc_annual) || 0) / 12).toLocaleString("en-IN")}/mo)
            </span>
          </div>
          {Math.round((parseFloat(salaryModal.ctc_annual) || 0) / 12) === ((parseFloat(salaryModal.basic_monthly) || 0) + (parseFloat(salaryModal.hra_monthly) || 0) + (parseFloat(salaryModal.special_allowance) || 0) + (parseFloat(salaryModal.conveyance) || 0)) ? (
            <span style={{ color: "#16a34a", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <IconCheck size={14} color="#16a34a" /> Perfectly Reconciled
            </span>
          ) : (
            <span style={{ color: "#d97706", fontWeight: "600" }}>Custom Breakdown</span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginTop: "0.85rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "0.25rem" }}>PF Deduction (₹)</label>
            <input
              type="number"
              value={salaryModal.pf_deduction}
              onChange={(e) => setSalaryModal({ ...salaryModal, pf_deduction: e.target.value })}
              placeholder="1800"
              style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "0.25rem" }}>Professional Tax (₹)</label>
            <input
              type="number"
              value={salaryModal.pt_deduction}
              onChange={(e) => setSalaryModal({ ...salaryModal, pt_deduction: e.target.value })}
              placeholder="200"
              style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "0.25rem" }}>TDS / Month (₹)</label>
            <input
              type="number"
              value={salaryModal.tds_monthly}
              onChange={(e) => setSalaryModal({ ...salaryModal, tds_monthly: e.target.value })}
              placeholder="0"
              style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>
      </FormModal>

      {/* ─── PRINTABLE CORPORATE PAYSLIP MODAL ─── */}
      {viewingSlip && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.7)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
          padding: "1rem"
        }}>
          <div style={{
            background: "#ffffff",
            width: "100%",
            maxWidth: "760px",
            maxHeight: "92vh",
            borderRadius: "12px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column"
          }}>
            {/* Top Toolbar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.5rem", borderBottom: "1px solid #e2e8f0" }}>
              <span style={{ fontWeight: "700", color: "#334155" }}>Official Salary Payslip &bull; {viewingSlip.month_year}</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => window.print()}
                  style={{ padding: "0.4rem 0.85rem", borderRadius: "6px", border: "none", background: "#2563eb", color: "#fff", fontWeight: "600", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <IconPrinter size={15} /> Print / Save as PDF
                </button>
                <button
                  onClick={() => setViewingSlip(null)}
                  style={{ padding: "0.4rem 0.85rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", color: "#64748b", fontWeight: "600", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <IconX size={15} /> Close
                </button>
              </div>
            </div>

            {/* Branded Letterhead */}
            <div style={{ padding: "2rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #2563eb", paddingBottom: "1.25rem", marginBottom: "1.5rem" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: "800", color: "#1e3a8a" }}>
                    PADHYA SOFTWARE TECHNOLOGIES
                  </h2>
                  <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.25rem" }}>
                    Enterprise Web & Mobile Solutions &bull; www.padhyasoft.com
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>
                    CIN: U72900GJ2024PTC123456 &bull; GSTIN: 24AAACP1234F1Z8
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: "800", color: "#0f172a" }}>SALARY PAYSLIP</div>
                  <div style={{ fontSize: "0.9rem", color: "#2563eb", fontWeight: "700" }}>{viewingSlip.month_year}</div>
                  <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Generated: {new Date().toLocaleDateString()}</div>
                </div>
              </div>

              {/* Employee Meta Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", background: "#f8fafc", padding: "1rem", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
                <div><strong>Employee Name:</strong> {viewingSlip.user_name}</div>
                <div><strong>Designation:</strong> {viewingSlip.designation || "Software Engineer"}</div>
                <div><strong>Department:</strong> {viewingSlip.department || "Engineering"}</div>
                <div><strong>Days in Month / Present:</strong> 30 / {viewingSlip.present_days} Days</div>
                <div><strong>Email:</strong> {viewingSlip.user_email || "N/A"}</div>
                <div><strong>Loss of Pay (LOP):</strong> {viewingSlip.unpaid_leave_days} Days</div>
              </div>

              {/* Earnings vs Deductions Table */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #cbd5e1", borderRadius: "8px", overflow: "hidden", marginBottom: "1.5rem" }}>
                {/* Earnings Column */}
                <div style={{ borderRight: "1px solid #cbd5e1" }}>
                  <div style={{ background: "#f1f5f9", padding: "0.6rem 1rem", fontWeight: "700", borderBottom: "1px solid #cbd5e1", color: "#0f172a" }}>
                    EARNINGS
                  </div>
                  <div style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Basic Salary</span>
                      <strong>₹{parseFloat(viewingSlip.basic_salary || 0).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>House Rent Allowance (HRA)</span>
                      <strong>₹{parseFloat(viewingSlip.hra || 0).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Special / Conveyance Allowance</span>
                      <strong>₹{parseFloat(viewingSlip.allowances || 0).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#2563eb", fontWeight: "600" }}>
                      <span>Reimbursements (Approved Bills)</span>
                      <strong>+₹{parseFloat(viewingSlip.reimbursements_total || 0).toFixed(2)}</strong>
                    </div>
                  </div>
                </div>

                {/* Deductions Column */}
                <div>
                  <div style={{ background: "#f1f5f9", padding: "0.6rem 1rem", fontWeight: "700", borderBottom: "1px solid #cbd5e1", color: "#0f172a" }}>
                    DEDUCTIONS
                  </div>
                  <div style={{ padding: "0.75rem 1rem", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Provident Fund (PF)</span>
                      <strong>₹{parseFloat(viewingSlip.pf_deduction || 0).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Professional Tax (PT)</span>
                      <strong>₹{parseFloat(viewingSlip.pt_deduction || 0).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Tax Deducted at Source (TDS)</span>
                      <strong>₹{parseFloat(viewingSlip.tds_deduction || 0).toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#dc2626" }}>
                      <span>LOP (Unpaid Leave Penalty)</span>
                      <strong>₹{parseFloat(viewingSlip.unpaid_leave_deduction || 0).toFixed(2)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Net Payable Highlight Banner */}
              <div style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)", color: "#fff", padding: "1.25rem", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.9 }}>
                    Net Salary Transferred
                  </div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: "0.2rem" }}>
                    Credited directly to linked corporate salary account
                  </div>
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: "800" }}>
                  ₹{parseFloat(viewingSlip.net_salary || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
              </div>

              {/* Signatures & Footer */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2.5rem", paddingTop: "1rem", borderTop: "1px dashed #cbd5e1", fontSize: "0.8rem", color: "#64748b" }}>
                <div>Employer: Padhya Software Technologies Pvt Ltd</div>
                <div>Authorized Signatory / HR Dept</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
