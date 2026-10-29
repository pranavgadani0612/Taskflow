const bcrypt = require("bcryptjs");
const { pool } = require("../config/mysqlDb");

// GET current user profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const [rows] = await pool.query(
      `SELECT s.id as _id, s.id, s.name, s.email, s.phone, s.position, s.status, s.image,
              r.id as role_id, r.name as role_name
       FROM staff s
       LEFT JOIN roles r ON s.role = r.id OR s.role = r.name
       WHERE s.id = ? LIMIT 1`,
      [userId]
    );

    if (!rows || rows.length === 0) return res.status(404).json({ error: "User not found" });

    const r = rows[0];
    res.json({
      _id: r.id,
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      position: r.position,
      status: r.status,
      image: r.image || "",
      role: {
        _id: r.role_id || "role_staff",
        name: r.role_name || "Staff"
      },
      companyId: {
        _id: "default_company",
        companyName: "Padhya Soft"
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT update current user profile
// PUT update current user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { name, phone, password } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: "Plese enter name" });
    }

    if (password && password.length >= 6) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);
      await pool.query(
        "UPDATE staff SET name = COALESCE(?, name), phone = COALESCE(?, phone), password = ? WHERE id = ?",
        [name ? name.trim() : null, phone, hash, userId]
      );
    } else if (password) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    } else {
      await pool.query(
        "UPDATE staff SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?",
        [name ? name.trim() : null, phone, userId]
      );
    }

    const [rows] = await pool.query("SELECT id as _id, id, name, email, phone, position, status, image FROM staff WHERE id = ?", [userId]);
    res.json({ message: "Profile updated successfully", staff: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT change current user password (verifies old password)
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword) {
      return res.status(400).json({ error: "Plese enter current password" });
    }
    if (!newPassword) {
      return res.status(400).json({ error: "Plese enter new password" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({ error: "New password cannot be the same as old password" });
    }

    const [rows] = await pool.query("SELECT password FROM staff WHERE id = ? LIMIT 1", [userId]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(oldPassword, rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ error: "Incorrect current password" });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    await pool.query("UPDATE staff SET password = ? WHERE id = ?", [hash, userId]);

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};