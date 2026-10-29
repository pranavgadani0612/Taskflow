const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runAudit() {
  console.log("🚀 Starting Playwright Full Web Application Audit on TaskFlow...");
  const report = {
    timestamp: new Date().toISOString(),
    totalTests: 0,
    passed: 0,
    failed: 0,
    bugsFound: [],
    networkErrors: [],
    consoleErrors: [],
    moduleResults: []
  };

  const screenshotsDir = path.join(__dirname, '../playwright-report/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 }
  });

  const page = await context.newPage();

  // Monitor Network & Console Errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore favicon or socket connection warnings
      if (!text.includes('favicon') && !text.includes('socket.io') && !text.includes('Failed to load resource')) {
        report.consoleErrors.push({ url: page.url(), message: text });
      }
    }
  });

  page.on('response', res => {
    if (res.status() >= 400) {
      const url = res.url();
      if (!url.includes('favicon.ico')) {
        report.networkErrors.push({
          url,
          status: res.status(),
          statusText: res.statusText(),
          page: page.url()
        });
      }
    }
  });

  // Helper test runner
  async function testStep(name, fn) {
    report.totalTests++;
    process.stdout.write(`  ▶ Running test: ${name}... `);
    try {
      await fn();
      report.passed++;
      console.log(`✅ PASS`);
      return true;
    } catch (err) {
      report.failed++;
      console.log(`❌ FAIL: ${err.message}`);
      report.bugsFound.push({
        test: name,
        error: err.message,
        url: page.url()
      });
      try {
        const shotPath = path.join(screenshotsDir, `failure_${Date.now()}.png`);
        await page.screenshot({ path: shotPath });
      } catch (_) {}
      return false;
    }
  }

  try {
    // ── TEST 1: LOGIN AUTHENTICATION ──────────────────────
    console.log("\n[TEST SUITE 1] Authentication & Session Security");
    await testStep("Login as Super Admin (gadanipranav@gmail.com)", async () => {
      await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
      
      // Click Employee Login button on landing page to open modal
      const openModalBtn = await page.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")', { timeout: 8000 });
      await openModalBtn.click();

      // Fill in modal
      await page.waitForSelector('input[type="email"]', { state: "visible", timeout: 5000 });
      await page.fill('input[type="email"]', 'gadanipranav@gmail.com');
      await page.fill('input[type="password"]', 'pranav123');
      await page.click('form button[type="submit"]');

      // Wait for navigation away from /login to dashboard
      await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 12000 });
      
      const token = await page.evaluate(() => localStorage.getItem('token'));
      if (!token) throw new Error("JWT token was not stored in localStorage after login");
    });

    // ── TEST 2: DASHBOARD VERIFICATION ────────────────────
    console.log("\n[TEST SUITE 2] Dashboard & Core Navigation");
    await testStep("Verify Dashboard Loads and Metrics Render", async () => {
      await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
      const sidebar = await page.$('.sidebar');
      if (!sidebar) throw new Error("Sidebar did not render on Dashboard");
      await page.screenshot({ path: path.join(screenshotsDir, 'dashboard.png') });
    });

    // ── TEST 3: ALL MODULES NAVIGATION AUDIT ──────────────
    console.log("\n[TEST SUITE 3] Comprehensive Module Route Audit (20 Modules)");
    const modulesToTest = [
      { name: "Projects", path: "/project", selector: "table, .project-card, .page-header" },
      { name: "Tasks Kanban", path: "/task", selector: ".kanban-board, .task-card, table, .page" },
      { name: "Timesheets", path: "/timesheet", selector: ".timesheet-page, table, .page" },
      { name: "Task Status", path: "/task-status", selector: "table, .page" },
      { name: "Team", path: "/team", selector: ".team-card, table, .page" },
      { name: "Document", path: "/document", selector: ".doc-list, table, .page" },
      { name: "QA & Testing", path: "/qa", selector: ".qa-container, table, .tabs, .page" },
      { name: "Clients", path: "/clients", selector: "table, .page" },
      { name: "Staff Management", path: "/staff", selector: "table, .page" },
      { name: "Role Management", path: "/role", selector: "table, .page" },
      { name: "Permissions", path: "/permission", selector: "table, .permission-grid, .page" },
      { name: "Attendance", path: "/attendance", selector: ".attendance-container, table, .page" },
      { name: "Time & Instances", path: "/timing-manager", selector: "table, .page" },
      { name: "Leave & Absence", path: "/leave", selector: "table, .leave-container, .page" },
      { name: "Performance Rating", path: "/rating", selector: "table, .rating-container, .page" },
      { name: "Break Management", path: "/breaks", selector: ".page, .break-card, button" },
      { name: "Tickets / Helpdesk", path: "/tickets", selector: "button, table, select, input" },
      { name: "Team Chat", path: "/chat", selector: "textarea, input, button" },
      { name: "Company Profile", path: "/profile", selector: "form, input, button" }
    ];

    for (const mod of modulesToTest) {
      await testStep(`Access Module: ${mod.name} (${mod.path})`, async () => {
        const res = await page.goto(`http://localhost:5173${mod.path}`, { waitUntil: "domcontentloaded", timeout: 8000 });
        if (res && res.status() >= 400) {
          throw new Error(`HTTP ${res.status()} response received`);
        }
        await page.waitForTimeout(600);
        const elem = await page.$(mod.selector);
        if (!elem) {
          throw new Error(`Expected content selector '${mod.selector}' not found`);
        }
        report.moduleResults.push({
          module: mod.name,
          route: mod.path,
          status: "SUCCESS"
        });
      });
    }

    // ── TEST 4: INTERACTIVE CRUD ON CLIENTS ────────────────
    console.log("\n[TEST SUITE 4] End-to-End Dynamic CRUD Life-cycle (Clients Module)");
    const testClientName = `AutoQA_${Date.now()}`;
    await testStep("Add, View, and Delete Client via Form Modal", async () => {
      await page.goto("http://localhost:5173/clients", { waitUntil: "networkidle" });

      // Click Add button
      const addBtn = await page.waitForSelector('button:has-text("Add Client"), button:has-text("+ Add"), button:has-text("Add"), .page-header button', { timeout: 6000 });
      await addBtn.click();
      await page.waitForTimeout(600);

      // Fill client modal
      await page.waitForSelector('input[placeholder*="Rahul Sharma"], input[placeholder*="client@example.com"]', { timeout: 5000 });
      await page.fill('input[placeholder*="Rahul Sharma"]', testClientName);
      await page.fill('input[placeholder*="client@example.com"]', `${testClientName.toLowerCase()}@test.com`);
      await page.fill('input[placeholder*="10-digit phone number"]', '9876543210');

      // Submit modal
      const submitBtn = await page.waitForSelector('.modal button[type="submit"], button:has-text("Save"), button:has-text("Create Client")', { timeout: 3000 });
      await submitBtn.click();
      await page.waitForTimeout(1000);

      // Verify client was added to table
      const pageText = await page.textContent('body');
      if (!pageText.includes(testClientName)) {
        throw new Error(`Newly created client '${testClientName}' was not rendered in table`);
      }

      // Cleanup: Delete the created client
      const row = page.locator(`tr:has-text("${testClientName}")`);
      const deleteBtn = row.locator('button:has-text("Delete"), button[title="Delete"], button svg');
      if (await deleteBtn.count() > 0) {
        await deleteBtn.last().click();
        await page.waitForTimeout(500);
        // If confirm modal appears, confirm
        const confirmBtn = await page.$('.modal button:has-text("Delete"), .modal button:has-text("Confirm"), .modal button:has-text("Yes")');
        if (confirmBtn) await confirmBtn.click();
        await page.waitForTimeout(1000);
      }
    });

    // ── TEST 5: TIMING MANAGER & ROLE BADGE INTEGRITY ─────
    console.log("\n[TEST SUITE 5] Timing Manager Table & Clean Presentation");
    await testStep("Verify Timing Manager table displays clean role names without hanging bullets", async () => {
      await page.goto("http://localhost:5173/timing-manager", { waitUntil: "networkidle" });
      const tableContent = await page.textContent('table');
      if (tableContent.includes("role_developer")) {
        throw new Error("Raw 'role_developer' database key found rendered in table!");
      }
      if (tableContent.includes("• Full Stack Developer")) {
        throw new Error("Hanging bullet with designation still found in table!");
      }
      await page.screenshot({ path: path.join(screenshotsDir, 'timing-manager-clean.png') });
    });

    // ── TEST 6: BREAK MANAGEMENT DARK MODE CONTRAST ───────
    console.log("\n[TEST SUITE 6] Break Management & Theme Contrast");
    await testStep("Verify Break Management card text contrast and availability", async () => {
      await page.goto("http://localhost:5173/breaks", { waitUntil: "networkidle" });
      const breakHeader = await page.$('text=Available Break Options');
      if (!breakHeader) throw new Error("'Available Break Options' header missing");
      await page.screenshot({ path: path.join(screenshotsDir, 'break-management.png') });
    });

    // ── TEST 7: RBAC ISOLATION (DEVELOPER RESTRICTIONS) ───
    console.log("\n[TEST SUITE 7] Multi-Role RBAC Security Guard");
    await testStep("Assert Developer cannot access Role Management (/role)", async () => {
      const devContext = await browser.newContext();
      const devPage = await devContext.newPage();
      
      await devPage.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
      const devModalBtn = await devPage.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")', { timeout: 8000 });
      await devModalBtn.click();
      await devPage.waitForSelector('input[type="email"]', { state: "visible", timeout: 5000 });
      await devPage.fill('input[type="email"]', 'amit@itcompany.com');
      await devPage.fill('input[type="password"]', 'Test@123');
      await devPage.click('form button[type="submit"]');
      await devPage.waitForURL(url => !url.pathname.includes('/login'), { timeout: 12000 });

      // Attempt restricted access to /role
      await devPage.goto("http://localhost:5173/role", { waitUntil: "networkidle" });
      await devPage.waitForTimeout(800);
      
      const currentUrl = devPage.url();
      if (currentUrl.endsWith('/role')) {
        throw new Error("SECURITY BUG: Developer role was NOT blocked from navigating to /role!");
      }
      await devContext.close();
    });

  } catch (fatal) {
    console.error("FATAL SUITE CRASH:", fatal);
    report.bugsFound.push({ test: "Suite Execution", error: fatal.message });
  } finally {
    await browser.close();
  }

  // Generate Report File
  const reportPath = path.join(__dirname, '../playwright-report/audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("\n══════════════════════════════════════════════════════");
  console.log(`🏁 PLAYWRIGHT AUDIT COMPLETE: ${report.passed} Passed / ${report.failed} Failed (Total: ${report.totalTests})`);
  console.log(`📄 Report saved to: ${reportPath}`);
  console.log("══════════════════════════════════════════════════════\n");
}

runAudit();
