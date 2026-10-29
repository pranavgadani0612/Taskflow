const { pool, logAudit } = require("../config/mysqlDb");

exports.createRole = async (req, res) => {
  try {
    if (!req.body.name || !req.body.name.trim()) {
      return res.status(400).json({ error: "Plese enter role name", msg: "Plese enter role name" });
    }

    const id = `role_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const name = req.body.name.trim();
    const status = req.body.status || "Active";
    const permissions = JSON.stringify(req.body.permissions || []);
    const companyId = req.body.companyId || req.user?.companyId?._id || req.user?.companyId || null;

    await pool.query(
      `INSERT INTO roles (id, name, status, permissions, company_id) 
       VALUES (?, ?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE status = VALUES(status), permissions = VALUES(permissions)`,
      [id, name, status, permissions, companyId]
    );

    await logAudit({
      companyId,
      actorId: req.user?.id || req.user?._id || "system",
      actorName: req.user?.name || "Admin",
      actorRole: req.user?.role?.name || "Admin",
      module: "roles",
      action: "role_created",
      targetId: id,
      targetName: name,
      details: { status, permissions: req.body.permissions },
      ipAddress: req.ip
    });

    const [rows] = await pool.query("SELECT * FROM roles WHERE id = ? OR name = ?", [id, name]);
    const role = rows[0];
    res.json({
      ...role,
      _id: role.id,
      permissions: typeof role.permissions === "string" ? JSON.parse(role.permissions) : role.permissions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getRoles = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM roles ORDER BY created_at ASC");
    const formatted = rows.map(r => ({
      ...r,
      _id: r.id,
      permissions: typeof r.permissions === "string" ? JSON.parse(r.permissions) : (r.permissions || [])
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getRole = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM roles WHERE id = ?", [req.params.id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ msg: "Role not found" });
    }
    const role = rows[0];
    res.json({
      ...role,
      _id: role.id,
      permissions: typeof role.permissions === "string" ? JSON.parse(role.permissions) : (role.permissions || [])
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const roleId = req.params.id;
    const { name, status, permissions } = req.body;

    const [existing] = await pool.query("SELECT * FROM roles WHERE id = ?", [roleId]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ msg: "Role not found" });
    }

    const updatedName = name !== undefined ? name.trim() : existing[0].name;
    if (!updatedName) {
      return res.status(400).json({ error: "Plese enter role name", msg: "Plese enter role name" });
    }
    const updatedStatus = status !== undefined ? status : existing[0].status;
    const updatedPerms = permissions !== undefined ? JSON.stringify(permissions) : existing[0].permissions;

    await pool.query(
      "UPDATE roles SET name = ?, status = ?, permissions = ? WHERE id = ?",
      [updatedName, updatedStatus, updatedPerms, roleId]
    );

    await logAudit({
      companyId: req.user?.companyId?._id || req.user?.companyId || null,
      actorId: req.user?.id || req.user?._id || "system",
      actorName: req.user?.name || "Admin",
      actorRole: req.user?.role?.name || "Admin",
      module: "roles",
      action: "role_updated",
      targetId: roleId,
      targetName: updatedName,
      details: { name: updatedName, status: updatedStatus },
      ipAddress: req.ip
    });

    const [updated] = await pool.query("SELECT * FROM roles WHERE id = ?", [roleId]);
    const role = updated[0];
    res.json({
      ...role,
      _id: role.id,
      permissions: typeof role.permissions === "string" ? JSON.parse(role.permissions) : (role.permissions || [])
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const [existing] = await pool.query("SELECT * FROM roles WHERE id = ?", [req.params.id]);
    await pool.query("DELETE FROM roles WHERE id = ?", [req.params.id]);

    if (existing && existing[0]) {
      await logAudit({
        companyId: req.user?.companyId?._id || req.user?.companyId || null,
        actorId: req.user?.id || req.user?._id || "system",
        actorName: req.user?.name || "Admin",
        actorRole: req.user?.role?.name || "Admin",
        module: "roles",
        action: "role_deleted",
        targetId: req.params.id,
        targetName: existing[0].name,
        details: { deletedRole: existing[0] },
        ipAddress: req.ip
      });
    }

    res.json({ msg: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};