const express = require("express");
const router = express.Router();
const { pool } = require("../config/mysqlDb");
const { checkPermission, checkAnyPermission } = require("../middleware/permissions");
const authMiddleware = require("../middleware/auth");

// GET all permissions (accessible by permission_management or role_management)
router.get("/", authMiddleware, checkAnyPermission(["permission_management", "role_management"], "read"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id as _id, id, name, value, created_at FROM permissions ORDER BY name ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADD permission
router.post("/", authMiddleware, checkPermission("permission_management", "create"), async (req, res) => {
  try {
    const { name, value } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Plese enter permission name", field: "name" });
    if (!value) return res.status(400).json({ error: "Plese enter permission value", field: "value" });

    const id = `perm_${Date.now()}`;
    await pool.query("INSERT INTO permissions (id, name, value) VALUES (?, ?, ?)", [id, name, value]);
    res.json({ _id: id, id, name, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE permission
router.put("/:id", authMiddleware, checkPermission("permission_management", "update"), async (req, res) => {
  try {
    const { name, value } = req.body;
    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ error: "Plese enter permission name", field: "name" });
    }
    await pool.query("UPDATE permissions SET name = COALESCE(?, name), value = COALESCE(?, value) WHERE id = ?", [name, value, req.params.id]);
    const [rows] = await pool.query("SELECT id as _id, id, name, value FROM permissions WHERE id = ?", [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE permission
router.delete("/:id", authMiddleware, checkPermission("permission_management", "delete"), async (req, res) => {
  try {
    await pool.query("DELETE FROM permissions WHERE id = ?", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;