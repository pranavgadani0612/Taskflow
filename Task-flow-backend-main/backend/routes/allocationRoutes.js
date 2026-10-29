const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool, logAudit } = require("../config/mysqlDb");

const isUserAdminOrLead = (req) => {
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

const getCompanyId = (req) => req.user?.companyId?._id || req.user?.companyId?.id || req.user?.company_id || (typeof req.user?.companyId === 'string' ? req.user.companyId : 'default_company');

// 1. GET ALL ALLOCATIONS
router.get("/", authMiddleware, async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { project_id, user_id } = req.query;

    let query = `SELECT * FROM project_allocations WHERE (company_id = ? OR company_id = 'default_company')`;
    const params = [companyId];

    if (project_id) {
      query += ` AND project_id = ?`;
      params.push(project_id);
    }
    if (user_id) {
      query += ` AND user_id = ?`;
      params.push(user_id);
    }

    query += ` ORDER BY user_name ASC, project_name ASC`;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET TEAM UTILIZATION SUMMARY (HEATMAP DATA)
router.get("/team-utilization", authMiddleware, async (req, res) => {
  try {
    const [employees] = await pool.query(
      `SELECT id, name, email, department, position FROM staff WHERE status = 'Active'`
    );

    const [allocations] = await pool.query(
      `SELECT * FROM project_allocations`
    );

    const utilization = employees.map(emp => {
      const empAlloc = allocations.filter(a => a.user_id === emp.id);
      const totalPct = empAlloc.reduce((acc, curr) => acc + (parseInt(curr.allocation_percentage) || 0), 0);
      const billablePct = empAlloc.filter(a => a.billing_type === 'Billable').reduce((acc, curr) => acc + (parseInt(curr.allocation_percentage) || 0), 0);

      let status = "Optimal"; // 80% - 100%
      if (totalPct < 80) status = "Bench / Underutilized";
      else if (totalPct > 100) status = "Overallocated";

      return {
        id: emp.id,
        name: emp.name,
        email: emp.email,
        department: emp.department || "Engineering",
        position: emp.position || "Developer",
        total_allocation: totalPct,
        billable_allocation: billablePct,
        bench_capacity: Math.max(0, 100 - totalPct),
        status,
        projects: empAlloc
      };
    });

    res.json(utilization);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CREATE / ASSIGN ALLOCATION
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrLead(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin or Leads can allocate resources." });
    }

    const { project_id, project_name, user_id, user_name, user_role, allocation_percentage = 100, start_date, end_date, billing_type = "Billable" } = req.body;
    if (!project_id) {
      return res.status(400).json({ error: "Plese enter project", field: "project_id" });
    }
    if (!user_id) {
      return res.status(400).json({ error: "Plese enter employee", field: "user_id" });
    }

    const companyId = getCompanyId(req);
    const id = `al_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await pool.query(
      `INSERT INTO project_allocations (
        id, company_id, project_id, project_name, user_id, user_name, user_role,
        allocation_percentage, start_date, end_date, billing_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, companyId, project_id, project_name || "Project", user_id, user_name,
        user_role || "Contributor", allocation_percentage, start_date || null, end_date || null, billing_type
      ]
    );

    res.status(201).json({ message: "Resource allocated successfully", id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. UPDATE ALLOCATION
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrLead(req)) {
      return res.status(403).json({ error: "Access Denied." });
    }

    const { id } = req.params;
    const { allocation_percentage, billing_type, start_date, end_date, user_role } = req.body;

    await pool.query(
      `UPDATE project_allocations SET
        allocation_percentage = COALESCE(?, allocation_percentage),
        billing_type = COALESCE(?, billing_type),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        user_role = COALESCE(?, user_role)
       WHERE id = ?`,
      [allocation_percentage, billing_type, start_date, end_date, user_role, id]
    );

    res.json({ message: "Allocation updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. DELETE ALLOCATION
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrLead(req)) {
      return res.status(403).json({ error: "Access Denied." });
    }
    const { id } = req.params;
    await pool.query(`DELETE FROM project_allocations WHERE id = ?`, [id]);
    res.json({ message: "Allocation deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
