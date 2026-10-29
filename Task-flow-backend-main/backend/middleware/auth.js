const jwt = require("jsonwebtoken");
const { pool } = require("../config/mysqlDb");

module.exports = async (req, res, next) => {
  try {
    // 🍪 Read token from httpOnly cookie first, then Authorization header fallback
    const token =
      req.cookies?.token ||
      (req.headers.authorization && req.headers.authorization.split(" ")[1]);

    if (!token) return res.status(401).json("No token provided");

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "tasksecret");
    if (!decoded || !decoded.id) return res.status(401).json("Invalid Token");

    const [rows] = await pool.query(
      `SELECT s.*, 
              r.id as role_id, r.name as role_name, r.permissions as role_permissions
       FROM staff s
       LEFT JOIN roles r ON s.role = r.id OR s.role = r.name
       WHERE s.id = ? LIMIT 1`,
      [decoded.id]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json("User no longer exists");
    }

    const row = rows[0];

    if (row.status && row.status.toLowerCase() === "inactive") {
      res.clearCookie("token", { httpOnly: true, sameSite: "none", secure: true });
      return res.status(403).json({ error: "Your account has been deactivated. You have been logged out.", inactive: true });
    }
    let parsedPerms = [];
    if (row.role_permissions) {
      try {
        parsedPerms = typeof row.role_permissions === "string" ? JSON.parse(row.role_permissions) : row.role_permissions;
      } catch (e) {
        parsedPerms = [];
      }
    }

    const roleObj = {
      _id: row.role_id || row.role || "role_staff",
      id: row.role_id || row.role || "role_staff",
      name: row.role_name || row.role || "Staff",
      permissions: parsedPerms
    };

    req.user = {
      _id: row.id,
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      position: row.position,
      status: row.status,
      role: roleObj,
      companyId: row.company_id || "default_company",
      image: row.image || ""
    };

    next();
  } catch (err) {
    res.status(401).json("Invalid Token");
  }
};