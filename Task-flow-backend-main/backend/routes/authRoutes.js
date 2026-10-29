const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { pool } = require("../config/mysqlDb");
const { sendResetPasswordMail } = require("../config/mail");

const APP_LINK = process.env.APP_URL || "http://localhost:5173";

// Helper: Format user object for client
function formatUser(row) {
  let permissions = [];
  if (row.role_permissions) {
    try {
      permissions = typeof row.role_permissions === "string" ? JSON.parse(row.role_permissions) : row.role_permissions;
    } catch (e) {
      permissions = [];
    }
  }

  const roleObj = {
    _id: row.role_id || row.role || "role_staff",
    id: row.role_id || row.role || "role_staff",
    name: row.role_name || row.role || "Staff",
    permissions: permissions
  };

  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    email: row.email,
    role: roleObj,
    position: row.position,
    status: row.status,
    phone: row.phone,
    image: row.image || "",
    companyId: {
      _id: row.company_id || "default_company",
      id: row.company_id || "default_company",
      companyName: "Padhya Soft"
    }
  };
}

// ✅ LOGIN — set token as httpOnly cookie
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json("Email and password are required");
    }

    const [rows] = await pool.query(
      `SELECT s.*, 
              r.id as role_id, r.name as role_name, r.permissions as role_permissions
       FROM staff s
       LEFT JOIN roles r ON s.role = r.id OR s.role = r.name
       WHERE s.email = ? LIMIT 1`,
      [email.trim().toLowerCase()]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const userRow = rows[0];
    const match = await bcrypt.compare(password, userRow.password);
    if (!match) {
      return res.status(401).json({ error: "Wrong password" });
    }

    if (userRow.status && userRow.status.toLowerCase() === "inactive") {
      return res.status(403).json({ 
        error: "Your account has been deactivated by the Administrator. Please contact your administrator." 
      });
    }

    const user = formatUser(userRow);
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || "tasksecret", {
      expiresIn: "7d"
    });

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user, token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET CURRENT USER
router.get("/me", async (req, res) => {
  try {
    const token = req.cookies?.token || (req.headers.authorization && req.headers.authorization.split(" ")[1]);
    if (!token) return res.status(401).json({ user: null, error: "Unauthorized" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "tasksecret");
    if (!decoded || !decoded.id) return res.status(401).json({ user: null, error: "Invalid token" });

    const [rows] = await pool.query(
      `SELECT s.*, 
              r.id as role_id, r.name as role_name, r.permissions as role_permissions
       FROM staff s
       LEFT JOIN roles r ON s.role = r.id OR s.role = r.name
       WHERE s.id = ? LIMIT 1`,
      [decoded.id]
    );

    if (!rows || rows.length === 0) return res.status(401).json({ user: null, error: "User not found" });

    if (rows[0].status && rows[0].status.toLowerCase() === "inactive") {
      res.clearCookie("token", { httpOnly: true, sameSite: "none", secure: true });
      return res.status(403).json({ user: null, error: "Account deactivated", inactive: true });
    }

    const user = formatUser(rows[0]);
    res.json({ user, ...user });
  } catch (err) {
    res.status(401).json({ user: null, error: err.message });
  }
});

// ✅ LOGOUT
router.post("/logout", (req, res) => {
  res.clearCookie("token", { httpOnly: true, sameSite: "none", secure: true });
  res.json({ message: "Logged out" });
});

// ✅ FORGOT PASSWORD
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const [rows] = await pool.query("SELECT * FROM staff WHERE email = ? LIMIT 1", [email?.trim().toLowerCase()]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "No user found with this email" });
    }

    const token = crypto.randomBytes(20).toString("hex");
    const expires = Date.now() + 3600000; // 1 hour

    await pool.query(
      "UPDATE staff SET reset_password_token = ?, reset_password_expires = ? WHERE id = ?",
      [token, expires, rows[0].id]
    );

    const resetLink = `${APP_LINK.replace(/\/$/, "")}/reset-password?token=${token}`;
    await sendResetPasswordMail(rows[0].email, rows[0].name, resetLink);

    res.json({ message: "Password reset link sent to your email" });
  } catch (err) {
    console.error("FORGOT PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ RESET PASSWORD
router.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!strongPassword.test(password)) {
      return res.status(400).json({ error: "Password must be 8+ chars with uppercase, lowercase, number, and symbol." });
    }

    const now = Date.now();
    const [rows] = await pool.query(
      "SELECT * FROM staff WHERE reset_password_token = ? AND reset_password_expires > ? LIMIT 1",
      [token, now]
    );

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: "Token is invalid or has expired" });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    await pool.query(
      "UPDATE staff SET password = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?",
      [hash, rows[0].id]
    );

    res.json({ message: "Password reset successful. Please log in with your new password." });
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;