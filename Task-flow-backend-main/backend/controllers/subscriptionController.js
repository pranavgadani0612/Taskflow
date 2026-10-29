const Subscription = require("../models/Subscription");
const Company = require("../models/Company");
const Task = require("../models/Task");
const Staff = require("../models/Staff");
const Project = require("../models/Project");
const Document = require("../models/Document");

const getCompanyId = (req) => req.user?.companyId?._id || req.user?.companyId;

// GET all plans (public)
exports.getPlans = async (req, res) => {
  try {
    const plans = await Subscription.find({ isActive: true }).sort({ price: 1 });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET single plan by ID
exports.getPlanById = async (req, res) => {
  try {
    const plan = await Subscription.findById(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET current company subscription
exports.getCurrentSubscription = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const company = await Company.findById(companyId).populate("subscription");
    if (!company) return res.status(404).json({ error: "Company not found" });

    if (company.subscriptionExpiry && new Date() > company.subscriptionExpiry) {
      company.subscriptionStatus = "expired";
      await company.save();
    }

    res.json({
      plan: company.subscription,
      status: company.subscriptionStatus,
      expiry: company.subscriptionExpiry
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST upgrade/change subscription plan
exports.upgradePlan = async (req, res) => {
  try {
    const { planId } = req.body;
    const companyId = getCompanyId(req);
    const company = await Company.findById(companyId);
    if (!company) return res.status(404).json({ error: "Company not found" });

    const plan = await Subscription.findById(planId);
    if (!plan) return res.status(404).json({ error: "Plan not found" });

    const expiry = new Date();
    if (plan.billingCycle === "monthly") expiry.setMonth(expiry.getMonth() + 1);
    else if (plan.billingCycle === "quarterly") expiry.setMonth(expiry.getMonth() + 3);
    else if (plan.billingCycle === "yearly") expiry.setFullYear(expiry.getFullYear() + 1);

    company.subscription = plan._id;
    company.subscriptionStatus = plan.price === 0 ? "trial" : "active";
    company.subscriptionExpiry = expiry;
    await company.save();

    res.json({ message: `Plan upgraded to ${plan.name} successfully`, plan, expiry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET usage stats for current company
exports.getUsageStats = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const company = await Company.findById(companyId).populate("subscription");
    if (!company) return res.status(404).json({ error: "Company not found" });

    const plan = company.subscription;

    const [staffCount, taskCount, projectCount, documentCount] = await Promise.all([
      Staff.countDocuments({ companyId }),
      Task.countDocuments({ companyId }),
      Project.countDocuments({ companyId }),
      Document.countDocuments({ companyId })
    ]);

    res.json({
      plan,
      usage: { staff: staffCount, tasks: taskCount, projects: projectCount, documents: documentCount },
      limits: plan ? {
        maxStaff: plan.maxStaff,
        maxTasks: plan.maxTasks,
        maxProjects: plan.maxProjects,
        maxDocuments: plan.maxDocuments
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= ADMMIN ACTIONS (SUPER ADMIN ONLY) =================

// POST create a new plan
exports.createPlan = async (req, res) => {
  try {
    const { name, price } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Plese enter plan name" });
    }
    if (price === undefined || price === null || price === "" || isNaN(Number(price))) {
      return res.status(400).json({ error: "Plese enter price" });
    }
    const plan = new Subscription(req.body);
    await plan.save();
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT update an existing plan
exports.updatePlan = async (req, res) => {
  try {
    const { name, price } = req.body;
    if (name !== undefined && !name.trim()) {
      return res.status(400).json({ error: "Plese enter plan name" });
    }
    if (price !== undefined && (price === "" || isNaN(Number(price)))) {
      return res.status(400).json({ error: "Plese enter price" });
    }
    const plan = await Subscription.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// DELETE a plan (soft delete/isActive toggle recommended but here we do actual delete or as per user requirement)
exports.deletePlan = async (req, res) => {
  try {
    const plan = await Subscription.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ error: "Plan not found" });
    res.json({ message: "Plan deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
