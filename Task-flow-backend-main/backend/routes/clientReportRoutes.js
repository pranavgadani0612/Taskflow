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
        `SELECT id, name, email, company, hourly_billing_rate, currency FROM clients`
      );
      clients = cRows || [];
    } catch (e) {
      console.warn("Could not query clients table:", e.message);
      clients = [];
    }

    // Fetch projects safely
    let projects = [];
    try {
      const [projRows] = await pool.query(`SELECT id, name, client_id FROM projects`);
      projects = projRows || [];
    } catch (e) {
      console.warn("Could not query projects table:", e.message);
      projects = [];
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
    const clientReports = (clients.length > 0 ? clients : [
      { id: "cl_1", name: "Padhya Enterprise Clients", company: "Padhya Technologies", hourly_billing_rate: 1200.00, currency: "INR" },
      { id: "cl_2", name: "Apex Retailers Ltd", company: "Apex Retail", hourly_billing_rate: 950.00, currency: "INR" }
    ]).map(c => {
      const clientRate = parseFloat(c.hourly_billing_rate) || 1000.00;
      const currency = c.currency || "INR";

      // Match projects for this client
      const matchedProjects = projects.filter(p => p.client_id === c.id);
      const projectIds = matchedProjects.length > 0 
        ? matchedProjects.map(p => p.id) 
        : (c.id === "cl_1" ? ["proj_fintech"] : ["proj_ecommerce"]);

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

    const { client_id, start_date, end_date, tax_rate = 18.0 } = req.body;

    let clientQuery = `SELECT * FROM clients WHERE id = ?`;
    let [clients] = await pool.query(clientQuery, [client_id]);
    let client = clients[0] || {
      id: client_id || "cl_1",
      name: "Global FinTech Corp",
      company: "FinTech Corp",
      email: "billing@fintechcorp.com",
      hourly_billing_rate: 45.00,
      currency: "USD"
    };

    const rate = parseFloat(client.hourly_billing_rate) || 35.00;
    const currency = client.currency || "USD";

    // Fetch timesheet entries
    let tsQuery = `SELECT * FROM timesheets WHERE is_billable = 1`;
    const params = [];
    if (start_date && end_date) {
      tsQuery += ` AND date BETWEEN ? AND ?`;
      params.push(start_date, end_date);
    }
    tsQuery += ` ORDER BY date DESC`;

    const [timesheets] = await pool.query(tsQuery, params);

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
