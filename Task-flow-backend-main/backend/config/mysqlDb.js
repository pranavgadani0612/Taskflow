const mysql = require("mysql2/promise");

// MySQL Connection Pool
let dbPassword = (process.env.DB_PASSWORD !== undefined) ? process.env.DB_PASSWORD : "";
if (typeof dbPassword === "string") {
  dbPassword = dbPassword.trim().replace(/^["']|["']$/g, '');
  if (dbPassword === "Task@" || dbPassword === "Task") {
    dbPassword = "Task@#123";
  }
}
const dbHost = (process.env.DB_HOST || "127.0.0.1").trim().replace(/^["']|["']$/g, '');
const dbUser = (process.env.DB_USER || "root").trim().replace(/^["']|["']$/g, '');
const dbName = (process.env.DB_NAME || "taskflow_db").trim().replace(/^["']|["']$/g, '');

const pool = mysql.createPool({
  host: dbHost,
  port: parseInt(process.env.DB_PORT) || 3306,
  user: dbUser,
  password: dbPassword,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true,
});

async function initDB() {
  try {
    try {
      const initConnection = await mysql.createConnection({
        host: dbHost,
        port: parseInt(process.env.DB_PORT) || 3306,
        user: process.env.DB_USER || "root",
        password: dbPassword,
      });
      await initConnection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || "taskflow_db"}\`;`);
      await initConnection.end();
    } catch (_) {}

    const connection = await pool.getConnection();
    console.log(`✅ MySQL Connected successfully to database: ${process.env.DB_NAME || "taskflow_db"}`);

    // Create tables
    await connection.query(`
      CREATE TABLE IF NOT EXISTS collections (
        collection_name VARCHAR(100) NOT NULL,
        _id VARCHAR(50) NOT NULL,
        data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (collection_name, _id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        status VARCHAR(50) DEFAULT 'Active',
        permissions JSON,
        company_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        value VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS task_statuses (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        status VARCHAR(50) DEFAULT 'Active',
        project_id VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS ratings (
        id VARCHAR(50) PRIMARY KEY,
        employee_id VARCHAR(50) NOT NULL,
        rated_by VARCHAR(50) NOT NULL,
        company_id VARCHAR(50),
        project_id VARCHAR(50),
        task_id VARCHAR(50),
        score INT NOT NULL DEFAULT 5,
        category VARCHAR(100) DEFAULT 'Overall Performance',
        review_period VARCHAR(100) DEFAULT 'General Review',
        feedback TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_emp (employee_id),
        INDEX idx_comp (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_conversations (
        id VARCHAR(50) PRIMARY KEY,
        type VARCHAR(20) DEFAULT 'direct',
        name VARCHAR(150),
        participants JSON,
        client_participants JSON,
        created_by VARCHAR(50),
        company_id VARCHAR(50),
        last_message JSON,
        is_archived TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id VARCHAR(50) PRIMARY KEY,
        conversation_id VARCHAR(50) NOT NULL,
        sender_id VARCHAR(50) NOT NULL,
        sender_name VARCHAR(150),
        sender_image VARCHAR(255),
        text TEXT,
        file_url VARCHAR(255),
        file_name VARCHAR(255),
        read_by JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_conv (conversation_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150),
        email VARCHAR(150) UNIQUE,
        password VARCHAR(255),
        role VARCHAR(100),
        position VARCHAR(100),
        status VARCHAR(50) DEFAULT 'Active',
        phone VARCHAR(50),
        company_id VARCHAR(50),
        reset_password_token VARCHAR(255),
        reset_password_expires BIGINT,
        image VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255),
        description TEXT,
        status VARCHAR(50),
        priority VARCHAR(50),
        project VARCHAR(100),
        assigned_to VARCHAR(100),
        due_date DATE,
        start_date DATE,
        end_date DATE,
        type VARCHAR(50) DEFAULT 'task',
        image VARCHAR(255),
        video VARCHAR(255),
        estimated_hours DECIMAL(6,2) DEFAULT 0,
        calculated_end_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150),
        description TEXT,
        status VARCHAR(50) DEFAULT 'Active',
        assigned_to JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        user_email VARCHAR(150),
        date DATE NOT NULL,
        clock_in DATETIME,
        clock_out DATETIME,
        work_mode VARCHAR(50) DEFAULT 'Office',
        break_start DATETIME,
        break_end DATETIME,
        total_break_minutes INT DEFAULT 0,
        total_hours DECIMAL(5,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Present',
        notes TEXT,
        is_regularized TINYINT(1) DEFAULT 0,
        only_admin_clock_out TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY user_date_unique (user_id, date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure columns exist in attendance
    try {
      await connection.query("ALTER TABLE attendance ADD COLUMN only_admin_clock_out TINYINT(1) DEFAULT 0");
    } catch (_) {}
    try {
      await connection.query("ALTER TABLE attendance ADD COLUMN auto_clock_out TINYINT(1) DEFAULT 0");
    } catch (_) {}
    try {
      await connection.query("ALTER TABLE attendance ADD COLUMN missed_clock_out TINYINT(1) DEFAULT 0");
    } catch (_) {}
    try {
      await connection.query("ALTER TABLE attendance ADD COLUMN is_late_instance TINYINT(1) DEFAULT 0");
    } catch (_) {}
    try {
      await connection.query("ALTER TABLE attendance ADD COLUMN late_minutes INT DEFAULT 0");
    } catch (_) {}
    try {
      await connection.query("ALTER TABLE attendance ADD COLUMN first_half_deducted TINYINT(1) DEFAULT 0");
    } catch (_) {}
    try {
      await connection.query("ALTER TABLE attendance ADD COLUMN is_official_duty TINYINT(1) DEFAULT 0");
    } catch (_) {}
    try {
      await connection.query("ALTER TABLE attendance ADD COLUMN waived_instance TINYINT(1) DEFAULT 0");
    } catch (_) {}
    try {
      await connection.query("ALTER TABLE attendance ADD COLUMN manual_adjusted_by VARCHAR(150) NULL");
    } catch (_) {}
    try {
      await connection.query("ALTER TABLE attendance ADD COLUMN adjustment_reason TEXT NULL");
    } catch (_) {}

    await connection.query(`
      CREATE TABLE IF NOT EXISTS attendance_settings (
        id VARCHAR(50) PRIMARY KEY DEFAULT 'default_settings',
        monthly_late_instances INT DEFAULT 3,
        late_grace_minutes INT DEFAULT 30,
        half_day_late_minutes INT DEFAULT 120,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await connection.query("ALTER TABLE attendance_settings ADD COLUMN half_day_late_minutes INT DEFAULT 120");
    } catch (_) {}

    // Ensure default attendance settings exist
    try {
      const [existingSettings] = await connection.query("SELECT COUNT(*) as count FROM attendance_settings");
      if (existingSettings[0].count === 0) {
        await connection.query(`
          INSERT INTO attendance_settings (id, monthly_late_instances, late_grace_minutes)
          VALUES ('default_settings', 3, 30)
        `);
        console.log("✅ Seeded default attendance settings (3 monthly late instances, 30 min grace)");
      }
    } catch (_) {}

    await connection.query(`
      CREATE TABLE IF NOT EXISTS break_logs (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        user_email VARCHAR(150),
        company_id VARCHAR(50),
        date DATE NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        duration_minutes INT DEFAULT 0,
        reason VARCHAR(255) DEFAULT 'Break',
        status VARCHAR(50) DEFAULT 'On Break',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_date (user_id, date),
        INDEX idx_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS break_types (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        duration_minutes INT DEFAULT 15,
        window_start VARCHAR(10) DEFAULT '00:00',
        window_end VARCHAR(10) DEFAULT '23:59',
        company_id VARCHAR(50),
        status VARCHAR(50) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(100) PRIMARY KEY,
        document_type VARCHAR(100) DEFAULT 'Document',
        description TEXT,
        content LONGTEXT,
        file VARCHAR(255),
        assigned_to JSON,
        project_id VARCHAR(100),
        access VARCHAR(50) DEFAULT 'All',
        access_granted TINYINT(1) DEFAULT 0,
        access_requested TINYINT(1) DEFAULT 0,
        granted_users JSON,
        requested_users JSON,
        text_type VARCHAR(50) DEFAULT 'upload',
        company_id VARCHAR(100) DEFAULT 'default_company',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_doc_proj (project_id),
        INDEX idx_doc_comp (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        company VARCHAR(150),
        address TEXT,
        status VARCHAR(50) DEFAULT 'Active',
        notes TEXT,
        projects JSON,
        company_id VARCHAR(100) DEFAULT 'default_company',
        created_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_client_comp (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS work_schedules (
        id VARCHAR(50) PRIMARY KEY,
        day_of_week VARCHAR(20) NOT NULL,
        is_working_day TINYINT(1) DEFAULT 1,
        clock_in_time VARCHAR(10) DEFAULT '09:30',
        clock_out_time VARCHAR(10) DEFAULT '18:30',
        saturday_rule VARCHAR(30) DEFAULT '2nd_4th_off',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_day (day_of_week)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure columns exist if table was already created
    try {
      const [colCheck] = await connection.query("SHOW COLUMNS FROM work_schedules LIKE 'saturday_rule'");
      if (colCheck.length === 0) {
        await connection.query("ALTER TABLE work_schedules ADD COLUMN saturday_rule VARCHAR(30) DEFAULT '2nd_4th_off'");
      }
    } catch (e) {}

    // Seed default weekday work schedules
    const [existingSchedules] = await connection.query("SELECT COUNT(*) as count FROM work_schedules");
    if (existingSchedules[0].count === 0) {
      await connection.query(`
        INSERT INTO work_schedules (id, day_of_week, is_working_day, clock_in_time, clock_out_time)
        VALUES 
          ('sched_1', 'Monday', 1, '09:30', '18:30'),
          ('sched_2', 'Tuesday', 1, '09:30', '18:30'),
          ('sched_3', 'Wednesday', 1, '09:30', '18:30'),
          ('sched_4', 'Thursday', 1, '09:30', '18:30'),
          ('sched_5', 'Friday', 1, '09:30', '18:30'),
          ('sched_6', 'Saturday', 0, '09:30', '14:00'),
          ('sched_7', 'Sunday', 0, '00:00', '00:00')
      `);
      console.log("✅ Seeded default work schedules (Mon-Fri 09:30 - 18:30)");
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS test_cases (
        id VARCHAR(50) PRIMARY KEY,
        project_id VARCHAR(50),
        project_name VARCHAR(150),
        module_name VARCHAR(100),
        title VARCHAR(255) NOT NULL,
        preconditions TEXT,
        steps TEXT,
        expected_result TEXT,
        actual_result TEXT,
        status VARCHAR(50) DEFAULT 'Not Executed',
        severity VARCHAR(50) DEFAULT 'Medium',
        created_by VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS qa_bugs (
        id VARCHAR(50) PRIMARY KEY,
        project_id VARCHAR(50),
        project_name VARCHAR(150),
        test_case_id VARCHAR(50),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        steps_to_reproduce TEXT,
        severity VARCHAR(50) DEFAULT 'Major',
        status VARCHAR(50) DEFAULT 'Open',
        assigned_to VARCHAR(150),
        reported_by VARCHAR(150),
        environment VARCHAR(100) DEFAULT 'Staging',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS leave_balances (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL UNIQUE,
        user_name VARCHAR(150),
        user_email VARCHAR(150),
        cl_balance INT DEFAULT 12,
        sl_balance INT DEFAULT 8,
        pl_balance INT DEFAULT 15,
        comp_off INT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await connection.query("ALTER TABLE leave_balances ADD COLUMN user_email VARCHAR(150) NULL");
    } catch (_) {}
    // Half-day leaves deduct 0.5, and balance may go negative -> signed DECIMAL
    try {
      const [balCols] = await connection.query("SHOW COLUMNS FROM leave_balances WHERE Field = 'cl_balance'");
      if (balCols[0] && !/decimal/i.test(balCols[0].Type)) {
        await connection.query(`
          ALTER TABLE leave_balances
            MODIFY cl_balance DECIMAL(5,1) DEFAULT 12,
            MODIFY sl_balance DECIMAL(5,1) DEFAULT 8,
            MODIFY pl_balance DECIMAL(5,1) DEFAULT 15,
            MODIFY comp_off DECIMAL(5,1) DEFAULT 0
        `);
      }
    } catch (_) {}

    await connection.query(`
      CREATE TABLE IF NOT EXISTS company_leave_settings (
        id VARCHAR(50) PRIMARY KEY DEFAULT 'default_policy',
        cl_default INT DEFAULT 12,
        sl_default INT DEFAULT 8,
        pl_default INT DEFAULT 15,
        comp_off_default INT DEFAULT 2,
        max_cl_per_month INT DEFAULT 1,
        max_pl_per_month INT DEFAULT 5,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try {
      await connection.query("ALTER TABLE company_leave_settings ADD COLUMN max_cl_per_month INT DEFAULT 1");
    } catch (_) {}
    try {
      await connection.query("ALTER TABLE company_leave_settings ADD COLUMN max_pl_per_month INT DEFAULT 5");
    } catch (_) {}
    try {
      await connection.query("ALTER TABLE company_leave_settings ADD COLUMN max_short_leave_minutes INT DEFAULT 120");
    } catch (_) {}

    try {
      await connection.query(`
        INSERT INTO company_leave_settings (id, cl_default, sl_default, pl_default, comp_off_default, max_cl_per_month, max_pl_per_month)
        VALUES ('default_policy', 12, 8, 15, 2, 1, 5)
        ON DUPLICATE KEY UPDATE id=id
      `);
    } catch (_) {}

    await connection.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        user_email VARCHAR(150),
        leave_type VARCHAR(50) NOT NULL,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        day_type VARCHAR(50) DEFAULT 'Full Day',
        total_days DECIMAL(4,1) DEFAULT 1.0,
        reason TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        approved_by VARCHAR(150),
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS short_leaves (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        date DATE NOT NULL,
        from_time VARCHAR(20) NOT NULL,
        to_time VARCHAR(20) NOT NULL,
        hours DECIMAL(3,1) DEFAULT 2.0,
        reason TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        approved_by VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // short_leaves.user_email is used by the admin summary & approvals queries
    try {
      await connection.query("ALTER TABLE short_leaves ADD COLUMN user_email VARCHAR(150) NULL AFTER user_name");
    } catch (_) {}
    try {
      await connection.query(
        "UPDATE short_leaves sl JOIN staff s ON sl.user_id = s.id SET sl.user_email = s.email WHERE sl.user_email IS NULL"
      );
    } catch (_) {}

    await connection.query(`
      CREATE TABLE IF NOT EXISTS timesheets (
        id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        user_email VARCHAR(150),
        project_id VARCHAR(50) NOT NULL,
        project_name VARCHAR(150),
        task_id VARCHAR(50),
        task_title VARCHAR(255),
        subtask_id VARCHAR(50),
        subtask_title VARCHAR(255),
        date DATE NOT NULL,
        hours DECIMAL(4,2) NOT NULL DEFAULT 0.00,
        description TEXT NOT NULL,
        is_billable TINYINT(1) DEFAULT 1,
        task_status VARCHAR(50) DEFAULT 'In Process',
        status VARCHAR(50) DEFAULT 'Submitted',
        approved_by VARCHAR(150),
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user_date (user_id, date),
        INDEX idx_project (project_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure subtasks table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS subtasks (
        id VARCHAR(50) PRIMARY KEY,
        task_id VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'Pending',
        assigned_to VARCHAR(150),
        start_date DATE,
        end_date DATE,
        hours DECIMAL(5,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_subtask_task (task_id)  
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure internal_tickets table exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS internal_tickets (
        id VARCHAR(50) PRIMARY KEY,
        ticket_number VARCHAR(50) UNIQUE NOT NULL,
        user_id VARCHAR(100) NOT NULL,
        user_name VARCHAR(150) NOT NULL,
        user_email VARCHAR(150) NOT NULL,
        category VARCHAR(100) NOT NULL,
        item_type VARCHAR(100),
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        priority VARCHAR(50) DEFAULT 'Medium',
        status VARCHAR(50) DEFAULT 'Open',
        admin_remarks TEXT,
        assigned_to VARCHAR(150),
        resolved_at DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ticket_user (user_id),
        INDEX idx_ticket_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try { await connection.query(`ALTER TABLE timesheets ADD COLUMN subtask_id VARCHAR(50) AFTER task_title`); } catch (e) {}
    try { await connection.query(`ALTER TABLE timesheets ADD COLUMN subtask_title VARCHAR(255) AFTER subtask_id`); } catch (e) {}
    try { await connection.query(`ALTER TABLE timesheets ADD COLUMN task_status VARCHAR(50) DEFAULT 'In Process' AFTER is_billable`); } catch (e) {}
    try { await connection.query(`ALTER TABLE tasks ADD COLUMN start_date DATE`); } catch (e) {}
    try { await connection.query(`ALTER TABLE tasks ADD COLUMN end_date DATE`); } catch (e) {}
    try { await connection.query(`ALTER TABLE tasks ADD COLUMN type VARCHAR(50) DEFAULT 'task'`); } catch (e) {}
    try { await connection.query(`ALTER TABLE tasks ADD COLUMN image VARCHAR(255) NULL`); } catch (e) {}
    try { await connection.query(`ALTER TABLE tasks ADD COLUMN video VARCHAR(255) NULL`); } catch (e) {}
    try { await connection.query(`ALTER TABLE tasks ADD COLUMN estimated_hours DECIMAL(6,2) DEFAULT 0`); } catch (e) {}
    try { await connection.query(`ALTER TABLE tasks ADD COLUMN calculated_end_date DATE NULL`); } catch (e) {}
    try { await connection.query(`ALTER TABLE tasks ADD COLUMN assigned_by VARCHAR(100) NULL`); } catch (e) {}
    try { await connection.query(`ALTER TABLE tasks ADD COLUMN assigned_by_name VARCHAR(150) NULL`); } catch (e) {}
    // ════════════════════════════════════════════════════════
    // EXPENSE & REIMBURSEMENT MODULE TABLES
    // ════════════════════════════════════════════════════════
    await connection.query(`
      CREATE TABLE IF NOT EXISTS expense_categories (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        name VARCHAR(100) NOT NULL,
        description VARCHAR(255),
        max_limit DECIMAL(10,2) DEFAULT NULL,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_exp_cat_comp (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS expense_policies (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL UNIQUE,
        max_amount_per_expense DECIMAL(10,2) DEFAULT 50000.00,
        max_amount_per_month DECIMAL(10,2) DEFAULT 200000.00,
        receipt_mandatory_above DECIMAL(10,2) DEFAULT 500.00,
        allow_future_dates TINYINT(1) DEFAULT 0,
        duplicate_detection TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_exp_pol_comp (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        employee_id VARCHAR(50) NOT NULL,
        employee_name VARCHAR(150),
        employee_email VARCHAR(150),
        title VARCHAR(255) NOT NULL,
        category_id VARCHAR(50) NOT NULL,
        category_name VARCHAR(100),
        project_id VARCHAR(50) NULL,
        project_name VARCHAR(150) NULL,
        items JSON,
        total_amount DECIMAL(10,2) NOT NULL,
        approved_amount DECIMAL(10,2) NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        expense_date DATE NOT NULL,
        payment_mode VARCHAR(50) DEFAULT 'UPI',
        description TEXT,
        receipts JSON,
        status VARCHAR(50) DEFAULT 'Draft',
        approver_id VARCHAR(50) NULL,
        approver_name VARCHAR(150) NULL,
        approver_comment TEXT NULL,
        submitted_at DATETIME NULL,
        approved_at DATETIME NULL,
        rejected_at DATETIME NULL,
        paid_at DATETIME NULL,
        payment_info JSON NULL,
        history JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_exp_comp (company_id),
        INDEX idx_exp_emp (employee_id),
        INDEX idx_exp_status (status),
        INDEX idx_exp_date (expense_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ════════════════════════════════════════════════════════
    // PHASE 1: CORE PORTAL TABLES & EXTENSIONS
    // ════════════════════════════════════════════════════════

    // 1. Staff table extensions (Department, Reporting Manager, Joining Date, DOB)
    try { await connection.query("ALTER TABLE staff ADD COLUMN department VARCHAR(100) DEFAULT 'Engineering'"); } catch (_) {}
    try { await connection.query("ALTER TABLE staff ADD COLUMN reporting_manager_id VARCHAR(50) NULL"); } catch (_) {}
    try { await connection.query("ALTER TABLE staff ADD COLUMN reporting_manager_name VARCHAR(150) NULL"); } catch (_) {}
    try { await connection.query("ALTER TABLE staff ADD COLUMN joining_date DATE NULL"); } catch (_) {}
    try { await connection.query("ALTER TABLE staff ADD COLUMN dob DATE NULL"); } catch (_) {}
    try { await connection.query("ALTER TABLE staff ADD COLUMN emergency_contact VARCHAR(100) NULL"); } catch (_) {}
    try { await connection.query("ALTER TABLE staff ADD COLUMN documents JSON NULL"); } catch (_) {}

    // 2. Attendance Regularization table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS attendance_regularizations (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        user_email VARCHAR(150),
        attendance_id VARCHAR(50) NULL,
        target_date DATE NOT NULL,
        original_clock_in DATETIME NULL,
        original_clock_out DATETIME NULL,
        requested_clock_in DATETIME NOT NULL,
        requested_clock_out DATETIME NOT NULL,
        reason TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        approver_id VARCHAR(50) NULL,
        approver_name VARCHAR(150) NULL,
        approver_comment TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_att_reg_comp (company_id),
        INDEX idx_att_reg_user (user_id),
        INDEX idx_att_reg_status (status),
        INDEX idx_att_reg_date (target_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2b. Forgot Punch Out requests (employee submits actual clock-out time for a system auto clock-out)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS forgot_punch_out_requests (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NULL,
        attendance_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        user_email VARCHAR(150),
        target_date DATE NOT NULL,
        clock_in DATETIME NULL,
        requested_clock_out DATETIME NOT NULL,
        reason TEXT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        approver_id VARCHAR(50) NULL,
        approver_name VARCHAR(150) NULL,
        approver_comment TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_fpo_att (attendance_id),
        INDEX idx_fpo_user (user_id),
        INDEX idx_fpo_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Older system auto clock-outs were stored as 'Half Day' - they are now 'Not Punch Out'
    try {
      await connection.query(
        "UPDATE attendance SET status = 'Not Punch Out' WHERE auto_clock_out = 1 AND status = 'Half Day' AND (is_regularized = 0 OR is_regularized IS NULL)"
      );
    } catch (_) {}

    // 3. Company Holidays table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS company_holidays (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        name VARCHAR(150) NOT NULL,
        holiday_date DATE NOT NULL,
        description VARCHAR(255),
        is_optional TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_holidays_comp (company_id),
        INDEX idx_holidays_date (holiday_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Announcements & Acknowledgments
    await connection.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        priority VARCHAR(50) DEFAULT 'Normal',
        target_department VARCHAR(100) DEFAULT 'All',
        pinned TINYINT(1) DEFAULT 0,
        requires_acknowledgment TINYINT(1) DEFAULT 0,
        created_by_id VARCHAR(50),
        created_by_name VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ann_comp (company_id),
        INDEX idx_ann_priority (priority)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS announcement_acknowledgments (
        id VARCHAR(50) PRIMARY KEY,
        announcement_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        acknowledged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unq_ann_user (announcement_id, user_id),
        INDEX idx_ack_ann (announcement_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Work From Home & On-Duty Requests
    await connection.query(`
      CREATE TABLE IF NOT EXISTS wfh_requests (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        user_email VARCHAR(150),
        request_type VARCHAR(50) DEFAULT 'WFH',
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        day_type VARCHAR(50) DEFAULT 'Full Day',
        reason TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        approver_id VARCHAR(50) NULL,
        approver_name VARCHAR(150) NULL,
        approver_comment TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_wfh_comp (company_id),
        INDEX idx_wfh_user (user_id),
        INDEX idx_wfh_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Universal Audit Logs table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        actor_id VARCHAR(50) NOT NULL,
        actor_name VARCHAR(150),
        actor_role VARCHAR(100),
        module VARCHAR(100) NOT NULL,
        action VARCHAR(100) NOT NULL,
        target_id VARCHAR(100) NULL,
        target_name VARCHAR(255) NULL,
        details JSON NULL,
        ip_address VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_audit_comp (company_id),
        INDEX idx_audit_module (module),
        INDEX idx_audit_actor (actor_id),
        INDEX idx_audit_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // ==========================================
    // 🚀 PHASE 2 MODULES & TABLES
    // ==========================================

    // 7. Assets & Hardware/License Inventory
    await connection.query(`
      CREATE TABLE IF NOT EXISTS company_assets (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        asset_tag VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'Laptop',
        brand VARCHAR(100),
        model VARCHAR(100),
        serial_number VARCHAR(150),
        purchase_date DATE NULL,
        purchase_cost DECIMAL(10, 2) DEFAULT 0.00,
        warranty_expiry DATE NULL,
        status VARCHAR(50) DEFAULT 'Available',
        assigned_to_id VARCHAR(50) NULL,
        assigned_to_name VARCHAR(150) NULL,
        specs JSON NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_asset_comp (company_id),
        INDEX idx_asset_status (status),
        INDEX idx_asset_assignee (assigned_to_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS asset_assignments (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        asset_id VARCHAR(50) NOT NULL,
        asset_tag VARCHAR(100),
        asset_name VARCHAR(255),
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        user_email VARCHAR(150),
        assigned_by_id VARCHAR(50),
        assigned_by_name VARCHAR(150),
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expected_return_date DATE NULL,
        returned_at TIMESTAMP NULL,
        condition_on_assign VARCHAR(100) DEFAULT 'Excellent',
        condition_on_return VARCHAR(100) NULL,
        return_notes TEXT NULL,
        status VARCHAR(50) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_assign_comp (company_id),
        INDEX idx_assign_asset (asset_id),
        INDEX idx_assign_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 8. Payroll, Salary Structures & Payslips
    await connection.query(`
      CREATE TABLE IF NOT EXISTS salary_structures (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        ctc_annual DECIMAL(12, 2) DEFAULT 0.00,
        basic_monthly DECIMAL(10, 2) DEFAULT 0.00,
        hra_monthly DECIMAL(10, 2) DEFAULT 0.00,
        special_allowance DECIMAL(10, 2) DEFAULT 0.00,
        conveyance DECIMAL(10, 2) DEFAULT 0.00,
        pf_deduction DECIMAL(10, 2) DEFAULT 0.00,
        pt_deduction DECIMAL(10, 2) DEFAULT 200.00,
        tds_monthly DECIMAL(10, 2) DEFAULT 0.00,
        effective_from DATE NULL,
        notes TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_sal_user (user_id),
        UNIQUE KEY unq_sal_user_comp (company_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        month_year VARCHAR(20) NOT NULL,
        total_payout DECIMAL(14, 2) DEFAULT 0.00,
        total_deductions DECIMAL(14, 2) DEFAULT 0.00,
        total_reimbursements DECIMAL(14, 2) DEFAULT 0.00,
        employee_count INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Draft',
        approved_by VARCHAR(150) NULL,
        disbursed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unq_run_month (company_id, month_year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS payslips (
        id VARCHAR(50) PRIMARY KEY,
        payroll_run_id VARCHAR(50) NOT NULL,
        company_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150) NOT NULL,
        user_email VARCHAR(150),
        department VARCHAR(100),
        designation VARCHAR(100),
        month_year VARCHAR(20) NOT NULL,
        working_days INT DEFAULT 30,
        present_days DECIMAL(5, 1) DEFAULT 30.0,
        unpaid_leave_days DECIMAL(5, 1) DEFAULT 0.0,
        basic_salary DECIMAL(10, 2) DEFAULT 0.00,
        hra DECIMAL(10, 2) DEFAULT 0.00,
        allowances DECIMAL(10, 2) DEFAULT 0.00,
        gross_salary DECIMAL(12, 2) DEFAULT 0.00,
        pf_deduction DECIMAL(10, 2) DEFAULT 0.00,
        pt_deduction DECIMAL(10, 2) DEFAULT 0.00,
        tds_deduction DECIMAL(10, 2) DEFAULT 0.00,
        unpaid_leave_deduction DECIMAL(10, 2) DEFAULT 0.00,
        total_deductions DECIMAL(12, 2) DEFAULT 0.00,
        reimbursements_total DECIMAL(10, 2) DEFAULT 0.00,
        net_salary DECIMAL(12, 2) DEFAULT 0.00,
        payment_status VARCHAR(50) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_slip_user (user_id),
        INDEX idx_slip_run (payroll_run_id),
        UNIQUE KEY unq_user_month (company_id, user_id, month_year)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 10. Project Resource Allocation
    await connection.query(`
      CREATE TABLE IF NOT EXISTS project_allocations (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        project_id VARCHAR(50) NOT NULL,
        project_name VARCHAR(255),
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        user_role VARCHAR(100),
        allocation_percentage INT DEFAULT 100,
        start_date DATE NULL,
        end_date DATE NULL,
        billing_type VARCHAR(50) DEFAULT 'Billable',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_alloc_proj (project_id),
        INDEX idx_alloc_user (user_id),
        INDEX idx_alloc_comp (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 11. Overtime Requests
    await connection.query(`
      CREATE TABLE IF NOT EXISTS overtime_requests (
        id VARCHAR(50) PRIMARY KEY,
        company_id VARCHAR(50) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        user_name VARCHAR(150),
        date DATE NOT NULL,
        ot_hours DECIMAL(5, 2) NOT NULL DEFAULT 1.0,
        reason TEXT NOT NULL,
        action_type VARCHAR(50) DEFAULT 'Pay Overtime',
        status VARCHAR(50) DEFAULT 'Pending',
        approver_id VARCHAR(50) NULL,
        approver_name VARCHAR(150) NULL,
        approver_comment TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ot_user (user_id),
        INDEX idx_ot_comp (company_id),
        INDEX idx_ot_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure clients has hourly_billing_rate and currency columns
    try {
      await connection.query(`ALTER TABLE clients ADD COLUMN hourly_billing_rate DECIMAL(10, 2) DEFAULT 35.00`);
    } catch (_) {}
    try {
      await connection.query(`ALTER TABLE clients ADD COLUMN currency VARCHAR(10) DEFAULT 'USD'`);
    } catch (_) {}

    connection.release();
    console.log("✅ MySQL Tables ready in phpMyAdmin (taskflow_db)");
  } catch (err) {
    console.error("❌ MySQL Connection/Init Error:", err);
    throw err;
  }
}

// 📜 Universal Audit Logging Helper
const logAudit = async ({ companyId = "default_company", actorId, actorName, actorRole, module, action, targetId, targetName, details, ipAddress }) => {
  try {
    const id = `aud_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    await pool.query(
      `INSERT INTO audit_logs (id, company_id, actor_id, actor_name, actor_role, module, action, target_id, target_name, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        actorId || "system",
        actorName || "System",
        actorRole || "System",
        module,
        action,
        targetId || null,
        targetName || null,
        details ? (typeof details === "string" ? details : JSON.stringify(details)) : null,
        ipAddress || null,
      ]
    );
  } catch (err) {
    console.warn("⚠️ Audit log error:", err.message);
  }
};

module.exports = { pool, initDB, logAudit };
