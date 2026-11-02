const express = require("express");
const router = express.Router();
const companyController = require("../controllers/companyController");
const authMiddleware = require("../middleware/auth");
const { checkPermission } = require("../middleware/permissions");
const upload = require("../middleware/upload");

// Public Registration
router.post("/register", upload.single("appLogo"), companyController.registerCompany);

// Protected CRUD (Superadmin mostly, or specifically assigned roles)
// The user said Company List Page is ONLY for superadmin.
router.get("/", authMiddleware, checkPermission("company_management", "read"), companyController.getCompanies);
router.post("/", authMiddleware, checkPermission("company_management", "create"), upload.single("appLogo"), companyController.createCompany);
router.get("/:id",authMiddleware, checkPermission("company_management", "read"), companyController.getCompanyById);
router.put("/:id", authMiddleware, checkPermission("company_management", "update"), upload.single("appLogo"), companyController.updateCompany);
router.delete("/:id", authMiddleware, checkPermission("company_management", "delete"), companyController.deleteCompany);

module.exports = router;
