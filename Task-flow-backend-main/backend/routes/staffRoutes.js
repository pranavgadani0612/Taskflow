const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { pool, logAudit } = require("../config/mysqlDb");
const { generatePassword, sendMail } = require("../config/mail");
const { checkPermission } = require("../middleware/permissions");
const authMiddleware = require("../middleware/auth");
const { checkPlanLimit } = require("../middleware/subscriptionLimits");
const staffController = require("../controllers/staffController");
const companyController = require("../controllers/companyController");
const upload = require("../middleware/upload");

// GET celebrations (Today & upcoming 14 days birthdays and work anniversaries)
router.get("/celebrations", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, name, email, role, position, image, department, dob, joining_date
      FROM staff
      WHERE status = 'Active' AND (dob IS NOT NULL OR joining_date IS NOT NULL)
    `);

    const now = new Date();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentDay = now.getDate(); // 1-31
    const currentYear = now.getFullYear();

    const todayBirthdays = [];
    const upcomingBirthdays = [];
    const todayAnniversaries = [];
    const upcomingAnniversaries = [];

    const getDaysUntil = (month, day) => {
      let eventDate = new Date(currentYear, month - 1, day);
      if (eventDate < new Date(currentYear, currentMonth - 1, currentDay)) {
        eventDate = new Date(currentYear + 1, month - 1, day);
      }
      const diffMs = eventDate - new Date(currentYear, currentMonth - 1, currentDay);
      return Math.round(diffMs / (1000 * 60 * 60 * 24));
    };

    rows.forEach((s) => {
      if (s.dob) {
        const d = new Date(s.dob);
        const m = d.getMonth() + 1;
        const day = d.getDate();
        if (m === currentMonth && day === currentDay) {
          todayBirthdays.push({
            id: s.id,
            name: s.name,
            email: s.email,
            department: s.department || "Engineering",
            position: s.position,
            image: s.image,
            dob: s.dob
          });
        } else {
          const daysLeft = getDaysUntil(m, day);
          if (daysLeft > 0 && daysLeft <= 14) {
            upcomingBirthdays.push({
              id: s.id,
              name: s.name,
              email: s.email,
              department: s.department || "Engineering",
              position: s.position,
              image: s.image,
              dob: s.dob,
              daysLeft
            });
          }
        }
      }

      if (s.joining_date) {
        const d = new Date(s.joining_date);
        const m = d.getMonth() + 1;
        const day = d.getDate();
        const yearsCompleted = currentYear - d.getFullYear();

        if (yearsCompleted > 0) {
          if (m === currentMonth && day === currentDay) {
            todayAnniversaries.push({
              id: s.id,
              name: s.name,
              email: s.email,
              department: s.department || "Engineering",
              position: s.position,
              image: s.image,
              joining_date: s.joining_date,
              yearsCompleted
            });
          } else {
            const daysLeft = getDaysUntil(m, day);
            if (daysLeft > 0 && daysLeft <= 14) {
              upcomingAnniversaries.push({
                id: s.id,
                name: s.name,
                email: s.email,
                department: s.department || "Engineering",
                position: s.position,
                image: s.image,
                joining_date: s.joining_date,
                yearsCompleted,
                daysLeft
              });
            }
          }
        }
      }
    });

    upcomingBirthdays.sort((a, b) => a.daysLeft - b.daysLeft);
    upcomingAnniversaries.sort((a, b) => a.daysLeft - b.daysLeft);

    res.json({
      todayBirthdays,
      upcomingBirthdays,
      todayAnniversaries,
      upcomingAnniversaries
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all staff (with directory fields)
router.get("/", authMiddleware, async (req, res) => {
  try {
    // If includeInactive is true (requested by Staff Management page), return all staff; otherwise default to Active only
    const includeInactive = req.query.includeInactive === "true";
    let query = `
      SELECT s.id as _id, s.id, s.name, s.email, s.role, s.position, s.status, s.phone, s.image,
             s.department, s.reporting_manager_id, s.reporting_manager_name, s.joining_date, s.dob, s.emergency_contact, s.documents,
             r.id as role_id, r.name as role_name
      FROM staff s
      LEFT JOIN roles r ON s.role = r.id OR s.role = r.name
    `;
    if (!includeInactive) {
      query += ` WHERE s.status = 'Active'`;
    }
    query += ` ORDER BY s.created_at DESC`;

    const [rows] = await pool.query(query);

    const formatted = rows.map(r => {
      const roleDisplayName = r.role_name || (r.role === "role_staff" ? "Staff" : r.role === "role_superadmin" ? "Super Admin" : (r.role || "Staff"));
      const positionDisplayName = (r.position && r.position !== "role_staff" && r.position !== "role_superadmin") 
        ? r.position 
        : roleDisplayName;

      return {
        _id: r.id,
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        position: positionDisplayName,
        status: r.status,
        image: r.image || "",
        department: r.department || (r.role_name?.includes("Manager") ? "Management" : "Engineering"),
        reporting_manager_id: r.reporting_manager_id,
        reporting_manager_name: r.reporting_manager_name || "Self",
        joining_date: r.joining_date,
        dob: r.dob,
        emergency_contact: r.emergency_contact,
        documents: typeof r.documents === "string" ? JSON.parse(r.documents || "[]") : (r.documents || []),
        role: {
          _id: r.role_id || r.role || "role_staff",
          id: r.role_id || r.role || "role_staff",
          name: roleDisplayName
        }
      };
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ADD staff
router.post("/", authMiddleware, checkPermission("staff_management", "create"), checkPlanLimit("staff"), async (req, res) => {
  try {
    const { name, email, phone, status, role, position, password } = req.body;
    
    // Server-side validations (B1, B6, B8, B9, B19)
    if (!name || !name.trim()) return res.status(400).json({ error: "Plese enter name", field: "name" });
    if (!email || !email.trim()) return res.status(400).json({ error: "Plese enter email", field: "email" });

    const trimmedName = name.trim();
    // Allow letters, spaces, hyphens, apostrophes, and periods in name (B9)
    const nameRegex = /^[a-zA-Z\s\-'.]+$/;
    if (!nameRegex.test(trimmedName)) {
      return res.status(400).json({ error: "Name can only contain letters, spaces, hyphens, and apostrophes", field: "name" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: "Plese enter valid email address", field: "email" });
    }

    let cleanPhone = "";
    if (phone) {
      cleanPhone = String(phone).trim();
      const phoneRegex = /^[0-9+\-\s]{7,15}$/;
      if (cleanPhone && !phoneRegex.test(cleanPhone)) {
        return res.status(400).json({ error: "Please enter a valid phone number (digits only, 7-15 numbers)", field: "phone" });
      }

      // Check duplicate phone (B8)
      if (cleanPhone) {
        const [existingPhone] = await pool.query("SELECT id FROM staff WHERE phone = ? LIMIT 1", [cleanPhone]);
        if (existingPhone.length > 0) {
          return res.status(409).json({ error: `An employee with phone number '${cleanPhone}' already exists!`, field: "phone" });
        }
      }
    } else {
      return res.status(400).json({ error: "Plese enter phone", field: "phone" });
    }

    if (!password || password.trim().length < 6) return res.status(400).json({ error: "Plese enter password", field: "password" });
    if (!status) return res.status(400).json({ error: "Plese enter status", field: "status" });
    if (!role) return res.status(400).json({ error: "Plese enter role", field: "role" });

    // Check duplicate email (B2 -> 409 Conflict)
    const [existing] = await pool.query("SELECT id FROM staff WHERE email = ? LIMIT 1", [cleanEmail]);
    if (existing.length > 0) {
      return res.status(409).json({ error: `An employee with email '${cleanEmail}' already exists!`, field: "email" });
    }

    const plainPassword = password.trim();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const id = `staff_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const roleVal = role || "Developer";

    await pool.query(
      `INSERT INTO staff (id, name, email, password, role, position, status, phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, trimmedName, cleanEmail, hashedPassword, roleVal, position || roleVal, status || "Active", phone ? String(phone).trim() : ""]
    );

    // Auto leave balance
    try {
      await pool.query(
        `INSERT INTO leave_balances (id, user_id, user_name, user_email, cl_balance, sl_balance, pl_balance, comp_off)
         VALUES (?, ?, ?, ?, 12, 8, 15, 0)
         ON DUPLICATE KEY UPDATE user_name=VALUES(user_name), user_email=VALUES(user_email)`,
        [`bal_${id}`, id, trimmedName, cleanEmail]
      );
    } catch (e) {}

    if (cleanEmail && plainPassword) {
      try {
        sendMail(cleanEmail, roleVal, plainPassword);
      } catch (mailErr) {
        console.error("Failed to send welcome email:", mailErr);
      }
    }

    res.status(201).json({
      _id: id,
      id,
      name: trimmedName,
      email: cleanEmail,
      phone: phone ? String(phone).trim() : "",
      role: { name: roleVal },
      position: position || roleVal,
      status: status || "Active",
      tempPassword: plainPassword
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "An employee with this email already exists!" });
    }
    res.status(500).json({ error: err.message });
  }
});

// UPDATE
router.put("/:id", authMiddleware, checkPermission("staff_management", "update"), async (req, res) => {
  try {
    const { name, email, phone, status, role, position, password } = req.body;
    const targetId = req.params.id;

    const trimmedName = name !== undefined ? name.trim() : null;
    if (trimmedName !== null && !trimmedName) {
      return res.status(400).json({ error: "Plese enter name", field: "name" });
    }

    if (trimmedName) {
      const nameRegex = /^[a-zA-Z\s\-'.]+$/;
      if (!nameRegex.test(trimmedName)) {
        return res.status(400).json({ error: "Name can only contain letters, spaces, hyphens, and apostrophes", field: "name" });
      }
    }

    const cleanEmail = email !== undefined && email !== null ? email.trim().toLowerCase() : null;
    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        return res.status(400).json({ error: "Please enter a valid email address" });
      }
      const [existingEmail] = await pool.query("SELECT id FROM staff WHERE email = ? AND id != ? LIMIT 1", [cleanEmail, targetId]);
      if (existingEmail.length > 0) {
        return res.status(409).json({ error: `An employee with email '${cleanEmail}' already exists!` });
      }
    }

    const cleanPhone = phone !== undefined && phone !== null ? String(phone).trim() : null;
    if (cleanPhone) {
      const phoneRegex = /^[0-9+\-\s]{7,15}$/;
      if (!phoneRegex.test(cleanPhone)) {
        return res.status(400).json({ error: "Please enter a valid phone number (digits only, 7-15 numbers)" });
      }
      const [existingPhone] = await pool.query("SELECT id FROM staff WHERE phone = ? AND id != ? LIMIT 1", [cleanPhone, targetId]);
      if (existingPhone.length > 0) {
        return res.status(409).json({ error: `An employee with phone number '${cleanPhone}' already exists!` });
      }
    }

    if (password && password.trim().length >= 6) {
      const hashedPassword = await bcrypt.hash(password.trim(), 10);
      await pool.query(
        `UPDATE staff SET 
           name = COALESCE(?, name),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           status = COALESCE(?, status),
           role = COALESCE(?, role),
           position = COALESCE(?, position),
           password = ?
         WHERE id = ?`,
        [trimmedName, cleanEmail, cleanPhone, status, role, position, hashedPassword, targetId]
      );
    } else {
      await pool.query(
        `UPDATE staff SET 
           name = COALESCE(?, name),
           email = COALESCE(?, email),
           phone = COALESCE(?, phone),
           status = COALESCE(?, status),
           role = COALESCE(?, role),
           position = COALESCE(?, position)
         WHERE id = ?`,
        [trimmedName, cleanEmail, cleanPhone, status, role, position, targetId]
      );
    }

    const [rows] = await pool.query("SELECT id as _id, id, name, email, phone, status, role, position FROM staff WHERE id = ?", [targetId]);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "An employee with this email or phone already exists!" });
    }
    res.status(500).json({ error: err.message });
  }
});

// DELETE (Hard delete staff and cascade delete all their associated records across modules)
router.delete("/:id", authMiddleware, checkPermission("staff_management", "delete"), async (req, res) => {
  try {
    const targetId = req.params.id;
    // Check if employee is superadmin
    const [staffRow] = await pool.query("SELECT role, email, name FROM staff WHERE id = ? LIMIT 1", [targetId]);
    if (staffRow.length > 0 && (staffRow[0].role === "role_superadmin" || staffRow[0].email === "gadanipranav@gmail.com")) {
      return res.status(403).json({ error: "Super Admin accounts cannot be deleted" });
    }

    const staffName = staffRow.length > 0 ? staffRow[0].name : targetId;
    const staffEmail = staffRow.length > 0 ? staffRow[0].email : "";

    // 1. Delete associated records from all modules where user_id / employee_id matches
    await pool.query("DELETE FROM attendance WHERE user_id = ? OR (user_email = ? AND user_email != '')", [targetId, staffEmail]);
    await pool.query("DELETE FROM attendance_regularizations WHERE user_id = ? OR (user_email = ? AND user_email != '')", [targetId, staffEmail]);
    await pool.query("DELETE FROM leave_requests WHERE user_id = ? OR (user_email = ? AND user_email != '')", [targetId, staffEmail]);
    await pool.query("DELETE FROM leave_balances WHERE user_id = ? OR (user_email = ? AND user_email != '')", [targetId, staffEmail]);
    await pool.query("DELETE FROM short_leaves WHERE user_id = ? OR (user_email = ? AND user_email != '')", [targetId, staffEmail]);
    await pool.query("DELETE FROM break_logs WHERE user_id = ? OR (user_email = ? AND user_email != '')", [targetId, staffEmail]);
    await pool.query("DELETE FROM timesheets WHERE user_id = ? OR (user_email = ? AND user_email != '')", [targetId, staffEmail]);
    await pool.query("DELETE FROM expenses WHERE employee_id = ? OR (employee_email = ? AND employee_email != '')", [targetId, staffEmail]);
    await pool.query("DELETE FROM internal_tickets WHERE user_id = ? OR (user_email = ? AND user_email != '')", [targetId, staffEmail]);
    await pool.query("DELETE FROM ratings WHERE employee_id = ? OR rated_by = ?", [targetId, targetId]);
    await pool.query("DELETE FROM project_allocations WHERE user_id = ?", [targetId]);
    await pool.query("DELETE FROM overtime_requests WHERE user_id = ?", [targetId]);
    await pool.query("DELETE FROM wfh_requests WHERE user_id = ?", [targetId]);
    await pool.query("DELETE FROM asset_assignments WHERE user_id = ?", [targetId]);
    await pool.query("DELETE FROM payslips WHERE user_id = ?", [targetId]);
    await pool.query("DELETE FROM salary_structures WHERE user_id = ?", [targetId]);

    // 2. Delete staff record
    await pool.query("DELETE FROM staff WHERE id = ?", [targetId]);

    await logAudit({
      actorId: req.user._id ? req.user._id.toString() : req.user.id,
      actorName: req.user.name || "Admin",
      actorRole: req.user.role?.name || req.user.role || "Admin",
      module: "staff",
      action: "staff_deleted",
      targetId,
      targetName: `Deleted staff ${staffName} (#${targetId})`,
      ipAddress: req.ip
    });

    res.json({ message: "Staff and all related records deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE EXTENDED PROFILE (Directory & HR fields)
router.put("/:id/extended-profile", authMiddleware, async (req, res) => {
  try {
    const { department, reporting_manager_id, reporting_manager_name, joining_date, dob, emergency_contact, documents } = req.body;
    const targetStaffId = req.params.id;

    // Validation (B37)
    if (reporting_manager_id && String(reporting_manager_id) === String(targetStaffId)) {
      return res.status(400).json({ error: "An employee cannot be their own reporting manager!" });
    }

    if (dob) {
      const dobDate = new Date(dob);
      const today = new Date();
      if (!isNaN(dobDate.getTime()) && dobDate >= today) {
        return res.status(400).json({ error: "Date of Birth cannot be today or in the future" });
      }
    }

    if (joining_date) {
      const joinDate = new Date(joining_date);
      const maxFutureDate = new Date();
      maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 1); // Maximum 1 year in advance
      if (!isNaN(joinDate.getTime()) && joinDate > maxFutureDate) {
        return res.status(400).json({ error: "Joining date cannot be more than 1 year in the future" });
      }
    }

    await pool.query(
      `UPDATE staff 
       SET department = COALESCE(?, department),
           reporting_manager_id = COALESCE(?, reporting_manager_id),
           reporting_manager_name = COALESCE(?, reporting_manager_name),
           joining_date = COALESCE(?, joining_date),
           dob = COALESCE(?, dob),
           emergency_contact = COALESCE(?, emergency_contact),
           documents = COALESCE(?, documents)
       WHERE id = ?`,
      [
        department,
        reporting_manager_id,
        reporting_manager_name,
        joining_date,
        dob,
        emergency_contact,
        documents ? (typeof documents === "string" ? documents : JSON.stringify(documents)) : null,
        targetStaffId
      ]
    );

    await logAudit({
      actorId: req.user._id ? req.user._id.toString() : req.user.id,
      actorName: req.user.name || "Admin",
      actorRole: req.user.role?.name || req.user.role || "Admin",
      module: "staff",
      action: "profile_updated",
      targetId: req.params.id,
      targetName: `Updated extended profile for staff #${req.params.id}`,
      ipAddress: req.ip
    });

    res.json({ message: "Staff extended profile updated successfully!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// PROFILE ROUTES
router.get("/me", authMiddleware, staffController.getProfile);
router.put("/me", authMiddleware, staffController.updateProfile);
router.put("/change-password", authMiddleware, staffController.changePassword);

// COMPANY SETTINGS ROUTES
router.get("/company/settings", authMiddleware, companyController.getSettings);
router.put("/company/settings", authMiddleware, upload.single("appLogo"), companyController.updateSettings);

// COMPANY POLICY ROUTES
router.get("/company/policies", authMiddleware, companyController.getPolicies);
router.post("/company/policies", authMiddleware, companyController.addPolicy);
router.put("/company/policies/:policyId", authMiddleware, companyController.updatePolicy);
router.delete("/company/policies/:policyId", authMiddleware, companyController.deletePolicy);

module.exports = router;