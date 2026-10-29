const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { checkPermission } = require("../middleware/permissions");
const taskStatusController = require("../controllers/taskStatusController");

// GET all statuses
router.get("/", authMiddleware, taskStatusController.getAll);

// CREATE status
router.post("/", authMiddleware, checkPermission("task_status_management", "create"), taskStatusController.create);

// UPDATE status
router.put("/:id", authMiddleware, checkPermission("task_status_management", "update"), taskStatusController.update);

// DELETE status
router.delete("/:id", authMiddleware, checkPermission("task_status_management", "delete"), taskStatusController.remove);

module.exports = router;