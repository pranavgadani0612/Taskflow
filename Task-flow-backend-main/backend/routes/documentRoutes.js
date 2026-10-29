const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const { pool } = require("../config/mysqlDb");
const authMiddleware = require("../middleware/auth");
const { sendDocumentMail, sendAccessRequestMail } = require("../config/mail");

const APP_LINK = process.env.APP_URL || "http://localhost:5173";
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com";

// Multer disk storage for uploads
const storage = multer.diskStorage({
  destination: "./uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Helper: Format MySQL document row for frontend
function formatDocument(row, staffMap = {}, projectMap = {}) {
  // Parse content
  let parsedContent = [];
  if (row.content) {
    try {
      const c = typeof row.content === "string" ? JSON.parse(row.content) : row.content;
      if (Array.isArray(c)) {
        parsedContent = c;
      } else if (typeof c === "string") {
        parsedContent = [{ id: `p-${Date.now()}`, content: c }];
      } else {
        parsedContent = [c];
      }
    } catch (_) {
      parsedContent = [{ id: `p-${Date.now()}`, content: row.content || "" }];
    }
  } else {
    parsedContent = [{ id: `p-${Date.now()}`, content: "" }];
  }

  // Parse assignedTo
  let rawAssigned = [];
  if (row.assigned_to) {
    try {
      rawAssigned = typeof row.assigned_to === "string" ? JSON.parse(row.assigned_to) : row.assigned_to;
    } catch (_) {
      rawAssigned = [];
    }
  }
  if (!Array.isArray(rawAssigned)) {
    rawAssigned = rawAssigned ? [rawAssigned] : [];
  }

  const populatedAssigned = rawAssigned.map((item) => {
    const id = typeof item === "object" ? (item._id || item.id) : item;
    const staff = staffMap[id] || (typeof item === "object" ? item : null);
    if (staff) {
      return {
        _id: staff.id || staff._id || id,
        id: staff.id || staff._id || id,
        name: staff.name || "Staff Member",
        email: staff.email || "",
        position: staff.position || "",
      };
    }
    return {
      _id: id,
      id: id,
      name: "Staff Member",
      email: "",
      position: "",
    };
  });

  // Project object
  let projectObj = null;
  if (row.project_id && projectMap[row.project_id]) {
    const p = projectMap[row.project_id];
    projectObj = {
      _id: p.id,
      id: p.id,
      name: p.name || "Project",
    };
  } else if (row.project_id) {
    projectObj = {
      _id: row.project_id,
      id: row.project_id,
      name: "Project",
    };
  }

  return {
    _id: row.id,
    id: row.id,
    documentType: row.document_type || "Document",
    description: row.description || "",
    content: parsedContent,
    file: row.file || null,
    assignedTo: populatedAssigned,
    project: projectObj,
    access: row.access || "All",
    accessGranted: Boolean(row.access_granted),
    accessRequested: Boolean(row.access_requested),
    textType: row.text_type || "upload",
    companyId: row.company_id || "default_company",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Helper: load staff and project lookup maps
async function getLookupMaps() {
  const staffMap = {};
  const projectMap = {};
  try {
    const [staffRows] = await pool.query("SELECT id, name, email, position FROM staff");
    staffRows.forEach((s) => {
      staffMap[s.id] = s;
    });
  } catch (_) {}

  try {
    const [projRows] = await pool.query("SELECT id, name, assigned_to FROM projects");
    projRows.forEach((p) => {
      projectMap[p.id] = p;
    });
  } catch (_) {}

  return { staffMap, projectMap };
}

// ================= GET DOCUMENTS =================
router.get("/", authMiddleware, async (req, res) => {
  try {
    const isSuperAdmin =
      req.user?.email === SUPERADMIN_EMAIL ||
      req.user?.role?.name === "Super Admin";

    const userRole = (req.user?.role?.name || "").toLowerCase();
    const isCompanyOwner = userRole.includes("company owner") || userRole.includes("admin");
    const isStaff = userRole.includes("staff");
    const isManager = userRole.includes("manager");

    const { staffMap, projectMap } = await getLookupMaps();

    let conditions = ["1=1"];
    let params = [];

    // Filter by project query
    if (req.query.project && req.query.project !== "undefined") {
      conditions.push("project_id = ?");
      params.push(req.query.project);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await pool.query(
      `SELECT * FROM documents ${whereClause} ORDER BY created_at DESC`,
      params
    );

    // Format all
    const allFormatted = rows.map((r) => formatDocument(r, staffMap, projectMap));

    // Scoping for non-superadmin & non-owner
    const perms = Array.isArray(req.user?.role?.permissions) ? req.user.role.permissions : [];
    const docPerm = perms.find((p) => p.value === "document");
    const hasFullDocAccess = Boolean(docPerm?.all || (docPerm?.read && docPerm?.create && docPerm?.update));

    if (isSuperAdmin || isCompanyOwner || hasFullDocAccess) {
      const withFullAccess = allFormatted.map(d => ({ ...d, accessGranted: true }));
      return res.json(withFullAccess);
    }

    const userId = String(req.user.id || req.user._id || "");
    const userEmail = (req.user.email || "").toLowerCase().trim();

    // User's assigned projects
    const userProjectIds = Object.values(projectMap)
      .filter((p) => {
        if (!p.assigned_to) return false;
        try {
          const list = typeof p.assigned_to === "string" ? JSON.parse(p.assigned_to) : p.assigned_to;
          return list.some(
            (u) =>
              String(u._id || u.id || u) === userId ||
              (u.email && u.email.toLowerCase() === userEmail)
          );
        } catch (_) {
          return false;
        }
      })
      .map((p) => p.id);

    const allowedRoles = ["all"];
    if (isStaff) allowedRoles.push("staff");
    if (isManager) allowedRoles.push("manager");

    const filtered = allFormatted.filter((doc) => {
      // 1. Directly assigned
      const isDirectlyAssigned = (doc.assignedTo || []).some(
        (m) =>
          String(m._id || m.id) === userId ||
          (m.email && m.email.toLowerCase() === userEmail)
      );
      if (isDirectlyAssigned) return true;

      // 2. Project match
      if (doc.project?._id && userProjectIds.includes(doc.project._id)) {
        return true;
      }

      // 3. General doc (no project) and role access matches
      if (!doc.project?._id && allowedRoles.includes((doc.access || "All").toLowerCase())) {
        return true;
      }

      return false;
    });

    res.json(filtered);
  } catch (err) {
    console.error("GET documents error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= CREATE DOCUMENT =================
router.post("/", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    const { documentType, description, access, project, textType, accessGranted } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({ error: "Plese enter description" });
    }
    let assignedTo = req.body.assignedTo;
    if (assignedTo && !Array.isArray(assignedTo)) {
      assignedTo = [assignedTo];
    } else if (!assignedTo) {
      assignedTo = [];
    }

    // Normalize content
    let contentToSave = req.body.content || "";
    if (typeof contentToSave === "object") {
      contentToSave = JSON.stringify(contentToSave);
    }

    const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const filename = req.file ? req.file.filename : null;
    const companyId = req.user.companyId?._id || req.user.companyId || "default_company";

    await pool.query(
      `INSERT INTO documents (
        id, document_type, description, content, file, assigned_to,
        project_id, access, access_granted, text_type, company_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        docId,
        documentType || "Document",
        description || "",
        contentToSave,
        filename,
        JSON.stringify(assignedTo),
        project || null,
        access || "All",
        accessGranted === "true" || accessGranted === true ? 1 : 0,
        textType || "upload",
        companyId,
      ]
    );

    const { staffMap, projectMap } = await getLookupMaps();
    const [createdRows] = await pool.query("SELECT * FROM documents WHERE id = ?", [docId]);
    const populated = formatDocument(createdRows[0], staffMap, projectMap);

    // 📧 Send email notifications to assigned staff (fire-and-forget)
    if (populated.assignedTo && populated.assignedTo.length > 0) {
      const redirectPath = encodeURIComponent(`/document?view=${docId}`);
      populated.assignedTo.forEach((member) => {
        if (member.email) {
          try {
            sendDocumentMail(
              member.email,
              member.name,
              description || "",
              `${APP_LINK}/login?redirect=${redirectPath}`
            );
          } catch (_) {}
        }
      });
    }

    res.status(201).json(populated);
  } catch (err) {
    console.error("CREATE document error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= UPDATE DOCUMENT =================
router.put("/:id", authMiddleware, upload.single("file"), async (req, res) => {
  try {
    const { documentType, description, access, project, textType, accessGranted } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({ error: "Plese enter description" });
    }
    let assignedTo = req.body.assignedTo;
    if (assignedTo && !Array.isArray(assignedTo)) {
      assignedTo = [assignedTo];
    } else if (!assignedTo) {
      assignedTo = [];
    }

    let contentToSave = req.body.content || "";
    if (typeof contentToSave === "object") {
      contentToSave = JSON.stringify(contentToSave);
    }

    const [existing] = await pool.query("SELECT * FROM documents WHERE id = ?", [req.params.id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    const oldDoc = existing[0];

    let oldAssignedIds = [];
    if (oldDoc.assigned_to) {
      try {
        const parsed = typeof oldDoc.assigned_to === "string" ? JSON.parse(oldDoc.assigned_to) : oldDoc.assigned_to;
        oldAssignedIds = Array.isArray(parsed) ? parsed.map((item) => String(item._id || item.id || item)) : [];
      } catch (_) {}
    }

    let newFilename = oldDoc.file;
    if (req.file) {
      newFilename = req.file.filename;
    } else if (textType && textType !== "upload") {
      newFilename = null;
    }

    await pool.query(
      `UPDATE documents SET
        document_type = ?,
        description = ?,
        content = ?,
        file = ?,
        assigned_to = ?,
        project_id = ?,
        access = ?,
        access_granted = ?,
        text_type = ?
       WHERE id = ?`,
      [
        documentType || oldDoc.document_type,
        description !== undefined ? description : oldDoc.description,
        contentToSave || oldDoc.content,
        newFilename,
        JSON.stringify(assignedTo),
        project || null,
        access || "All",
        accessGranted === "true" || accessGranted === true ? 1 : 0,
        textType || "upload",
        req.params.id,
      ]
    );

    const { staffMap, projectMap } = await getLookupMaps();
    const [updatedRows] = await pool.query("SELECT * FROM documents WHERE id = ?", [req.params.id]);
    const doc = formatDocument(updatedRows[0], staffMap, projectMap);

    // 📧 Send email only to newly assigned members
    if (doc.assignedTo && doc.assignedTo.length > 0) {
      const redirectPath = encodeURIComponent(`/document?view=${doc._id}`);
      doc.assignedTo.forEach((member) => {
        const memberIdStr = String(member._id || member.id || "");
        if (!oldAssignedIds.includes(memberIdStr) && member.email) {
          try {
            sendDocumentMail(
              member.email,
              member.name,
              doc.description || description || "",
              `${APP_LINK}/login?redirect=${redirectPath}`
            );
          } catch (_) {}
        }
      });
    }

    res.json(doc);
  } catch (err) {
    console.error("UPDATE document error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= DELETE DOCUMENT =================
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM documents WHERE id = ?", [req.params.id]);
    res.json({ message: "Document deleted" });
  } catch (err) {
    console.error("DELETE document error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= REQUEST ACCESS =================
router.post("/:id/request-access", authMiddleware, async (req, res) => {
  try {
    const { staffMap, projectMap } = await getLookupMaps();
    const [rows] = await pool.query("SELECT * FROM documents WHERE id = ?", [req.params.id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    const doc = formatDocument(rows[0], staffMap, projectMap);
    const userId = String(req.user.id || req.user._id || "");
    const userEmail = (req.user.email || "").toLowerCase().trim();

    const isAssigned = (doc.assignedTo || []).some(
      (m) =>
        String(m._id || m.id) === userId ||
        (m.email && m.email.toLowerCase() === userEmail)
    );

    if (!isAssigned) {
      return res.status(403).json({ error: "Not assigned to this document" });
    }

    if (doc.accessGranted) {
      return res.status(400).json({ error: "Access already granted" });
    }

    await pool.query("UPDATE documents SET access_requested = 1 WHERE id = ?", [req.params.id]);

    const grantLink = `${APP_LINK}/document?grant=${doc._id}`;
    try {
      await sendAccessRequestMail(
        SUPERADMIN_EMAIL,
        req.user.name || req.user.email,
        req.user.email,
        doc.description || doc.documentType || "N/A",
        grantLink
      );
    } catch (_) {}

    const [updatedRows] = await pool.query("SELECT * FROM documents WHERE id = ?", [req.params.id]);
    const populated = formatDocument(updatedRows[0], staffMap, projectMap);

    res.json({ message: "Access request sent to admin", doc: populated });
  } catch (err) {
    console.error("REQUEST access error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= GRANT ACCESS (Superadmin only) =================
router.patch("/:id/access", authMiddleware, async (req, res) => {
  try {
    const isSuperAdmin =
      req.user?.email === SUPERADMIN_EMAIL ||
      req.user?.role?.name === "Super Admin";
    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Only superadmin can grant access" });
    }

    await pool.query(
      "UPDATE documents SET access_granted = 1, access_requested = 0 WHERE id = ?",
      [req.params.id]
    );

    const { staffMap, projectMap } = await getLookupMaps();
    const [rows] = await pool.query("SELECT * FROM documents WHERE id = ?", [req.params.id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json(formatDocument(rows[0], staffMap, projectMap));
  } catch (err) {
    console.error("GRANT access error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ================= REVOKE ACCESS (Superadmin only) =================
router.patch("/:id/revoke-access", authMiddleware, async (req, res) => {
  try {
    const isSuperAdmin =
      req.user?.email === SUPERADMIN_EMAIL ||
      req.user?.role?.name === "Super Admin";
    if (!isSuperAdmin) {
      return res.status(403).json({ error: "Only superadmin can revoke access" });
    }

    await pool.query(
      "UPDATE documents SET access_granted = 0, access_requested = 0 WHERE id = ?",
      [req.params.id]
    );

    const { staffMap, projectMap } = await getLookupMaps();
    const [rows] = await pool.query("SELECT * FROM documents WHERE id = ?", [req.params.id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    res.json(formatDocument(rows[0], staffMap, projectMap));
  } catch (err) {
    console.error("REVOKE access error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
