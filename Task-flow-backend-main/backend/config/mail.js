require("dotenv").config();
const nodemailer = require("nodemailer");

// Strong 8 character password generator
const generatePassword = () => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$!%*?&";
  let password = "";
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// Create Transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Gmail App Password
    },
  });
};

// Corporate Email Wrapper for Padhya Software Technologies
const getEmailLayout = (content, category = "Notification") => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Padhya Software Technologies</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <div style="max-width: 600px; margin: 32px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
    
    <!-- BRAND HEADER -->
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%); padding: 32px 36px; text-align: left;">
      <div style="color: #bfdbfe; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px;">
        Internal Employee Portal
      </div>
      <div style="color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.3px; line-height: 1.2;">
        Padhya Software Technologies
      </div>
      <div style="margin-top: 14px; display: inline-block; background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3); color: #ffffff; font-size: 11px; font-weight: 700; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
        ${category}
      </div>
    </div>

    <!-- MAIN BODY CONTENT -->
    <div style="padding: 36px 36px 28px 36px; line-height: 1.6; font-size: 15px; color: #334155;">
      ${content}
    </div>

    <!-- SECURITY NOTICE -->
    <div style="padding: 16px 36px; background-color: #f8fafc; border-top: 1px solid #edf2f7; font-size: 12px; color: #64748b; line-height: 1.5;">
      <strong>Security Notice:</strong> Padhya Software Technologies will never ask for your credentials via email or phone. If you suspect unauthorized activity, please contact your System Administrator.
    </div>

    <!-- FOOTER -->
    <div style="background-color: #0f172a; padding: 24px 36px; text-align: center; color: #94a3b8;">
      <div style="color: #ffffff; font-size: 13px; font-weight: 700; margin-bottom: 4px;">
        Padhya Software Technologies Pvt. Ltd.
      </div>
      <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
        Enterprise Engineering & Internal Operations
      </div>
      <div style="font-size: 11px; color: #475569; border-top: 1px solid #1e293b; padding-top: 12px;">
        © ${new Date().getFullYear()} Padhya Software Technologies Pvt. Ltd. All rights reserved.<br>
        This is an automated system notification. Replies to this address are not monitored.
      </div>
    </div>

  </div>
</body>
</html>
`;

// 1. Send Staff Login Email
const sendMail = async (to, name, position, password) => {
  try {
    const transporter = createTransporter();
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 22px; font-weight: 800;">Welcome to the Team!</h2>
        <p style="margin: 0; color: #64748b; font-size: 14px;">Your corporate portal account has been configured</p>
      </div>

      <p style="font-size: 15px; color: #1e293b;">Hello <strong>${name}</strong>,</p>
      <p style="color: #475569;">Welcome to Padhya Software Technologies. Your employee portal account is active. Use the credentials below to log in:</p>
      
      <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px 24px; margin: 24px 0; border: 1px solid #e2e8f0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-weight: 600; width: 110px;">Role / Position</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 700;">${position}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Login Email</td>
            <td style="padding: 8px 0; color: #1e293b; font-weight: 700;">${to}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Temporary Pass</td>
            <td style="padding: 8px 0; color: #2563eb; font-weight: 800; font-family: monospace; font-size: 17px;">${password}</td>
          </tr>
        </table>
      </div>
      
      <p style="color: #b91c1c; font-size: 13px; font-weight: 600; background: #fef2f2; border: 1px solid #fee2e2; padding: 12px; border-radius: 8px; text-align: center;">
        Important: Please change your password immediately after your first sign in.
      </p>
    `;

    await transporter.sendMail({
      from: `"Padhya Software Technologies" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Padhya Software Technologies | Your Account Credentials",
      html: getEmailLayout(content, "Account Provisioned"),
    });

    console.log("✅ Staff email sent to:", to);
  } catch (error) {
    console.error("❌ Staff email failed:", error.message);
  }
};

// 2. Send Task/Issue Assigned Email
const sendTaskOrIssueMail = async (to, title, description, username, status = null, type = "task") => {
  try {
    const transporter = createTransporter();
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
    
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 22px; font-weight: 800;">New ${typeLabel} Assignment</h2>
        <p style="margin: 0; color: #64748b; font-size: 14px;">An item has been assigned to your workspace</p>
      </div>

      <p style="font-size: 15px; color: #1e293b;">Hello <strong>${username}</strong>,</p>
      <p style="color: #475569;">A new ${type} has been assigned to you. Details are listed below:</p>
      
      <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px 24px; margin: 24px 0; border: 1px solid #e2e8f0;">
        <p style="margin: 0 0 10px 0; font-size: 15px;"><strong>Title:</strong> ${title}</p>
        ${description ? `<p style="margin: 0 0 10px 0; color: #475569; font-size: 14px;"><strong>Description:</strong> ${description}</p>` : ""}
        ${status ? `<p style="margin: 0; font-size: 13px;"><strong>Initial Status:</strong> <span style="background: #e0f2fe; color: #0369a1; padding: 3px 10px; border-radius: 6px; font-weight: 600;">${status}</span></p>` : ""}
      </div>
      
      <p style="color: #64748b; font-size: 14px;">Please sign in to the portal to view sprint deadlines and update task status.</p>
    `;

    await transporter.sendMail({
      from: `"Padhya Software Technologies" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Padhya Software Technologies | New ${typeLabel}: ${title}`,
      html: getEmailLayout(content, typeLabel + " Update"),
    });

    console.log(`✅ ${typeLabel} email sent to:`, to);
  } catch (error) {
    console.error(`❌ ${typeLabel} email failed:`, error.message);
  }
};

