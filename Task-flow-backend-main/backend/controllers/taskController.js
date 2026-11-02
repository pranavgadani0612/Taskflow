const Task = require("../models/Task");
const Staff = require("../models/Staff");
const { sendTaskOrIssueMail } = require("../config/mail");

exports.createTask = async (req, res) => {
  try {
    if (!req.body.title)
      return res.status(400).json({ msg: "Title required" });

    const image = req.files?.image?.[0]?.filename || "";
    const video = req.files?.video?.[0]?.filename || "";

    let companyId = req.user.companyId?._id || req.user.companyId;
    const isSuperAdmin = req.user.email === (process.env.SUPERADMIN_EMAIL || "gadanipranav@gmail.com") || req.user.role?.name === "Super Admin";

    if (isSuperAdmin && !companyId) {
      companyId = req.body.companyId || req.query.companyId;
    }

    if (!companyId && req.body.project) {
        const Project = require("../models/Project");
        const proj = await Project.findById(req.body.project);
        if (proj) companyId = proj.companyId;
    }

    const task = await Task.create({
      title: req.body.title,
      description: req.body.description,
      assignedTo: req.body.assignedTo,
      status: req.body.status,
      project: req.body.project || null,
      priority: req.body.priority || "Medium",
      type: req.body.type || "task",
      companyId,
      image,
      video,
    });

    // Populate before emitting
    const populated = await Task.findById(task._id).populate("assignedTo status project");


    // ⚡ Emit real-time event to all connected clients
    const io = req.app.get("io");
    if (io) io.emit("task:created", populated);

    res.json(populated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTasks = async (req, res) => {
  try {
    const filter = {};
    if (req.query.project) {
      filter.project = req.query.project;
    }

    // Filter by type: 'task' or 'issue'
    // Old documents (without type field) are treated as 'task'
    if (req.query.type === "issue") {
      filter.type = "issue";
    } else if (req.query.type === "task") {
      // Show type='task' AND old documents that have no type field
      filter.$or = [
        { type: "task" },
        { type: { $exists: false } },
        { type: null }
      ];
    }

    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const companyId = req.user.companyId?._id || req.user.companyId;

    if (!isSuperAdmin) {
      if (companyId) filter.companyId = companyId;
    } else if (req.query.companyId) {
      filter.companyId = req.query.companyId;
    }

    res.json(
      await Task.find(filter).populate("assignedTo status project")
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTask = async (req, res) => {
  try {
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const companyId = req.user.companyId?._id || req.user.companyId;

    const query = { _id: req.params.id };
    if (!isSuperAdmin) query.companyId = companyId;

    const task = await Task.findOne(query).populate("assignedTo status project");
    if (!task) return res.status(404).json({ error: "Task not found" });

    res.json(task);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateTask = async (req, res) => {
  try {
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const companyId = req.user.companyId?._id || req.user.companyId;

    const query = { _id: req.params.id };
    if (!isSuperAdmin) query.companyId = companyId;

    const image = req.files?.image?.[0]?.filename;
    const video = req.files?.video?.[0]?.filename;

    const updateData = { ...req.body };
    if (image) updateData.image = image;
    if (video) updateData.video = video;
    if (req.body.project !== undefined) {
      updateData.project = req.body.project || null;
    }

    const updated = await Task.findOneAndUpdate(query, updateData, {
      new: true,
    }).populate("assignedTo status project");

    if (!updated) return res.status(404).json({ error: "Task not found" });

    // ⚡ Emit real-time event to all connected clients
    const io = req.app.get("io");
    if (io) io.emit("task:updated", updated);

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteTask = async (req, res) => {
  try {
    const isSuperAdmin = req.user.email === "gadanipranav@gmail.com" || req.user.role?.name === "Super Admin";
    const companyId = req.user.companyId?._id || req.user.companyId;

    const query = { _id: req.params.id };
    if (!isSuperAdmin) query.companyId = companyId;

    const task = await Task.findOneAndDelete(query);
    if (!task) return res.status(404).json({ error: "Task not found" });

    // ⚡ Emit real-time event to all connected clients
    const io = req.app.get("io");
    if (io) io.emit("task:deleted", { _id: req.params.id });

    res.json({ msg: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};