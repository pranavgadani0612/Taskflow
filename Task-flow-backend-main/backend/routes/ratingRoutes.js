const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { pool } = require("../config/mysqlDb");

// Helper: format rating row
function formatRating(row) {
  return {
    _id: row.id,
    id: row.id,
    employeeId: {
      _id: row.emp_id,
      id: row.emp_id,
      name: row.emp_name,
      email: row.emp_email,
      image: row.emp_image || "",
      position: row.emp_position || "Staff"
    },
    ratedBy: {
      _id: row.rater_id,
      id: row.rater_id,
      name: row.rater_name || "Manager",
      email: row.rater_email || "",
      image: row.rater_image || ""
    },
    projectId: row.proj_id ? {
      _id: row.proj_id,
      id: row.proj_id,
      name: row.proj_name || "Project",
      title: row.proj_name || "Project"
    } : null,
    taskId: row.task_id ? {
      _id: row.task_id,
      id: row.task_id,
      title: row.task_title || "Task"
    } : null,
    score: row.score,
    category: row.category || "Overall Performance",
    reviewPeriod: row.review_period || "General Review",
    feedback: row.feedback || "",
    createdAt: row.created_at
  };
}

// @route   GET /api/ratings
router.get("/", authMiddleware, async (req, res) => {
  try {
    let query = `
      SELECT r.*,
             e.id as emp_id, e.name as emp_name, e.email as emp_email, e.position as emp_position, e.image as emp_image,
             rb.id as rater_id, rb.name as rater_name, rb.email as rater_email, rb.image as rater_image,
             p.id as proj_id, p.name as proj_name,
             t.id as task_id, t.title as task_title
      FROM ratings r
      LEFT JOIN staff e ON r.employee_id = e.id
      LEFT JOIN staff rb ON r.rated_by = rb.id
      LEFT JOIN projects p ON r.project_id = p.id
      LEFT JOIN tasks t ON r.task_id = t.id
    `;
    const params = [];

    if (req.query.employeeId) {
      query += ` WHERE r.employee_id = ? OR e.email = ?`;
      params.push(req.query.employeeId, req.query.employeeId);
    }

    query += ` ORDER BY r.created_at DESC`;

    const [rows] = await pool.query(query, params);
    const ratings = rows.map(formatRating);
    res.json(ratings);
  } catch (error) {
    console.error("Error fetching ratings:", error);
    res.status(500).json({ message: "Server error fetching ratings" });
  }
});

// @route   GET /api/ratings/summary
router.get("/summary", authMiddleware, async (req, res) => {
  try {
    const query = `
      SELECT r.*,
             e.id as emp_id, e.name as emp_name, e.email as emp_email, e.position as emp_position, e.image as emp_image
      FROM ratings r
      INNER JOIN staff e ON r.employee_id = e.id
    `;
    const [rows] = await pool.query(query);

    const summaryMap = {};
    rows.forEach((r) => {
      const empId = r.emp_id;
      if (!empId) return;
      if (!summaryMap[empId]) {
        summaryMap[empId] = {
          employee: {
            _id: r.emp_id,
            id: r.emp_id,
            name: r.emp_name,
            email: r.emp_email,
            image: r.emp_image || "",
            position: r.emp_position || "Staff"
          },
          totalRatings: 0,
          totalScore: 0,
          averageScore: 0,
          categoryBreakdown: {},
          latestFeedback: r.feedback,
        };
      }
      summaryMap[empId].totalRatings += 1;
      summaryMap[empId].totalScore += r.score;
      if (!summaryMap[empId].categoryBreakdown[r.category]) {
        summaryMap[empId].categoryBreakdown[r.category] = { total: 0, count: 0 };
      }
      summaryMap[empId].categoryBreakdown[r.category].total += r.score;
      summaryMap[empId].categoryBreakdown[r.category].count += 1;
    });

    const summary = Object.values(summaryMap).map((item) => ({
      ...item,
      averageScore: Number((item.totalScore / item.totalRatings).toFixed(1)),
    }));

    res.json(summary);
  } catch (error) {
    console.error("Error fetching rating summary:", error);
    res.status(500).json({ message: "Server error fetching rating summary" });
  }
});

// @route   POST /api/ratings
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { employeeId, projectId, taskId, score, category, reviewPeriod, feedback } = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: "Plese enter employee", field: "employeeId" });
    }

    const numericScore = Number(score);
    if (!numericScore || numericScore < 1 || numericScore > 5) {
      return res.status(400).json({ error: "Plese enter score", field: "score" });
    }

    // Lookup employee in staff table
    const [empRows] = await pool.query("SELECT * FROM staff WHERE id = ? OR email = ? LIMIT 1", [employeeId, employeeId]);
    if (!empRows || empRows.length === 0) {
      return res.status(404).json({ message: "Employee not found in records." });
    }
    const emp = empRows[0];

    const id = `rate_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const raterId = req.user._id || req.user.id;
    const compId = req.user.companyId?._id || req.user.companyId || "default_company";

    await pool.query(
      `INSERT INTO ratings (id, employee_id, rated_by, company_id, project_id, task_id, score, category, review_period, feedback)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        emp.id,
        raterId,
        compId,
        projectId || null,
        taskId || null,
        numericScore,
        category || "Overall Performance",
        reviewPeriod || "General Review",
        feedback ? feedback.trim() : ""
      ]
    );

    const [rows] = await pool.query(
      `SELECT r.*,
              e.id as emp_id, e.name as emp_name, e.email as emp_email, e.position as emp_position, e.image as emp_image,
              rb.id as rater_id, rb.name as rater_name, rb.email as rater_email, rb.image as rater_image,
              p.id as proj_id, p.name as proj_name,
              t.id as task_id, t.title as task_title
       FROM ratings r
       LEFT JOIN staff e ON r.employee_id = e.id
       LEFT JOIN staff rb ON r.rated_by = rb.id
       LEFT JOIN projects p ON r.project_id = p.id
       LEFT JOIN tasks t ON r.task_id = t.id
       WHERE r.id = ?`,
      [id]
    );

    const formatted = formatRating(rows[0]);
    res.status(201).json({ message: "Rating saved successfully", rating: formatted });
  } catch (error) {
    console.error("Error saving rating:", error);
    res.status(500).json({ message: error.message || "Server error saving rating" });
  }
});

// @route   DELETE /api/ratings/:id
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM ratings WHERE id = ?", [req.params.id]);
    res.json({ message: "Rating deleted successfully." });
  } catch (error) {
    console.error("Error deleting rating:", error);
    res.status(500).json({ message: "Server error deleting rating" });
  }
});

module.exports = router;
