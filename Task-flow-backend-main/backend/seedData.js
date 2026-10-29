const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool, initDB } = require("./config/mysqlDb");

async function seedDummyData() {
  try {
    await initDB();

    const [staffCount] = await pool.query("SELECT COUNT(*) as count FROM staff");
    if (staffCount[0]?.count > 2) {
      console.log("ℹ️ Live staff database active (" + staffCount[0].count + " users). Skipping dummy developer seed.");
      return;
    }

    console.log("🌱 Starting Pure MySQL Seeding: 2 Projects, 5 Developers, Tasks & QA...");

    // 1. Ensure Developer Role Exists
    const devPerms = [
      { name: "Task Management", value: "task_management", all: false, create: false, read: true, update: true, delete: false },
      { name: "Project Management", value: "project_management", all: false, create: false, read: true, update: false, delete: false },
      { name: "View Dashboard", value: "view_dashboard", all: true, create: true, read: true, update: true, delete: true },
      { name: "Document Management", value: "document", all: false, create: false, read: true, update: false, delete: false },
      { name: "Attendance Management", value: "attendance_management", all: false, create: true, read: true, update: false, delete: false },
      { name: "Leave Management", value: "leave_management", all: false, create: true, read: true, update: false, delete: false },
      { name: "Break Management", value: "break_management", all: false, create: true, read: true, update: false, delete: false },
      { name: "Team Chat", value: "chat_management", all: true, create: true, read: true, update: true, delete: true }
    ];

    await pool.query(
      `INSERT INTO roles (id, name, status, permissions) 
       VALUES ('role_developer', 'Developer', 'Active', ?)
       ON DUPLICATE KEY UPDATE permissions=VALUES(permissions)`,
      [JSON.stringify(devPerms)]
    );

    // 2. 5 Dummy Developers
    const passwordHash = await bcrypt.hash("Test@123", 10);
    const developersData = [
      { id: "dev_1", name: "Rahul Sharma", email: "rahul@yopmail.com", position: "Senior Backend Developer", phone: "9876543210", department: "Backend Engineering", dob: "1995-10-23", joining_date: "2024-10-23", reporting_manager_name: "Super Admin" },
      { id: "dev_2", name: "Priya Patel", email: "priya@itcompany.com", position: "Frontend React Developer", phone: "9876543211", department: "Frontend Engineering", dob: "1997-10-25", joining_date: "2025-06-15", reporting_manager_name: "Rahul Sharma" },
      { id: "dev_3", name: "Amit Verma", email: "amit@itcompany.com", position: "Full Stack Developer", phone: "9876543212", department: "Product Engineering", dob: "1994-11-02", joining_date: "2023-10-23", reporting_manager_name: "Super Admin" },
      { id: "dev_4", name: "Sneha Mehta", email: "sneha@itcompany.com", position: "UI/UX & Frontend Developer", phone: "9876543213", department: "Product Design", dob: "1998-10-28", joining_date: "2025-01-10", reporting_manager_name: "Priya Patel" },
      { id: "dev_5", name: "Vikram Singh", email: "vikram@itcompany.com", position: "Cloud & Backend Developer", phone: "9876543214", department: "DevOps & Cloud", dob: "1996-12-14", joining_date: "2024-03-01", reporting_manager_name: "Rahul Sharma" }
    ];

    for (const u of developersData) {
      const [existing] = await pool.query("SELECT id FROM staff WHERE id = ? LIMIT 1", [u.id]);
      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO staff (id, name, email, password, role, position, status, phone, company_id, department, dob, joining_date, reporting_manager_name)
           VALUES (?, ?, ?, ?, 'role_developer', ?, 'Active', ?, 'default_company', ?, ?, ?, ?)`,
          [u.id, u.name, u.email, passwordHash, u.position, u.phone, u.department, u.dob, u.joining_date, u.reporting_manager_name]
        );

        await pool.query(
          `INSERT INTO leave_balances (id, user_id, user_name, cl_balance, sl_balance, pl_balance, comp_off)
           VALUES (?, ?, ?, 12, 8, 15, 2)
           ON DUPLICATE KEY UPDATE user_name=VALUES(user_name)`,
          [`bal_${u.id}`, u.id, u.name]
        );
      }
    }
    console.log("✅ 5 Developers created with Leave balances");

    // 3. Exactly 2 IT Projects
    const assignedStaffList = JSON.stringify(
      developersData.map(u => ({ id: u.id, _id: u.id, name: u.name, email: u.email }))
    );

    const projectsData = [
      {
        id: "proj_fintech",
        name: "FinTech Mobile Banking App",
        description: "iOS and Android mobile application for digital payments, micro-loans and UPI instant transfer.",
        status: "Active"
      },
      {
        id: "proj_ecommerce",
        name: "E-Commerce Multi-Vendor Hub",
        description: "Scalable B2B wholesale portal with Stripe payment, warehouse inventory and order tracking.",
        status: "Active"
      }
    ];

    const [existingProjects] = await pool.query("SELECT COUNT(*) as count FROM projects");
    if (existingProjects[0]?.count === 0) {
      for (const p of projectsData) {
        await pool.query(
          `INSERT INTO projects (id, name, description, status, assigned_to)
           VALUES (?, ?, ?, ?, ?)`,
          [p.id, p.name, p.description, p.status, assignedStaffList]
        );
      }
      console.log("✅ Exactly 2 IT Projects created with all 5 Developers assigned in MySQL");
    }

    // 4. Tasks for the 2 Projects
    const now = new Date();
    const dMinus5 = new Date(now.getTime() - 5 * 86400000).toISOString().slice(0, 10);
    const dMinus3 = new Date(now.getTime() - 3 * 86400000).toISOString().slice(0, 10);
    const dMinus2 = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const dMinus1 = new Date(now.getTime() - 1 * 86400000).toISOString().slice(0, 10);
    const dPlus2 = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
    const dPlus4 = new Date(now.getTime() + 4 * 86400000).toISOString().slice(0, 10);
    const dPlus6 = new Date(now.getTime() + 6 * 86400000).toISOString().slice(0, 10);

    const tasksData = [
      // Project 1 Tasks (FinTech)
      {
        id: "task_fintech_oauth",
        title: "Implement OAuth2 Social Google/Apple Sign-in",
        description: "Secure multi-provider authentication for mobile & web apps.",
        priority: "High",
        project: "proj_fintech",
        assignedTo: "dev_1", // Rahul
        status: "In Progress",
        startDate: dMinus3,
        endDate: dPlus4,
        type: "task",
        estimatedHours: 8.0,
        subtasks: [
          { id: "sub_oauth_1", title: "Setup Google OAuth credentials & Consent screen", status: "Complete", startDate: dMinus3, endDate: dMinus2, hours: 4.5 },
          { id: "sub_oauth_2", title: "Implement Apple ID private key sign-in endpoint", status: "In Process", startDate: dMinus1, endDate: dPlus2, hours: 3.5 },
          { id: "sub_oauth_3", title: "Frontend JWT refresh token persistence & auto-login", status: "Pending", startDate: dPlus2, endDate: dPlus4, hours: 0 }
        ]
      },
      {
        id: "task_fintech_biometric",
        title: "Biometric FaceID & Secure Keychain Vault",
        description: "Integrate hardware-backed keystore for seamless 2FA authorization.",
        priority: "Critical",
        project: "proj_fintech",
        assignedTo: "dev_3", // Amit
        status: "In Progress",
        startDate: dMinus2,
        endDate: dPlus4,
        type: "task",
        estimatedHours: 7.5,
        subtasks: [
          { id: "sub_bio_1", title: "Android BiometricPrompt API hardware crypto check", status: "Complete", startDate: dMinus2, endDate: dMinus1, hours: 4.0 },
          { id: "sub_bio_2", title: "iOS LocalAuthentication biometric fallback dialog", status: "In Process", startDate: dMinus1, endDate: dPlus2, hours: 3.5 },
          { id: "sub_bio_3", title: "Secure enclaved private key rotation mechanism", status: "Pending", startDate: dPlus2, endDate: dPlus4, hours: 0 }
        ]
      },
      // Project 2 Tasks (E-Commerce)
      {
        id: "task_ecom_wireframes",
        title: "Design Responsive Checkout & Cart Wireframes",
        description: "High-conversion checkout experience with multiple payment options.",
        priority: "Medium",
        project: "proj_ecommerce",
        assignedTo: "dev_4", // Sneha
        status: "Complete",
        startDate: dMinus5,
        endDate: dPlus2,
        type: "task",
        estimatedHours: 10.0,
        subtasks: [
          { id: "sub_cart_1", title: "Figma UI prototype for Desktop checkout flow", status: "Complete", startDate: dMinus5, endDate: dMinus3, hours: 6.0 },
          { id: "sub_cart_2", title: "Mobile drawer cart layout & swipe-to-delete", status: "Complete", startDate: dMinus2, endDate: dMinus1, hours: 4.0 },
          { id: "sub_cart_3", title: "Stripe element form layout & error validation states", status: "Pending", startDate: dMinus1, endDate: dPlus2, hours: 0 }
        ]
      },
      {
        id: "task_ecom_webhooks",
        title: "Build Product Inventory & Order Status Webhooks",
        description: "Real-time inventory deduction and order state webhooks.",
        priority: "High",
        project: "proj_ecommerce",
        assignedTo: "dev_2", // Priya
        status: "In Progress",
        startDate: dMinus2,
        endDate: dPlus4,
        type: "task",
        estimatedHours: 8.0,
        subtasks: [
          { id: "sub_inv_1", title: "Stripe webhook payment_intent.succeeded listener", status: "Complete", startDate: dMinus2, endDate: dMinus1, hours: 5.0 },
          { id: "sub_inv_2", title: "Low stock notification email & push alert dispatch", status: "In Process", startDate: dMinus1, endDate: dPlus2, hours: 3.0 },
          { id: "sub_inv_3", title: "Order shipment tracking URL sync with carrier API", status: "Pending", startDate: dPlus2, endDate: dPlus4, hours: 0 }
        ]
      },
      {
        id: "task_ecom_k8s",
        title: "Kubernetes Cluster Deployment & Redis Cache Layer",
        description: "Microservices orchestration and caching architecture.",
        priority: "Critical",
        project: "proj_ecommerce",
        assignedTo: "dev_5", // Vikram
        status: "Pending",
        startDate: dMinus1,
        endDate: dPlus6,
        type: "task",
        estimatedHours: 8.0,
        subtasks: [
          { id: "sub_k8s_1", title: "Helm chart configuration for E-Commerce API pods", status: "In Process", startDate: dMinus1, endDate: dPlus2, hours: 4.5 },
          { id: "sub_k8s_2", title: "Redis cluster setup for session & cart store", status: "Complete", startDate: dMinus3, endDate: dMinus1, hours: 3.5 }
        ]
      }
    ];

    const [existingTasks] = await pool.query("SELECT COUNT(*) as count FROM tasks");
    if (existingTasks[0]?.count === 0) {
      for (const t of tasksData) {
        await pool.query(
          `INSERT INTO tasks (
            id, title, description, status, priority, project, assigned_to,
            due_date, start_date, end_date, type, estimated_hours
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.id, t.title, t.description, t.status, t.priority, t.project, t.assignedTo,
            t.endDate, t.startDate, t.endDate, t.type, t.estimatedHours
          ]
        );

        if (Array.isArray(t.subtasks)) {
          for (const s of t.subtasks) {
            await pool.query(
              `INSERT INTO subtasks (id, task_id, title, description, status, assigned_to, start_date, end_date, hours)
               VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)`,
              [s.id, t.id, s.title, s.status, t.assignedTo, s.startDate, s.endDate, s.hours]
            );
          }
        }
      }
      console.log("✅ 5 Tasks & Subtasks seeded into MySQL");
    }

    // 5. QA Test Cases
    const testCases = [
      {
        id: "TC-101",
        title: "Verify Google OAuth Callback Redirects to Dashboard",
        project_id: "proj_fintech",
        project_name: "FinTech Mobile Banking App",
        module: "Authentication",
        steps: "1. Click Google Sign-in\n2. Authorize account\n3. Verify redirect to /dashboard",
        expected_result: "User is authenticated and redirected with valid JWT",
        status: "Pass",
        priority: "High",
        tested_by: "Rahul Sharma"
      },
      {
        id: "TC-102",
        title: "Verify Checkout Cart Total Matches Discount Voucher",
        project_id: "proj_ecommerce",
        project_name: "E-Commerce Multi-Vendor Hub",
        module: "Checkout",
        steps: "1. Add item to cart\n2. Apply coupon SAVE20\n3. Check total",
        expected_result: "Cart total reduced by exactly 20%",
        status: "Pass",
        priority: "Critical",
        tested_by: "Priya Patel"
      }
    ];

    const [existingTestCases] = await pool.query("SELECT COUNT(*) as count FROM test_cases");
    if (existingTestCases[0]?.count === 0) {
      for (const tc of testCases) {
        await pool.query(
          `INSERT INTO test_cases (id, title, project_id, project_name, module_name, steps, expected_result, status, severity, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tc.id, tc.title, tc.project_id, tc.project_name, tc.module, tc.steps, tc.expected_result, tc.status, tc.priority, tc.tested_by]
        );
      }
      console.log("✅ QA Test Cases created in MySQL");
    }

    // 6. QA Bugs
    const sampleBugs = [
      {
        id: "BUG-201",
        title: "Safari iOS Cart Drawer Overflow scroll glitch",
        project_id: "proj_ecommerce",
        project_name: "E-Commerce Multi-Vendor Hub",
        severity: "Major",
        assigned_to: "Sneha Mehta",
        status: "In Progress",
        description: "On iOS WebKit, swiping inside the cart drawer triggers page reload."
      }
    ];

    const [existingBugs] = await pool.query("SELECT COUNT(*) as count FROM qa_bugs");
    if (existingBugs[0]?.count === 0) {
      for (const b of sampleBugs) {
        await pool.query(
          `INSERT INTO qa_bugs (id, title, project_id, project_name, severity, assigned_to, status, description, environment)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Staging')`,
          [b.id, b.title, b.project_id, b.project_name, b.severity, b.assigned_to, b.status, b.description]
        );
      }
      console.log("✅ QA Bugs created in MySQL");
    }

    // 7. Seed Dynamic Sample Expense Claims
    const sampleExpenses = [
      {
        id: "exp_seed_1",
        company_id: "default_company",
        employee_id: "dev_1",
        employee_name: "Rahul Sharma",
        employee_email: "rahul@itcompany.com",
        title: "Client Strategy Meeting at Mumbai",
        category_id: "cat_meeting",
        category_name: "Client Meeting",
        project_id: "proj_crm",
        project_name: "Enterprise Cloud CRM Suite",
        items: JSON.stringify([
          { id: "it_1", description: "Flight Mumbai return transit", amount: 2800 },
          { id: "it_2", description: "Lunch meeting with stakeholders", amount: 1450 }
        ]),
        total_amount: 4250.00,
        approved_amount: null,
        expense_date: "2026-10-22",
        payment_mode: "Credit Card",
        description: "Strategy alignment meeting with enterprise client for CRM deployment.",
        receipts: JSON.stringify([{ name: "mumbai_meeting_bill.pdf", url: "/uploads/dummy.pdf", size: 245000 }]),
        status: "Pending",
        submitted_at: "2026-10-22 14:30:00",
        history: JSON.stringify([
          { action: "Submitted", byId: "dev_1", byName: "Rahul Sharma", at: "2026-10-22T14:30:00.000Z", remarks: "Claim submitted for manager approval" }
        ])
      },
      {
        id: "exp_seed_2",
        company_id: "default_company",
        employee_id: "dev_5",
        employee_name: "Vikram Singh",
        employee_email: "vikram@itcompany.com",
        title: "AWS Solutions Architect Exam Fee",
        category_id: "cat_software",
        category_name: "Software & Tools",
        project_id: null,
        project_name: null,
        items: JSON.stringify([
          { id: "it_1", description: "AWS Certification Exam Registration", amount: 12500 }
        ]),
        total_amount: 12500.00,
        approved_amount: null,
        expense_date: "2026-10-21",
        payment_mode: "UPI",
        description: "Official cloud architecture certification as approved by tech lead.",
        receipts: JSON.stringify([{ name: "aws_exam_receipt.png", url: "/uploads/dummy.png", size: 180000 }]),
        status: "Pending",
        submitted_at: "2026-10-21 11:15:00",
        history: JSON.stringify([
          { action: "Submitted", byId: "dev_5", byName: "Vikram Singh", at: "2026-10-21T11:15:00.000Z", remarks: "Claim submitted" }
        ])
      },
      {
        id: "exp_seed_3",
        company_id: "default_company",
        employee_id: "dev_4",
        employee_name: "Sneha Mehta",
        employee_email: "sneha@itcompany.com",
        title: "Ergonomic Mechanical Keyboard & Mouse",
        category_id: "cat_supplies",
        category_name: "Office Supplies",
        project_id: null,
        project_name: null,
        items: JSON.stringify([
          { id: "it_1", description: "Wireless mechanical keyboard", amount: 2200 },
          { id: "it_2", description: "Ergonomic vertical mouse", amount: 1200 }
        ]),
        total_amount: 3400.00,
        approved_amount: null,
        expense_date: "2026-10-20",
        payment_mode: "Debit Card",
        description: "Workstation peripherals replacement for design development.",
        receipts: JSON.stringify([{ name: "amazon_invoice_peripherals.pdf", url: "/uploads/dummy.pdf", size: 310000 }]),
        status: "Pending",
        submitted_at: "2026-10-20 16:45:00",
        history: JSON.stringify([
          { action: "Submitted", byId: "dev_4", byName: "Sneha Mehta", at: "2026-10-20T16:45:00.000Z", remarks: "Submitted" }
        ])
      },
      {
        id: "exp_seed_4",
        company_id: "default_company",
        employee_id: "dev_3",
        employee_name: "Amit Verma",
        employee_email: "amit@itcompany.com",
        title: "Client Working Lunch with FinTech Team",
        category_id: "cat_food",
        category_name: "Food & Meals",
        project_id: "proj_crm",
        project_name: "Enterprise Cloud CRM Suite",
        items: JSON.stringify([
          { id: "it_1", description: "Working lunch for 4 stakeholders", amount: 2850 }
        ]),
        total_amount: 2850.00,
        approved_amount: 2850.00,
        expense_date: "2026-10-18",
        payment_mode: "Credit Card",
        description: "Sprint review and roadmap discussion lunch.",
        receipts: JSON.stringify([{ name: "restaurant_tax_invoice.jpg", url: "/uploads/dummy.jpg", size: 420000 }]),
        status: "Approved",
        approver_id: "superadmin-1",
        approver_name: "Super Admin",
        approver_comment: "Receipt verified with tax breakdown. Approved.",
        submitted_at: "2026-10-18 15:00:00",
        approved_at: "2026-10-19 10:30:00",
        history: JSON.stringify([
          { action: "Submitted", byId: "dev_3", byName: "Amit Verma", at: "2026-10-18T15:00:00.000Z", remarks: "Claim submitted" },
          { action: "Approved", byId: "superadmin-1", byName: "Super Admin", at: "2026-10-19T10:30:00.000Z", remarks: "Receipt verified with tax breakdown. Approved." }
        ])
      },
      {
        id: "exp_seed_5",
        company_id: "default_company",
        employee_id: "dev_2",
        employee_name: "Priya Patel",
        employee_email: "priya@itcompany.com",
        title: "Local Travel - Uber to Client Onsite Demo",
        category_id: "cat_travel",
        category_name: "Travel & Conveyance",
        project_id: "proj_ecommerce",
        project_name: "E-Commerce Multi-Vendor Hub",
        items: JSON.stringify([
          { id: "it_1", description: "Uber to client HQ", amount: 820 },
          { id: "it_2", description: "Uber return to office", amount: 830 }
        ]),
        total_amount: 1650.00,
        approved_amount: 1650.00,
        expense_date: "2026-10-17",
        payment_mode: "UPI",
        description: "Client product demonstration travel.",
        receipts: JSON.stringify([{ name: "uber_trip_receipts.pdf", url: "/uploads/dummy.pdf", size: 150000 }]),
        status: "Approved",
        approver_id: "superadmin-1",
        approver_name: "Super Admin",
        approver_comment: "Approved full amount.",
        submitted_at: "2026-10-17 18:00:00",
        approved_at: "2026-10-18 09:20:00",
        history: JSON.stringify([
          { action: "Submitted", byId: "dev_2", byName: "Priya Patel", at: "2026-10-17T18:00:00.000Z" },
          { action: "Approved", byId: "superadmin-1", byName: "Super Admin", at: "2026-10-18T09:20:00.000Z", remarks: "Approved full amount." }
        ])
      },
      {
        id: "exp_seed_6",
        company_id: "default_company",
        employee_id: "dev_1",
        employee_name: "Rahul Sharma",
        employee_email: "rahul@itcompany.com",
        title: "Monthly High-Speed Fiber Internet",
        category_id: "cat_telecom",
        category_name: "Internet & Phone",
        project_id: null,
        project_name: null,
        items: JSON.stringify([
          { id: "it_1", description: "300 Mbps Fiber broadband bill", amount: 1999 }
        ]),
        total_amount: 1999.00,
        approved_amount: 1999.00,
        expense_date: "2026-10-12",
        payment_mode: "UPI",
        description: "Monthly WFH connectivity allowance as per HR policy.",
        receipts: JSON.stringify([{ name: "airtel_fiber_invoice.pdf", url: "/uploads/dummy.pdf", size: 210000 }]),
        status: "Paid",
        approver_id: "superadmin-1",
        approver_name: "Super Admin",
        approver_comment: "Verified against policy.",
        submitted_at: "2026-10-12 10:00:00",
        approved_at: "2026-10-13 11:00:00",
        paid_at: "2026-10-15 14:20:00",
        payment_info: JSON.stringify({
          date: "2026-10-15",
          mode: "UPI",
          reference: "UPI/20261015/0981",
          note: "Reimbursed to employee UPI handle",
          paidByName: "Super Admin",
          paidById: "superadmin-1",
          paidAt: "2026-10-15T14:20:00.000Z"
        }),
        history: JSON.stringify([
          { action: "Submitted", byId: "dev_1", byName: "Rahul Sharma", at: "2026-10-12T10:00:00.000Z" },
          { action: "Approved", byId: "superadmin-1", byName: "Super Admin", at: "2026-10-13T11:00:00.000Z" },
          { action: "Paid", byId: "superadmin-1", byName: "Super Admin", at: "2026-10-15T14:20:00.000Z", remarks: "Paid via UPI (Ref: UPI/20261015/0981)" }
        ])
      },
      {
        id: "exp_seed_7",
        company_id: "default_company",
        employee_id: "dev_3",
        employee_name: "Amit Verma",
        employee_email: "amit@itcompany.com",
        title: "Annual JetBrains All Products Pack License",
        category_id: "cat_software",
        category_name: "Software & Tools",
        project_id: "proj_crm",
        project_name: "Enterprise Cloud CRM Suite",
        items: JSON.stringify([
          { id: "it_1", description: "JetBrains IDE commercial subscription", amount: 18500 }
        ]),
        total_amount: 18500.00,
        approved_amount: 18500.00,
        expense_date: "2026-10-08",
        payment_mode: "Credit Card",
        description: "IDE licenses renewal for backend microservices engineering.",
        receipts: JSON.stringify([{ name: "jetbrains_tax_invoice.pdf", url: "/uploads/dummy.pdf", size: 540000 }]),
        status: "Paid",
        approver_id: "superadmin-1",
        approver_name: "Super Admin",
        approver_comment: "Approved corporate developer tool expense.",
        submitted_at: "2026-10-08 09:30:00",
        approved_at: "2026-10-09 14:10:00",
        paid_at: "2026-10-10 16:45:00",
        payment_info: JSON.stringify({
          date: "2026-10-10",
          mode: "Bank Transfer",
          reference: "NEFT202610101928",
          note: "Reimbursed via HDFC bank transfer",
          paidByName: "Super Admin",
          paidById: "superadmin-1",
          paidAt: "2026-10-10T16:45:00.000Z"
        }),
        history: JSON.stringify([
          { action: "Submitted", byId: "dev_3", byName: "Amit Verma", at: "2026-10-08T09:30:00.000Z" },
          { action: "Approved", byId: "superadmin-1", byName: "Super Admin", at: "2026-10-09T14:10:00.000Z" },
          { action: "Paid", byId: "superadmin-1", byName: "Super Admin", at: "2026-10-10T16:45:00.000Z", remarks: "Paid via Bank Transfer (Ref: NEFT202610101928)" }
        ])
      },
      {
        id: "exp_seed_8",
        company_id: "default_company",
        employee_id: "dev_5",
        employee_name: "Vikram Singh",
        employee_email: "vikram@itcompany.com",
        title: "Flight & Accommodation - Bangalore Tech Summit",
        category_id: "cat_travel",
        category_name: "Travel & Conveyance",
        project_id: "proj_ecommerce",
        project_name: "E-Commerce Multi-Vendor Hub",
        items: JSON.stringify([
          { id: "it_1", description: "Return flight tickets", amount: 6200 },
          { id: "it_2", description: "2 Nights Hotel Stay", amount: 2700 }
        ]),
        total_amount: 8900.00,
        approved_amount: 8900.00,
        expense_date: "2026-10-04",
        payment_mode: "Credit Card",
        description: "Travel expenses for conference speaker session.",
        receipts: JSON.stringify([{ name: "indigo_flight_hotel.pdf", url: "/uploads/dummy.pdf", size: 680000 }]),
        status: "Paid",
        approver_id: "superadmin-1",
        approver_name: "Super Admin",
        approver_comment: "Approved.",
        submitted_at: "2026-10-04 12:00:00",
        approved_at: "2026-10-04 18:00:00",
        paid_at: "2026-10-05 11:30:00",
        payment_info: JSON.stringify({
          date: "2026-10-05",
          mode: "Bank Transfer",
          reference: "RTGS202610058821",
          note: "Reimbursed via RTGS",
          paidByName: "Super Admin",
          paidById: "superadmin-1",
          paidAt: "2026-10-05T11:30:00.000Z"
        }),
        history: JSON.stringify([
          { action: "Submitted", byId: "dev_5", byName: "Vikram Singh", at: "2026-10-04T12:00:00.000Z" },
          { action: "Approved", byId: "superadmin-1", byName: "Super Admin", at: "2026-10-04T18:00:00.000Z" },
          { action: "Paid", byId: "superadmin-1", byName: "Super Admin", at: "2026-10-05T11:30:00.000Z", remarks: "Paid via Bank Transfer" }
        ])
      },
      {
        id: "exp_seed_9",
        company_id: "default_company",
        employee_id: "dev_2",
        employee_name: "Priya Patel",
        employee_email: "priya@itcompany.com",
        title: "Monthly Vehicle Fuel Reimbursement",
        category_id: "cat_fuel",
        category_name: "Fuel & Mileage",
        project_id: null,
        project_name: null,
        items: JSON.stringify([
          { id: "it_1", description: "Petrol expense for client visits", amount: 2100 }
        ]),
        total_amount: 2100.00,
        approved_amount: null,
        expense_date: "2026-10-23",
        payment_mode: "Cash",
        description: "Drafting fuel claim for this fortnight.",
        receipts: JSON.stringify([]),
        status: "Draft",
        history: JSON.stringify([
          { action: "Created as Draft", byId: "dev_2", byName: "Priya Patel", at: "2026-10-23T08:00:00.000Z", remarks: "Claim saved as draft" }
        ])
      },
      {
        id: "exp_seed_10",
        company_id: "default_company",
        employee_id: "superadmin-1",
        employee_name: "Super Admin",
        employee_email: "gadanipranav@gmail.com",
        title: "Team Sprint Retrospective Celebration & Refreshments",
        category_id: "cat_food",
        category_name: "Food & Meals",
        project_id: "proj_crm",
        project_name: "Enterprise Cloud CRM Suite",
        items: JSON.stringify([
          { id: "it_1", description: "Team pizzas & beverages", amount: 1450 }
        ]),
        total_amount: 1450.00,
        approved_amount: null,
        expense_date: "2026-10-23",
        payment_mode: "UPI",
        description: "Celebration snacks for successful milestone delivery.",
        receipts: JSON.stringify([{ name: "dominos_bill.pdf", url: "/uploads/dummy.pdf", size: 120000 }]),
        status: "Pending",
        submitted_at: "2026-10-23 10:15:00",
        history: JSON.stringify([
          { action: "Submitted", byId: "superadmin-1", byName: "Super Admin", at: "2026-10-23T10:15:00.000Z", remarks: "Claim submitted" }
        ])
      }
    ];

    const [existingExpenses] = await pool.query("SELECT COUNT(*) as count FROM expenses");
    if (existingExpenses[0]?.count === 0) {
      for (const exp of sampleExpenses) {
        await pool.query(
          `INSERT INTO expenses (
            id, company_id, employee_id, employee_name, employee_email,
            title, category_id, category_name, project_id, project_name,
            items, total_amount, approved_amount, expense_date, payment_mode,
            description, receipts, status, approver_id, approver_name, approver_comment,
            submitted_at, approved_at, paid_at, payment_info, history
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            exp.id, exp.company_id, exp.employee_id, exp.employee_name, exp.employee_email,
            exp.title, exp.category_id, exp.category_name, exp.project_id, exp.project_name,
            exp.items, exp.total_amount, exp.approved_amount, exp.expense_date, exp.payment_mode,
            exp.description, exp.receipts, exp.status, exp.approver_id || null, exp.approver_name || null, exp.approver_comment || null,
            exp.submitted_at || null, exp.approved_at || null, exp.paid_at || null, exp.payment_info || null, exp.history
          ]
        );
      }
      console.log("✅ Seeded 10 dynamic sample expense claims across all states (Pending, Approved, Paid, Draft)");
    }

    // ════════════════════════════════════════════════════════
    // SEED COMPANY HOLIDAYS (2026)
    // ════════════════════════════════════════════════════════
    const holidays2026 = [
      { id: "hol_1", name: "Republic Day", holiday_date: "2026-01-26", description: "National Holiday", is_optional: 0 },
      { id: "hol_2", name: "Holi Festival of Colors", holiday_date: "2026-03-04", description: "Public Holiday", is_optional: 0 },
      { id: "hol_3", name: "Independence Day", holiday_date: "2026-08-15", description: "National Holiday", is_optional: 0 },
      { id: "hol_4", name: "Raksha Bandhan", holiday_date: "2026-08-28", description: "Festival Holiday", is_optional: 1 },
      { id: "hol_5", name: "Gandhi Jayanti", holiday_date: "2026-10-02", description: "National Holiday", is_optional: 0 },
      { id: "hol_6", name: "Dussehra (Vijayadashami)", holiday_date: "2026-10-20", description: "Festival Holiday", is_optional: 0 },
      { id: "hol_7", name: "Diwali (Deepavali)", holiday_date: "2026-11-08", description: "Festival of Lights", is_optional: 0 },
      { id: "hol_8", name: "Christmas Day", holiday_date: "2026-12-25", description: "Christmas Holiday", is_optional: 0 }
    ];

    const [existingHolidays] = await pool.query("SELECT COUNT(*) as count FROM company_holidays");
    if (existingHolidays[0]?.count === 0) {
      for (const h of holidays2026) {
        await pool.query(
          `INSERT INTO company_holidays (id, company_id, name, holiday_date, description, is_optional)
           VALUES (?, 'default_company', ?, ?, ?, ?)`,
          [h.id, h.name, h.holiday_date, h.description, h.is_optional]
        );
      }
      console.log("✅ Seeded 2026 Company Holidays");
    }

    // ════════════════════════════════════════════════════════
    // SEED INITIAL COMPANY ANNOUNCEMENTS
    // ════════════════════════════════════════════════════════
    const initialAnnouncements = [
      {
        id: "ann_1",
        title: "Welcome to Padhya Software Technologies Employee Portal!",
        content: "Welcome team! Our upgraded internal portal is live. You can now track Attendance, apply for Leaves, record Timesheets, manage Tasks, submit Expenses, request Punch Regularizations, and view Company Holidays all in one place.",
        priority: "High",
        pinned: 1,
        requires_acknowledgment: 1,
        authorId: "superadmin-1",
        authorName: "Pranav Gadani (Super Admin)"
      },
      {
        id: "ann_2",
        title: "Upcoming Diwali Celebration & Holiday Notice",
        content: "The office will observe holiday on Diwali. We invite everyone for the traditional sweets distribution and festive celebration in the main conference hall on the eve of Diwali. Let's celebrate our achievements together!",
        priority: "Normal",
        pinned: 1,
        requires_acknowledgment: 0,
        authorId: "superadmin-1",
        authorName: "HR Department"
      }
    ];

    const [existingAnnouncements] = await pool.query("SELECT COUNT(*) as count FROM announcements");
    if (existingAnnouncements[0]?.count === 0) {
      for (const a of initialAnnouncements) {
        await pool.query(
          `INSERT INTO announcements (id, company_id, title, content, priority, pinned, requires_acknowledgment, created_by_id, created_by_name)
           VALUES (?, 'default_company', ?, ?, ?, ?, ?, ?, ?)`,
          [a.id, a.title, a.content, a.priority, a.pinned, a.requires_acknowledgment, a.authorId, a.authorName]
        );
      }
      console.log("✅ Seeded Company Announcements");
    }

    // ════════════════════════════════════════════════════════
    // SEED PHASE 2: COMPANY ASSETS & INVENTORY
    // ════════════════════════════════════════════════════════
    const initialAssets = [
      {
        id: "ast_1",
        asset_tag: "PST-LAP-001",
        name: "Apple MacBook Pro 16\" M2 Max",
        category: "Laptop",
        brand: "Apple",
        model: "MacBook Pro 16",
        serial_number: "C02G9988MD6T",
        purchase_date: "2025-03-15",
        purchase_cost: 249900.00,
        warranty_expiry: "2028-03-15",
        status: "Assigned",
        assigned_to_id: "dev_1",
        assigned_to_name: "Amit Sharma",
        specs: JSON.stringify({ ram: "32GB Unified", storage: "1TB SSD", cpu: "M2 Max 12-core", os: "macOS Sequoia" }),
        notes: "Primary development machine for Tech Lead."
      },
      {
        id: "ast_2",
        asset_tag: "PST-LAP-002",
        name: "Dell XPS 15 9530 (i9 13th Gen)",
        category: "Laptop",
        brand: "Dell",
        model: "XPS 15",
        serial_number: "DLXPS991203",
        purchase_date: "2025-05-10",
        purchase_cost: 185000.00,
        warranty_expiry: "2028-05-10",
        status: "Assigned",
        assigned_to_id: "dev_2",
        assigned_to_name: "Priya Patel",
        specs: JSON.stringify({ ram: "32GB DDR5", storage: "1TB NVMe SSD", gpu: "RTX 4060", os: "Ubuntu 24.04 LTS" }),
        notes: "Frontend & UI engineering workhorse."
      },
      {
        id: "ast_3",
        asset_tag: "PST-LAP-003",
        name: "Lenovo ThinkPad X1 Carbon Gen 11",
        category: "Laptop",
        brand: "Lenovo",
        model: "ThinkPad X1 Carbon",
        serial_number: "LNV-TP-44912",
        purchase_date: "2025-06-01",
        purchase_cost: 165000.00,
        warranty_expiry: "2028-06-01",
        status: "Available",
        assigned_to_id: null,
        assigned_to_name: null,
        specs: JSON.stringify({ ram: "16GB LPDDR5", storage: "512GB SSD", cpu: "Core i7-1365U", os: "Windows 11 Pro" }),
        notes: "Ready for new developer onboarding."
      },
      {
        id: "ast_4",
        asset_tag: "PST-MON-001",
        name: "LG UltraFine 27\" 4K UHD Monitor",
        category: "Monitor",
        brand: "LG",
        model: "27UP850-W",
        serial_number: "LG4K-882190",
        purchase_date: "2025-04-12",
        purchase_cost: 38000.00,
        warranty_expiry: "2027-04-12",
        status: "Assigned",
        assigned_to_id: "dev_1",
        assigned_to_name: "Amit Sharma",
        specs: JSON.stringify({ resolution: "3840x2160", port: "USB-C 96W PD, HDMI, DisplayPort" }),
        notes: "Assigned for dual monitor coding setup."
      },
      {
        id: "ast_5",
        asset_tag: "PST-LIC-001",
        name: "JetBrains All Products Pack License",
        category: "Software License",
        brand: "JetBrains",
        model: "Commercial Annual Subscription",
        serial_number: "JB-COMM-2026-X99",
        purchase_date: "2026-01-01",
        purchase_cost: 29900.00,
        warranty_expiry: "2027-01-01",
        status: "Assigned",
        assigned_to_id: "dev_1",
        assigned_to_name: "Amit Sharma",
        specs: JSON.stringify({ key: "PST-JB-SUBSCRIPTION-VALID", products: "IntelliJ IDEA, WebStorm, PyCharm, DataGrip" }),
        notes: "Full developer suite license."
      },
      {
        id: "ast_6",
        asset_tag: "PST-LIC-002",
        name: "Figma Organization Seat",
        category: "Software License",
        brand: "Figma",
        model: "Enterprise Annual Seat",
        serial_number: "FIG-ENT-2026-012",
        purchase_date: "2026-02-15",
        purchase_cost: 42000.00,
        warranty_expiry: "2027-02-15",
        status: "Assigned",
        assigned_to_id: "dev_2",
        assigned_to_name: "Priya Patel",
        specs: JSON.stringify({ plan: "Enterprise Seat", permissions: "Full Editor" }),
        notes: "UI/UX component library and design system seat."
      }
    ];

    const [existingAssets] = await pool.query("SELECT COUNT(*) as count FROM company_assets");
    if (existingAssets[0]?.count === 0) {
      for (const ast of initialAssets) {
        await pool.query(
          `INSERT INTO company_assets (
            id, company_id, asset_tag, name, category, brand, model, serial_number,
            purchase_date, purchase_cost, warranty_expiry, status, assigned_to_id, assigned_to_name, specs, notes
          ) VALUES (?, 'default_company', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ast.id, ast.asset_tag, ast.name, ast.category, ast.brand, ast.model, ast.serial_number,
            ast.purchase_date, ast.purchase_cost, ast.warranty_expiry, ast.status,
            ast.assigned_to_id, ast.assigned_to_name, ast.specs, ast.notes
          ]
        );
      }
      console.log("✅ Seeded Company Assets & Hardware Inventory");
    }

    // ════════════════════════════════════════════════════════
    // SEED SALARY STRUCTURES (FOR PAYROLL)
    // ════════════════════════════════════════════════════════
    const salaries = [
      {
        id: "sal_dev1",
        user_id: "dev_1",
        ctc_annual: 1440000.00, // 14.4 LPA
        basic_monthly: 60000.00,
        hra_monthly: 30000.00,
        special_allowance: 25000.00,
        conveyance: 5000.00,
        pf_deduction: 3600.00,
        pt_deduction: 200.00,
        tds_monthly: 4500.00,
        effective_from: "2026-01-01"
      },
      {
        id: "sal_dev2",
        user_id: "dev_2",
        ctc_annual: 960000.00, // 9.6 LPA
        basic_monthly: 40000.00,
        hra_monthly: 20000.00,
        special_allowance: 16000.00,
        conveyance: 4000.00,
        pf_deduction: 2400.00,
        pt_deduction: 200.00,
        tds_monthly: 2500.00,
        effective_from: "2026-01-01"
      }
    ];

    const [existingSalaries] = await pool.query("SELECT COUNT(*) as count FROM salary_structures");
    if (existingSalaries[0]?.count === 0) {
      for (const s of salaries) {
        await pool.query(
          `INSERT INTO salary_structures (
            id, company_id, user_id, ctc_annual, basic_monthly, hra_monthly,
            special_allowance, conveyance, pf_deduction, pt_deduction, tds_monthly, effective_from
          ) VALUES (?, 'default_company', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.user_id, s.ctc_annual, s.basic_monthly, s.hra_monthly, s.special_allowance, s.conveyance, s.pf_deduction, s.pt_deduction, s.tds_monthly, s.effective_from]
        );
      }
      console.log("✅ Seeded Developer Salary Structures");
    }

    // ════════════════════════════════════════════════════════
    // SEED PROJECT RESOURCE ALLOCATIONS
    // ════════════════════════════════════════════════════════
    const allocations = [
      { id: "alloc_1", project_id: "proj_fintech", project_name: "FinTech Mobile Banking App", user_id: "dev_1", user_name: "Rahul Sharma", user_role: "Tech Lead", pct: 60, type: "Billable" },
      { id: "alloc_2", project_id: "proj_ecommerce", project_name: "E-Commerce Multi-Vendor Hub", user_id: "dev_1", user_name: "Rahul Sharma", user_role: "Tech Lead", pct: 40, type: "Billable" },
      { id: "alloc_3", project_id: "proj_ecommerce", project_name: "E-Commerce Multi-Vendor Hub", user_id: "dev_2", user_name: "Priya Patel", user_role: "Frontend Engineer", pct: 100, type: "Billable" },
      { id: "alloc_4", project_id: "proj_fintech", project_name: "FinTech Mobile Banking App", user_id: "dev_3", user_name: "Amit Verma", user_role: "Backend Engineer", pct: 80, type: "Billable" },
      { id: "alloc_5", project_id: "proj_fintech", project_name: "FinTech Mobile Banking App", user_id: "dev_4", user_name: "Sneha Mehta", user_role: "QA Engineer", pct: 75, type: "Billable" },
      { id: "alloc_6", project_id: "proj_ecommerce", project_name: "E-Commerce Multi-Vendor Hub", user_id: "dev_5", user_name: "Vikram Singh", user_role: "DevOps Engineer", pct: 50, type: "Billable" }
    ];

    const [existingAllocations] = await pool.query("SELECT COUNT(*) as count FROM project_allocations");
    if (existingAllocations[0]?.count === 0) {
      for (const al of allocations) {
        await pool.query(
          `INSERT INTO project_allocations (
            id, company_id, project_id, project_name, user_id, user_name, user_role, allocation_percentage, billing_type
          ) VALUES (?, 'default_company', ?, ?, ?, ?, ?, ?, ?)`,
          [al.id, al.project_id, al.project_name, al.user_id, al.user_name, al.user_role, al.pct, al.type]
        );
      }
      console.log("✅ Seeded Project Resource Allocations");
    }

    console.log("🎉 ALL DUMMY DATA SEEDED SUCCESSFULLY INTO MYSQL! (2 Projects, 5 Developers, Tasks, Expenses, Holidays, Announcements, Assets, Checklists, Salaries, Allocations)");
    return true;
  } catch (err) {
    console.error("❌ Pure MySQL Seeding Error:", err);
    return false;
  }
}

if (require.main === module) {
  seedDummyData().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = seedDummyData;
