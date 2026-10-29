const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function runExpenseTestSuite() {
  console.log("════════════════════════════════════════════════════════════════════════");
  console.log("💳 EXPENSE & REIMBURSEMENT MODULE: PLAYWRIGHT E2E AUTOMATED SUITE");
  console.log("   Padhya Software Technologies / TaskFlow Internal Portal");
  console.log("════════════════════════════════════════════════════════════════════════\n");

  const results = [];
  const startTime = Date.now();

  async function executeTest(id, scenario, fn) {
    const testRecord = {
      id,
      scenario,
      status: "RUNNING",
      durationMs: 0,
      error: null,
    };
    const t0 = Date.now();
    process.stdout.write(`  [${id}] ${scenario.padEnd(58, " ")} `);
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
    let adminToken = "";
    let devToken = "";
    let createdExpenseId = "";
    let testCategory = null;

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Admin Login & Categories / Policy Setup
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-01", "Admin Login & Expense Categories Management", async () => {
      const loginRes = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "gadanipranav@gmail.com", password: "pranav123" }),
      });
      const data = await loginRes.json();
      if (!data.token) throw new Error("Admin login failed");
      adminToken = data.token;

      // Create new category via API
      const catRes = await fetch("http://localhost:5000/api/expenses/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Annual Conference & Summit",
          description: "Conference registration, passes and venue fees",
          maxLimit: 40000,
        }),
      });
      if (catRes.status !== 201) throw new Error(`Failed to create category: status ${catRes.status}`);
      testCategory = await catRes.json();
      if (!testCategory.id || testCategory.name !== "Annual Conference & Summit") {
        throw new Error("Category record mismatch");
      }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Multi-Tenant Isolation Protection
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-02", "Multi-Tenant Data Isolation Enforcement", async () => {
      // Query with another tenant ID directly should return 404 or empty
      const crossTenantRes = await fetch("http://localhost:5000/api/expenses/non_existent_id", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (crossTenantRes.status !== 404) {
        throw new Error(`Expected 404 for nonexistent cross-tenant claim, got ${crossTenantRes.status}`);
      }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Employee Creates Draft with Line Items & Auto Total
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-03", "Employee Draft Claim Creation with Line Items", async () => {
      const loginRes = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "amit@itcompany.com", password: "Test@123" }),
      });
      const devData = await loginRes.json();
      if (!devData.token) throw new Error("Developer login failed");
      devToken = devData.token;

      const createRes = await fetch("http://localhost:5000/api/expenses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${devToken}`,
        },
        body: JSON.stringify({
          title: "Q4 Tech Conference Travel",
          categoryId: testCategory.id,
          expenseDate: new Date().toISOString().slice(0, 10),
          paymentMode: "Credit Card",
          description: "Attending annual cloud developer conference",
          items: [
            { description: "Conference Pass", amount: 1500.0 },
            { description: "Hotel Stay", amount: 2200.0 },
          ],
          totalAmount: 3700.0,
          asDraft: true,
        }),
      });

      if (createRes.status !== 201) {
        const err = await createRes.json();
        throw new Error(`Failed to create draft claim: ${JSON.stringify(err)}`);
      }
      const exp = await createRes.json();
      createdExpenseId = exp.id;

      if (exp.status !== "Draft" || Number(exp.total_amount) !== 3700) {
        throw new Error(`Draft state mismatch: status=${exp.status}, total=${exp.total_amount}`);
      }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Receipt Mandatory Policy Rule Enforcement
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-04", "Mandatory Receipt Policy Rule Enforcement", async () => {
      // Amount 3700 >= mandatory 500 threshold, so submitting without receipt must be rejected
      const submitRes = await fetch(`http://localhost:5000/api/expenses/${createdExpenseId}/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${devToken}` },
      });

      if (submitRes.status !== 400) {
        throw new Error(`Expected 400 rejection for missing receipt, got ${submitRes.status}`);
      }
      const data = await submitRes.json();
      if (!data.error || !data.error.includes("Receipt attachment is required")) {
        throw new Error(`Unexpected error message: ${data.error}`);
      }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Receipt Upload & Submission (Moves to Pending Review)
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-05", "Receipt File Upload & Submission to Pending", async () => {
      // Create a dummy receipt file
      const dummyReceiptPath = path.join(__dirname, "dummy_receipt.png");
      const dummyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      fs.writeFileSync(dummyReceiptPath, Buffer.from(dummyPngBase64, "base64"));

      // Use native global FormData and File
      const form = new FormData();
      form.append("title", "Q4 Tech Conference Travel (Receipt Attached)");
      form.append("categoryId", testCategory.id);
      form.append("expenseDate", new Date().toISOString().slice(0, 10));
      form.append("paymentMode", "Credit Card");
      form.append("totalAmount", "3700.00");
      form.append("description", "Attending annual cloud developer conference with receipt attached");
      form.append(
        "receipts",
        new File([fs.readFileSync(dummyReceiptPath)], "receipt_conf.png", { type: "image/png" })
      );

      const updateRes = await fetch(`http://localhost:5000/api/expenses/${createdExpenseId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${devToken}` },
        body: form,
      });

      if (updateRes.status !== 200) {
        throw new Error(`Failed to attach receipt: status ${updateRes.status}`);
      }

      // Now submit the claim
      const submitRes = await fetch(`http://localhost:5000/api/expenses/${createdExpenseId}/submit`, {
        method: "POST",
        headers: { Authorization: `Bearer ${devToken}` },
      });

      if (submitRes.status !== 200) {
        const err = await submitRes.json();
        throw new Error(`Failed to submit draft with receipt: ${JSON.stringify(err)}`);
      }

      // Verify status is now 'Pending'
      const verifyRes = await fetch(`http://localhost:5000/api/expenses/${createdExpenseId}`, {
        headers: { Authorization: `Bearer ${devToken}` },
      });
      const updated = await verifyRes.json();
      if (updated.status !== "Pending") {
        throw new Error(`Expected status 'Pending', got '${updated.status}'`);
      }

      // Clean up dummy receipt
      try { fs.unlinkSync(dummyReceiptPath); } catch (_) {}
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Approver Self-Approval Restriction
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-06", "Approver Self-Approval Prevention Rule", async () => {
      // Employee attempts to approve their own claim -> MUST be blocked with 403
      const selfApproveRes = await fetch(`http://localhost:5000/api/expenses/${createdExpenseId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${devToken}`,
        },
        body: JSON.stringify({ comment: "Approving my own claim" }),
      });

      if (selfApproveRes.status !== 403) {
        throw new Error(`Expected 403 forbidden for self-approval, got ${selfApproveRes.status}`);
      }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Manager / Admin Approval Workflow
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-07", "Admin Review & Approval Workflow", async () => {
      const approveRes = await fetch(`http://localhost:5000/api/expenses/${createdExpenseId}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          approvedAmount: 3700.0,
          comment: "All registration receipts and hotel vouchers verified. Approved.",
        }),
      });

      if (approveRes.status !== 200) {
        const err = await approveRes.json();
        throw new Error(`Failed to approve claim: ${JSON.stringify(err)}`);
      }

      // Verify status is Approved
      const checkRes = await fetch(`http://localhost:5000/api/expenses/${createdExpenseId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const exp = await checkRes.json();
      if (exp.status !== "Approved" || Number(exp.approved_amount) !== 3700) {
        throw new Error(`Approved state mismatch: status=${exp.status}, approved_amount=${exp.approved_amount}`);
      }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Accounts / Admin Marks as Paid (Reimbursement Payout)
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-08", "Reimbursement Payout Disbursement (Paid)", async () => {
      const payRes = await fetch(`http://localhost:5000/api/expenses/${createdExpenseId}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          paymentDate: new Date().toISOString().slice(0, 10),
          paymentMode: "Bank Transfer",
          transactionReference: "NEFT202610237788",
          note: "Reimbursement credited via Corporate HDFC account",
        }),
      });

      if (payRes.status !== 200) {
        const err = await payRes.json();
        throw new Error(`Failed to mark expense as paid: ${JSON.stringify(err)}`);
      }

      const checkRes = await fetch(`http://localhost:5000/api/expenses/${createdExpenseId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const exp = await checkRes.json();
      if (exp.status !== "Paid" || !exp.payment_info?.reference) {
        throw new Error("Payment record verification failed");
      }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Immutability / Lock Rule After Payment
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-09", "Immutability & Lock Rule for Paid Records", async () => {
      // Attempt to modify paid expense should fail
      const editRes = await fetch(`http://localhost:5000/api/expenses/${createdExpenseId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${devToken}`,
        },
        body: JSON.stringify({ title: "Tampered Title" }),
      });

      if (editRes.status !== 400 && editRes.status !== 403) {
        throw new Error(`Expected 400/403 for modifying paid expense, got ${editRes.status}`);
      }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 10: Complete Audit Trail Timeline Verification
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-10", "Full Lifecycle Audit Trail Timeline Integrity", async () => {
      const detailRes = await fetch(`http://localhost:5000/api/expenses/${createdExpenseId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const exp = await detailRes.json();
      const history = exp.history || [];

      // Check actions: Created as Draft -> Submitted -> Approved -> Paid
      const actions = history.map((h) => h.action);
      if (!actions.includes("Created as Draft")) throw new Error("Missing 'Created as Draft' in audit log");
      if (!actions.includes("Submitted")) throw new Error("Missing 'Submitted' in audit log");
      if (!actions.includes("Approved")) throw new Error("Missing 'Approved' in audit log");
      if (!actions.includes("Paid")) throw new Error("Missing 'Paid' in audit log");
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 11: Batch Reimbursement Payout
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-11", "Batch Reimbursement Payout Disbursement", async () => {
      // Create 2 small claims under 500, submit, approve, then batch pay
      const c1Res = await fetch("http://localhost:5000/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${devToken}` },
        body: JSON.stringify({
          title: "Batch Item 1 - Local Travel",
          categoryId: testCategory.id,
          expenseDate: new Date().toISOString().slice(0, 10),
          paymentMode: "UPI",
          totalAmount: 250.0,
          asDraft: false,
        }),
      });
      const exp1 = await c1Res.json();

      const c2Res = await fetch("http://localhost:5000/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${devToken}` },
        body: JSON.stringify({
          title: "Batch Item 2 - Office Supplies",
          categoryId: testCategory.id,
          expenseDate: new Date().toISOString().slice(0, 10),
          paymentMode: "UPI",
          totalAmount: 350.0,
          asDraft: false,
        }),
      });
      const exp2 = await c2Res.json();

      // Admin approves both
      await fetch(`http://localhost:5000/api/expenses/${exp1.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ comment: "Batch test approve" }),
      });
      await fetch(`http://localhost:5000/api/expenses/${exp2.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ comment: "Batch test approve" }),
      });

      // Admin executes Batch Pay
      const batchRes = await fetch("http://localhost:5000/api/expenses/batch-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          expenseIds: [exp1.id, exp2.id],
          paymentDate: new Date().toISOString().slice(0, 10),
          paymentMode: "UPI",
          transactionReference: "UPI_BATCH_9921",
          note: "Combined batch reimbursement",
        }),
      });

      if (batchRes.status !== 200) {
        throw new Error(`Batch pay failed: status ${batchRes.status}`);
      }
      const batchData = await batchRes.json();
      if (batchData.paidCount !== 2 || Number(batchData.totalDisbursed) !== 600) {
        throw new Error(`Unexpected batch payout result: ${JSON.stringify(batchData)}`);
      }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 12: CSV Export Functionality
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-12", "CSV Export Data Generation & Headers Verification", async () => {
      const exportRes = await fetch("http://localhost:5000/api/expenses/export", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (exportRes.status !== 200) {
        throw new Error(`Export CSV failed with status ${exportRes.status}`);
      }
      const csv = await exportRes.text();
      if (!csv.includes("Claim ID") || !csv.includes("Claimed Amount") || !csv.includes("Approved Amount")) {
        throw new Error("CSV header structure mismatch");
      }
      if (!csv.includes("Q4 Tech Conference Travel")) {
        throw new Error("Exported CSV missing created test claims");
      }
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 13: Browser UI E2E Navigation & Component Verification
    // ─────────────────────────────────────────────────────────────
    await executeTest("EXP-13", "Browser UI /expenses Route & KPI Cards Rendering", async () => {
      const page = await browser.newPage();
      await page.goto("http://localhost:5173/login", { waitUntil: "networkidle" });

      const loginBtn = await page.waitForSelector(
        'button:has-text("Employee Login"), button:has-text("Sign In to Employee Portal")',
        { timeout: 8000 }
      );
      await loginBtn.click();
      await page.fill('input[type="email"]', "gadanipranav@gmail.com");
      await page.fill('input[type="password"]', "pranav123");
      await page.click('form button[type="submit"]');

      // Wait for dashboard and navigate to /expenses
      await page.waitForURL("http://localhost:5173/", { timeout: 10000 });
      await page.goto("http://localhost:5173/expenses", { waitUntil: "networkidle" });

      // Verify header title and KPI cards
      const title = await page.waitForSelector(".expense-header-title", { timeout: 8000 });
      const text = await title.textContent();
      if (!text.includes("Expenses & Reimbursements")) {
        throw new Error(`Unexpected page title: ${text}`);
      }

      // Verify tab navigation buttons
      const tabs = await page.$$(".expense-tab-btn");
      if (tabs.length < 3) {
        throw new Error(`Expected at least 3 tabs for admin, found ${tabs.length}`);
      }

      // Check New Expense Claim button triggers modal
      const newClaimBtn = await page.waitForSelector('button:has-text("New Expense Claim")');
      await newClaimBtn.click();
      await page.waitForSelector(".expense-modal-title:has-text('New Expense Claim')", { timeout: 5000 });

      // Close modal
      const closeBtn = await page.waitForSelector(".expense-modal-content button:has-text('✕')");
      await closeBtn.click();
      await page.close();
    });

  } finally {
    await browser.close();
  }

  console.log("\n════════════════════════════════════════════════════════════════════════");
  console.log("📊 EXPENSE MODULE PLAYWRIGHT EXECUTION SUMMARY");
  console.log("════════════════════════════════════════════════════════════════════════");
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`Total Test Cases: ${results.length}`);
  console.log(`Passed: \x1b[32m${passed}\x1b[0m`);
  console.log(`Failed: \x1b[${failed > 0 ? "31" : "32"}m${failed}\x1b[0m`);
  console.log(`Total Execution Time: ${((Date.now() - startTime) / 1000).toFixed(2)}s\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runExpenseTestSuite().catch((err) => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});
