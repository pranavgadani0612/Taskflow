const express = require("express");
const router = express.Router();

const projectController = require("../controllers/projectController");
const { checkPermission } = require("../middleware/permissions");
const authMiddleware = require("../middleware/auth");

// GET ALL
router.get("/", authMiddleware, projectController.getProjects);

// GET SINGLE
router.get("/:id", authMiddleware, checkPermission("project_management", "read"), projectController.getProject);

// CREATE
router.post("/", authMiddleware, checkPermission("project_management", "create"),projectController.createProject);

// UPDATE
router.put("/:id", authMiddleware, checkPermission("project_management", "update"), projectController.updateProject);

// DELETE
router.delete("/:id", authMiddleware, checkPermission("project_management", "delete"), projectController.deleteProject);

module.exports = router;
