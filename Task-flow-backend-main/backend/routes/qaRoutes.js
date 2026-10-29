const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool } = require("../config/mysqlDb");

// ================= TEST CASES =================

// 1. GET ALL TEST CASES
router.get("/test-cases", authMiddleware, async (req, res) => {
  try {
    const { projectId, status } = req.query;
    let query = "SELECT * FROM test_cases WHERE 1=1";
    const params = [];

    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    query += " ORDER BY created_at DESC";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. CREATE TEST CASE
router.post("/test-cases", authMiddleware, async (req, res) => {
  try {
    const { project_id, project_name, module_name, title, preconditions, steps, expected_result, severity } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Plese enter test case title" });
    }
    const id = `tc_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const created_by = req.user.name || "QA Tester";

    await pool.query(
      `INSERT INTO test_cases (id, project_id, project_name, module_name, title, preconditions, steps, expected_result, severity, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Not Executed')`,
      [id, project_id, project_name, module_name || "General", title, preconditions, steps, expected_result, severity || "Medium", created_by]
    );

    const [created] = await pool.query("SELECT * FROM test_cases WHERE id = ?", [id]);
    res.json(created[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. EXECUTE / UPDATE TEST CASE (Pass, Fail, Blocked)
router.put("/test-cases/:id", authMiddleware, async (req, res) => {
  try {
    const { status, actual_result, title, steps, expected_result, severity } = req.body;

    await pool.query(
      `UPDATE test_cases 
       SET status = COALESCE(?, status),
           actual_result = COALESCE(?, actual_result),
           title = COALESCE(?, title),
           steps = COALESCE(?, steps),
           expected_result = COALESCE(?, expected_result),
           severity = COALESCE(?, severity)
       WHERE id = ?`,
      [status, actual_result, title, steps, expected_result, severity, req.params.id]
    );

    const [updated] = await pool.query("SELECT * FROM test_cases WHERE id = ?", [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. DELETE TEST CASE
router.delete("/test-cases/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM test_cases WHERE id = ?", [req.params.id]);
    res.json({ message: "Test Case deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ================= QA BUGS & DEFECTS =================

// 5. GET ALL QA BUGS
router.get("/bugs", authMiddleware, async (req, res) => {
  try {
    const { projectId, status, severity } = req.query;
    let query = "SELECT * FROM qa_bugs WHERE 1=1";
    const params = [];

    if (projectId) {
      query += " AND project_id = ?";
      params.push(projectId);
    }
    if (status) {
      query += " AND status = ?";
      params.push(status);
    }
    if (severity) {
      query += " AND severity = ?";
      params.push(severity);
    }
    query += " ORDER BY created_at DESC";

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. REPORT NEW QA BUG
router.post("/bugs", authMiddleware, async (req, res) => {
  try {
    const { project_id, project_name, test_case_id, title, description, steps_to_reproduce, severity, assigned_to, environment } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Plese enter bug title" });
    }
    const id = `bug_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const reported_by = req.user.name || "QA Tester";

    await pool.query(
      `INSERT INTO qa_bugs (id, project_id, project_name, test_case_id, title, description, steps_to_reproduce, severity, status, assigned_to, reported_by, environment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?, ?)`,
      [id, project_id, project_name, test_case_id, title, description, steps_to_reproduce, severity || "Major", assigned_to || "Unassigned", reported_by, environment || "Staging"]
    );

    const [created] = await pool.query("SELECT * FROM qa_bugs WHERE id = ?", [id]);
    res.json(created[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. UPDATE BUG STATUS (Open -> In Fixing -> Resolved -> Retest -> Closed)
router.put("/bugs/:id", authMiddleware, async (req, res) => {
  try {
    const { status, severity, assigned_to, description } = req.body;

    await pool.query(
      `UPDATE qa_bugs 
       SET status = COALESCE(?, status),
           severity = COALESCE(?, severity),
           assigned_to = COALESCE(?, assigned_to),
           description = COALESCE(?, description)
       WHERE id = ?`,
      [status, severity, assigned_to, description, req.params.id]
    );

    const [updated] = await pool.query("SELECT * FROM qa_bugs WHERE id = ?", [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. DELETE BUG
router.delete("/bugs/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM qa_bugs WHERE id = ?", [req.params.id]);
    res.json({ message: "Bug deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
