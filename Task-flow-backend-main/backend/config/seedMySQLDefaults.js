const { pool } = require("./mysqlDb");

async function seedMySQLDefaults() {
  const permissions = [
    { id: "perm_staff", name: "Staff Management", value: "staff_management" },
    { id: "perm_task", name: "Task Management", value: "task_management" },
    { id: "perm_role", name: "Role Management", value: "role_management" },
    { id: "perm_perm", name: "Permission Management", value: "permission_management" },
    { id: "perm_status", name: "Task Status Management", value: "task_status_management" },
    { id: "perm_project", name: "Project Management", value: "project_management" },
    { id: "perm_dash", name: "View Dashboard", value: "view_dashboard" },
    { id: "perm_comp", name: "Company Management", value: "company_management" },
    { id: "perm_doc", name: "Document Management", value: "document" },
    { id: "perm_att", name: "Attendance Management", value: "attendance_management" },
    { id: "perm_leave", name: "Leave Management", value: "leave_management" },
    { id: "perm_rating", name: "Performance and Rating", value: "rating_management" },
    { id: "perm_break", name: "Break Management", value: "break_management" },
    { id: "perm_chat", name: "Team Chat", value: "chat_management" },
    { id: "perm_timesheet", name: "Timesheet Management", value: "timesheet_management" },
    { id: "perm_qa", name: "QA & Testing", value: "qa_management" },
    { id: "perm_client", name: "Client Management", value: "client_management" },
    { id: "perm_time_instances", name: "Time & Instances Management", value: "time_instances_management" },
    { id: "perm_ticket", name: "Ticket Management", value: "ticket_management" },
    { id: "perm_team", name: "Team Management", value: "team_management" },
    { id: "perm_expense", name: "Expense Management", value: "expense_management" },
    { id: "perm_notices", name: "Notice Board", value: "notice_board" },
    { id: "perm_directory", name: "Employee Directory", value: "employee_directory" },
    { id: "perm_holidays", name: "Holidays & Calendar", value: "holiday_calendar" },
    { id: "perm_wfh", name: "WFH & On-Duty", value: "wfh_management" },
    { id: "perm_asset", name: "IT Asset Management", value: "asset_management" },
    { id: "perm_payroll", name: "Payroll & Payslips", value: "payroll_management" },
    { id: "perm_resource", name: "Resource Utilization", value: "resource_management" },
    { id: "perm_client_reports", name: "Client Invoicing & Reports", value: "client_reports" },
    { id: "perm_audit_logs", name: "Universal Audit Logs", value: "audit_logs" }
  ];

  for (const p of permissions) {
    await pool.query(
      "INSERT INTO permissions (id, name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
      [p.id, p.name, p.value]
    );
  }

  const superAdminPerms = permissions.map(p => ({
    name: p.name,
    value: p.value,
    all: true,
    create: true,
    read: true,
    update: true,
    delete: true
  }));

  const devPerms = [
    { name: "Task Management", value: "task_management", all: false, create: false, read: true, update: true, delete: false },
    { name: "Project Management", value: "project_management", all: false, create: false, read: true, update: false, delete: false },
    { name: "View Dashboard", value: "view_dashboard", all: true, create: true, read: true, update: true, delete: true },
    { name: "Document Management", value: "document", all: false, create: false, read: true, update: false, delete: false },
    { name: "Attendance Management", value: "attendance_management", all: false, create: true, read: true, update: false, delete: false },
    { name: "Leave Management", value: "leave_management", all: false, create: true, read: true, update: false, delete: false },
    { name: "Break Management", value: "break_management", all: false, create: true, read: true, update: false, delete: false },
    { name: "Team Chat", value: "chat_management", all: true, create: true, read: true, update: true, delete: true },
    { name: "Expense Management", value: "expense_management", all: false, create: true, read: true, update: true, delete: true }
  ];

  // Seed roles ONLY IF THEY DO NOT EXIST yet (do NOT overwrite admin's modified permissions on server restart)
  const [existingRoles] = await pool.query("SELECT id FROM roles");
  const existingRoleIds = new Set(existingRoles.map(r => r.id));

  if (!existingRoleIds.has("role_superadmin")) {
    await pool.query(
      "INSERT INTO roles (id, name, status, permissions) VALUES (?, ?, ?, ?)",
      ["role_superadmin", "Super Admin", "Active", JSON.stringify(superAdminPerms)]
    );
  }

  if (!existingRoleIds.has("role_developer")) {
    await pool.query(
      "INSERT INTO roles (id, name, status, permissions) VALUES (?, ?, ?, ?)",
      ["role_developer", "Developer", "Active", JSON.stringify(devPerms)]
    );
  }

  if (!existingRoleIds.has("role_owner")) {
    await pool.query(
      "INSERT INTO roles (id, name, status, permissions) VALUES (?, ?, ?, ?)",
      ["role_owner", "Company Owner", "Active", JSON.stringify(superAdminPerms)]
    );
  }

  if (!existingRoleIds.has("role_staff")) {
    await pool.query(
      "INSERT INTO roles (id, name, status, permissions) VALUES (?, ?, ?, ?)",
      ["role_staff", "Staff", "Active", JSON.stringify(devPerms)]
    );
  }

  const statuses = ["Active", "In Progress", "Complete", "Pending", "Incomplete"];
  for (let i = 0; i < statuses.length; i++) {
    await pool.query(
      "INSERT INTO task_statuses (id, name, status) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name)",
      [`status_${i + 1}`, statuses[i], "Active"]
    );
  }

  const defaultCompany = {
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

  await pool.query(
    "INSERT INTO collections (collection_name, _id, data) VALUES ('companies', ?, ?) ON DUPLICATE KEY UPDATE data=VALUES(data)",
    [defaultCompany._id, JSON.stringify(defaultCompany)]
  );

  // Seed default Expense Categories
  const defaultCategories = [
    { id: "cat_travel", name: "Travel & Conveyance", desc: "Flights, trains, taxis, local transit", limit: 25000 },
    { id: "cat_food", name: "Food & Meals", desc: "Team lunch, client dinner, working meals", limit: 5000 },
    { id: "cat_fuel", name: "Fuel & Mileage", desc: "Petrol, diesel, vehicle mileage reimbursements", limit: 8000 },
    { id: "cat_accom", name: "Accommodation", desc: "Hotel stays, guest house bookings", limit: 30000 },
    { id: "cat_meeting", name: "Client Meeting", desc: "Meeting expenses, refreshments, venue rentals", limit: 10000 },
    { id: "cat_telecom", name: "Internet & Phone", desc: "Monthly broadband, mobile recharge for work", limit: 2500 },
    { id: "cat_software", name: "Software & Tools", desc: "Licenses, subscriptions, cloud credits", limit: 20000 },
    { id: "cat_supplies", name: "Office Supplies", desc: "Stationery, cables, peripherals, ergonomics", limit: 5000 },
    { id: "cat_other", name: "Other Expenses", desc: "Miscellaneous business operational costs", limit: 10000 }
  ];

  for (const cat of defaultCategories) {
    await pool.query(
      `INSERT INTO expense_categories (id, company_id, name, description, max_limit, is_active)
       VALUES (?, 'default_company', ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description), max_limit=VALUES(max_limit)`,
      [cat.id, cat.name, cat.desc, cat.limit]
    );
  }

  // Seed default Expense Policy
  await pool.query(
    `INSERT INTO expense_policies (id, company_id, max_amount_per_expense, max_amount_per_month, receipt_mandatory_above, allow_future_dates, duplicate_detection)
     VALUES ('pol_default', 'default_company', 50000.00, 200000.00, 500.00, 0, 1)
     ON DUPLICATE KEY UPDATE max_amount_per_expense=VALUES(max_amount_per_expense), max_amount_per_month=VALUES(max_amount_per_month), receipt_mandatory_above=VALUES(receipt_mandatory_above)`
  );

  const bcrypt = require("bcryptjs");
  const adminPasswordHash = await bcrypt.hash("pranav123", 10);
  await pool.query(
    `INSERT INTO staff (id, name, email, password, role, position, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE password=VALUES(password), status='Active', role=VALUES(role)`,
    ["superadmin-1", "Super Admin", "gadanipranav@gmail.com", adminPasswordHash, "role_superadmin", "Super Admin", "Active"]
  );

  console.log("✅ Seeded permissions, roles, task_statuses, company, categories, policy and Super Admin into MySQL taskflow_db");
}

module.exports = seedMySQLDefaults;
