const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool, logAudit } = require("../config/mysqlDb");

const isUserAdminOrHR = (req) => {
  const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
  const roleName = req.user?.role?.name || req.user?.role || "";
  const position = req.user?.position || "";
  return req.user?.email === superEmail ||
    roleName === "Super Admin" ||
    roleName === "Company Owner" ||
    roleName.includes("Admin") ||
    roleName.includes("HR") ||
    position.includes("Manager") ||
    position.includes("HR");
};

const getCompanyId = (req) => req.user?.companyId?._id || req.user?.companyId?.id || req.user?.company_id || (typeof req.user?.companyId === 'string' ? req.user.companyId : 'default_company');

// 1. GET ALL PAYROLL RUNS
router.get("/runs", authMiddleware, async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const [rows] = await pool.query(
      `SELECT * FROM payroll_runs WHERE company_id = ? OR company_id = 'default_company' ORDER BY month_year DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET SALARY STRUCTURE FOR USER
router.get("/salary-structure/:userId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await pool.query(`SELECT * FROM salary_structures WHERE user_id = ?`, [userId]);
    if (rows.length === 0) {
      // B25: Reconcile components to match CTC 6,00,000 / 12 = 50,000 exactly
      // Basic 25,000 + HRA 12,500 + Special 10,500 + Conveyance 2,000 = 50,000.00
      return res.json({
        user_id: userId,
        ctc_annual: 600000.00,
        basic_monthly: 25000.00,
        hra_monthly: 12500.00,
        special_allowance: 10500.00,
        conveyance: 2000.00,
        pf_deduction: 1800.00,
        pt_deduction: 200.00,
        tds_monthly: 1500.00
      });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. UPDATE / SAVE SALARY STRUCTURE FOR USER
router.post("/salary-structure/:userId", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrHR(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin or HR can update salary structures." });
    }

    const { userId } = req.params;
    const { ctc_annual, basic_monthly, hra_monthly, special_allowance, conveyance, pf_deduction, pt_deduction, tds_monthly, effective_from } = req.body;
    if (!ctc_annual || parseFloat(ctc_annual) <= 0) {
      return res.status(400).json({ error: "Plese enter annual ctc" });
    }
    if (!basic_monthly || parseFloat(basic_monthly) <= 0) {
      return res.status(400).json({ error: "Plese enter basic salary" });
    }
    const companyId = getCompanyId(req);
    const id = `sal_${userId}`;

    await pool.query(
      `INSERT INTO salary_structures (
        id, company_id, user_id, ctc_annual, basic_monthly, hra_monthly,
        special_allowance, conveyance, pf_deduction, pt_deduction, tds_monthly, effective_from
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        ctc_annual=VALUES(ctc_annual), basic_monthly=VALUES(basic_monthly),
        hra_monthly=VALUES(hra_monthly), special_allowance=VALUES(special_allowance),
        conveyance=VALUES(conveyance), pf_deduction=VALUES(pf_deduction),
        pt_deduction=VALUES(pt_deduction), tds_monthly=VALUES(tds_monthly), effective_from=VALUES(effective_from)`,
      [
        id, companyId, userId, ctc_annual || 0, basic_monthly || 0, hra_monthly || 0,
        special_allowance || 0, conveyance || 0, pf_deduction || 0, pt_deduction || 200, tds_monthly || 0,
        effective_from || null
      ]
    );

    res.json({ message: "Salary structure updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GENERATE MONTHLY PAYROLL RUN
router.post("/generate-run", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrHR(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin can execute payroll runs." });
    }

    const { month_year = new Date().toISOString().slice(0, 7) } = req.body; // e.g. "2026-10"
    const companyId = getCompanyId(req);
    const runId = `run_${month_year.replace("-", "_")}_${Date.now()}`;

    // Get all active employees
    const [employees] = await pool.query(
      `SELECT id, name, email, department, position, role FROM staff WHERE status = 'Active'`
    );

    let totalGross = 0;
    let totalDeductions = 0;
    let totalReimbursements = 0;
    let totalNet = 0;
    let processedEmployees = 0;

    for (const emp of employees) {
      // 1. Fetch Salary Structure
      const [salRows] = await pool.query(`SELECT * FROM salary_structures WHERE user_id = ?`, [emp.id]);
      const sal = salRows[0] || {
        basic_monthly: 25000.00,
        hra_monthly: 12500.00,
        special_allowance: 10500.00,
        conveyance: 2000.00,
        pf_deduction: 1800.00,
        pt_deduction: 200.00,
        tds_monthly: 1500.00
      };

      const basic = parseFloat(sal.basic_monthly) || 25000;
      const hra = parseFloat(sal.hra_monthly) || 12500;
      const allowances = (parseFloat(sal.special_allowance) || 0) + (parseFloat(sal.conveyance) || 0);
      const gross = basic + hra + allowances;

      // 2. Fetch Unpaid Leaves for the month (LOP)
      let unpaidDays = 0;
      try {
        const [leaves] = await pool.query(
          `SELECT SUM(total_days) as lop_days FROM leave_requests 
           WHERE user_id = ? AND status = 'Approved' AND leave_type LIKE '%Unpaid%' 
             AND from_date LIKE ?`,
          [emp.id, `${month_year}%`]
        );
        unpaidDays = parseFloat(leaves[0]?.lop_days) || 0;
      } catch (_) {}

      const workingDays = 30;
      const presentDays = Math.max(0, workingDays - unpaidDays);
      const perDaySalary = gross / workingDays;
      const lopDeduction = Math.round(perDaySalary * unpaidDays);

      const pf = parseFloat(sal.pf_deduction) || 0;
      const pt = parseFloat(sal.pt_deduction) || 200;
      const tds = parseFloat(sal.tds_monthly) || 0;
      const empTotalDeductions = pf + pt + tds + lopDeduction;

      // 3. Fetch Approved Expense Reimbursements for the month
      let reimbursementAmt = 0;
      try {
        const [expRows] = await pool.query(
          `SELECT SUM(amount) as total_reimb FROM expenses 
           WHERE (employee_id = ? OR employee_email = ?) 
             AND status = 'Approved' AND expense_date LIKE ?`,
          [emp.id, emp.email, `${month_year}%`]
        );
        reimbursementAmt = parseFloat(expRows[0]?.total_reimb) || 0;
      } catch (_) {}

      const netSalary = Math.max(0, (gross - empTotalDeductions) + reimbursementAmt);

      totalGross += gross;
      totalDeductions += empTotalDeductions;
      totalReimbursements += reimbursementAmt;
      totalNet += netSalary;
      processedEmployees++;

      const slipId = `slip_${month_year}_${emp.id}`;

      // Insert or update payslip
      await pool.query(
        `INSERT INTO payslips (
          id, payroll_run_id, company_id, user_id, user_name, user_email, department, designation,
          month_year, working_days, present_days, unpaid_leave_days, basic_salary, hra, allowances,
          gross_salary, pf_deduction, pt_deduction, tds_deduction, unpaid_leave_deduction,
          total_deductions, reimbursements_total, net_salary, payment_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')
        ON DUPLICATE KEY UPDATE
          gross_salary=VALUES(gross_salary), total_deductions=VALUES(total_deductions),
          reimbursements_total=VALUES(reimbursements_total), net_salary=VALUES(net_salary),
          working_days=VALUES(working_days), present_days=VALUES(present_days)`,
        [
          slipId, runId, companyId, emp.id, emp.name, emp.email, emp.department || "Engineering",
          emp.position || "Software Engineer", month_year, workingDays, presentDays, unpaidDays,
          basic, hra, allowances, gross, pf, pt, tds, lopDeduction,
          empTotalDeductions, reimbursementAmt, netSalary
        ]
      );
    }

    // Upsert payroll_runs record
    await pool.query(
      `INSERT INTO payroll_runs (
        id, company_id, month_year, total_payout, total_deductions, total_reimbursements,
        employee_count, status, approved_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Draft', ?)
      ON DUPLICATE KEY UPDATE
        total_payout=VALUES(total_payout), total_deductions=VALUES(total_deductions),
        total_reimbursements=VALUES(total_reimbursements), employee_count=VALUES(employee_count)`,
      [runId, companyId, month_year, totalNet, totalDeductions, totalReimbursements, processedEmployees, req.user.name]
    );

    await logAudit({
      companyId,
      actorId: req.user._id ? req.user._id.toString() : req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role?.name || req.user.role,
      module: "Payroll",
      action: "Generated Monthly Payroll Run",
      targetId: runId,
      targetName: `Payroll ${month_year}`,
      details: { employees: processedEmployees, totalNet, totalReimbursements }
    });

    res.json({
      message: `Payroll run generated for ${month_year} (${processedEmployees} employees processed)`,
      runId,
      totalPayout: totalNet,
      employeeCount: processedEmployees
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET PAYSLIPS
router.get("/payslips", authMiddleware, async (req, res) => {
  try {
    const isSuper = isUserAdminOrHR(req);
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const { month_year, user_id } = req.query;
    const companyId = getCompanyId(req);

    let query = `SELECT * FROM payslips WHERE (company_id = ? OR company_id = 'default_company')`;
    const params = [companyId];

    if (!isSuper) {
      // Employees only see their own payslips
      query += ` AND (user_id = ? OR user_email = ?)`;
      params.push(userId, req.user.email);
    } else if (user_id) {
      query += ` AND user_id = ?`;
      params.push(user_id);
    }

    if (month_year) {
      query += ` AND month_year = ?`;
      params.push(month_year);
    }

    query += ` ORDER BY month_year DESC, user_name ASC`;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. GET SINGLE PAYSLIP DETAILS
router.get("/payslips/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(`SELECT * FROM payslips WHERE id = ?`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Payslip not found" });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. DISBURSE / FINALIZE PAYROLL RUN
router.post("/runs/:id/disburse", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrHR(req)) {
      return res.status(403).json({ error: "Access Denied." });
    }
    const { id } = req.params;
    await pool.query(
      `UPDATE payroll_runs SET status = 'Disbursed', disbursed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id]
    );
    await pool.query(
      `UPDATE payslips SET payment_status = 'Paid' WHERE payroll_run_id = ?`,
      [id]
    );
    res.json({ message: "Payroll run marked as Disbursed and payslips marked as Paid!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
