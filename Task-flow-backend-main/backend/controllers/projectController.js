const { pool } = require("../config/mysqlDb");
const { sendProjectMail } = require("../config/mail");

// Helper: fetch staff details for assigned users
const getAssignedStaffObjects = async (assignedIds) => {
  if (!Array.isArray(assignedIds) || assignedIds.length === 0) return [];
  try {
    const [rows] = await pool.query("SELECT id, name, email, position FROM staff");
    return assignedIds.map(id => {
      const found = rows.find(r => r.id === id || r.id === String(id) || r.email === id);
      if (found) {
        return { _id: found.id, id: found.id, name: found.name, email: found.email, position: found.position };
      }
      return { _id: id, id: id, name: "Staff Member", email: "" };
    });
  } catch (e) {
    return assignedIds.map(id => ({ _id: id, id: id, name: "Staff Member", email: "" }));
  }
};

exports.createProject = async (req, res) => {
  try {
    const { name, description, assignedTo, status } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Plese enter project name", field: "name" });
    }

    const trimmedName = name.trim();

    // B16: Prevent duplicate project names
    const [existing] = await pool.query("SELECT id FROM projects WHERE LOWER(name) = ? LIMIT 1", [trimmedName.toLowerCase()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: `A project with name '${trimmedName}' already exists!` });
    }

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const assignedArray = Array.isArray(assignedTo) ? assignedTo : [];
    const assignedUsers = await getAssignedStaffObjects(assignedArray);

    await pool.query(
      `INSERT INTO projects (id, name, description, status, assigned_to)
       VALUES (?, ?, ?, ?, ?)`,
      [projectId, name.trim(), description || "", status || "Active", JSON.stringify(assignedUsers)]
    );

    // Send emails
    for (const user of assignedUsers) {
      if (user.email) {
        try {
          sendProjectMail(user.email, user.name, name, description || "");
        } catch (e) {}
      }
    }

    res.status(201).json({
      _id: projectId,
      id: projectId,
      name,
      description,
      status: status || "Active",
      assignedTo: assignedUsers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const userCanSeeAllProjects = (user) => {
  if (!user) return false;
  const isSuperAdmin = user.email === "gadanipranav@gmail.com" || 
                       user.email === (process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com") || 
                       user.role?.name === "Super Admin";
  if (isSuperAdmin) return true;

  const roleName = String(user.role?.name || "").toLowerCase();
  const roleId = String(user.role?.id || user.role?._id || user.role || "").toLowerCase();
  const position = String(user.position || "").toLowerCase();

  const perms = Array.isArray(user.role?.permissions) ? user.role.permissions : [];
  const projPerm = perms.find(p => p.value === "project_management");
  const hasFullAccess = projPerm?.all || projPerm?.delete;

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

const isProjectAssignedToUser = (project, user) => {
  if (!user) return false;
  const userId = String(user.id || user._id || "").toLowerCase().trim();
  const userEmail = String(user.email || "").toLowerCase().trim();
  const userName = String(user.name || "").toLowerCase().trim();

  const assignedList = Array.isArray(project.assignedTo) ? project.assignedTo : [];
  return assignedList.some(u => {
    if (!u) return false;
    if (typeof u === "string") {
      const s = u.toLowerCase().trim();
      return s === userId || s === userEmail || (userName && s.includes(userName));
    }
    const uId = String(u.id || u._id || "").toLowerCase().trim();
    const uEmail = String(u.email || "").toLowerCase().trim();
    const uName = String(u.name || "").toLowerCase().trim();

    return (userId && uId === userId) ||
           (userEmail && uEmail === userEmail) ||
           (userName && uName === userName) ||
           (userName && (uName.includes(userName) || userName.includes(uName)));
  });
};

exports.getProjects = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM projects ORDER BY created_at DESC");
    let formatted = rows.map(p => {
      let assigned = [];
      if (p.assigned_to) {
        try {
          assigned = typeof p.assigned_to === "string" ? JSON.parse(p.assigned_to) : p.assigned_to;
        } catch (e) {
          assigned = [];
        }
      }
      return {
        ...p,
        _id: p.id,
        assignedTo: assigned
      };
    });

    // If user is a regular staff/developer, show projects assigned directly OR via assigned tasks (B38)
    if (!userCanSeeAllProjects(req.user)) {
      // Find projects where user has tasks or subtasks assigned
      const userId = String(req.user?.id || req.user?._id || "");
      const [taskProjects] = await pool.query(
        `SELECT DISTINCT project FROM tasks 
         WHERE (assigned_to = ? OR assigned_to LIKE ? OR id IN (SELECT task_id FROM subtasks WHERE assigned_to = ?))
         AND project IS NOT NULL`,
        [userId, `%"id":"${userId}"%`, userId]
      );
      const userTaskProjectIds = new Set(taskProjects.map(tp => String(tp.project)));

      formatted = formatted.filter(p => isProjectAssignedToUser(p, req.user) || userTaskProjectIds.has(String(p.id)));
    }

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getProject = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM projects WHERE id = ?", [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: "Project not found" });

    const p = rows[0];
    let assigned = [];
    if (p.assigned_to) {
      try {
        assigned = typeof p.assigned_to === "string" ? JSON.parse(p.assigned_to) : p.assigned_to;
      } catch (e) {
        assigned = [];
      }
    }

    const projectData = {
      ...p,
      _id: p.id,
      assignedTo: assigned
    };

    if (!userCanSeeAllProjects(req.user) && !isProjectAssignedToUser(projectData, req.user)) {
      return res.status(403).json({ error: "Access denied: You are not assigned to this project" });
    }

    res.json(projectData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const projectId = req.params.id;
    const { name, description, assignedTo, status } = req.body;

    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ error: "Plese enter project name", field: "name" });
    }

    const assignedArray = Array.isArray(assignedTo) ? assignedTo : [];
    const assignedUsers = await getAssignedStaffObjects(assignedArray);

    await pool.query(
      `UPDATE projects SET 
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         status = COALESCE(?, status),
         assigned_to = COALESCE(?, assigned_to)
       WHERE id = ?`,
      [name, description, status, JSON.stringify(assignedUsers), projectId]
    );

    const [rows] = await pool.query("SELECT * FROM projects WHERE id = ?", [projectId]);
    const p = rows[0];
    let assigned = [];
    if (p.assigned_to) {
      try {
        assigned = typeof p.assigned_to === "string" ? JSON.parse(p.assigned_to) : p.assigned_to;
      } catch (e) {
        assigned = [];
      }
    }

    res.json({
      ...p,
      _id: p.id,
      assignedTo: assigned
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteProject = async (req, res) => {
  try {
    await pool.query("DELETE FROM projects WHERE id = ?", [req.params.id]);
    res.json({ message: "Project deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
