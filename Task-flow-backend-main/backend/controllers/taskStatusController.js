const { pool } = require("../config/mysqlDb");

exports.getAll = async (req, res) => {
  try {
    // ?project=<id> returns that project's statuses plus global ones (no project)
    const project = Array.isArray(req.query.project) ? req.query.project[0] : req.query.project;
    let query = "SELECT id as _id, id, name, status, project_id as project FROM task_statuses";
    const params = [];
    if (project) {
      query += " WHERE project_id = ? OR project_id IS NULL OR project_id = ''";
      params.push(project);
    }
    query += " ORDER BY id ASC";
    const [rows] = await pool.query(query, params);
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
    const [found] = await pool.query("SELECT id FROM task_statuses WHERE id = ? LIMIT 1", [req.params.id]);
    if (found.length === 0) return res.status(404).json({ error: "Task Status not found" });

    // project omitted -> keep existing; project "" / null -> store NULL (global)
    if (project !== undefined) {
      await pool.query("UPDATE task_statuses SET project_id = ? WHERE id = ?", [project || null, req.params.id]);
    }
    await pool.query(
      "UPDATE task_statuses SET name = COALESCE(?, name), status = COALESCE(?, status) WHERE id = ?",
      [name ? name.trim() : null, status, req.params.id]
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
    const [result] = await pool.query("DELETE FROM task_statuses WHERE id = ?", [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: "Task Status not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};