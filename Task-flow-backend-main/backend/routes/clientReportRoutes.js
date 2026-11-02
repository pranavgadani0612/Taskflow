const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool, logAudit } = require("../config/mysqlDb");

const isUserAdminOrManager = (req) => {
  const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
  const roleName = req.user?.role?.name || req.user?.role || "";
  const position = req.user?.position || "";
  return req.user?.email === superEmail ||
    roleName === "Super Admin" ||
    roleName === "Company Owner" ||
    roleName.includes("Admin") ||
    position.includes("Manager") ||
    position.includes("Lead");
};

// Projects link to clients via the clients.projects JSON column (array of ids or {id/_id} objects)
const getClientProjectIds = (client) => {
  let list = client?.projects;
  if (typeof list === "string") {
    try { list = JSON.parse(list); } catch (_) { list = []; }
  }
  if (!Array.isArray(list)) return [];
  return list
    .map(item => (item && typeof item === "object" ? (item._id || item.id) : item))
    .filter(Boolean)
    .map(String);
};

// 1. GET BILLABLE HOURS & CLIENT SUMMARY
router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    let timeFilter = "";
    const params = [];
    if (start_date && end_date) {
      timeFilter = "AND t.date BETWEEN ? AND ?";
      params.push(start_date, end_date);
    }

    // Fetch clients safely
    let clients = [];
    try {
      const [cRows] = await pool.query(
        `SELECT id, name, email, company, hourly_billing_rate, currency, projects FROM clients`
      );
      clients = cRows || [];
    } catch (e) {
      console.warn("Could not query clients table:", e.message);
      clients = [];
    }

    // Fetch aggregated timesheets safely
    let timesheetAgg = [];
    try {
      const [aggRows] = await pool.query(`
        SELECT 
          project_id,
          project_name,
          SUM(CASE WHEN is_billable = 1 THEN hours ELSE 0 END) as billable_hours,
          SUM(CASE WHEN is_billable = 0 THEN hours ELSE 0 END) as non_billable_hours,
          COUNT(DISTINCT user_id) as resource_count,
          COUNT(*) as log_count
        FROM timesheets t
        WHERE 1=1 ${timeFilter}
        GROUP BY project_id, project_name
      `, params);
      timesheetAgg = aggRows || [];
    } catch (e) {
      console.warn("Could not query timesheets for client report:", e.message);
      timesheetAgg = [];
    }

    // Build client-wise report
    const clientReports = clients.map(c => {
      const clientRate = parseFloat(c.hourly_billing_rate) || 1000.00;
      const currency = c.currency || "INR";

      // Match projects for this client
      const projectIds = getClientProjectIds(c);

      const projectStats = timesheetAgg.filter(t => projectIds.includes(t.project_id));
      
      const billableHours = projectStats.reduce((sum, p) => sum + parseFloat(p.billable_hours || 0), 0);
      const nonBillableHours = projectStats.reduce((sum, p) => sum + parseFloat(p.non_billable_hours || 0), 0);
      const totalHours = billableHours + nonBillableHours;
      const totalAmount = billableHours * clientRate;

      return {
        client_id: c.id,
        client_name: c.name || c.company || "Client",
        company: c.company || c.name || "Client",
        hourly_rate: clientRate,
        currency,
        billable_hours: billableHours,
        non_billable_hours: nonBillableHours,
        total_hours: totalHours,
        total_amount: totalAmount,
        projects: projectStats
      };
    });

    const totalBillableHours = clientReports.reduce((sum, c) => sum + c.billable_hours, 0);
    const totalNonBillableHours = clientReports.reduce((sum, c) => sum + c.non_billable_hours, 0);
    const totalInvoicedValue = clientReports.reduce((sum, c) => sum + c.total_amount, 0);

    res.json({
      summary: {
        total_billable_hours: totalBillableHours,
        total_non_billable_hours: totalNonBillableHours,
        total_invoiced_value: totalInvoicedValue,
        client_count: clientReports.length
      },
      clients: clientReports
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GENERATE DETAILED CLIENT INVOICE CALCULATION
router.post("/generate-invoice", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrManager(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin/Managers can generate client invoices." });
    }

    const { client_id, start_date, end_date } = req.body;
    const tax_rate = req.body.tax_rate === undefined ? 18.0 : parseFloat(req.body.tax_rate);
    if (!Number.isFinite(tax_rate) || tax_rate < 0 || tax_rate > 100) {
      return res.status(400).json({ error: "tax_rate must be a number between 0 and 100." });
    }

    const [clients] = await pool.query(`SELECT * FROM clients WHERE id = ?`, [client_id]);
    if (clients.length === 0) {
      return res.status(404).json({ error: "Client not found." });
    }
    const client = clients[0];

    const rate = parseFloat(client.hourly_billing_rate) || 35.00;
    const currency = client.currency || "USD";

    // Fetch billable timesheet entries for this client's projects only
    const projectIds = getClientProjectIds(client);
    let timesheets = [];
    if (projectIds.length > 0) {
      let tsQuery = `SELECT * FROM timesheets WHERE is_billable = 1 AND project_id IN (?)`;
      const params = [projectIds];
      if (start_date && end_date) {
        tsQuery += ` AND date BETWEEN ? AND ?`;
        params.push(start_date, end_date);
      }
      tsQuery += ` ORDER BY date DESC`;
      [timesheets] = await pool.query(tsQuery, params);
    }

    const totalHours = timesheets.reduce((acc, curr) => acc + parseFloat(curr.hours || 0), 0);
    const subtotal = Math.round(totalHours * rate * 100) / 100;
    const taxAmount = Math.round(subtotal * (tax_rate / 100) * 100) / 100;
    const grandTotal = Math.round((subtotal + taxAmount) * 100) / 100;

    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    res.json({
      invoice_number: invoiceNumber,
      invoice_date: new Date().toISOString().slice(0, 10),
      client: {
        id: client.id,
        name: client.name,
        company: client.company,
        email: client.email
      },
      billing_rate: rate,
      currency,
      total_hours: totalHours,
      subtotal,
      tax_rate,
      tax_amount: taxAmount,
      grand_total: grandTotal,
      items: timesheets.map(t => ({
        id: t.id,
        date: t.date,
        developer: t.user_name,
        task: t.task_title || t.description,
        hours: parseFloat(t.hours),
        amount: Math.round(parseFloat(t.hours) * rate * 100) / 100
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
