const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { pool } = require("../config/mysqlDb");
const authMiddleware = require("../middleware/auth");
const { sendExpenseMail } = require("../config/mail");

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage for receipts
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./uploads");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 30);
    cb(null, `exp_${Date.now()}_${safeName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|pdf/i;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype) || file.mimetype === "application/pdf";
    if (ext && mime) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG and PDF receipts are allowed (max 5 MB each)."));
    }
  },
});

// ── Role & Permission Helpers ──
const isSuperAdmin = (req) => {
  return (
    req.user?.email === "gadanipranav@gmail.com" ||
    req.user?.role?.name === "Super Admin" ||
    req.user?.role === "Super Admin"
  );
};

const isCompanyOwnerOrAdmin = (req) => {
  if (isSuperAdmin(req)) return true;
  const roleName = req.user?.role?.name || req.user?.role || "";
  return roleName === "Company Owner" || roleName === "Admin";
};

const canApproveExpenses = (req) => {
  if (isCompanyOwnerOrAdmin(req)) return true;
  const roleName = req.user?.role?.name || req.user?.role || "";
  if (roleName === "Manager" || roleName === "HR" || roleName === "Lead") return true;
  const perms = req.user?.role?.permissions || [];
  const p = perms.find((x) => x.value === "expense_management");
  return p ? p.all || p.approve || p.update : false;
};

const canPayExpenses = (req) => {
  if (isCompanyOwnerOrAdmin(req)) return true;
  const roleName = req.user?.role?.name || req.user?.role || "";
  if (roleName === "Accounts" || roleName === "Finance") return true;
  const perms = req.user?.role?.permissions || [];
  const p = perms.find((x) => x.value === "expense_management");
  return p ? p.all || p.pay || p.update : false;
};

const canManageCategoriesOrPolicy = (req) => {
  if (isCompanyOwnerOrAdmin(req)) return true;
  const perms = req.user?.role?.permissions || [];
  const p = perms.find((x) => x.value === "expense_management");
  return p ? p.all || p.update || p.delete : false;
};

// Helper: Safely parse JSON
const safeJsonParse = (val, fallback = null) => {
  if (!val) return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    return fallback;
  }
};

// ============================================================
// 1. EXPENSE CATEGORIES ENDPOINTS
// ============================================================

// GET /categories
router.get("/categories", authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId || "default_company";
    const includeInactive = req.query.all === "true" && canManageCategoriesOrPolicy(req);

    let query = "SELECT * FROM expense_categories WHERE company_id = ?";
    const params = [companyId];

    if (!includeInactive) {
      query += " AND is_active = 1";
    }
    query += " ORDER BY name ASC";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /categories
router.post("/categories", authMiddleware, async (req, res) => {
  try {
    if (!canManageCategoriesOrPolicy(req)) {
      return res.status(403).json({ error: "Access denied: Cannot manage categories." });
    }
    const companyId = req.user.companyId || "default_company";
    const { name, description, maxLimit } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Category name is required." });
    }

    const id = `cat_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const limit = maxLimit !== undefined && maxLimit !== "" && maxLimit !== null ? parseFloat(maxLimit) : null;

    await pool.query(
      `INSERT INTO expense_categories (id, company_id, name, description, max_limit, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [id, companyId, name.trim(), description ? description.trim() : "", limit]
    );

    const [created] = await pool.query("SELECT * FROM expense_categories WHERE id = ?", [id]);
    res.status(201).json(created[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /categories/:id
router.put("/categories/:id", authMiddleware, async (req, res) => {
  try {
    if (!canManageCategoriesOrPolicy(req)) {
      return res.status(403).json({ error: "Access denied: Cannot manage categories." });
    }
    const companyId = req.user.companyId || "default_company";
    const { id } = req.params;
    const { name, description, maxLimit, isActive } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Category name is required." });
    }

    const limit = maxLimit !== undefined && maxLimit !== "" && maxLimit !== null ? parseFloat(maxLimit) : null;
    const active = isActive === false || isActive === 0 ? 0 : 1;

    const [result] = await pool.query(
      `UPDATE expense_categories 
       SET name = ?, description = ?, max_limit = ?, is_active = ?
       WHERE id = ? AND company_id = ?`,
      [name.trim(), description ? description.trim() : "", limit, active, id, companyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Category not found in your company." });
    }

    const [updated] = await pool.query("SELECT * FROM expense_categories WHERE id = ?", [id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /categories/:id (or toggle inactive)
router.delete("/categories/:id", authMiddleware, async (req, res) => {
  try {
    if (!canManageCategoriesOrPolicy(req)) {
      return res.status(403).json({ error: "Access denied: Cannot delete categories." });
    }
    const companyId = req.user.companyId || "default_company";
    const { id } = req.params;

    // Check if any expenses reference this category
    const [[countRow]] = await pool.query(
      "SELECT COUNT(*) as count FROM expenses WHERE category_id = ? AND company_id = ?",
      [id, companyId]
    );

    if (countRow?.count > 0) {
      // Soft disable if referenced
      await pool.query(
        "UPDATE expense_categories SET is_active = 0 WHERE id = ? AND company_id = ?",
        [id, companyId]
      );
      return res.json({ message: "Category is linked to existing claims; it has been disabled instead of deleted." });
    }

    await pool.query("DELETE FROM expense_categories WHERE id = ? AND company_id = ?", [id, companyId]);
    res.json({ message: "Category deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 2. EXPENSE POLICY ENDPOINTS
// ============================================================

// GET /policy
router.get("/policy", authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId || "default_company";
    const [rows] = await pool.query("SELECT * FROM expense_policies WHERE company_id = ? LIMIT 1", [companyId]);

    if (rows.length === 0) {
      // Return sensible defaults if no policy record yet
      return res.json({
        id: "default",
        company_id: companyId,
        max_amount_per_expense: 50000.0,
        max_amount_per_month: 200000.0,
        receipt_mandatory_above: 500.0,
        allow_future_dates: 0,
        duplicate_detection: 1,
      });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /policy
router.put("/policy", authMiddleware, async (req, res) => {
  try {
    if (!canManageCategoriesOrPolicy(req)) {
      return res.status(403).json({ error: "Access denied: Cannot manage company expense policies." });
    }
    const companyId = req.user.companyId || "default_company";
    const { maxAmountPerExpense, maxAmountPerMonth, receiptMandatoryAbove, allowFutureDates, duplicateDetection } =
      req.body;

    const maxExp = parseFloat(maxAmountPerExpense) || 50000;
    const maxMonth = parseFloat(maxAmountPerMonth) || 200000;
    const receiptAbove = parseFloat(receiptMandatoryAbove) || 500;
    const futureDates = allowFutureDates ? 1 : 0;
    const duplicate = duplicateDetection !== false ? 1 : 0;

    await pool.query(
      `INSERT INTO expense_policies 
       (id, company_id, max_amount_per_expense, max_amount_per_month, receipt_mandatory_above, allow_future_dates, duplicate_detection)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         max_amount_per_expense = VALUES(max_amount_per_expense),
         max_amount_per_month = VALUES(max_amount_per_month),
         receipt_mandatory_above = VALUES(receipt_mandatory_above),
         allow_future_dates = VALUES(allow_future_dates),
         duplicate_detection = VALUES(duplicate_detection)`,
      [`pol_${companyId}`, companyId, maxExp, maxMonth, receiptAbove, futureDates, duplicate]
    );

    const [rows] = await pool.query("SELECT * FROM expense_policies WHERE company_id = ? LIMIT 1", [companyId]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 3. EXPENSES SUMMARY / DASHBOARD ANALYTICS
// ============================================================

router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId || "default_company";
    const isApproverOrAdmin = canApproveExpenses(req) || canPayExpenses(req);
    const userId = req.user.id;

    // 1. Employee-specific totals (always computed for user's own claims)
    const [empStats] = await pool.query(
      `SELECT status, COUNT(*) as count, SUM(total_amount) as total
       FROM expenses
       WHERE company_id = ? AND employee_id = ?
       GROUP BY status`,
      [companyId, userId]
    );

    const mySummary = {
      draft: { count: 0, amount: 0 },
      pending: { count: 0, amount: 0 },
      approved: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
      rejected: { count: 0, amount: 0 },
      cancelled: { count: 0, amount: 0 },
    };

    empStats.forEach((r) => {
      const key = (r.status || "").toLowerCase();
      if (mySummary[key]) {
        mySummary[key].count = Number(r.count || 0);
        mySummary[key].amount = Number(r.total || 0);
      }
    });

    let adminAnalytics = null;

    if (isApproverOrAdmin) {
      // 2. Company-wide totals for managers/admins
      const [allStatus] = await pool.query(
        `SELECT status, COUNT(*) as count, SUM(total_amount) as total
         FROM expenses
         WHERE company_id = ?
         GROUP BY status`,
        [companyId]
      );

      // Spend this month (Approved + Paid)
      const [[spendMonthRow]] = await pool.query(
        `SELECT SUM(COALESCE(approved_amount, total_amount)) as totalSpendThisMonth
         FROM expenses
         WHERE company_id = ? 
           AND status IN ('Approved', 'Paid')
           AND MONTH(expense_date) = MONTH(CURRENT_DATE())
           AND YEAR(expense_date) = YEAR(CURRENT_DATE())`,
        [companyId]
      );

      // Spend by Category
      const [spendByCategory] = await pool.query(
        `SELECT category_name as name, COUNT(*) as count, SUM(COALESCE(approved_amount, total_amount)) as amount
         FROM expenses
         WHERE company_id = ? AND status IN ('Approved', 'Paid')
         GROUP BY category_name
         ORDER BY amount DESC LIMIT 8`,
        [companyId]
      );

      // Spend by Employee
      const [spendByEmployee] = await pool.query(
        `SELECT employee_name as name, COUNT(*) as count, SUM(COALESCE(approved_amount, total_amount)) as amount
         FROM expenses
         WHERE company_id = ? AND status IN ('Approved', 'Paid')
         GROUP BY employee_id, employee_name
         ORDER BY amount DESC LIMIT 8`,
        [companyId]
      );

      // Spend by Project
      const [spendByProject] = await pool.query(
        `SELECT COALESCE(project_name, 'No Project') as name, COUNT(*) as count, SUM(COALESCE(approved_amount, total_amount)) as amount
         FROM expenses
         WHERE company_id = ? AND status IN ('Approved', 'Paid')
         GROUP BY project_id, project_name
         ORDER BY amount DESC LIMIT 8`,
        [companyId]
      );

      // Monthly Trend (Last 6 Months)
      const [monthlyTrend] = await pool.query(
        `SELECT DATE_FORMAT(expense_date, '%b %Y') as month, 
                SUM(COALESCE(approved_amount, total_amount)) as total,
                COUNT(*) as count
         FROM expenses
         WHERE company_id = ? AND status IN ('Approved', 'Paid')
           AND expense_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
         GROUP BY DATE_FORMAT(expense_date, '%b %Y'), YEAR(expense_date), MONTH(expense_date)
         ORDER BY YEAR(expense_date) ASC, MONTH(expense_date) ASC`,
        [companyId]
      );

      adminAnalytics = {
        totalSpendThisMonth: Number(spendMonthRow?.totalSpendThisMonth || 0),
        statusBreakdown: allStatus,
        spendByCategory,
        spendByEmployee,
        spendByProject,
        monthlyTrend,
      };
    }

    res.json({
      mySummary,
      adminAnalytics,
      isApproverOrAdmin,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 4. CSV EXPORT ENDPOINT
// ============================================================

router.get("/export", authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId || "default_company";
    const isApproverOrAdmin = canApproveExpenses(req) || canPayExpenses(req);
    const userId = req.user.id;

    const { status, categoryId, projectId, employeeId, startDate, endDate, search } = req.query;

    let query = "SELECT * FROM expenses WHERE company_id = ?";
    const params = [companyId];

    if (!isApproverOrAdmin) {
      query += " AND employee_id = ?";
      params.push(userId);
    } else if (employeeId) {
      query += " AND employee_id = ?";
      params.push(employeeId);
    }

    if (status && status !== "All") {
      query += " AND status = ?";
      params.push(status);
    }
    if (categoryId) {
      query += " AND category_id = ?";
      params.push(categoryId);
    }
    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }
    if (startDate) {
      query += " AND expense_date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      query += " AND expense_date <= ?";
      params.push(endDate);
    }
    if (search && search.trim()) {
      query += " AND (title LIKE ? OR description LIKE ? OR employee_name LIKE ?)";
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    query += " ORDER BY expense_date DESC, created_at DESC";

    const [rows] = await pool.query(query, params);

    // Build CSV
    const headers = [
      "Claim ID",
      "Date",
      "Employee",
      "Category",
      "Project",
      "Title",
      "Claimed Amount",
      "Approved Amount",
      "Currency",
      "Payment Mode",
      "Status",
      "Approver",
      "Approver Remarks",
      "Paid Date",
      "Txn Reference",
      "Created At",
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const s = String(str).replace(/"/g, '""');
      return `"${s}"`;
    };

    const csvLines = [headers.join(",")];

    for (const r of rows) {
      const payInfo = safeJsonParse(r.payment_info, {});
      const line = [
        escapeCsv(r.id),
        escapeCsv(r.expense_date ? new Date(r.expense_date).toISOString().slice(0, 10) : ""),
        escapeCsv(r.employee_name),
        escapeCsv(r.category_name),
        escapeCsv(r.project_name || "N/A"),
        escapeCsv(r.title),
        Number(r.total_amount || 0).toFixed(2),
        r.approved_amount !== null && r.approved_amount !== undefined ? Number(r.approved_amount).toFixed(2) : "",
        escapeCsv(r.currency || "INR"),
        escapeCsv(r.payment_mode),
        escapeCsv(r.status),
        escapeCsv(r.approver_name || ""),
        escapeCsv(r.approver_comment || ""),
        escapeCsv(payInfo.date || (r.paid_at ? new Date(r.paid_at).toISOString().slice(0, 10) : "")),
        escapeCsv(payInfo.reference || ""),
        escapeCsv(r.created_at ? new Date(r.created_at).toISOString().slice(0, 19).replace("T", " ") : ""),
      ];
      csvLines.push(line.join(","));
    }

    const csvContent = csvLines.join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=Expense_Claims_${Date.now()}.csv`);
    return res.status(200).send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 5. EXPENSES LIST & PAGINATION
// ============================================================

router.get("/", authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId || "default_company";
    const isApproverOrAdmin = canApproveExpenses(req) || canPayExpenses(req);
    const userId = req.user.id;

    const { status, categoryId, projectId, employeeId, startDate, endDate, search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 15));
    const offset = (page - 1) * limit;

    let whereClause = "WHERE e.company_id = ? AND (s.status = 'Active' OR s.status IS NULL)";
    const params = [companyId];

    // Tenant / Employee filter
    if (!isApproverOrAdmin) {
      whereClause += " AND e.employee_id = ?";
      params.push(userId);
    } else if (employeeId) {
      whereClause += " AND e.employee_id = ?";
      params.push(employeeId);
    }

    if (status && status !== "All") {
      whereClause += " AND e.status = ?";
      params.push(status);
    }
    if (categoryId) {
      whereClause += " AND e.category_id = ?";
      params.push(categoryId);
    }
    if (projectId) {
      whereClause += " AND e.project_id = ?";
      params.push(projectId);
    }
    if (startDate) {
      whereClause += " AND e.expense_date >= ?";
      params.push(startDate);
    }
    if (endDate) {
      whereClause += " AND e.expense_date <= ?";
      params.push(endDate);
    }
    if (search && search.trim()) {
      whereClause += " AND (e.title LIKE ? OR e.description LIKE ? OR e.employee_name LIKE ?)";
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    // Count
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) as total 
       FROM expenses e
       LEFT JOIN staff s ON e.employee_id = s.id OR (e.employee_email = s.email AND e.employee_email != '')
       ${whereClause}`, 
      params
    );
    const total = countRow?.total || 0;

    // Fetch Page
    const [rows] = await pool.query(
      `SELECT e.* 
       FROM expenses e
       LEFT JOIN staff s ON e.employee_id = s.id OR (e.employee_email = s.email AND e.employee_email != '')
       ${whereClause} 
       ORDER BY e.expense_date DESC, e.created_at DESC 
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Format fields
    const formatted = rows.map((r) => ({
      ...r,
      items: safeJsonParse(r.items, []),
      receipts: safeJsonParse(r.receipts, []),
      payment_info: safeJsonParse(r.payment_info, null),
      history: safeJsonParse(r.history, []),
    }));

    res.json({
      expenses: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 6. GET SINGLE EXPENSE DETAIL
// ============================================================

router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId || "default_company";
    const { id } = req.params;

    const [rows] = await pool.query("SELECT * FROM expenses WHERE id = ? AND company_id = ? LIMIT 1", [
      id,
      companyId,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Expense claim not found." });
    }

    const expense = rows[0];
    const isApproverOrAdmin = canApproveExpenses(req) || canPayExpenses(req);

    // Tenant / Employee Isolation: Only author or approver/admin may view
    if (!isApproverOrAdmin && expense.employee_id !== req.user.id) {
      return res.status(403).json({ error: "Access denied: You cannot view this expense claim." });
    }

    res.json({
      ...expense,
      items: safeJsonParse(expense.items, []),
      receipts: safeJsonParse(expense.receipts, []),
      payment_info: safeJsonParse(expense.payment_info, null),
      history: safeJsonParse(expense.history, []),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 7. CREATE EXPENSE CLAIM
// ============================================================

router.post("/", authMiddleware, upload.array("receipts", 5), async (req, res) => {
  try {
    const companyId = req.user.companyId || "default_company";
    const userId = req.user.id;
    const userName = req.user.name || "Employee";
    const userEmail = req.user.email || "";

    const {
      title,
      categoryId,
      projectId,
      items: rawItems,
      totalAmount: rawTotalAmount,
      currency = "INR",
      expenseDate,
      paymentMode = "UPI",
      description,
      asDraft = "false",
      ignoreDuplicateWarning = "false",
    } = req.body;

    const isDraft = asDraft === "true" || asDraft === true;

    // 1. Title validation
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Plese enter title", field: "title" });
    }

    // 2. Category lookup
    if (!categoryId) {
      return res.status(400).json({ error: "Plese enter category", field: "categoryId" });
    }

    const [catRows] = await pool.query(
      "SELECT * FROM expense_categories WHERE id = ? AND company_id = ? LIMIT 1",
      [categoryId, companyId]
    );

    if (catRows.length === 0) {
      return res.status(400).json({ error: "Plese enter category", field: "categoryId" });
    }
    const category = catRows[0];

    // 3. Project lookup (optional)
    let projectName = null;
    if (projectId && projectId.trim()) {
      const [projRows] = await pool.query("SELECT id, name FROM projects WHERE id = ? LIMIT 1", [projectId]);
      if (projRows.length > 0) {
        projectName = projRows[0].name;
      }
    }

    // 4. Expense Date validation
    if (!expenseDate) {
      return res.status(400).json({ error: "Plese enter date", field: "expenseDate" });
    }
    const expDateObj = new Date(expenseDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    // Fetch company policy
    const [polRows] = await pool.query("SELECT * FROM expense_policies WHERE company_id = ? LIMIT 1", [companyId]);
    const policy = polRows[0] || {
      max_amount_per_expense: 50000.0,
      max_amount_per_month: 200000.0,
      receipt_mandatory_above: 500.0,
      allow_future_dates: 0,
      duplicate_detection: 1,
    };

    if (!policy.allow_future_dates && expDateObj > today) {
      return res.status(400).json({ error: "Expense date cannot be in the future." });
    }

    // 5. Line items parsing & Total calculation
    let parsedItems = [];
    if (rawItems) {
      try {
        parsedItems = typeof rawItems === "string" ? JSON.parse(rawItems) : rawItems;
      } catch (e) {
        parsedItems = [];
      }
    }

    let calculatedTotal = 0;
    if (Array.isArray(parsedItems) && parsedItems.length > 0) {
      parsedItems = parsedItems.map((item, idx) => {
        const itemAmount = Math.round(parseFloat(item.amount || 0) * 100) / 100;
        calculatedTotal += itemAmount;
        return {
          id: item.id || `item_${idx + 1}`,
          description: item.description || `Item ${idx + 1}`,
          amount: itemAmount,
          receiptIndex: item.receiptIndex !== undefined ? item.receiptIndex : null,
        };
      });
      calculatedTotal = Math.round(calculatedTotal * 100) / 100;
    }

    let finalAmount = parseFloat(rawTotalAmount);
    if (isNaN(finalAmount) || finalAmount <= 0) {
      if (calculatedTotal > 0) {
        finalAmount = calculatedTotal;
      } else {
        return res.status(400).json({ error: "Plese enter amount", field: "totalAmount" });
      }
    } else {
      finalAmount = Math.round(finalAmount * 100) / 100;
    }

    // 6. Max amount per expense policy check
    if (!isDraft && finalAmount > policy.max_amount_per_expense) {
      return res.status(400).json({
        error: `Expense amount (₹${finalAmount}) exceeds company limit of ₹${policy.max_amount_per_expense} per claim.`,
      });
    }

    // Category limit check
    if (!isDraft && category.max_limit && finalAmount > category.max_limit) {
      return res.status(400).json({
        error: `Expense amount exceeds category limit of ₹${category.max_limit} for "${category.name}".`,
      });
    }

    // Monthly limit check
    if (!isDraft) {
      const [[monthSpendRow]] = await pool.query(
        `SELECT SUM(total_amount) as totalMonth
         FROM expenses
         WHERE company_id = ? AND employee_id = ? AND status IN ('Pending', 'Approved', 'Paid')
           AND MONTH(expense_date) = MONTH(?) AND YEAR(expense_date) = YEAR(?)`,
        [companyId, userId, expenseDate, expenseDate]
      );
      const existingMonthTotal = Number(monthSpendRow?.totalMonth || 0);
      if (existingMonthTotal + finalAmount > policy.max_amount_per_month) {
        return res.status(400).json({
          error: `Monthly reimbursement limit of ₹${policy.max_amount_per_month} reached (Current monthly spend: ₹${existingMonthTotal}).`,
        });
      }
    }

    // 7. Receipts processing
    const receipts = (req.files || []).map((file) => ({
      name: file.originalname,
      url: `/uploads/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype,
      uploadedAt: new Date(),
    }));

    // Mandatory receipt check
    if (!isDraft && finalAmount >= policy.receipt_mandatory_above && receipts.length === 0) {
      return res.status(400).json({
        error: `Receipt attachment is mandatory for claims of ₹${policy.receipt_mandatory_above} or higher.`,
      });
    }

    // 8. Duplicate detection
    if (policy.duplicate_detection && ignoreDuplicateWarning !== "true" && !isDraft) {
      const [duplicates] = await pool.query(
        `SELECT id, title, total_amount, expense_date, status
         FROM expenses
         WHERE company_id = ? AND employee_id = ? AND category_id = ? 
           AND total_amount = ? AND expense_date = ? AND status IN ('Pending', 'Approved', 'Paid')
         LIMIT 1`,
        [companyId, userId, categoryId, finalAmount, expenseDate]
      );

      if (duplicates.length > 0) {
        return res.status(409).json({
          duplicateWarning: true,
          error: `A similar expense claim ("${duplicates[0].title}" - ₹${duplicates[0].total_amount} on ${expenseDate}) is already ${duplicates[0].status}. Proceed anyway?`,
        });
      }
    }

    // 9. Status and History
    const status = isDraft ? "Draft" : "Pending";
    const initialHistory = [
      {
        action: isDraft ? "Created as Draft" : "Submitted",
        byId: userId,
        byName: userName,
        at: new Date().toISOString(),
        remarks: isDraft ? "Claim saved as draft" : "Claim submitted for approval",
      },
    ];

    const expenseId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const submittedAt = isDraft ? null : new Date();

    await pool.query(
      `INSERT INTO expenses (
        id, company_id, employee_id, employee_name, employee_email,
        title, category_id, category_name, project_id, project_name,
        items, total_amount, approved_amount, currency, expense_date,
        payment_mode, description, receipts, status, submitted_at, history
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        expenseId,
        companyId,
        userId,
        userName,
        userEmail,
        title.trim(),
        categoryId,
        category.name,
        projectId || null,
        projectName || null,
        JSON.stringify(parsedItems),
        finalAmount,
        null,
        currency,
        expenseDate,
        paymentMode,
        description ? description.trim() : "",
        JSON.stringify(receipts),
        status,
        submittedAt,
        JSON.stringify(initialHistory),
      ]
    );

    const [createdRows] = await pool.query("SELECT * FROM expenses WHERE id = ?", [expenseId]);
    const createdExpense = {
      ...createdRows[0],
      items: safeJsonParse(createdRows[0].items, []),
      receipts: safeJsonParse(createdRows[0].receipts, []),
      history: safeJsonParse(createdRows[0].history, []),
    };

    // 10. Emit Socket.io & Email notification
    const io = req.app.get("io");
    if (!isDraft) {
      if (io) {
        io.emit("expense_submitted", {
          id: expenseId,
          title: createdExpense.title,
          employeeName: userName,
          totalAmount: finalAmount,
          currency,
          companyId,
        });
      }

      // Notify company admin via email
      try {
        const [adminRows] = await pool.query(
          "SELECT email, name FROM staff WHERE (role = 'role_superadmin' OR role = 'role_owner' OR role = 'Super Admin' OR role = 'Company Owner') AND status = 'Active' LIMIT 3"
        );
        for (const admin of adminRows) {
          if (admin.email) {
            sendExpenseMail({
              to: admin.email,
              recipientName: admin.name,
              title: createdExpense.title,
              action: "Submitted",
              amount: finalAmount,
              currency,
              comment: `Submitted by ${userName} for category: ${category.name}`,
              appLink: `${process.env.APP_URL || "http://localhost:5173"}/expenses`,
            });
          }
        }
      } catch (e) {
        console.warn("Expense notification mail failed:", e.message);
      }
    }

    res.status(201).json(createdExpense);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 8. UPDATE EXPENSE CLAIM (Draft or Pending only)
// ============================================================

router.put("/:id", authMiddleware, upload.array("receipts", 5), async (req, res) => {
  try {
    const companyId = req.user.companyId || "default_company";
    const { id } = req.params;
    const userId = req.user.id;

    const [rows] = await pool.query("SELECT * FROM expenses WHERE id = ? AND company_id = ? LIMIT 1", [
      id,
      companyId,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Expense claim not found." });
    }

    const expense = rows[0];

    // Only owner or admin can edit, and only while Draft or Pending
    const isOwnerOrAdmin = isCompanyOwnerOrAdmin(req);
    if (!isOwnerOrAdmin && expense.employee_id !== userId) {
      return res.status(403).json({ error: "Access denied: You cannot edit another user's claim." });
    }

    if (expense.status !== "Draft" && expense.status !== "Pending") {
      return res.status(400).json({
        error: `Cannot edit an expense claim that is already ${expense.status}. Only Draft and Pending claims can be modified.`,
      });
    }

    const {
      title,
      categoryId,
      projectId,
      items: rawItems,
      totalAmount: rawTotalAmount,
      currency = "INR",
      expenseDate,
      paymentMode = "UPI",
      description,
      existingReceipts: rawExistingReceipts,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required." });
    }

    // Category
    const catId = categoryId || expense.category_id;
    const [catRows] = await pool.query(
      "SELECT * FROM expense_categories WHERE id = ? AND company_id = ? LIMIT 1",
      [catId, companyId]
    );
    const category = catRows.length > 0 ? catRows[0] : { id: catId, name: expense.category_name };

    // Project
    let projectName = expense.project_name;
    if (projectId !== undefined) {
      if (projectId && projectId.trim()) {
        const [projRows] = await pool.query("SELECT id, name FROM projects WHERE id = ? LIMIT 1", [projectId]);
        projectName = projRows.length > 0 ? projRows[0].name : null;
      } else {
        projectName = null;
      }
    }

    // Line items
    let parsedItems = safeJsonParse(rawItems, safeJsonParse(expense.items, []));
    let calculatedTotal = 0;
    if (Array.isArray(parsedItems) && parsedItems.length > 0) {
      parsedItems = parsedItems.map((item, idx) => {
        const itemAmount = Math.round(parseFloat(item.amount || 0) * 100) / 100;
        calculatedTotal += itemAmount;
        return {
          id: item.id || `item_${idx + 1}`,
          description: item.description || `Item ${idx + 1}`,
          amount: itemAmount,
        };
      });
      calculatedTotal = Math.round(calculatedTotal * 100) / 100;
    }

    let finalAmount = parseFloat(rawTotalAmount);
    if (isNaN(finalAmount) || finalAmount <= 0) {
      finalAmount = calculatedTotal > 0 ? calculatedTotal : Number(expense.total_amount);
    } else {
      finalAmount = Math.round(finalAmount * 100) / 100;
    }

    // Receipts: merge existing with newly uploaded
    let keptReceipts = safeJsonParse(rawExistingReceipts, safeJsonParse(expense.receipts, []));
    if (!Array.isArray(keptReceipts)) keptReceipts = [];

    const newReceipts = (req.files || []).map((file) => ({
      name: file.originalname,
      url: `/uploads/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype,
      uploadedAt: new Date(),
    }));

    const allReceipts = [...keptReceipts, ...newReceipts];

    // History log
    const history = safeJsonParse(expense.history, []);
    history.push({
      action: "Updated",
      byId: userId,
      byName: req.user.name || "User",
      at: new Date().toISOString(),
      remarks: "Expense details updated",
    });

    await pool.query(
      `UPDATE expenses SET
        title = ?, category_id = ?, category_name = ?,
        project_id = ?, project_name = ?,
        items = ?, total_amount = ?, currency = ?,
        expense_date = ?, payment_mode = ?, description = ?,
        receipts = ?, history = ?
       WHERE id = ? AND company_id = ?`,
      [
        title.trim(),
        catId,
        category.name,
        projectId || null,
        projectName,
        JSON.stringify(parsedItems),
        finalAmount,
        currency,
        expenseDate || expense.expense_date,
        paymentMode,
        description ? description.trim() : "",
        JSON.stringify(allReceipts),
        JSON.stringify(history),
        id,
        companyId,
      ]
    );

    const [updatedRows] = await pool.query("SELECT * FROM expenses WHERE id = ?", [id]);
    res.json({
      ...updatedRows[0],
      items: safeJsonParse(updatedRows[0].items, []),
      receipts: safeJsonParse(updatedRows[0].receipts, []),
      history: safeJsonParse(updatedRows[0].history, []),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 9. DELETE DRAFT EXPENSE CLAIM (OR SEED / ANY FOR SUPER ADMIN)
// ============================================================

router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId || "default_company";
    const { id } = req.params;
    const userId = req.user.id;

    // Check if user has permission or is Super Admin
    if (!isSuperAdmin(req) && !canManageExpenses(req)) {
      return res.status(403).json({ error: "Access denied: You do not have permission to delete claims." });
    }

    const [rows] = await pool.query("SELECT * FROM expenses WHERE id = ? AND company_id = ? LIMIT 1", [
      id,
      companyId,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Expense claim not found." });
    }

    const expense = rows[0];

    // If not super admin/manager, only Draft expenses can be deleted
    if (!isSuperAdmin(req) && !canManageExpenses(req) && expense.status !== "Draft") {
      return res.status(400).json({
        error: `Only Draft claims can be deleted. Current status is "${expense.status}".`,
      });
    }

    await pool.query("DELETE FROM expenses WHERE id = ? AND company_id = ?", [id, companyId]);
    res.json({ message: "Claim deleted successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses/clean-seed-data - Super Admin one-click clean seed claims
router.post("/clean-seed-data", authMiddleware, async (req, res) => {
  try {
    if (!isSuperAdmin(req) && !canManageExpenses(req)) {
      return res.status(403).json({ error: "Access denied: Only Admin can clear seed data." });
    }

    const [result] = await pool.query(
      "DELETE FROM expenses WHERE id LIKE 'exp_seed_%' OR description LIKE '%milestone delivery%' OR description LIKE '%Strategy alignment meeting%'"
    );

    res.json({ success: true, message: `Removed ${result.affectedRows} seed expense claims.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 10. SUBMIT DRAFT CLAIM
// ============================================================

router.post("/:id/submit", authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId || "default_company";
    const { id } = req.params;
    const userId = req.user.id;

    const [rows] = await pool.query("SELECT * FROM expenses WHERE id = ? AND company_id = ? LIMIT 1", [
      id,
      companyId,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Expense claim not found." });
    }

    const expense = rows[0];

    if (expense.employee_id !== userId && !isCompanyOwnerOrAdmin(req)) {
      return res.status(403).json({ error: "Access denied: You cannot submit this claim." });
    }

    if (expense.status !== "Draft") {
      return res.status(400).json({ error: `Only Draft claims can be submitted. Current status: ${expense.status}` });
    }

    // Policy check for mandatory receipts
    const [polRows] = await pool.query("SELECT * FROM expense_policies WHERE company_id = ? LIMIT 1", [companyId]);
    const policy = polRows[0] || { receipt_mandatory_above: 500 };
    const receipts = safeJsonParse(expense.receipts, []);

    if (Number(expense.total_amount) >= Number(policy.receipt_mandatory_above) && receipts.length === 0) {
      return res.status(400).json({
        error: `Receipt attachment is required before submitting claims of ₹${policy.receipt_mandatory_above} or higher.`,
      });
    }

    const history = safeJsonParse(expense.history, []);
    history.push({
      action: "Submitted",
      byId: userId,
      byName: req.user.name || "Employee",
      at: new Date().toISOString(),
      remarks: "Draft claim submitted for approval",
    });

    await pool.query(
      `UPDATE expenses 
       SET status = 'Pending', submitted_at = NOW(), history = ?
       WHERE id = ? AND company_id = ?`,
      [JSON.stringify(history), id, companyId]
    );

    const io = req.app.get("io");
    if (io) {
      io.emit("expense_submitted", {
        id,
        title: expense.title,
        employeeName: expense.employee_name,
        totalAmount: expense.total_amount,
        companyId,
      });
    }

    res.json({ message: "Expense claim submitted for approval successfully.", status: "Pending" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 11. CANCEL PENDING CLAIM (Employee action)
// ============================================================

router.post("/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const companyId = req.user.companyId || "default_company";
    const { id } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;

    const [rows] = await pool.query("SELECT * FROM expenses WHERE id = ? AND company_id = ? LIMIT 1", [
      id,
      companyId,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Expense claim not found." });
    }

    const expense = rows[0];

    if (expense.employee_id !== userId && !isCompanyOwnerOrAdmin(req)) {
      return res.status(403).json({ error: "Access denied: You cannot cancel another user's claim." });
    }

    if (expense.status !== "Pending") {
      return res.status(400).json({
        error: `Only claims in "Pending" status can be cancelled. Current status is "${expense.status}".`,
      });
    }

    const history = safeJsonParse(expense.history, []);
    history.push({
      action: "Cancelled",
      byId: userId,
      byName: req.user.name || "Employee",
      at: new Date().toISOString(),
      remarks: reason ? reason.trim() : "Cancelled by employee",
    });

    await pool.query(
      `UPDATE expenses 
       SET status = 'Cancelled', history = ?
       WHERE id = ? AND company_id = ?`,
      [JSON.stringify(history), id, companyId]
    );

    res.json({ message: "Expense claim cancelled.", status: "Cancelled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 12. APPROVE EXPENSE CLAIM (Full or Partial)
// ============================================================

router.post("/:id/approve", authMiddleware, async (req, res) => {
  try {
    if (!canApproveExpenses(req)) {
      return res.status(403).json({ error: "Access denied: You do not have permission to approve expenses." });
    }

    const companyId = req.user.companyId || "default_company";
    const { id } = req.params;
    const approverId = req.user.id;
    const approverName = req.user.name || "Approver";
    const { approvedAmount, comment } = req.body;

    const [rows] = await pool.query("SELECT * FROM expenses WHERE id = ? AND company_id = ? LIMIT 1", [
      id,
      companyId,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Expense claim not found." });
    }

    const expense = rows[0];

    // Approver cannot approve their own expense
    if (expense.employee_id === approverId && !isSuperAdmin(req)) {
      return res.status(403).json({ error: "Approver cannot approve their own expense claim." });
    }

    if (expense.status !== "Pending") {
      return res.status(400).json({
        error: `Only "Pending" expense claims can be approved. Current status is "${expense.status}".`,
      });
    }

    // Determine final approved amount
    let finalApprovedAmount = Number(expense.total_amount);
    let isPartial = false;

    if (approvedAmount !== undefined && approvedAmount !== "" && approvedAmount !== null) {
      const parsedAmount = Math.round(parseFloat(approvedAmount) * 100) / 100;
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Approved amount must be a positive number greater than 0." });
      }
      if (parsedAmount > Number(expense.total_amount)) {
        return res.status(400).json({ error: "Approved amount cannot be greater than the claimed amount." });
      }
      if (parsedAmount < Number(expense.total_amount)) {
        isPartial = true;
        finalApprovedAmount = parsedAmount;
        if (!comment || !comment.trim()) {
          return res.status(400).json({ error: "Reason is required when approving a partial amount." });
        }
      }
    }

    const actionText = isPartial ? "Partially Approved" : "Approved";
    const history = safeJsonParse(expense.history, []);
    history.push({
      action: actionText,
      byId: approverId,
      byName: approverName,
      at: new Date().toISOString(),
      remarks: comment ? comment.trim() : isPartial ? `Approved ₹${finalApprovedAmount}` : "Approved full amount",
    });

    await pool.query(
      `UPDATE expenses 
       SET status = 'Approved',
           approved_amount = ?,
           approver_id = ?,
           approver_name = ?,
           approver_comment = ?,
           approved_at = NOW(),
           history = ?
       WHERE id = ? AND company_id = ?`,
      [finalApprovedAmount, approverId, approverName, comment ? comment.trim() : null, JSON.stringify(history), id, companyId]
    );

    // Socket.io notification
    const io = req.app.get("io");
    if (io) {
      io.emit("expense_approved", {
        id,
        title: expense.title,
        employeeId: expense.employee_id,
        approvedAmount: finalApprovedAmount,
        status: "Approved",
      });
    }

    // Email notification to employee
    if (expense.employee_email) {
      sendExpenseMail({
        to: expense.employee_email,
        recipientName: expense.employee_name,
        title: expense.title,
        action: actionText,
        amount: finalApprovedAmount,
        currency: expense.currency || "INR",
        comment: comment ? comment.trim() : "",
        appLink: `${process.env.APP_URL || "http://localhost:5173"}/expenses`,
      });
    }

    res.json({
      message: `Expense claim ${actionText.toLowerCase()} successfully.`,
      status: "Approved",
      approvedAmount: finalApprovedAmount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 13. REJECT EXPENSE CLAIM
// ============================================================

router.post("/:id/reject", authMiddleware, async (req, res) => {
  try {
    if (!canApproveExpenses(req)) {
      return res.status(403).json({ error: "Access denied: You do not have permission to reject expenses." });
    }

    const companyId = req.user.companyId || "default_company";
    const { id } = req.params;
    const approverId = req.user.id;
    const approverName = req.user.name || "Approver";
    const { comment } = req.body;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: "A rejection reason/comment is required." });
    }

    const [rows] = await pool.query("SELECT * FROM expenses WHERE id = ? AND company_id = ? LIMIT 1", [
      id,
      companyId,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Expense claim not found." });
    }

    const expense = rows[0];

    // Approver cannot reject their own expense
    if (expense.employee_id === approverId && !isSuperAdmin(req)) {
      return res.status(403).json({ error: "Approver cannot act on their own expense claim." });
    }

    if (expense.status !== "Pending") {
      return res.status(400).json({
        error: `Only "Pending" expense claims can be rejected. Current status is "${expense.status}".`,
      });
    }

    const history = safeJsonParse(expense.history, []);
    history.push({
      action: "Rejected",
      byId: approverId,
      byName: approverName,
      at: new Date().toISOString(),
      remarks: comment.trim(),
    });

    await pool.query(
      `UPDATE expenses 
       SET status = 'Rejected',
           approver_id = ?,
           approver_name = ?,
           approver_comment = ?,
           rejected_at = NOW(),
           history = ?
       WHERE id = ? AND company_id = ?`,
      [approverId, approverName, comment.trim(), JSON.stringify(history), id, companyId]
    );

    // Socket.io
    const io = req.app.get("io");
    if (io) {
      io.emit("expense_rejected", {
        id,
        title: expense.title,
        employeeId: expense.employee_id,
        status: "Rejected",
      });
    }

    // Email
    if (expense.employee_email) {
      sendExpenseMail({
        to: expense.employee_email,
        recipientName: expense.employee_name,
        title: expense.title,
        action: "Rejected",
        amount: expense.total_amount,
        currency: expense.currency || "INR",
        comment: comment.trim(),
        appLink: `${process.env.APP_URL || "http://localhost:5173"}/expenses`,
      });
    }

    res.json({ message: "Expense claim rejected.", status: "Rejected" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 14. RECORD PAYMENT (Mark as Paid)
// ============================================================

router.post("/:id/pay", authMiddleware, async (req, res) => {
  try {
    if (!canPayExpenses(req)) {
      return res.status(403).json({ error: "Access denied: You do not have permission to disburse reimbursements." });
    }

    const companyId = req.user.companyId || "default_company";
    const { id } = req.params;
    const payerId = req.user.id;
    const payerName = req.user.name || "Accounts";

    const { paymentDate, paymentMode = "Bank Transfer", transactionReference, note } = req.body;

    const [rows] = await pool.query("SELECT * FROM expenses WHERE id = ? AND company_id = ? LIMIT 1", [
      id,
      companyId,
    ]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Expense claim not found." });
    }

    const expense = rows[0];

    if (expense.status !== "Approved") {
      return res.status(400).json({
        error: `Only "Approved" expense claims can be marked as Paid. Current status is "${expense.status}".`,
      });
    }

    const payDate = paymentDate || new Date().toISOString().slice(0, 10);
    const paymentInfo = {
      date: payDate,
      mode: paymentMode,
      reference: transactionReference ? transactionReference.trim() : "",
      note: note ? note.trim() : "",
      paidById: payerId,
      paidByName: payerName,
      paidAt: new Date().toISOString(),
    };

    const history = safeJsonParse(expense.history, []);
    history.push({
      action: "Paid",
      byId: payerId,
      byName: payerName,
      at: new Date().toISOString(),
      remarks: `Paid via ${paymentMode}${transactionReference ? ` (Ref: ${transactionReference})` : ""}`,
    });

    await pool.query(
      `UPDATE expenses 
       SET status = 'Paid',
           paid_at = ?,
           payment_info = ?,
           history = ?
       WHERE id = ? AND company_id = ?`,
      [new Date(payDate), JSON.stringify(paymentInfo), JSON.stringify(history), id, companyId]
    );

    // Socket.io
    const io = req.app.get("io");
    if (io) {
      io.emit("expense_paid", {
        id,
        title: expense.title,
        employeeId: expense.employee_id,
        amount: expense.approved_amount || expense.total_amount,
        status: "Paid",
      });
    }

    // Email
    if (expense.employee_email) {
      sendExpenseMail({
        to: expense.employee_email,
        recipientName: expense.employee_name,
        title: expense.title,
        action: "Paid",
        amount: expense.approved_amount || expense.total_amount,
        currency: expense.currency || "INR",
        reference: transactionReference ? transactionReference.trim() : "",
        comment: note ? note.trim() : `Paid via ${paymentMode}`,
        appLink: `${process.env.APP_URL || "http://localhost:5173"}/expenses`,
      });
    }

    res.json({ message: "Expense reimbursement marked as Paid.", status: "Paid", paymentInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// 15. BATCH PAY (Mark multiple approved expenses as Paid together)
// ============================================================

router.post("/batch-pay", authMiddleware, async (req, res) => {
  try {
    if (!canPayExpenses(req)) {
      return res.status(403).json({ error: "Access denied: You do not have permission to disburse reimbursements." });
    }

    const companyId = req.user.companyId || "default_company";
    const payerId = req.user.id;
    const payerName = req.user.name || "Accounts";
    const { expenseIds, paymentDate, paymentMode = "Bank Transfer", transactionReference, note } = req.body;

    if (!Array.isArray(expenseIds) || expenseIds.length === 0) {
      return res.status(400).json({ error: "Please select at least one expense claim to pay." });
    }

    // Verify all claims belong to company and are 'Approved'
    const placeholders = expenseIds.map(() => "?").join(",");
    const [rows] = await pool.query(
      `SELECT * FROM expenses WHERE id IN (${placeholders}) AND company_id = ?`,
      [...expenseIds, companyId]
    );

    if (rows.length !== expenseIds.length) {
      return res.status(400).json({ error: "One or more selected claims were not found in your company." });
    }

    const nonApproved = rows.filter((r) => r.status !== "Approved");
    if (nonApproved.length > 0) {
      return res.status(400).json({
        error: `Cannot pay batch: ${nonApproved.length} claim(s) are not in "Approved" status.`,
      });
    }

    const payDate = paymentDate || new Date().toISOString().slice(0, 10);
    const paymentInfo = {
      date: payDate,
      mode: paymentMode,
      reference: transactionReference ? transactionReference.trim() : "",
      note: note ? note.trim() : "",
      paidById: payerId,
      paidByName: payerName,
      paidAt: new Date().toISOString(),
      isBatch: true,
      batchSize: expenseIds.length,
    };

    let totalDisbursed = 0;

    for (const exp of rows) {
      const amt = Number(exp.approved_amount || exp.total_amount);
      totalDisbursed += amt;

      const history = safeJsonParse(exp.history, []);
      history.push({
        action: "Paid",
        byId: payerId,
        byName: payerName,
        at: new Date().toISOString(),
        remarks: `Batch Paid via ${paymentMode}${transactionReference ? ` (Ref: ${transactionReference})` : ""}`,
      });

      await pool.query(
        `UPDATE expenses 
         SET status = 'Paid',
             paid_at = ?,
             payment_info = ?,
             history = ?
         WHERE id = ? AND company_id = ?`,
        [new Date(payDate), JSON.stringify(paymentInfo), JSON.stringify(history), exp.id, companyId]
      );

      // Notification
      if (exp.employee_email) {
        sendExpenseMail({
          to: exp.employee_email,
          recipientName: exp.employee_name,
          title: exp.title,
          action: "Paid",
          amount: amt,
          currency: exp.currency || "INR",
          reference: transactionReference ? transactionReference.trim() : "",
          comment: note ? note.trim() : `Paid via ${paymentMode}`,
          appLink: `${process.env.APP_URL || "http://localhost:5173"}/expenses`,
        });
      }
    }

    const io = req.app.get("io");
    if (io) {
      io.emit("expense_batch_paid", {
        count: expenseIds.length,
        totalDisbursed,
        companyId,
      });
    }

    res.json({
      message: `Successfully paid ${expenseIds.length} claims totaling ₹${totalDisbursed.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
      })}.`,
      paidCount: expenseIds.length,
      totalDisbursed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
