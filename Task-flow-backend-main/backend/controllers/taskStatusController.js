const { pool } = require("../config/mysqlDb");

exports.getAll = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id as _id, id, name, status, project_id as project FROM task_statuses ORDER BY id ASC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, status, project } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Plese enter status name", message: "Plese enter status name" });

    const id = `status_${Date.now()}`;
    await pool.query(
      "INSERT INTO task_statuses (id, name, status, project_id) VALUES (?, ?, ?, ?)",
      [id, name, status || "Active", project || null]
    );

    res.json({ _id: id, id, name, status: status || "Active", project: project || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { name, status, project } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: "Plese enter status name", message: "Plese enter status name" });
    }
    await pool.query(
      "UPDATE task_statuses SET name = COALESCE(?, name), status = COALESCE(?, status), project_id = COALESCE(?, project_id) WHERE id = ?",
      [name ? name.trim() : null, status, project, req.params.id]
    );

    const [rows] = await pool.query("SELECT id as _id, id, name, status, project_id as project FROM task_statuses WHERE id = ?", [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Task Status not found" });

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    await pool.query("DELETE FROM task_statuses WHERE id = ?", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};