// 3. Send Project Assigned Email
const sendProjectMail = async (to, username, projectName, projectDescription, mode = "assigned") => {
  try {
    const transporter = createTransporter();
    const actionLabel = mode === "assigned" ? "Assigned" : "Updated";

    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 22px; font-weight: 800;">Project ${actionLabel}</h2>
        <p style="margin: 0; color: #64748b; font-size: 14px;">Team member project allocation notice</p>
      </div>

      <p style="font-size: 15px; color: #1e293b;">Hello <strong>${username}</strong>,</p>
      <p style="color: #475569;">You have been ${mode} to the following engineering project:</p>
      
      <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px 24px; margin: 24px 0; border: 1px solid #e2e8f0;">
        <p style="margin: 0 0 10px 0; font-size: 16px;"><strong>Project:</strong> ${projectName}</p>
        ${projectDescription ? `<p style="margin: 0; color: #475569; font-size: 14px;"><strong>Description:</strong> ${projectDescription}</p>` : ""}
      </div>
      
      <p style="color: #64748b; font-size: 14px;">You can now view project boards, sprint tasks, and test cycles on your dashboard.</p>
    `;

    await transporter.sendMail({
      from: `"Padhya Software Technologies" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Padhya Software Technologies | Project ${actionLabel}: ${projectName}`,
      html: getEmailLayout(content, "Project Allocation"),
    });

    console.log("✅ Project email sent to:", to);
  } catch (error) {
    console.error("❌ Project email failed:", error.message);
  }
};

// 4. Document Assignment Email
const sendDocumentMail = async (to, memberName, description, appLink) => {
  try {
    const transporter = createTransporter();
    
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 22px; font-weight: 800;">Document Shared</h2>
        <p style="margin: 0; color: #64748b; font-size: 14px;">A corporate document has been shared with you</p>
      </div>

      <p style="font-size: 15px; color: #1e293b;">Hi <strong>${memberName}</strong>,</p>
      <p style="color: #475569;">You have been granted access to a document in the Padhya Software Technologies repository.</p>
      
      ${description ? `
      <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 16px 20px; border-radius: 6px; margin: 24px 0;">
        <p style="margin: 0; color: #0369a1; font-weight: 700; font-size: 13px; text-transform: uppercase;">Description</p>
        <p style="margin: 4px 0 0 0; color: #0c4a6e; font-size: 14px;">${description}</p>
      </div>` : ""}
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${appLink}" style="background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%); color: #ffffff; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);">View Document</a>
      </div>
    `;

    await transporter.sendMail({
      from: `"Padhya Software Technologies" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Padhya Software Technologies | Document Shared With You",
      html: getEmailLayout(content, "Document Repository"),
    });
    console.log("✅ Document email sent to:", to);
  } catch (error) {
    console.error("❌ Document email failed:", error.message);
  }
};

// 5. Access Request Email (to Superadmin)
const sendAccessRequestMail = async (toAdmin, memberName, memberEmail, docDescription, acceptLink) => {
  try {
    const transporter = createTransporter();
    
    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 22px; font-weight: 800;">Access Approval Request</h2>
        <p style="margin: 0; color: #64748b; font-size: 14px;">An employee requested document clearance</p>
      </div>

      <p style="color: #475569;"><strong>${memberName}</strong> (<a href="mailto:${memberEmail}" style="color: #2563eb;">${memberEmail}</a>) has requested access to the following corporate file:</p>
      
      <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px 24px; margin: 24px 0; border: 1px solid #e2e8f0;">
        <p style="margin: 0; font-size: 15px;"><strong>Document:</strong> ${docDescription}</p>
      </div>
      
      <div style="text-align: center; margin: 32px 0;">
        <a href="${acceptLink}" style="background: #16a34a; color: #ffffff; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block;">Approve Access Request</a>
      </div>
    `;

    await transporter.sendMail({
      from: `"Padhya Software Technologies" <${process.env.EMAIL_USER}>`,
      to: toAdmin,
      subject: `Padhya Software Technologies | Access Request from ${memberName}`,
      html: getEmailLayout(content, "Security & Clearance"),
    });
    console.log("✅ Access request email sent to superadmin:", toAdmin);
  } catch (error) {
    console.error("❌ Access request email failed:", error.message);
  }
};

// 6. Reset Password Email (Clean, Corporate, NO EMOJIS)
const sendResetPasswordMail = async (to, username, resetLink) => {
  try {
    const transporter = createTransporter();
    
    const content = `
      <div style="margin-bottom: 24px;">
        <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 22px; font-weight: 800; letter-spacing: -0.3px;">
          Password Reset Request
        </h2>
        <p style="margin: 0; color: #64748b; font-size: 14px;">
          Action required to set a new password for your employee portal account
        </p>
      </div>

      <p style="font-size: 15px; color: #1e293b; margin-bottom: 16px;">
        Hello <strong>${username}</strong>,
      </p>

      <p style="color: #475569; line-height: 1.6; margin-bottom: 24px;">
        We received a request to reset the password associated with your account on the <strong>Padhya Software Technologies Internal Employee Portal</strong>. Click the button below to choose your new password:
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" style="background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%); color: #ffffff; padding: 14px 36px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35); letter-spacing: 0.2px;">
          Reset Password
        </a>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 20px; margin: 28px 0 20px 0;">
        <div style="font-size: 12px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">
          Security & Link Information
        </div>
        <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #64748b; line-height: 1.6;">
          <li>This reset link is valid for <strong>60 minutes</strong>.</li>
          <li>For your security, this link can only be used once.</li>
          <li>If you did not request a password reset, you can safely ignore this email; your account remains secure.</li>
        </ul>
      </div>

      <div style="font-size: 12px; color: #94a3b8; word-break: break-all; margin-top: 20px; padding-top: 16px; border-top: 1px dashed #e2e8f0;">
        If the button above does not work, copy and paste this link into your web browser:<br>
        <a href="${resetLink}" style="color: #2563eb; text-decoration: underline;">${resetLink}</a>
      </div>
    `;

    await transporter.sendMail({
      from: `"Padhya Software Technologies" <${process.env.EMAIL_USER}>`,
      to,
      subject: "Padhya Software Technologies | Password Reset Request",
      html: getEmailLayout(content, "Account Security"),
    });
    console.log("✅ Reset password email sent to:", to);
  } catch (error) {
    console.error("❌ Reset password email failed:", error.message);
  }
};

// 7. Expense / Reimbursement Status Notification Email
const sendExpenseMail = async ({ to, recipientName, title, action, amount, currency = "INR", comment, reference, appLink }) => {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.log(`ℹ️ Mail skipped (no credentials): Expense "${title}" - ${action}`);
      return;
    }
    const transporter = createTransporter();
    let badgeColor = "#2563eb";
    let statusText = "Expense Claim Update";

    if (action === "Submitted") {
      badgeColor = "#d97706";
      statusText = "New Expense Claim Submitted for Approval";
    } else if (action === "Approved") {
      badgeColor = "#16a34a";
      statusText = "Expense Claim Approved";
    } else if (action === "Partially Approved") {
      badgeColor = "#0284c7";
      statusText = "Expense Claim Partially Approved";
    } else if (action === "Rejected") {
      badgeColor = "#dc2626";
      statusText = "Expense Claim Rejected";
    } else if (action === "Paid") {
      badgeColor = "#059669";
      statusText = "Expense Claim Reimbursed (Paid)";
    }

    const content = `
      <div style="margin-bottom: 20px;">
        <h2 style="color: #0f172a; margin: 0 0 6px 0; font-size: 22px; font-weight: 800;">${statusText}</h2>
        <p style="margin: 0; color: #64748b; font-size: 14px;">Financial claims and reimbursement tracking</p>
      </div>

      <p style="font-size: 15px; color: #1e293b;">Hello <strong>${recipientName || "Team Member"}</strong>,</p>
      <p style="color: #475569;">There is an update regarding your expense claim: <strong>${title}</strong></p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid ${badgeColor}; padding: 18px 22px; border-radius: 6px; margin: 20px 0; border: 1px solid #e2e8f0; border-left-width: 4px;">
        <p style="margin: 4px 0; font-size: 14px;"><strong>Status:</strong> <span style="display:inline-block; padding: 3px 10px; border-radius: 4px; background-color: ${badgeColor}; color: #fff; font-weight:700; font-size:12px;">${action}</span></p>
        <p style="margin: 6px 0 4px 0; font-size: 14px;"><strong>Amount:</strong> ${currency} ${Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
        ${comment ? `<p style="margin: 6px 0 4px 0; font-size: 14px;"><strong>Remarks / Note:</strong> ${comment}</p>` : ""}
        ${reference ? `<p style="margin: 6px 0 4px 0; font-size: 14px;"><strong>Disbursement Reference:</strong> ${reference}</p>` : ""}
      </div>

      ${appLink ? `
      <div style="text-align: center; margin: 28px 0;">
        <a href="${appLink}" style="background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%); color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">View in Portal</a>
      </div>` : ""}
    `;

    await transporter.sendMail({
      from: `"Padhya Software Technologies" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Padhya Software Technologies | Expense Claim [${action}]: ${title}`,
      html: getEmailLayout(content, "Reimbursement Update"),
    });
    console.log(`✅ Expense email [${action}] sent to:`, to);
  } catch (error) {
    console.warn("⚠️ Expense email notification notice:", error.message);
  }
};

module.exports = {
  generatePassword,
  sendMail,
  sendTaskOrIssueMail,
  sendProjectMail,
  sendDocumentMail,
  sendAccessRequestMail,
  sendResetPasswordMail,
  sendExpenseMail
};
