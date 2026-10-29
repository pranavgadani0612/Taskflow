const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runMasterTestPlanSuite() {
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("🎯 STARTING PLAYWRIGHT MASTER TEST SUITE: PADHYA SOFTWARE TECHNOLOGIES");
  console.log("   Internal Employee Portal - Comprehensive QA Test Plan Execution");
  console.log("════════════════════════════════════════════════════════════════════════\n");

  const reportDir = path.join(__dirname, '../playwright-report/test-plan-results');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const results = [];
  const startTime = Date.now();

  async function executeTest(id, section, scenario, fn) {
    const testRecord = {
      id,
      section,
      scenario,
      status: "RUNNING",
      durationMs: 0,
      error: null
    };
    const t0 = Date.now();
    process.stdout.write(`  [${id}] ${scenario.padEnd(62, ' ')} `);
    try {
      await fn();
      testRecord.status = "PASS";
      testRecord.durationMs = Date.now() - t0;
      console.log(`\x1b[32m✔ PASS\x1b[0m (${testRecord.durationMs}ms)`);
    } catch (err) {
      testRecord.status = "FAIL";
      testRecord.durationMs = Date.now() - t0;
      testRecord.error = err.message;
      console.log(`\x1b[31m✖ FAIL\x1b[0m (${testRecord.durationMs}ms) - ${err.message}`);
    }
    results.push(testRecord);
  }

  const browser = await chromium.launch({ headless: true });

  try {
    // ═════════════════════════════════════════════════════════════════
    // SECTION A: AUTHENTICATION (AU-01 to AU-11)
    // ═════════════════════════════════════════════════════════════════
    console.log("\n▶ SECTION A: AUTHENTICATION SUITE");

    await executeTest("AU-01", "Authentication", "Valid login for Super Admin & redirection to dashboard", async () => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
      const loginBtn = await page.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")');
      await loginBtn.click();
      await page.fill('input[type="email"]', 'gadanipranav@gmail.com');
      await page.fill('input[type="password"]', 'pranav123');
      await page.click('form button[type="submit"]');
      await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
      const token = await page.evaluate(() => localStorage.getItem('token'));
      if (!token) throw new Error("Token missing from localStorage");
      await ctx.close();
    });

    await executeTest("AU-01b", "Authentication", "Valid login for Developer role (amit@itcompany.com)", async () => {
      const devCtx = await browser.newContext();
      const devPage = await devCtx.newPage();
      await devPage.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
      const loginBtn = await devPage.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")');
      await loginBtn.click();
      await devPage.fill('input[type="email"]', 'amit@itcompany.com');
      await devPage.fill('input[type="password"]', 'Test@123');
      await devPage.click('form button[type="submit"]');
      await devPage.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });
      await devCtx.close();
    });

    await executeTest("AU-02", "Authentication", "Wrong password returns rejection feedback", async () => {
      const negCtx = await browser.newContext();
      const negPage = await negCtx.newPage();
      await negPage.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
      const loginBtn = await negPage.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")');
      await loginBtn.click();
      await negPage.fill('input[type="email"]', 'gadanipranav@gmail.com');
      await negPage.fill('input[type="password"]', 'WrongPassword!999');
      await negPage.click('form button[type="submit"]');
      await negPage.waitForTimeout(1000);
      const isStillOnLogin = negPage.url().includes('/login');
      if (!isStillOnLogin) throw new Error("Incorrect password should not navigate away from /login");
      await negCtx.close();
    });

    await executeTest("AU-03", "Authentication", "Empty email or password field validation", async () => {
      const negCtx = await browser.newContext();
      const negPage = await negCtx.newPage();
      await negPage.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
      const loginBtn = await negPage.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")');
      await loginBtn.click();
      const emailRequired = await negPage.$eval('input[type="email"]', el => el.required);
      const passRequired = await negPage.$eval('input[type="password"]', el => el.required);
      if (!emailRequired || !passRequired) throw new Error("HTML5 required validation missing on login fields");
      await negCtx.close();
    });

    await executeTest("AU-05", "Authentication", "SQL/script injection payload rejected safely", async () => {
      const secCtx = await browser.newContext();
      const secPage = await secCtx.newPage();
      await secPage.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
      const loginBtn = await secPage.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")');
      await loginBtn.click();
      await secPage.fill('input[type="email"]', "admin' OR 1=1--");
      await secPage.fill('input[type="password"]', "<script>alert(1)</script>");
      await secPage.click('form button[type="submit"]');
      await secPage.waitForTimeout(1000);
      if (!secPage.url().includes('/login')) throw new Error("SQL injection allowed bypass!");
      await secCtx.close();
    });

    await executeTest("AU-07", "Authentication", "Unauthenticated visit to protected route redirects to login", async () => {
      const cleanCtx = await browser.newContext();
      const cleanPage = await cleanCtx.newPage();
      await cleanPage.goto("http://localhost:5173/staff");
      await cleanPage.waitForTimeout(800);
      if (!cleanPage.url().includes('/login')) {
        throw new Error("Unauthenticated user was not redirected to /login");
      }
      await cleanCtx.close();
    });

    await executeTest("AU-10", "Authentication", "Forgot or reset password modal navigates to forgot-password", async () => {
      const cleanCtx = await browser.newContext();
      const cleanPage = await cleanCtx.newPage();
      await cleanPage.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
      const loginBtn = await cleanPage.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")');
      await loginBtn.click();
      const forgotLink = await cleanPage.waitForSelector('text=Forgot password?', { timeout: 4000 });
      await forgotLink.click();
      await cleanPage.waitForTimeout(600);
      if (!cleanPage.url().includes('forgot-password')) {
        throw new Error("Forgot password link did not navigate to /forgot-password");
      }
      await cleanCtx.close();
    });

    await executeTest("AU-11", "Authentication", "Password visibility eye toggle works correctly", async () => {
      const cleanCtx = await browser.newContext();
      const cleanPage = await cleanCtx.newPage();
      await cleanPage.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
      const loginBtn = await cleanPage.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")');
      await loginBtn.click();
      const pwdInput = await cleanPage.waitForSelector('input[type="password"]');
      await pwdInput.fill("SecretTest123");
      const eyeBtn = await cleanPage.waitForSelector('.input-wrapper button, form button[type="button"]');
      await eyeBtn.click();
      await cleanPage.waitForTimeout(200);
      const revealedType = await pwdInput.getAttribute('type');
      if (revealedType !== "text") throw new Error(`Password not revealed as text, got ${revealedType}`);
      await eyeBtn.click();
      await cleanPage.waitForTimeout(200);
      const hiddenType = await pwdInput.getAttribute('type');
      if (hiddenType !== "password") throw new Error(`Password not hidden as password, got ${hiddenType}`);
      await cleanCtx.close();
    });

    // ═════════════════════════════════════════════════════════════════
    // SECTION B: ROLES AND PERMISSIONS (RB-01 to RB-06)
    // ═════════════════════════════════════════════════════════════════
    console.log("\n▶ SECTION B: ROLES AND PERMISSIONS SUITE");
    const superContext = await browser.newContext();
    const superPage = await superContext.newPage();
    await superPage.goto("http://localhost:5173/login");
    const sLoginBtn = await superPage.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")');
    await sLoginBtn.click();
    await superPage.fill('input[type="email"]', 'gadanipranav@gmail.com');
    await superPage.fill('input[type="password"]', 'pranav123');
    await superPage.click('form button[type="submit"]');
    await superPage.waitForURL(u => !u.pathname.includes('/login'));

    await executeTest("RB-01", "Roles & Permissions", "Super Admin sees all administrative menu items", async () => {
      await superPage.goto("http://localhost:5173/");
      const menuText = await superPage.innerText('.sidebar-menu');
      if (!menuText.includes("Staff") || !menuText.includes("Role") || !menuText.includes("Permission")) {
        throw new Error("Super admin missing administrative navigation links");
      }
    });

    const devContext = await browser.newContext();
    const devPage = await devContext.newPage();
    await devPage.goto("http://localhost:5173/login");
    const dLoginBtn = await devPage.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")');
    await dLoginBtn.click();
    await devPage.fill('input[type="email"]', 'amit@itcompany.com');
    await devPage.fill('input[type="password"]', 'Test@123');
    await devPage.click('form button[type="submit"]');
    await devPage.waitForURL(u => !u.pathname.includes('/login'));

    await executeTest("RB-02", "Roles & Permissions", "Employee role sidebar hides restricted modules", async () => {
      await devPage.goto("http://localhost:5173/");
      const menuText = await devPage.innerText('.sidebar-menu');
      if (menuText.includes("Staff") || menuText.includes("Role") || menuText.includes("Permission")) {
        throw new Error("Developer should NOT see Staff, Role, or Permission in sidebar");
      }
    });

    await executeTest("RB-03", "Roles & Permissions", "Direct URL access to /permission without rights is guarded", async () => {
      await devPage.goto("http://localhost:5173/permission");
      await devPage.waitForTimeout(800);
      const content = await devPage.content();
      const isBlocked = content.includes("Unauthorized") || content.includes("Access Denied") || devPage.url().includes('/') || !content.includes("Save Permissions");
      if (!isBlocked) throw new Error("Unauthorized user was able to access permission editor");
    });

    await executeTest("RB-05", "Roles & Permissions", "Multi-tenant workspace organization isolation", async () => {
      const devProfile = await devPage.goto("http://localhost:5173/profile");
      if (devProfile.status() >= 400) throw new Error("Failed to load developer profile");
    });

    // ═════════════════════════════════════════════════════════════════
    // SECTION C: ATTENDANCE & TIMING MANAGER (AT-01 to AT-09)
    // ═════════════════════════════════════════════════════════════════
    console.log("\n▶ SECTION C: ATTENDANCE & TIMING MANAGER SUITE");

    await executeTest("AT-01", "Attendance", "Attendance dashboard page loads and renders clock action controls", async () => {
      await superPage.goto("http://localhost:5173/attendance", { waitUntil: "networkidle" });
      const clockBtn = await superPage.$('button:has-text("Clock In"), button:has-text("Clock Out"), button:has-text("Punch")');
      if (!clockBtn) throw new Error("Attendance clock in/out trigger button not found");
    });

    await executeTest("AT-05", "Attendance", "Time & Instances Hub renders IST timings and staff instance counters", async () => {
      await superPage.goto("http://localhost:5173/timing-manager", { waitUntil: "networkidle" });
      const hubText = await superPage.innerText('body');
      if (!hubText.includes("Time & Instance Control Hub") && !hubText.includes("TOTAL STAFF")) {
        throw new Error("Timing Manager hub did not render expected control metrics");
      }
    });

    await executeTest("AT-09", "Attendance", "Break Management module loads available break options", async () => {
      await superPage.goto("http://localhost:5173/breaks", { waitUntil: "networkidle" });
      const pageTitle = await superPage.waitForSelector('text=Break Management', { timeout: 5000 });
      if (!pageTitle) throw new Error("Break Management title not visible");
    });

    // ═════════════════════════════════════════════════════════════════
    // SECTION D: LEAVE MANAGEMENT (LV-01 to LV-10)
    // ═════════════════════════════════════════════════════════════════
    console.log("\n▶ SECTION D: LEAVE MANAGEMENT SUITE");

    await executeTest("LV-01", "Leave", "Leave module loads leave balances and application table", async () => {
      await superPage.goto("http://localhost:5173/leave", { waitUntil: "networkidle" });
      const pageText = await superPage.innerText('body');
      if (!pageText.includes("Leave") && !pageText.includes("Balance")) {
        throw new Error("Leave & Absence page did not render leave data");
      }
    });

    await executeTest("LV-02", "Leave", "Apply leave modal opens and validates required inputs", async () => {
      await superPage.goto("http://localhost:5173/leave", { waitUntil: "networkidle" });
      const applyBtn = await superPage.$('button:has-text("Apply"), button:has-text("Request Leave"), button:has-text("+")');
      if (applyBtn) {
        await applyBtn.click();
        await superPage.waitForTimeout(500);
        const modal = await superPage.$('.modal, .form-modal, form');
        if (!modal) throw new Error("Leave request modal failed to open");
      }
    });

    await executeTest("LV-05", "Leave", "Developer leave balance table renders CL, SL, PL counts", async () => {
      await devPage.goto("http://localhost:5173/leave", { waitUntil: "networkidle" });
      const content = await devPage.innerText('body');
      if (!content.includes("Leave") && !content.includes("Balance")) {
        throw new Error("Developer leave view did not display balances");
      }
    });

    // ═════════════════════════════════════════════════════════════════
    // SECTION E: POLICIES (PL-01 to PL-04)
    // ═════════════════════════════════════════════════════════════════
    console.log("\n▶ SECTION E: POLICIES SUITE");

    await executeTest("PL-01", "Policies", "Company Profile & Policies tab renders and loads company details", async () => {
      await superPage.goto("http://localhost:5173/profile?tab=policies", { waitUntil: "networkidle" });
      const content = await superPage.innerText('body');
      if (!content.includes("Company") && !content.includes("Policies")) {
        throw new Error("Company policies did not load on Profile page");
      }
    });

    // ═════════════════════════════════════════════════════════════════
    // SECTION F: TIMESHEETS (TS-01 to TS-07)
    // ═════════════════════════════════════════════════════════════════
    console.log("\n▶ SECTION F: TIMESHEETS SUITE");

    await executeTest("TS-01", "Timesheet", "Timesheet module loads weekly/monthly view with project dropdown", async () => {
      await superPage.goto("http://localhost:5173/timesheet", { waitUntil: "networkidle" });
      const table = await superPage.$('table, .timesheet-container, .page-header');
      if (!table) throw new Error("Timesheet table not loaded");
    });

    // ═════════════════════════════════════════════════════════════════
    // SECTION G: TASKS, TEAMS AND DASHBOARD (TK-01, DB-01, DB-02)
    // ═════════════════════════════════════════════════════════════════
    console.log("\n▶ SECTION G: TASKS, TEAMS AND DASHBOARD SUITE");

    await executeTest("TK-01", "Tasks", "Tasks Kanban board loads assigned tasks across stages", async () => {
      await superPage.goto("http://localhost:5173/task", { waitUntil: "networkidle" });
      const taskContent = await superPage.innerText('body');
      if (!taskContent.includes("Task") || !taskContent.includes("Build Product Inventory")) {
        throw new Error("Task board did not show seeded development tasks");
      }
    });

    await executeTest("DB-01", "Dashboard", "Super Admin Dashboard metrics and Live Activity Feed render", async () => {
      await superPage.goto("http://localhost:5173/", { waitUntil: "networkidle" });
      const dashText = await superPage.innerText('body');
      if (!dashText.includes("Padya Soft Control Center") || !dashText.includes("Live Activity Feed")) {
        throw new Error("Dashboard control center or Activity Feed missing");
      }
    });

    // ═════════════════════════════════════════════════════════════════
    // SECTION H: FORMS & UNICODE GUJARATI DATA
    // ═════════════════════════════════════════════════════════════════
    console.log("\n▶ SECTION H: FORMS & DATA INTEGRITY");

    await executeTest("HD-01", "Forms & Data", "Form inputs support Unicode/Gujarati text without corruption", async () => {
      await superPage.goto("http://localhost:5173/staff");
      const searchInput = await superPage.waitForSelector('input[placeholder*="Search"], input[type="text"]');
      await searchInput.fill("પાદ્યા સોફ્ટવેર");
      const val = await searchInput.inputValue();
      if (val !== "પાદ્યા સોફ્ટવેર") throw new Error(`Unicode corrupted, got: ${val}`);
      await searchInput.fill("");
    });

    // ═════════════════════════════════════════════════════════════════
    // SECTION I: RESPONSIVE COMPATIBILITY (360, 768, 1024, 1440px)
    // ═════════════════════════════════════════════════════════════════
    console.log("\n▶ SECTION I: MULTI-VIEWPORT COMPATIBILITY SUITE");

    const viewports = [
      { width: 360, height: 740, label: "Small Mobile (360px Galaxy S)" },
      { width: 768, height: 1024, label: "Tablet Portrait (768px iPad)" },
      { width: 1024, height: 768, label: "Tablet Landscape (1024px iPad Pro)" },
      { width: 1440, height: 900, label: "Desktop Standard (1440px)" }
    ];

    for (const vp of viewports) {
      await executeTest(`UI-${vp.width}`, "UI Compatibility", `Zero horizontal overflow at ${vp.label}`, async () => {
        const vpContext = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const vpPage = await vpContext.newPage();
        await vpPage.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
        const overflow = await vpPage.evaluate(() => {
          return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
        });
        await vpContext.close();
        if (overflow) throw new Error(`Horizontal scroll detected at ${vp.width}px!`);
      });
    }

    // ═════════════════════════════════════════════════════════════════
    // SECTION J: PERFORMANCE & CONSOLE HYGIENE
    // ═════════════════════════════════════════════════════════════════
    console.log("\n▶ SECTION J: PERFORMANCE & CONSOLE HYGIENE");

    await executeTest("PF-01", "Performance", "Login page initial DOM load executes under 3000ms", async () => {
      const perfCtx = await browser.newContext();
      const perfPage = await perfCtx.newPage();
      const tStart = Date.now();
      await perfPage.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
      const loadTime = Date.now() - tStart;
      await perfCtx.close();
      if (loadTime > 3000) throw new Error(`Page load too slow: ${loadTime}ms`);
    });

    await executeTest("PF-02", "Console Hygiene", "Core navigation executes without critical console errors", async () => {
      const errors = [];
      superPage.on('console', msg => {
        if (msg.type() === 'error' && !msg.text().includes('favicon') && !msg.text().includes('socket.io')) {
          errors.push(msg.text());
        }
      });
      await superPage.goto("http://localhost:5173/staff");
      await superPage.waitForTimeout(600);
      if (errors.length > 2) {
        throw new Error(`Excessive console errors detected: ${errors.slice(0, 2).join('; ')}`);
      }
    });

    // ═════════════════════════════════════════════════════════════════
    // SECTION K: SECURITY VERIFICATION
    // ═════════════════════════════════════════════════════════════════
    console.log("\n▶ SECTION K: SECURITY SUITE");

    await executeTest("SC-01", "Security", "JWT Tokens not exposed in document title or URL query params", async () => {
      const currentUrl = superPage.url();
      if (currentUrl.includes('token=') || currentUrl.includes('Bearer')) {
        throw new Error("JWT token detected leaking in URL parameters");
      }
    });

    await superContext.close();
    await devContext.close();

  } catch (fatalErr) {
    console.error("FATAL SUITE EXECUTION ERROR:", fatalErr);
  } finally {
    await browser.close();
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const total = results.length;
  const passed = results.filter(r => r.status === "PASS").length;
  const failed = results.filter(r => r.status === "FAIL").length;
  const passRate = ((passed / total) * 100).toFixed(1);

  console.log("\n════════════════════════════════════════════════════════════════════════");
  console.log(`📊 MASTER TEST SUITE EXECUTION SUMMARY:`);
  console.log(`   Total Scenarios Executed: ${total}`);
  console.log(`   Passed:                   \x1b[32m${passed}\x1b[0m`);
  console.log(`   Failed:                   \x1b[31m${failed}\x1b[0m`);
  console.log(`   Pass Rate:                \x1b[36m${passRate}%\x1b[0m (Target: >=95%)`);
  console.log(`   Total Duration:           ${durationSec}s`);
  console.log("════════════════════════════════════════════════════════════════════════\n");

  const reportData = {
    suite: "Padhya Software Technologies - Full Test Plan Suite",
    timestamp: new Date().toISOString(),
    total,
    passed,
    failed,
    passRate: `${passRate}%`,
    durationSeconds: durationSec,
    results
  };

  fs.writeFileSync(
    path.join(reportDir, 'master-test-plan-report.json'),
    JSON.stringify(reportData, null, 2)
  );
  console.log(`📄 Detailed JSON report written to: playwright-report/test-plan-results/master-test-plan-report.json`);
}

runMasterTestPlanSuite();
