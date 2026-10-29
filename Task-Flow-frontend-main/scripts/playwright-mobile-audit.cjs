const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runMobileAudit() {
  console.log("📱 Starting Playwright Mobile Viewport Audit...");

  const screenshotsDir = path.join(__dirname, '../playwright-report/mobile-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // Use iPhone 14 mobile device emulation
  const pixel7 = devices['Pixel 7'] || {
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...pixel7
  });

  const page = await context.newPage();
  const mobileIssues = [];

  async function checkPageOverflow(pageName) {
    const overflow = await page.evaluate(() => {
      const docWidth = document.documentElement.clientWidth;
      const scrollWidth = document.documentElement.scrollWidth;
      return {
        hasHorizontalScrollbar: scrollWidth > docWidth + 5,
        diff: scrollWidth - docWidth
      };
    });
    if (overflow.hasHorizontalScrollbar) {
      mobileIssues.push({
        page: pageName,
        issue: `Horizontal page overflow detected (+${overflow.diff}px outside viewport)`
      });
      console.log(`  ⚠️ Warning: Horizontal overflow on ${pageName} (+${overflow.diff}px)`);
    } else {
      console.log(`  ✅ ${pageName} perfectly fits mobile width`);
    }
  }

  try {
    // 1. LOGIN LANDING PAGE (MOBILE)
    console.log("\n[1] Checking /login Mobile View...");
    await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(screenshotsDir, '01_login_landing_mobile.png'), fullPage: false });
    await checkPageOverflow("/login Landing");

    // Open Login Modal on Mobile
    const openModalBtn = await page.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")', { timeout: 8000 });
    await openModalBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, '02_login_modal_mobile.png') });
    await checkPageOverflow("/login Modal");

    // Perform Login
    await page.fill('input[type="email"]', 'gadanipranav@gmail.com');
    await page.fill('input[type="password"]', 'pranav123');
    await page.click('form button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 12000 });

    // 2. DASHBOARD MOBILE VIEW & HAMBURGER MENU
    console.log("\n[2] Checking Dashboard & Mobile Sidebar Drawer...");
    await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(screenshotsDir, '03_dashboard_mobile.png') });
    await checkPageOverflow("Dashboard");

    // Scroll down to Live Activity Feed
    const feedHeader = await page.waitForSelector('text=Live Activity Feed', { timeout: 5000 }).catch(() => null);
    if (feedHeader) {
      await feedHeader.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(screenshotsDir, '03_activity_feed_mobile.png') });
    }

    // Check Hamburger Button
    const hamburger = await page.$('.mobile-hamburger-btn, .menu-btn, .mobile-toggle');
    if (hamburger) {
      await hamburger.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(screenshotsDir, '04_sidebar_drawer_open_mobile.png') });
      console.log("  ✅ Hamburger menu toggled mobile drawer successfully");

      // Close mobile drawer
      const closeBtn = await page.$('.mobile-sidebar-close-btn, .sidebar.mobile-open button, .sidebar-overlay');
      if (closeBtn) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    }

    // 3. TIME & INSTANCES TABLE MOBILE VIEW
    console.log("\n[3] Checking /timing-manager Table on Mobile...");
    await page.goto("http://localhost:5173/timing-manager", { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(screenshotsDir, '05_timing_manager_mobile.png'), fullPage: false });
    await checkPageOverflow("Timing Manager");

    // 4. BREAK MANAGEMENT MOBILE VIEW
    console.log("\n[4] Checking /breaks Page on Mobile...");
    await page.goto("http://localhost:5173/breaks", { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(screenshotsDir, '06_breaks_page_mobile.png'), fullPage: false });
    await checkPageOverflow("Break Management");

    // 5. TASKS KANBAN MOBILE VIEW
    console.log("\n[5] Checking /task Kanban on Mobile...");
    await page.goto("http://localhost:5173/task", { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(screenshotsDir, '07_tasks_mobile.png'), fullPage: false });
    await checkPageOverflow("Tasks Kanban");

    // 6. ATTENDANCE MOBILE VIEW
    console.log("\n[6] Checking /attendance Page on Mobile...");
    await page.goto("http://localhost:5173/attendance", { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(screenshotsDir, '08_attendance_mobile.png'), fullPage: false });
    await checkPageOverflow("Attendance");

  } catch (err) {
    console.error("Mobile Audit Error:", err);
    mobileIssues.push({ page: page.url(), issue: err.message });
  } finally {
    await browser.close();
  }

  console.log("\n══════════════════════════════════════════════════════");
  console.log("📱 MOBILE AUDIT SUMMARY:");
  if (mobileIssues.length === 0) {
    console.log("✅ Zero mobile layout issues detected! All pages are responsive.");
  } else {
    console.log(`⚠️ Detected ${mobileIssues.length} mobile issue(s):`);
    mobileIssues.forEach((item, idx) => console.log(`  ${idx + 1}. [${item.page}] ${item.issue}`));
  }
  console.log(`📸 Mobile screenshots saved to: ${screenshotsDir}`);
  console.log("══════════════════════════════════════════════════════\n");
}

runMobileAudit();
