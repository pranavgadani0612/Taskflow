const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  console.log("1. Navigating to login...");
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  const loginBtn = await page.waitForSelector('button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")');
  await loginBtn.click();
  await page.fill('input[type="email"]', 'gadanipranav@gmail.com');
  await page.fill('input[type="password"]', 'pranav123');
  await page.click('form button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/login'));

  console.log("2. Navigating to /staff...");
  await page.goto('http://localhost:5173/staff', { waitUntil: 'networkidle' });
  const addStaffBtn = await page.waitForSelector('button:has-text("+ Add Staff")');
  await addStaffBtn.click();

  console.log("3. Waiting for password input in Add Staff modal...");
  const pwdInput = await page.waitForSelector('input[placeholder*="password"]');
  await pwdInput.fill('SecureSecret123');
  await page.waitForTimeout(300);

  const screenshotPath1 = path.join(__dirname, '../playwright-report/mobile-screenshots/test_password_eye_hidden.png');
  await page.screenshot({ path: screenshotPath1 });

  const eyeBtn = await page.$('button[aria-label="Show password"]');
  console.log("Eye button detected:", !!eyeBtn);
  if (eyeBtn) {
    await eyeBtn.click();
    await page.waitForTimeout(300);
    const inputType = await pwdInput.getAttribute('type');
    console.log("Password input type after click:", inputType);
    const screenshotPath2 = path.join(__dirname, '../playwright-report/mobile-screenshots/test_password_eye_revealed.png');
    await page.screenshot({ path: screenshotPath2 });
  }

  await browser.close();
  console.log("Done testing password eye toggle!");
})();
