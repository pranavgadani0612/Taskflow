const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const csv = require("fast-csv");

const { pool } = require("../config/mysqlDb");
const { sendTaskOrIssueMail } = require("../config/mail");
const { checkAnyPermission } = require("../middleware/permissions");
const authMiddleware = require("../middleware/auth");

// FILE STORAGE
const storage = multer.diskStorage({
  destination: require("../config/uploadDir"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Helper: parse assigned_to JSON array from DB
function parseAssignedTo(raw) {
  if (!raw) return [];
  if (typeof raw === "object" && Array.isArray(raw)) return raw;
  const str = String(raw).trim();
  if (!str || str === "null" || str === "undefined" || str === "[object Object]") return [];
  if (str.startsWith("[")) {
    try { return JSON.parse(str).filter(Boolean); } catch (_) {}
  }
  if (str.startsWith("{")) {
    try {
      const obj = JSON.parse(str);
      return [obj._id || obj.id || str].filter(Boolean);
    } catch (_) {}
  }
  return str ? [str] : [];
}

// Helper: build JSON array string to store multiple assignees
function buildAssignedToVal(assignedTo) {
  const extractId = (val) => {
    if (!val) return "";
    if (typeof val === "object") return val._id || val.id || "";
    const str = String(val).trim();
    if (!str || str === "[object Object]") return "";
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === "object" && parsed !== null) return parsed._id || parsed.id || "";
    } catch (_) {}
    return str;
  };

  let ids = [];
  if (Array.isArray(assignedTo)) {
    ids = assignedTo.map(extractId).filter(Boolean);
  } else if (assignedTo !== undefined && assignedTo !== null) {
    const id = extractId(assignedTo);
    if (id) ids = [id];
  }
  return ids.length > 0 ? JSON.stringify(ids) : null;
}

// Helper: fetch { [staffId]: { _id, id, name, email } } for all assignees in the given task rows
async function buildStaffMap(rows) {
  const ids = new Set();
  (rows || []).forEach(r => parseAssignedTo(r?.assigned_to).forEach(id => ids.add(id)));
  const staffMap = {};
  if (ids.size === 0) return staffMap;
  const idArr = Array.from(ids);
  const [sRows] = await pool.query(
    `SELECT id, name, email FROM staff WHERE id IN (${idArr.map(() => "?").join(",")})`,
    idArr
  );
  sRows.forEach(s => { staffMap[s.id] = { _id: s.id, id: s.id, name: s.name, email: s.email || "" }; });
  return staffMap;
}

// Helper: make sure every task assignee is also a member of the task's project.
// Without this, a staff member assigned a task in a project they don't belong to
// can't pick that project (and so can't log hours) in the timesheet.
async function ensureAssigneesInProject(projectId, assignedToRaw) {
  const assigneeIds = parseAssignedTo(assignedToRaw);
  if (!projectId || assigneeIds.length === 0) return;
  try {
    const [pRows] = await pool.query("SELECT assigned_to FROM projects WHERE id = ? LIMIT 1", [projectId]);
    if (pRows.length === 0) return;

    let members = [];
    try {
      const raw = pRows[0].assigned_to;
      members = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : [];
    } catch (_) { members = []; }
    if (!Array.isArray(members)) members = [];

    const memberIds = new Set(members.map(m => String(m?._id || m?.id || m || "")).filter(Boolean));
    const missing = assigneeIds.filter(id => !memberIds.has(String(id)));
    if (missing.length === 0) return;

    const [sRows] = await pool.query(
      `SELECT id, name, email, position FROM staff WHERE id IN (${missing.map(() => "?").join(",")})`,
      missing
    );
    if (sRows.length === 0) return;

    const updated = [
      ...members,
      ...sRows.map(s => ({ _id: s.id, id: s.id, name: s.name, email: s.email || "", position: s.position || "" }))
    ];
    await pool.query("UPDATE projects SET assigned_to = ? WHERE id = ?", [JSON.stringify(updated), projectId]);
    console.log(`[TASK] Auto-added ${sRows.map(s => s.name).join(", ")} to project ${projectId}`);
  } catch (err) {
    // Never fail the task save because of this
    console.error("ensureAssigneesInProject error:", err.message);
  }
}

// Helper: map a raw MySQL task row + its subtasks into frontend shape
// staffMap: { [staffId]: { _id, name, email } } â€“ pre-fetched for multi-assignee
function formatTask(taskRow, subtasksList = [], staffMap = {}) {
  const taskSubtasks = subtasksList
    .filter(s => s.task_id === taskRow.id)
    .map(s => ({
      _id: s.id,
      id: s.id,
      title: s.title,
      description: s.description || "",
      status: s.status || "Pending",
      assignedTo: s.assigned_to,
      startDate: s.start_date,
      endDate: s.end_date,
      hours: parseFloat(s.hours) || 0
    }));

  // Parse multi-assignee JSON array
  const assignedIds = parseAssignedTo(taskRow.assigned_to);
  let assignedToArr = [];
  if (assignedIds.length > 0) {
    assignedToArr = assignedIds.map(id => {
      if (staffMap[id]) return staffMap[id];
      // Fallback: use JOIN data for first assignee only
      if (taskRow.assigned_id === id) {
        return { _id: id, id, name: taskRow.assigned_name || "Staff", email: taskRow.assigned_email || "" };
      }
      return { _id: id, id, name: "Staff", email: "" };
    });
  } else if (taskRow.assigned_id) {
    // Legacy single-value from JOIN (shouldn't happen post-migration)
    assignedToArr = [{ _id: taskRow.assigned_id, id: taskRow.assigned_id, name: taskRow.assigned_name || "Staff", email: taskRow.assigned_email || "" }];
  }

  return {
    _id: taskRow.id,
    id: taskRow.id,
    title: taskRow.title,
    description: taskRow.description || "",
    status: {
      _id: taskRow.status_id || taskRow.status,
      id: taskRow.status_id || taskRow.status,
      name: taskRow.status_name || taskRow.status || "Pending"
    },
    priority: taskRow.priority || "Medium",
    project: taskRow.project_id ? {
      _id: taskRow.project_id,
      id: taskRow.project_id,
      name: taskRow.project_name || "Project"
    } : null,
    assignedTo: assignedToArr,
    type: taskRow.type || "task",
    startDate: taskRow.start_date,
    endDate: taskRow.end_date,
    calculatedEndDate: taskRow.calculated_end_date || taskRow.end_date,
    estimatedHours: parseFloat(taskRow.estimated_hours) || 0,
    subtasks: taskSubtasks,
    assignedBy: taskRow.assigned_by_id ? {
      _id: taskRow.assigned_by_id,
      id: taskRow.assigned_by_id,
      name: taskRow.assigned_by_staff_name || taskRow.assigned_by_name || "Admin",
      email: taskRow.assigned_by_email || ""
    } : (taskRow.assigned_by_name ? {
      name: taskRow.assigned_by_name
    } : null),
    image: taskRow.image || "",
    video: taskRow.video || "",
    createdAt: taskRow.created_at
  };
}

// Helper: check if user can see all tasks (Admin, Owner, Manager, or full task management permissions)
const userCanSeeAllTasks = (user) => {
  if (!user) return false;
  const superEmail = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";
  if (user.email === superEmail || user.email === "gadanipranav@gmail.com") return true;

  const roleName = String(user.role?.name || "").toLowerCase().trim();
  const roleId = String(user.role?.id || user.role?._id || user.role || "").toLowerCase().trim();
  const position = String(user.position || "").toLowerCase().trim();

  const perms = Array.isArray(user.role?.permissions) ? user.role.permissions : [];
  const taskPerm = perms.find(p => p.value === "task_management");
  const hasFullAccess = taskPerm?.all || (taskPerm?.create && taskPerm?.update);

  return roleName.includes("owner") ||
         roleName.includes("admin") ||
         roleName.includes("manager") ||
         roleId === "role_owner" ||
         roleId === "role_superadmin" ||
         position.includes("manager") ||
         position.includes("owner") ||
         position.includes("admin") ||
         Boolean(hasFullAccess);
};

// ================= REPAIR: Fix tasks with blank assigned_to =================
// POST /tasks/repair-assign  { staffId: "staff_xxx" }
// Assigns all blank-assigned tasks to a specific staff member (superadmin only)
router.post("/repair-assign", authMiddleware, async (req, res) => {
  try {
    const isSuperAdmin = userCanSeeAllTasks(req.user);
    if (!isSuperAdmin) return res.status(403).json({ error: "SuperAdmin access required" });

    const { staffId } = req.body;
    if (!staffId) return res.status(400).json({ error: "staffId is required" });

    // Verify staff exists
    const [staffRows] = await pool.query("SELECT id, name FROM staff WHERE id = ?", [staffId]);
    if (!staffRows || staffRows.length === 0) return res.status(404).json({ error: "Staff not found" });

    // Fix all tasks where assigned_to is blank/null
    const [result] = await pool.query(
      "UPDATE tasks SET assigned_to = ? WHERE (assigned_to IS NULL OR assigned_to = '' OR assigned_to = 'undefined')",
      [staffId]
    );

    const io = req.app.get("io");
    if (io) io.emit("tasks:repaired", { staffId, count: result.affectedRows });

    res.json({
      success: true,
      message: `Fixed ${result.affectedRows} unassigned tasks â†’ assigned to ${staffRows[0].name}`,
      affectedRows: result.affectedRows,
      staff: staffRows[0]
    });
  } catch (err) {
    console.error("Repair assign error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= GET TASKS =================
router.get("/", authMiddleware, checkAnyPermission(["task_management", "issue"], "read"), async (req, res) => {
  try {
    let conditions = ["1=1"];
    let params = [];

    // Filter by project
    if (req.query.project && req.query.project !== "undefined") {
      conditions.push("t.project = ?");
      params.push(req.query.project);
    }

    // Filter by employee / assigned staff (single or multiple comma-separated)
    if (req.query.employee && req.query.employee !== "undefined" && req.query.employee !== "all") {
      const empList = String(req.query.employee).split(",").map(e => e.trim()).filter(Boolean);
      if (empList.length >= 1) {
        const orClauses = empList.map(empId => {
          params.push(`%${empId}%`, empId);
          return `(t.assigned_to LIKE ? OR t.id IN (SELECT task_id FROM subtasks WHERE assigned_to = ?))`;
        });
        conditions.push(`(${orClauses.join(" OR ")})`);
      }
    }

    // Filter by start_date & end_date
    if (req.query.startDate) {
      conditions.push("(t.start_date >= ? OR t.end_date >= ?)");
      params.push(req.query.startDate, req.query.startDate);
    }
    if (req.query.endDate) {
      conditions.push("(t.start_date <= ? OR t.end_date <= ?)");
      params.push(req.query.endDate, req.query.endDate);
    }

    // Search filter across title, description, assigned staff name, project name
    if (req.query.search && req.query.search.trim()) {
      const s = `%${req.query.search.trim()}%`;
      conditions.push(`(
        t.title LIKE ? 
        OR t.description LIKE ? 

        OR p.name LIKE ? 
        OR t.id IN (SELECT task_id FROM subtasks WHERE title LIKE ?)
      )`);
      params.push(s, s, s, s);
    }

    // Role-based scoping: regular staff only see tasks assigned to them
    if (!userCanSeeAllTasks(req.user)) {
      conditions.push(`(
        t.assigned_to LIKE ?
        OR t.id IN (SELECT task_id FROM subtasks WHERE assigned_to = ?)
      )`);
      params.push(`%${req.user.id}%`, req.user.id);
    }


    // Type filter
    if (req.query.type === "issue") {
      conditions.push("t.type = 'issue'");
    } else {
      conditions.push("(t.type = 'task' OR t.type IS NULL)");
    }

    // Do not show tasks assigned to Inactive staff
    // assigned_to filter and type filter handle visibility

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const query = `
      SELECT t.*,
             p.id as project_id, p.name as project_name,
             ab.id as assigned_by_id, ab.name as assigned_by_staff_name, ab.email as assigned_by_email,
             ts.id as status_id, ts.name as status_name
      FROM tasks t
      LEFT JOIN projects p ON t.project = p.id
      LEFT JOIN staff ab ON t.assigned_by = ab.id
      LEFT JOIN task_statuses ts ON t.status = ts.id OR t.status = ts.name
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT 1000
    `;

    const [rows] = await pool.query(query, params);

    // Fetch subtasks for these tasks
    let subtasks = [];
    if (rows.length > 0) {
      const taskIds = rows.map(r => r.id);
      const [subRows] = await pool.query(
        `SELECT * FROM subtasks WHERE task_id IN (${taskIds.map(() => "?").join(",")})`,
        taskIds
      );
      subtasks = subRows;
    }

    const staffMap = await buildStaffMap(rows);
    const formatted = rows.map(r => formatTask(r, subtasks, staffMap));

    if (req.query.page && req.query.limit) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const start = (page - 1) * limit;
      const paginated = formatted.slice(start, start + limit);
      return res.json({
        tasks: paginated,
        totalCount: formatted.length,
        totalPages: Math.ceil(formatted.length / limit),
        currentPage: page
      });
    }

    res.json(formatted);
  } catch (err) {
    console.error("GET tasks error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= ADD TASK =================
router.post(
  "/",
  authMiddleware,
  checkAnyPermission(["task_management", "issue"], "create"),
  upload.fields([{ name: "image" }, { name: "video" }]),
  async (req, res) => {
    try {
      const {
        title, description, assignedTo, status, project, priority,
        type, startDate, endDate, estimatedHours, calculatedEndDate, subtasks
      } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ error: "Plese enter task title", field: "title" });
      }

      // B5: Cross-field validation (End date cannot be earlier than start date)
      if (startDate && endDate) {
        const sDate = new Date(startDate);
        const eDate = new Date(endDate);
        if (eDate < sDate) {
          return res.status(400).json({ error: "End Date cannot be earlier than Start Date!" });
        }
      }

      // B5: Negative hours check
      if (estimatedHours !== undefined && estimatedHours !== null && parseFloat(estimatedHours) < 0) {
        return res.status(400).json({ error: "Estimated hours cannot be negative!" });
      }

      const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const image = req.files?.image?.[0]?.filename || null;
      const video = req.files?.video?.[0]?.filename || null;

      const assignedVal = buildAssignedToVal(assignedTo);

      const creatorId = req.user?._id ? req.user._id.toString() : (req.user?.id || null);
      const creatorName = req.user?.name || req.user?.email || "Admin";
      console.log(`[TASK CREATE] Created by user: id=${creatorId}, name=${creatorName}, email=${req.user?.email}`);

      await pool.query(
        `INSERT INTO tasks (
          id, title, description, status, priority, project, assigned_to,
          due_date, start_date, end_date, type, image, video, estimated_hours, calculated_end_date,
          assigned_by, assigned_by_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          title.trim(),
          description || "",
          status || "In Progress",
          priority || "Medium",
          project || null,
          assignedVal || null,
          endDate || calculatedEndDate || null,
          startDate || null,
          endDate || null,
          type || "task",
          image,
          video,
          parseFloat(estimatedHours) || 0,
          calculatedEndDate || endDate || null,
          creatorId,
          creatorName
        ]
      );

      // Save subtasks if provided
      let parsedSubtasks = [];
      if (subtasks) {
        try {
          parsedSubtasks = typeof subtasks === "string" ? JSON.parse(subtasks) : subtasks;
        } catch (e) { parsedSubtasks = []; }
      }

      if (Array.isArray(parsedSubtasks) && parsedSubtasks.length > 0) {
        for (const sub of parsedSubtasks) {
          const subId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          await pool.query(
            `INSERT INTO subtasks (id, task_id, title, description, status, assigned_to, start_date, end_date, hours)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              subId, id, sub.title, sub.description || "", sub.status || "Pending",
              sub.assignedTo || null, sub.startDate || null, sub.endDate || null, parseFloat(sub.hours) || 0
            ]
          );
        }
      }

      // Fetch created task
      const [rows] = await pool.query(
        `SELECT t.*,
                p.id as project_id, p.name as project_name,
                s.id as assigned_id, s.name as assigned_name, s.email as assigned_email,
                ab.id as assigned_by_id, ab.name as assigned_by_staff_name, ab.email as assigned_by_email,
                ts.id as status_id, ts.name as status_name
         FROM tasks t
         LEFT JOIN projects p ON t.project = p.id
         LEFT JOIN staff s ON t.assigned_to = s.id
         LEFT JOIN staff ab ON t.assigned_by = ab.id
         LEFT JOIN task_statuses ts ON t.status = ts.id OR t.status = ts.name
         WHERE t.id = ?`,
        [id]
      );

      await ensureAssigneesInProject(rows[0]?.project, rows[0]?.assigned_to);

      const [subRows] = await pool.query("SELECT * FROM subtasks WHERE task_id = ?", [id]);
      const formatted = formatTask(rows[0], subRows, await buildStaffMap(rows));

      const io = req.app.get("io");
      if (io) io.emit("task:created", formatted);

      res.status(201).json(formatted);
    } catch (err) {
      console.error("Create task error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ================= UPDATE TASK =================
router.put(
  "/:id",
  authMiddleware,
  checkAnyPermission(["task_management", "issue"], "update"),
  upload.fields([{ name: "image" }, { name: "video" }]),
  async (req, res) => {
    try {
      const taskId = req.params.id;
      const {
        title, description, assignedTo, status, project, priority,
        type, startDate, endDate, estimatedHours, calculatedEndDate
      } = req.body;

      if (title !== undefined && !title.trim()) {
        return res.status(400).json({ error: "Plese enter task title", field: "title" });
      }

      if (startDate && endDate) {
        const sDate = new Date(startDate);
        const eDate = new Date(endDate);
        if (eDate < sDate) {
          return res.status(400).json({ error: "End Date cannot be earlier than Start Date!" });
        }
      }

      if (estimatedHours !== undefined && estimatedHours !== null && parseFloat(estimatedHours) < 0) {
        return res.status(400).json({ error: "Estimated hours cannot be negative!" });
      }

      const assignedVal = assignedTo !== undefined ? buildAssignedToVal(assignedTo) : undefined;

      // Use NULLIF so that empty-string values don't overwrite existing data
      await pool.query(
        `UPDATE tasks SET
           title = COALESCE(NULLIF(?, ''), title),
           description = COALESCE(NULLIF(?, ''), description),
           status = COALESCE(NULLIF(?, ''), status),
           priority = COALESCE(NULLIF(?, ''), priority),
           project = COALESCE(NULLIF(?, ''), project),
           assigned_to = COALESCE(NULLIF(?, ''), assigned_to),
           start_date = COALESCE(?, start_date),
           end_date = COALESCE(?, end_date),
           type = COALESCE(NULLIF(?, ''), type),
           estimated_hours = COALESCE(?, estimated_hours),
           calculated_end_date = COALESCE(?, calculated_end_date)
         WHERE id = ?`,
        [
          title, description, status, priority, project, assignedVal,
          startDate, endDate, type, estimatedHours, calculatedEndDate, taskId
        ]
      );

      // Sync subtasks if provided
      if (req.body.subtasks !== undefined) {
        let parsedSubtasks = [];
        try {
          parsedSubtasks = typeof req.body.subtasks === "string" ? JSON.parse(req.body.subtasks) : req.body.subtasks;
        } catch (e) { parsedSubtasks = []; }

        if (Array.isArray(parsedSubtasks)) {
          await pool.query("DELETE FROM subtasks WHERE task_id = ?", [taskId]);
          for (const sub of parsedSubtasks) {
            const subId = sub._id || sub.id || `sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            await pool.query(
              `INSERT INTO subtasks (id, task_id, title, description, status, assigned_to, start_date, end_date, hours)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                subId, taskId, sub.title || "", sub.description || "", sub.status || "Pending",
                sub.assignedTo || null, sub.startDate || null, sub.endDate || null, parseFloat(sub.hours) || 0
              ]
            );
          }
        }
      }

      const [rows] = await pool.query(
        `SELECT t.*,
                p.id as project_id, p.name as project_name,
                s.id as assigned_id, s.name as assigned_name, s.email as assigned_email,
                ab.id as assigned_by_id, ab.name as assigned_by_staff_name, ab.email as assigned_by_email,
                ts.id as status_id, ts.name as status_name
         FROM tasks t
         LEFT JOIN projects p ON t.project = p.id
         LEFT JOIN staff s ON t.assigned_to = s.id
         LEFT JOIN staff ab ON t.assigned_by = ab.id
         LEFT JOIN task_statuses ts ON t.status = ts.id OR t.status = ts.name
         WHERE t.id = ?`,
        [taskId]
      );

      if (!rows || rows.length === 0) return res.status(404).json({ error: "Task not found" });

      await ensureAssigneesInProject(rows[0]?.project, rows[0]?.assigned_to);

      const [subRows] = await pool.query("SELECT * FROM subtasks WHERE task_id = ?", [taskId]);
      const formatted = formatTask(rows[0], subRows, await buildStaffMap(rows));

      const io = req.app.get("io");
      if (io) io.emit("task:updated", formatted);

      res.json(formatted);
    } catch (err) {
      console.error("Update task error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ================= DELETE TASK =================
router.delete("/:id", authMiddleware, checkAnyPermission(["task_management", "issue"], "delete"), async (req, res) => {
  try {
    const taskId = req.params.id;
    await pool.query("DELETE FROM subtasks WHERE task_id = ?", [taskId]);
    await pool.query("DELETE FROM tasks WHERE id = ?", [taskId]);

    const io = req.app.get("io");
    if (io) io.emit("task:deleted", { _id: taskId, id: taskId });

    res.json({ message: "Task deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= SUBTASKS MANAGEMENT =================
router.post("/:id/subtasks", authMiddleware, async (req, res) => {
  try {
    const { title, description, status, assignedTo, startDate, endDate, hours } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: "Subtask title is required" });

    // Validate dates & hours (B27)
    if (startDate && endDate) {
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime()) && eDate < sDate) {
        return res.status(400).json({ error: "Subtask End Date cannot be earlier than Start Date" });
      }
    }

    const subHours = hours !== undefined && hours !== null && hours !== "" ? parseFloat(hours) : 0;
    if (isNaN(subHours) || subHours < 0) {
      return res.status(400).json({ error: "Subtask estimated hours cannot be negative" });
    }

    const taskId = req.params.id;
    const subId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    await pool.query(
      `INSERT INTO subtasks (id, task_id, title, description, status, assigned_to, start_date, end_date, hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [subId, taskId, title.trim(), description || "", status || "Pending", assignedTo || null, startDate || null, endDate || null, subHours]
    );

    // Sync task's estimated_hours from subtasks sum if any have hours
    const [subHourRows] = await pool.query("SELECT SUM(hours) as total_hours FROM subtasks WHERE task_id = ?", [taskId]);
    if (subHourRows && subHourRows[0] && subHourRows[0].total_hours !== null && parseFloat(subHourRows[0].total_hours) > 0) {
      await pool.query("UPDATE tasks SET estimated_hours = ? WHERE id = ?", [parseFloat(subHourRows[0].total_hours), taskId]);
    }

    const [rows] = await pool.query(
      `SELECT t.*,
              p.id as project_id, p.name as project_name,
              s.id as assigned_id, s.name as assigned_name, s.email as assigned_email,
              ts.id as status_id, ts.name as status_name
       FROM tasks t
       LEFT JOIN projects p ON t.project = p.id
       LEFT JOIN staff s ON t.assigned_to = s.id
       LEFT JOIN task_statuses ts ON t.status = ts.id OR t.status = ts.name
       WHERE t.id = ?`,
      [taskId]
    );

    const [subRows] = await pool.query("SELECT * FROM subtasks WHERE task_id = ?", [taskId]);
    const formatted = formatTask(rows[0], subRows, await buildStaffMap(rows));

    const io = req.app.get("io");
    if (io) io.emit("task:updated", formatted);

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/:id/subtasks/:subtaskId", authMiddleware, async (req, res) => {
  try {
    const { title, description, status, assignedTo, startDate, endDate, hours } = req.body;
    const { id: taskId, subtaskId } = req.params;

    if (title !== undefined && (!title || !title.trim())) {
      return res.status(400).json({ error: "Subtask title cannot be empty" });
    }

    if (startDate && endDate) {
      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime()) && eDate < sDate) {
        return res.status(400).json({ error: "Subtask End Date cannot be earlier than Start Date" });
      }
    }

    if (hours !== undefined && hours !== null && hours !== "") {
      const subHours = parseFloat(hours);
      if (isNaN(subHours) || subHours < 0) {
        return res.status(400).json({ error: "Subtask estimated hours cannot be negative" });
      }
    }

    await pool.query(
      `UPDATE subtasks SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         status = COALESCE(?, status),
         assigned_to = COALESCE(?, assigned_to),
         start_date = COALESCE(?, start_date),
         end_date = COALESCE(?, end_date),
         hours = COALESCE(?, hours)
       WHERE id = ?`,
      [title ? title.trim() : null, description, status, assignedTo, startDate, endDate, hours !== undefined ? parseFloat(hours) : null, subtaskId]
    );

    // Sync task's estimated_hours
    const [subHourRows] = await pool.query("SELECT SUM(hours) as total_hours FROM subtasks WHERE task_id = ?", [taskId]);
    if (subHourRows && subHourRows[0] && subHourRows[0].total_hours !== null) {
      await pool.query("UPDATE tasks SET estimated_hours = ? WHERE id = ?", [parseFloat(subHourRows[0].total_hours) || 0, taskId]);
    }

    const [rows] = await pool.query(
      `SELECT t.*,
              p.id as project_id, p.name as project_name,
              s.id as assigned_id, s.name as assigned_name, s.email as assigned_email,
              ts.id as status_id, ts.name as status_name
       FROM tasks t
       LEFT JOIN projects p ON t.project = p.id
       LEFT JOIN staff s ON t.assigned_to = s.id
       LEFT JOIN task_statuses ts ON t.status = ts.id OR t.status = ts.name
       WHERE t.id = ?`,
      [taskId]
    );

    const [subRows] = await pool.query("SELECT * FROM subtasks WHERE task_id = ?", [taskId]);
    const formatted = formatTask(rows[0], subRows, await buildStaffMap(rows));

    const io = req.app.get("io");
    if (io) io.emit("task:updated", formatted);

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/:id/subtasks/:subtaskId", authMiddleware, async (req, res) => {
  try {
    const { id: taskId, subtaskId } = req.params;
    await pool.query("DELETE FROM subtasks WHERE id = ?", [subtaskId]);

    // Sync task's estimated_hours
    const [subHourRows] = await pool.query("SELECT SUM(hours) as total_hours FROM subtasks WHERE task_id = ?", [taskId]);
    if (subHourRows && subHourRows[0] && subHourRows[0].total_hours !== null) {
      await pool.query("UPDATE tasks SET estimated_hours = ? WHERE id = ?", [parseFloat(subHourRows[0].total_hours) || 0, taskId]);
    }

    const [rows] = await pool.query(
      `SELECT t.*,
              p.id as project_id, p.name as project_name,
              s.id as assigned_id, s.name as assigned_name, s.email as assigned_email,
              ts.id as status_id, ts.name as status_name
       FROM tasks t
       LEFT JOIN projects p ON t.project = p.id
       LEFT JOIN staff s ON t.assigned_to = s.id
       LEFT JOIN task_statuses ts ON t.status = ts.id OR t.status = ts.name
       WHERE t.id = ?`,
      [taskId]
    );

    const [subRows] = await pool.query("SELECT * FROM subtasks WHERE task_id = ?", [taskId]);
    const formatted = formatTask(rows[0], subRows, await buildStaffMap(rows));

    const io = req.app.get("io");
    if (io) io.emit("task:updated", formatted);

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


