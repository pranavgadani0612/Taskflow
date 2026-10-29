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

// 1. GET ALL ASSETS (Admin/HR view all, filtered by company)
router.get("/", authMiddleware, async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { category, status, search } = req.query;

    let query = `SELECT * FROM company_assets WHERE (company_id = ? OR company_id = 'default_company')`;
    const params = [companyId];

    if (category && category !== "All") {
      query += ` AND category = ?`;
      params.push(category);
    }
    if (status && status !== "All") {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (search) {
      query += ` AND (name LIKE ? OR asset_tag LIKE ? OR serial_number LIKE ? OR assigned_to_name LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY created_at DESC`;

    const [rows] = await pool.query(query, params);
    const parsed = rows.map(r => ({
      ...r,
      specs: typeof r.specs === "string" ? JSON.parse(r.specs || "{}") : (r.specs || {})
    }));

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. GET MY ASSIGNED ASSETS (Self-service for employees)
router.get("/my-assets", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id ? req.user._id.toString() : req.user.id;
    const companyId = getCompanyId(req);

    const [rows] = await pool.query(
      `SELECT * FROM company_assets 
       WHERE (company_id = ? OR company_id = 'default_company')
         AND (assigned_to_id = ? OR assigned_to_id = ?)
       ORDER BY created_at DESC`,
      [companyId, userId, req.user.id || ""]
    );

    const parsed = rows.map(r => ({
      ...r,
      specs: typeof r.specs === "string" ? JSON.parse(r.specs || "{}") : (r.specs || {})
    }));

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. CREATE ASSET
router.post("/", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrHR(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin or HR can add assets." });
    }

    const {
      asset_tag, name, category = "Laptop", brand, model, serial_number,
      purchase_date, purchase_cost = 0, warranty_expiry, specs, notes
    } = req.body;

    if (!asset_tag || !asset_tag.trim()) {
      return res.status(400).json({ error: "Plese enter asset tag", field: "asset_tag" });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Plese enter name", field: "name" });
    }

    if (purchase_cost !== undefined && parseFloat(purchase_cost) < 0) {
      return res.status(400).json({ error: "Purchase cost cannot be negative." });
    }

    const companyId = getCompanyId(req);
    const id = `ast_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    await pool.query(
      `INSERT INTO company_assets (
        id, company_id, asset_tag, name, category, brand, model, serial_number,
        purchase_date, purchase_cost, warranty_expiry, status, specs, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Available', ?, ?)`,
      [
        id, companyId, asset_tag, name, category, brand || null, model || null, serial_number || null,
        purchase_date || null, purchase_cost || 0, warranty_expiry || null,
        specs ? JSON.stringify(specs) : null, notes || null
      ]
    );

    await logAudit({
      companyId,
      actorId: req.user._id ? req.user._id.toString() : req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role?.name || req.user.role,
      module: "Asset Management",
      action: "Created Asset",
      targetId: id,
      targetName: `${asset_tag} (${name})`,
      details: { category, brand, serial_number }
    });

    res.status(201).json({ message: "Asset added successfully", id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. UPDATE ASSET
router.put("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrHR(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin or HR can edit assets." });
    }

    const { id } = req.params;
    const {
      asset_tag, name, category, brand, model, serial_number,
      purchase_date, purchase_cost, warranty_expiry, status, specs, notes
    } = req.body;

    await pool.query(
      `UPDATE company_assets SET
        asset_tag = COALESCE(?, asset_tag),
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        brand = COALESCE(?, brand),
        model = COALESCE(?, model),
        serial_number = COALESCE(?, serial_number),
        purchase_date = COALESCE(?, purchase_date),
        purchase_cost = COALESCE(?, purchase_cost),
        warranty_expiry = COALESCE(?, warranty_expiry),
        status = COALESCE(?, status),
        specs = COALESCE(?, specs),
        notes = COALESCE(?, notes)
       WHERE id = ?`,
      [
        asset_tag, name, category, brand, model, serial_number,
        purchase_date, purchase_cost, warranty_expiry, status,
        specs ? JSON.stringify(specs) : null, notes, id
      ]
    );

    res.json({ message: "Asset updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. ASSIGN ASSET TO EMPLOYEE
router.post("/:id/assign", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrHR(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin or HR can assign assets." });
    }

    const { id } = req.params;
    const { user_id, user_name, user_email, expected_return_date, condition_on_assign = "Excellent", notes } = req.body;

    if (!user_id || !user_name) {
      return res.status(400).json({ error: "Employee user_id and user_name are required." });
    }

    const [assets] = await pool.query(`SELECT * FROM company_assets WHERE id = ?`, [id]);
    if (assets.length === 0) return res.status(404).json({ error: "Asset not found." });
    const asset = assets[0];

    const companyId = getCompanyId(req);
    const assignId = `asgn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const actorId = req.user._id ? req.user._id.toString() : req.user.id;

    // Insert into asset_assignments
    await pool.query(
      `INSERT INTO asset_assignments (
        id, company_id, asset_id, asset_tag, asset_name, user_id, user_name, user_email,
        assigned_by_id, assigned_by_name, expected_return_date, condition_on_assign, return_notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
      [
        assignId, companyId, id, asset.asset_tag, asset.name, user_id, user_name, user_email || null,
        actorId, req.user.name, expected_return_date || null, condition_on_assign, notes || null
      ]
    );

    // Update company_assets
    await pool.query(
      `UPDATE company_assets SET status = 'Assigned', assigned_to_id = ?, assigned_to_name = ? WHERE id = ?`,
      [user_id, user_name, id]
    );

    await logAudit({
      companyId,
      actorId,
      actorName: req.user.name,
      actorRole: req.user.role?.name || req.user.role,
      module: "Asset Management",
      action: "Assigned Asset",
      targetId: id,
      targetName: `${asset.asset_tag} assigned to ${user_name}`,
      details: { user_id, user_name, condition: condition_on_assign }
    });

    res.json({ message: `Asset ${asset.asset_tag} assigned to ${user_name} successfully!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. RETURN ASSET (Check-in from employee)
router.post("/:id/return", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrHR(req)) {
      return res.status(403).json({ error: "Access Denied: Only Admin or HR can process asset return." });
    }

    const { id } = req.params;
    const { condition_on_return = "Good", return_notes, new_status = "Available" } = req.body;

    const [assets] = await pool.query(`SELECT * FROM company_assets WHERE id = ?`, [id]);
    if (assets.length === 0) return res.status(404).json({ error: "Asset not found." });
    const asset = assets[0];

    // Mark current active assignment as Returned
    await pool.query(
      `UPDATE asset_assignments 
       SET status = 'Returned', returned_at = CURRENT_TIMESTAMP, condition_on_return = ?, return_notes = ?
       WHERE asset_id = ? AND status = 'Active'`,
      [condition_on_return, return_notes || null, id]
    );

    // Update company_assets status back to Available or Under Repair
    await pool.query(
      `UPDATE company_assets SET status = ?, assigned_to_id = NULL, assigned_to_name = NULL WHERE id = ?`,
      [new_status, id]
    );

    const companyId = getCompanyId(req);
    await logAudit({
      companyId,
      actorId: req.user._id ? req.user._id.toString() : req.user.id,
      actorName: req.user.name,
      actorRole: req.user.role?.name || req.user.role,
      module: "Asset Management",
      action: "Returned Asset",
      targetId: id,
      targetName: `${asset.asset_tag} (${asset.name})`,
      details: { condition_on_return, new_status, previous_assignee: asset.assigned_to_name }
    });

    res.json({ message: `Asset ${asset.asset_tag} returned successfully and is now ${new_status}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. GET ASSET ASSIGNMENT HISTORY
router.get("/:id/history", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT * FROM asset_assignments WHERE asset_id = ? ORDER BY assigned_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. DELETE ASSET (Admin only)
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    if (!isUserAdminOrHR(req)) {
      return res.status(403).json({ error: "Access Denied." });
    }
    const { id } = req.params;
    await pool.query(`DELETE FROM company_assets WHERE id = ?`, [id]);
    res.json({ message: "Asset deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
