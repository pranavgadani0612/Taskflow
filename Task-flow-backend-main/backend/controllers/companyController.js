const Company = require("../models/Company");
const Staff = require("../models/Staff");
const Role = require("../models/Role");
const Subscription = require("../models/Subscription");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../config/mysqlDb");

// Registration
exports.registerCompany = async (req, res) => {
  try {
    const {
      companyName, gstNumber, panNumber, contactPersonName, contactPersonPhone,
      contactPersonEmail, email, phone, addressLine1, addressLine2, country,
      state, city, pincode, password
    } = req.body;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^[0-9]{10}$/;
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    const pincodeRegex = /^[0-9]{6}$/;

    if (!companyName || !companyName.trim()) return res.status(400).json({ error: "Plese enter company name" });
    if (!email || !emailRegex.test(email)) return res.status(400).json({ error: "Plese enter email" });
    if (!contactPersonName || !contactPersonName.trim()) return res.status(400).json({ error: "Plese enter contact person name" });
    if (!contactPersonPhone || !phoneRegex.test(contactPersonPhone)) return res.status(400).json({ error: "Plese enter contact phone" });
    if (!password || password.length < 6) return res.status(400).json({ error: "Plese enter password" });

    if (gstNumber && !gstRegex.test(gstNumber.toUpperCase())) return res.status(400).json({ error: "Invalid GST Number format" });
    if (panNumber && !panRegex.test(panNumber.toUpperCase())) return res.status(400).json({ error: "Invalid PAN Number format" });
    if (phone && !phoneRegex.test(phone)) return res.status(400).json({ error: "Invalid Company Phone (10 digits)" });
    if (pincode && !pincodeRegex.test(pincode)) return res.status(400).json({ error: "Invalid Pincode (6 digits)" });

    const existingCompany = await Company.findOne({ email });
    if (existingCompany) return res.status(400).json({ error: "Company email already exists" });

    const existingStaff = await Staff.findOne({ email });
    if (existingStaff) return res.status(400).json({ error: "Staff email already exists" });

    const freePlan = await Subscription.findOne({ billingCycle: "monthly" });
    const expiry = new Date(); expiry.setMonth(expiry.getMonth() + 1);

    const company = await Company.create({
      companyName, gstNumber, panNumber, contactPersonName, contactPersonPhone,
      contactPersonEmail, email, phone, addressLine1, addressLine2, country,
      state, city, pincode, appLogo: req.file ? `/uploads/${req.file.filename}` : "",
      subscription: freePlan ? freePlan._id : null,
      subscriptionStatus: "trial",
      subscriptionExpiry: expiry
    });

    const ownerRole = await Role.create({
      name: "Company Owner", status: "Active", companyId: company._id,
      permissions: [
        { name: "Staff Management", value: "staff_management", all: true, create: true, read: true, update: true, delete: true },
        { name: "Task Management", value: "task_management", all: true, create: true, read: true, update: true, delete: true },
        { name: "Project Management", value: "project_management", all: true, create: true, read: true, update: true, delete: true },
        { name: "View Dashboard", value: "view_dashboard", all: true, read: true },
        { name: "Task Status Management", value: "task_status_management", all: true, create: true, read: true, update: true, delete: true },
        { name: "Document Management", value: "document", all: true, create: true, read: true, update: true, delete: true },
        { name: "Role Management", value: "role_management", all: true, create: true, read: true, update: true, delete: true },
        { name: "Permission Management", value: "permission_management", all: true, create: true, read: true, update: true, delete: true }
      ]
    });

    await Role.create({
      name: "Staff", status: "Active", companyId: company._id,
      permissions: [
        { name: "Task Management", value: "task_management", all: false, create: true, read: true, update: true, delete: false },
        { name: "View Dashboard", value: "view_dashboard", all: true, read: true },
        { name: "Document Management", value: "document", all: false, create: false, read: true, update: false, delete: false }
      ]
    });

    await Role.create({
      name: "Manager", status: "Active", companyId: company._id,
      permissions: [
        { name: "Staff Management", value: "staff_management", all: false, create: false, read: true, update: false, delete: false },
        { name: "Task Management", value: "task_management", all: true, create: true, read: true, update: true, delete: true },
        { name: "Project Management", value: "project_management", all: false, create: false, read: true, update: false, delete: false },
        { name: "View Dashboard", value: "view_dashboard", all: true, read: true },
        { name: "Task Status Management", value: "task_status_management", all: false, create: false, read: true, update: false, delete: false },
        { name: "Document Management", value: "document", all: false, create: true, read: true, update: true, delete: false }
      ]
    });

    await Role.create({
      name: "Worker", status: "Active", companyId: company._id,
      permissions: [
        { name: "Task Management", value: "task_management", all: false, create: false, read: true, update: true, delete: false },
        { name: "View Dashboard", value: "view_dashboard", all: true, read: true }
      ]
    });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const staff = await Staff.create({
      name: contactPersonName, email: email, password: hashedPassword, phone: contactPersonPhone,
      role: ownerRole._id, companyId: company._id, status: "Active"
    });

    const populatedStaff = await Staff.findById(staff._id).populate("role").populate("companyId");
    const token = jwt.sign({ id: staff._id }, process.env.JWT_SECRET || "tasksecret", { expiresIn: "7d" });
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(201).json({
      message: "Company and Owner registered successfully",
      company,
      staff: populatedStaff,
      token,
      autoLogin: true
    });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getCompanies = async (req, res) => {
  try {
    // If MySQL has collections stored:
    const [rows] = await pool.query("SELECT data FROM collections WHERE collection_name = 'companies' ORDER BY created_at DESC");
    if (rows && rows.length > 0) {
      const parsed = rows.map(r => typeof r.data === "string" ? JSON.parse(r.data) : r.data);
      return res.json(parsed);
    }

    // Default company object for pure MySQL setup
    return res.json([
      {
        _id: "default_company",
        companyName: "Padhya Software Technologies",
        email: "contact@padhyasoft.com",
        phone: "9876543210",
        addressLine1: "Tech Hub, 4th Floor",
        city: "Ahmedabad",
        state: "Gujarat",
        country: "India",
        pincode: "380015",
        status: "Active"
      }
    ]);
  } catch (err) {
    res.json([]);
  }
};

async function getCompanyData(companyId) {
  try {
    let query = "SELECT data FROM collections WHERE collection_name = 'companies'";
    let params = [];
    if (companyId) {
      query += " AND _id = ? LIMIT 1";
      params.push(companyId);
    } else {
      query += " LIMIT 1";
    }
    const [rows] = await pool.query(query, params);
    if (rows && rows.length > 0) {
      return typeof rows[0].data === "string" ? JSON.parse(rows[0].data) : rows[0].data;
    }
  } catch (e) {}

  return {
    _id: "default_company",
    companyName: "Padhya Software Technologies",
    email: "contact@padhyasoft.com",
    phone: "9876543210",
    addressLine1: "Tech Hub, 4th Floor",
    city: "Ahmedabad",
    state: "Gujarat",
    country: "India",
    pincode: "380015",
    workingHours: {
      startTime: "09:30",
      endTime: "18:30"
    },
    breakTime: {
      lunchBreak: 40,
      teaBreak: 20
    },
    policies: []
  };
}

async function saveCompanyData(companyData) {
  const id = companyData._id || "default_company";
  companyData._id = id;
  await pool.query(
    "INSERT INTO collections (collection_name, _id, data) VALUES ('companies', ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)",
    [id, JSON.stringify(companyData)]
  );
  return companyData;
}

exports.getCompanyById = async (req, res) => {
  try {
    const company = await getCompanyData(req.params.id);
    if (!company) return res.status(404).json({ error: "Company not found" });
    res.json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateCompany = async (req, res) => {
  try {
    const updateData = { ...req.body };
    if (typeof updateData.workingHours === 'string') {
      try { updateData.workingHours = JSON.parse(updateData.workingHours); } catch (e) { }
    }
    if (typeof updateData.breakTime === 'string') {
      try { updateData.breakTime = JSON.parse(updateData.breakTime); } catch (e) { }
    }
    if (typeof updateData.holidays === 'string') {
      try { updateData.holidays = JSON.parse(updateData.holidays); } catch (e) { }
    }
    if (req.file) updateData.appLogo = `/uploads/${req.file.filename}`;

    const company = await getCompanyData(req.params.id);
    if (!company) return res.status(404).json({ error: "Company not found" });

    const merged = { ...company, ...updateData };
    await saveCompanyData(merged);
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteCompany = async (req, res) => {
  try {
    await pool.query("DELETE FROM collections WHERE collection_name = 'companies' AND _id = ?", [req.params.id]);
    await pool.query("DELETE FROM staff WHERE company_id = ?", [req.params.id]);
    res.json({ message: "Company and its staff deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET company settings & BIO
exports.getSettings = async (req, res) => {
  try {
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    let companyId = req.user.companyId?._id || req.user.companyId;

    if (isSuperAdmin && req.query.companyId) {
      companyId = Array.isArray(req.query.companyId) ? req.query.companyId[0] : req.query.companyId;
    }

    const data = await getCompanyData(companyId);
    return res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT update company settings & BIO
exports.updateSettings = async (req, res) => {
  try {
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const isOwnerOrAdmin = req.user.role?.name === "Company Owner" || isSuperAdmin;
    if (!isOwnerOrAdmin) return res.status(403).json({ error: "Permission denied" });

    let companyId = req.user.companyId?._id || req.user.companyId;
    if (isSuperAdmin && req.query.companyId) {
      companyId = Array.isArray(req.query.companyId) ? req.query.companyId[0] : req.query.companyId;
    }

    const company = await getCompanyData(companyId);
    const updateData = { ...req.body };
    const parse = (val) => {
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch (e) { return val; }
      }
      return val;
    };

    if (updateData.workingHours) updateData.workingHours = parse(updateData.workingHours);
    if (updateData.breakTime) updateData.breakTime = parse(updateData.breakTime);
    if (updateData.holidays) updateData.holidays = parse(updateData.holidays);
    if (updateData.policies) updateData.policies = parse(updateData.policies);
    if (req.file) updateData.appLogo = `/uploads/${req.file.filename}`;

    const merged = { ...company, ...updateData, updatedAt: new Date() };
    await saveCompanyData(merged);
    res.json({ message: "Settings updated successfully", settings: merged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET all company policies (Accessible by all staff)
exports.getPolicies = async (req, res) => {
  try {
    let companyId = req.user.companyId?._id || req.user.companyId;
    const company = await getCompanyData(companyId);
    res.json({ policies: company.policies || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST add new policy (Admin only)
exports.addPolicy = async (req, res) => {
  try {
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const isOwnerOrAdmin = req.user.role?.name === "Company Owner" || isSuperAdmin;
    if (!isOwnerOrAdmin) return res.status(403).json({ error: "Only Admin can add company policies" });

    const { title, category, summary, content, effectiveDate, status } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: "Plese enter policy title" });
    if (!content || !content.trim()) return res.status(400).json({ error: "Plese enter policy content" });

    let companyId = req.user.companyId?._id || req.user.companyId;
    const company = await getCompanyData(companyId);

    const newPolicy = {
      _id: "pol_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
      title: title.trim(),
      category: category || "General",
      summary: (summary || "").trim(),
      content: content.trim(),
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      status: status || "Active",
      updatedBy: req.user.name || "Admin",
      updatedAt: new Date()
    };

    if (!Array.isArray(company.policies)) company.policies = [];
    company.policies.push(newPolicy);
    await saveCompanyData(company);

    res.status(201).json({ message: "Company policy added successfully", policy: newPolicy, policies: company.policies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT update policy (Admin only)
exports.updatePolicy = async (req, res) => {
  try {
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const isOwnerOrAdmin = req.user.role?.name === "Company Owner" || isSuperAdmin;
    if (!isOwnerOrAdmin) return res.status(403).json({ error: "Only Admin can update company policies" });

    const { policyId } = req.params;
    const { title, category, summary, content, effectiveDate, status } = req.body;

    let companyId = req.user.companyId?._id || req.user.companyId;
    const company = await getCompanyData(companyId);

    if (!Array.isArray(company.policies)) company.policies = [];
    const policy = company.policies.find(p => (p._id || p.id) == policyId);
    if (!policy) return res.status(404).json({ error: "Policy not found" });

    if (title) policy.title = title.trim();
    if (category) policy.category = category;
    if (summary !== undefined) policy.summary = summary.trim();
    if (content) policy.content = content.trim();
    if (effectiveDate) policy.effectiveDate = new Date(effectiveDate);
    if (status) policy.status = status;
    policy.updatedBy = req.user.name || "Admin";
    policy.updatedAt = new Date();

    await saveCompanyData(company);
    res.json({ message: "Policy updated successfully", policy, policies: company.policies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE policy (Admin only)
exports.deletePolicy = async (req, res) => {
  try {
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const isOwnerOrAdmin = req.user.role?.name === "Company Owner" || isSuperAdmin;
    if (!isOwnerOrAdmin) return res.status(403).json({ error: "Only Admin can delete company policies" });

    const { policyId } = req.params;
    let companyId = req.user.companyId?._id || req.user.companyId;
    const company = await getCompanyData(companyId);

    if (!Array.isArray(company.policies)) company.policies = [];
    company.policies = company.policies.filter(p => (p._id || p.id) != policyId);
    await saveCompanyData(company);

    res.json({ message: "Policy deleted successfully", policies: company.policies });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
