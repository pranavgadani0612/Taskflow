import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { useToast } from "../contexts/ToastContext";
import { useSocket } from "../contexts/SocketContext";
import {
  IconBuilding,
  IconUser,
  IconPaperclip,
  IconEdit,
  IconTrash,
  IconX,
  IconFileText,
  IconCheck,
  FolderIcon,
  DownloadIcon,
} from "../components/common/Icons";
import Pagination from "../components/common/Pagination";
import ConfirmModal from "../components/common/ConfirmModal";
import { useTableSort, SortIndicator } from "../utils/tableSort";
import "../style/expenses.css";

export default function Expenses() {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { showToast } = useToast();
  const { socket } = useSocket();

  const [confirmConfig, setConfirmConfig] = useState({
    show: false,
    title: "Confirmation",
    message: "",
    onConfirm: () => {},
    confirmText: "Confirm",
    confirmColor: "var(--danger-color)"
  });

  const askConfirm = (title, message, onConfirm, confirmText = "Delete", confirmColor = "var(--danger-color)") => {
    setConfirmConfig({
      show: true,
      title,
      message,
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, show: false }));
        await onConfirm();
      },
      confirmText,
      confirmColor
    });
  };

  // Role Checks
  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isCompanyOwner = user?.role?.name === "Company Owner";
  const userRoleName = (user?.role?.name || user?.role || "").toLowerCase();

  const canApprove = isSuperAdmin || isCompanyOwner || userRoleName.includes("manager") || hasPermission("expense_management", "update") || hasPermission("expense_management", "approve");
  const canPay = isSuperAdmin || isCompanyOwner || userRoleName.includes("accounts") || userRoleName.includes("finance") || hasPermission("expense_management", "update") || hasPermission("expense_management", "pay");
  const canManagePolicy = isSuperAdmin || isCompanyOwner || hasPermission("expense_management", "all");

  // Tabs: "my_claims", "approvals", "payouts", "analytics", "settings"
  const [activeTab, setActiveTab] = useState("my_claims");

  // Data states
  const [loading, setLoading] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const { sortedData: sortedExpenses, sortConfig: expSortConfig, requestSort: requestExpSort } = useTableSort(expenses, "expense_date", "desc");
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [projects, setProjects] = useState([]);
  const [policy, setPolicy] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [staffList, setStaffList] = useState([]);
  const [kpiViewMode, setKpiViewMode] = useState("company");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [detailExpense, setDetailExpense] = useState(null);
  const [reviewExpense, setReviewExpense] = useState(null);
  const [payExpense, setPayExpense] = useState(null);
  const [batchPaySelected, setBatchPaySelected] = useState([]);
  const [showBatchPayModal, setShowBatchPayModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState({ show: false, category: null });

  // Create / Edit Form State
  const initialForm = {
    title: "",
    categoryId: "",
    projectId: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    paymentMode: "UPI",
    description: "",
    totalAmount: "",
    items: [{ id: "item_1", description: "", amount: "" }],
    receipts: [],
    existingReceipts: [],
  };
  const [formData, setFormData] = useState(initialForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Review Form State (Approve / Reject)
  const [reviewAction, setReviewAction] = useState("approve_full");
  const [partialAmount, setPartialAmount] = useState("");
  const [reviewComment, setReviewComment] = useState("");

  // Payment Form State
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMode: "Bank Transfer",
    transactionReference: "",
    note: "",
  });

  // Policy Form State
  const [policyForm, setPolicyForm] = useState({
    maxAmountPerExpense: 50000,
    maxAmountPerMonth: 200000,
    receiptMandatoryAbove: 500,
    allowFutureDates: false,
    duplicateDetection: true,
  });

  // Category Edit Form
  const [catForm, setCatForm] = useState({ name: "", description: "", maxLimit: "", isActive: true });

  const printVoucherRef = useRef(null);

  // ── Fetch Categories & Policy & Projects & Staff ──
  const fetchMetadata = useCallback(async () => {
    try {
      const [catRes, polRes, projRes, staffRes] = await Promise.allSettled([
        API.get("/expenses/categories?all=true"),
        API.get("/expenses/policy"),
        API.get("/projects"),
        API.get("/staff"),
      ]);

      if (catRes.status === "fulfilled" && Array.isArray(catRes.value.data)) {
        setCategories(catRes.value.data);
      }
      if (polRes.status === "fulfilled" && polRes.value.data) {
        setPolicy(polRes.value.data);
        setPolicyForm({
          maxAmountPerExpense: polRes.value.data.max_amount_per_expense || 50000,
          maxAmountPerMonth: polRes.value.data.max_amount_per_month || 200000,
          receiptMandatoryAbove: polRes.value.data.receipt_mandatory_above || 500,
          allowFutureDates: Boolean(polRes.value.data.allow_future_dates),
          duplicateDetection: Boolean(polRes.value.data.duplicate_detection),
        });
      }
      if (projRes.status === "fulfilled" && Array.isArray(projRes.value.data)) {
        setProjects(projRes.value.data);
      }
      if (staffRes.status === "fulfilled") {
        const staffData = Array.isArray(staffRes.value.data) ? staffRes.value.data : staffRes.value.data?.staff || [];
        setStaffList(staffData);
      }
    } catch (err) {
      console.error("Failed to load expense metadata:", err);
    }
  }, []);

  // ── Fetch Expenses List & Summary ──
  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };

      if (activeTab === "approvals") {
        params.status = "Pending";
      } else if (activeTab === "payouts") {
        params.status = "Approved";
      } else if (statusFilter !== "All") {
        params.status = statusFilter;
      }

      if (categoryFilter) params.categoryId = categoryFilter;
      if (projectFilter) params.projectId = projectFilter;
      if (employeeFilter) params.employeeId = employeeFilter;
      if (searchQuery.trim() && searchQuery.trim().length >= 3) params.search = searchQuery.trim();
      if (dateRange.start) params.startDate = dateRange.start;
      if (dateRange.end) params.endDate = dateRange.end;

      const [listRes, summaryRes] = await Promise.all([
        API.get("/expenses", { params }),
        API.get("/expenses/summary"),
      ]);

      if (listRes.data) {
        setExpenses(listRes.data.expenses || []);
        if (listRes.data.pagination) {
          setPagination((prev) => ({
            ...prev,
            total: listRes.data.pagination.total,
            totalPages: listRes.data.pagination.totalPages,
          }));
        }
      }
      if (summaryRes.data) {
        setSummary(summaryRes.data);
      }
    } catch (err) {
      console.error("Failed to load expenses:", err);
      showToast(err.response?.data?.error || "Failed to load expenses", "error");
    } finally {
      setLoading(false);
    }
  }, [activeTab, statusFilter, categoryFilter, projectFilter, employeeFilter, searchQuery, dateRange, pagination.page, pagination.limit, showToast]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // Real-time socket sync
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => {
      fetchExpenses();
    };
    socket.on("expense_submitted", handleUpdate);
    socket.on("expense_approved", handleUpdate);
    socket.on("expense_rejected", handleUpdate);
    socket.on("expense_paid", handleUpdate);
    socket.on("expense_batch_paid", handleUpdate);

    return () => {
      socket.off("expense_submitted", handleUpdate);
      socket.off("expense_approved", handleUpdate);
      socket.off("expense_rejected", handleUpdate);
      socket.off("expense_paid", handleUpdate);
      socket.off("expense_batch_paid", handleUpdate);
    };
  }, [socket, fetchExpenses]);

  // ── Auto Calculate Total from Line Items ──
  const lineItemsTotal = useMemo(() => {
    return formData.items.reduce((acc, curr) => {
      const val = parseFloat(curr.amount);
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
  }, [formData.items]);

  useEffect(() => {
    if (formData.items.length > 0 && lineItemsTotal > 0) {
      setFormData((prev) => ({ ...prev, totalAmount: lineItemsTotal.toFixed(2) }));
    }
  }, [lineItemsTotal]);

  // ── Handlers for Line Items ──
  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { id: `item_${Date.now()}`, description: "", amount: "" }],
    }));
  };

  const handleRemoveItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const handleItemChange = (index, field, value) => {
    setFormData((prev) => {
      const updated = [...prev.items];
      updated[index][field] = value;
      return { ...prev, items: updated };
    });
  };

  // ── Receipt File Upload & Previews ──
  const handleReceiptsChange = (e) => {
    const files = Array.from(e.target.files || []);
    const totalCount = (formData.existingReceipts?.length || 0) + formData.receipts.length + files.length;
    if (totalCount > 5) {
      showToast("You can upload a maximum of 5 receipts per claim.", "warning");
      return;
    }

    for (const f of files) {
      if (f.size > 5 * 1024 * 1024) {
        showToast(`File "${f.name}" exceeds 5 MB limit.`, "error");
        return;
      }
      const isAllowed = /jpeg|jpg|png|pdf/i.test(f.type) || /\.(jpg|jpeg|png|pdf)$/i.test(f.name);
      if (!isAllowed) {
        showToast(`File "${f.name}" has invalid format. Only JPG, PNG, and PDF accepted.`, "error");
        return;
      }
    }

    setFormData((prev) => ({
      ...prev,
      receipts: [...prev.receipts, ...files],
    }));
  };

  const handleRemoveNewReceipt = (index) => {
    setFormData((prev) => ({
      ...prev,
      receipts: prev.receipts.filter((_, i) => i !== index),
    }));
  };

  const handleRemoveExistingReceipt = (index) => {
    setFormData((prev) => ({
      ...prev,
      existingReceipts: prev.existingReceipts.filter((_, i) => i !== index),
    }));
  };

  // ── Create or Edit Submit ──
  const handleFormSubmit = async (asDraft = false) => {
    setFieldErrors({});
    if (!asDraft) {
      if (!formData.claimTitle || !formData.claimTitle.trim()) {
        showToast("Claim Title is required", "error");
        return;
      }
      if (!formData.categoryId) {
        showToast("Category is required", "error");
        return;
      }
      if (!formData.expenseDate) {
        showToast("Expense Date is required", "error");
        return;
      }
      if (!formData.totalAmount || parseFloat(formData.totalAmount) <= 0) {
        showToast("Valid total amount is required", "error");
        return;
      }
    }
    const finalAmount = parseFloat(formData.totalAmount);

    // Receipt mandatory check
    const totalReceiptsCount = (formData.existingReceipts?.length || 0) + formData.receipts.length;
    if (!asDraft && policy && finalAmount >= policy.receipt_mandatory_above && totalReceiptsCount === 0) {
      showToast(`Receipt attachment is mandatory for expenses of ₹${policy.receipt_mandatory_above} or higher.`, "warning");
      return;
    }

    setFormSubmitting(true);
    try {
      const data = new FormData();
      data.append("title", formData.title);
      data.append("categoryId", formData.categoryId);
      if (formData.projectId) data.append("projectId", formData.projectId);
      data.append("expenseDate", formData.expenseDate);
      data.append("paymentMode", formData.paymentMode);
      data.append("description", formData.description);
      data.append("totalAmount", finalAmount || "");
      data.append("asDraft", asDraft ? "true" : "false");
      data.append("items", JSON.stringify(formData.items.filter((it) => it.description.trim() || it.amount)));

      if (editingExpense) {
        data.append("existingReceipts", JSON.stringify(formData.existingReceipts));
      }

      formData.receipts.forEach((file) => {
        data.append("receipts", file);
      });

      if (editingExpense) {
        await API.put(`/expenses/${editingExpense.id}`, data, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        showToast("Expense claim updated successfully!", "success");
      } else {
        await API.post("/expenses", data, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        showToast(asDraft ? "Claim saved as draft!" : "Expense claim submitted for approval!", "success");
      }

      setShowCreateModal(false);
      setEditingExpense(null);
      setFieldErrors({});
      setFormData(initialForm);
      fetchExpenses();
    } catch (err) {
      console.error(err);
      const serverErr = err.response?.data?.error;
      const serverField = err.response?.data?.field;
      if (serverField) {
        setFieldErrors({ [serverField]: serverErr });
      } else if (err.response?.status === 409 && err.response?.data?.duplicateWarning) {
        askConfirm(
          "Duplicate Claim Warning",
          `${err.response.data.error}\nDo you still want to proceed?`,
          async () => {
            try {
              setFormSubmitting(true);
              const data = new FormData();
              data.append("title", formData.title);
              data.append("categoryId", formData.categoryId);
              if (formData.projectId) data.append("projectId", formData.projectId);
              data.append("expenseDate", formData.expenseDate);
              data.append("paymentMode", formData.paymentMode);
              data.append("description", formData.description);
              data.append("totalAmount", finalAmount);
              data.append("asDraft", asDraft ? "true" : "false");
              data.append("ignoreDuplicateWarning", "true");
              data.append("items", JSON.stringify(formData.items));
              formData.receipts.forEach((file) => data.append("receipts", file));

              await API.post("/expenses", data, { headers: { "Content-Type": "multipart/form-data" } });
              showToast("Claim submitted successfully despite duplicate warning.", "success");
              setShowCreateModal(false);
              setFormData(initialForm);
              fetchExpenses();
            } catch (retryErr) {
              showToast(retryErr.response?.data?.error || "Failed to submit claim", "error");
            } finally {
              setFormSubmitting(false);
            }
          },
          "Proceed Anyway",
          "#f59e0b"
        );
      } else {
        showToast(serverErr || "Failed to save expense claim", "error");
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  // ── Open Edit Modal ──
  const handleOpenEdit = (exp) => {
    setEditingExpense(exp);
    setFormData({
      title: exp.title,
      categoryId: exp.category_id,
      projectId: exp.project_id || "",
      expenseDate: exp.expense_date ? new Date(exp.expense_date).toISOString().slice(0, 10) : "",
      paymentMode: exp.payment_mode || "UPI",
      description: exp.description || "",
      totalAmount: exp.total_amount,
      items: Array.isArray(exp.items) && exp.items.length > 0 ? exp.items : [{ id: "item_1", description: "", amount: exp.total_amount }],
      receipts: [],
      existingReceipts: Array.isArray(exp.receipts) ? exp.receipts : [],
    });
    setShowCreateModal(true);
  };

  // ── Submit Draft Claim ──
  const handleSubmitDraft = async (expId) => {
    try {
      await API.post(`/expenses/${expId}/submit`);
      showToast("Draft claim submitted for approval!", "success");
      fetchExpenses();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to submit draft", "error");
    }
  };

  // ── Cancel Pending Claim ──
  const handleCancelClaim = async (expId) => {
    const reason = window.prompt("Reason for cancelling claim (optional):");
    if (reason === null) return;
    try {
      await API.post(`/expenses/${expId}/cancel`, { reason });
      showToast("Expense claim cancelled.", "info");
      fetchExpenses();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to cancel claim", "error");
    }
  };

  // ── Delete Claim (Draft or any claim for Super Admin) ──
  const handleDeleteDraft = (expId) => {
    askConfirm("Delete Expense Claim", "Are you sure you want to delete this expense claim?", async () => {
      try {
        await API.delete(`/expenses/${expId}`);
        showToast("Expense claim deleted successfully.", "success");
        fetchExpenses();
      } catch (err) {
        showToast(err.response?.data?.error || "Failed to delete claim", "error");
      }
    });
  };

  // ── Clean all seed expense claims (Super Admin) ──
  const handleCleanSeedData = () => {
    askConfirm("Clear Seed Data", "Are you sure you want to delete all demo/seed expense claims? This cannot be undone.", async () => {
      try {
        const res = await API.post("/expenses/clean-seed-data");
        showToast(res.data.message || "Seed expense claims removed.", "success");
        fetchExpenses();
      } catch (err) {
        showToast(err.response?.data?.error || "Failed to remove seed data", "error");
      }
    });
  };

  // ── Approve / Partial Approve / Reject ──
  const handleReviewDecision = async () => {
    if (!reviewExpense) return;
    try {
      if (reviewAction === "reject") {
        if (!reviewComment.trim()) {
          showToast("Rejection reason is required.", "warning");
          return;
        }
        await API.post(`/expenses/${reviewExpense.id}/reject`, { comment: reviewComment });
        showToast("Expense claim rejected.", "info");
      } else {
        const payload = {
          comment: reviewComment,
        };
        if (reviewAction === "approve_partial") {
          const amt = parseFloat(partialAmount);
          if (isNaN(amt) || amt <= 0 || amt > Number(reviewExpense.total_amount)) {
            showToast("Enter a valid partial approved amount.", "warning");
            return;
          }
          if (!reviewComment.trim()) {
            showToast("Reason/note is mandatory when approving a partial amount.", "warning");
            return;
          }
          payload.approvedAmount = amt;
        }
        await API.post(`/expenses/${reviewExpense.id}/approve`, payload);
        showToast("Expense claim approved successfully!", "success");
      }
      setReviewExpense(null);
      fetchExpenses();
    } catch (err) {
      showToast(err.response?.data?.error || "Action failed", "error");
    }
  };

  // ── Single Pay Handler ──
  const handleRecordPayment = async () => {
    if (!payExpense) return;
    try {
      await API.post(`/expenses/${payExpense.id}/pay`, paymentForm);
      showToast("Reimbursement payment recorded successfully!", "success");
      setPayExpense(null);
      fetchExpenses();
    } catch (err) {
      showToast(err.response?.data?.error || "Payment record failed", "error");
    }
  };

  // ── Batch Pay Handler ──
  const handleBatchPaySubmit = async () => {
    if (batchPaySelected.length === 0) return;
    try {
      const res = await API.post("/expenses/batch-pay", {
        expenseIds: batchPaySelected,
        ...paymentForm,
      });
      showToast(res.data.message || "Batch payment recorded successfully!", "success");
      setShowBatchPayModal(false);
      setBatchPaySelected([]);
      fetchExpenses();
    } catch (err) {
      showToast(err.response?.data?.error || "Batch payment failed", "error");
    }
  };

  // ── Export CSV Handler ──
  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "All") params.append("status", statusFilter);
    if (categoryFilter) params.append("categoryId", categoryFilter);
    if (projectFilter) params.append("projectId", projectFilter);
    if (searchQuery.trim()) params.append("search", searchQuery.trim());
    if (dateRange.start) params.append("startDate", dateRange.start);
    if (dateRange.end) params.append("endDate", dateRange.end);

    window.open(`${API.defaults.baseURL || "http://localhost:5000/api"}/expenses/export?${params.toString()}`, "_blank");
  };

  // ── Download PDF Voucher Handler ──
  const handleDownloadPdf = () => {
    if (!printVoucherRef.current) return;
    const opt = {
      margin: 10,
      filename: `Expense_Voucher_${detailExpense?.id || Date.now()}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };
    html2pdf().from(printVoucherRef.current).set(opt).save();
  };

  // ── Save Company Policy ──
  const handleSavePolicy = async (e) => {
    e.preventDefault();
    try {
      await API.put("/expenses/policy", policyForm);
      showToast("Expense policy updated successfully!", "success");
      fetchMetadata();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update policy", "error");
    }
  };

  // ── Save Category ──
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!catForm.name.trim()) return;
    try {
      if (categoryModal.category) {
        await API.put(`/expenses/categories/${categoryModal.category.id}`, catForm);
        showToast("Category updated successfully!", "success");
      } else {
        await API.post("/expenses/categories", catForm);
        showToast("New category created successfully!", "success");
      }
      setCategoryModal({ show: false, category: null });
      fetchMetadata();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to save category", "error");
    }
  };

  // ── Delete Category ──
  const handleDeleteCategory = (catId) => {
    askConfirm("Delete Category", "Are you sure you want to delete / disable this category?", async () => {
      try {
        const res = await API.delete(`/expenses/categories/${catId}`);
        showToast(res.data.message || "Category updated.", "success");
        fetchMetadata();
      } catch (err) {
        showToast(err.response?.data?.error || "Failed to delete category", "error");
      }
    });
  };

  // Pending count for Approver badge
  const pendingApprovalsCount = summary?.adminAnalytics?.statusBreakdown?.find((s) => s.status === "Pending")?.count || 0;
  const approvedPayoutsCount = summary?.adminAnalytics?.statusBreakdown?.find((s) => s.status === "Approved")?.count || 0;

  return (
    <div className="expense-page">
      {/* ── HEADER ── */}
      <div className="expense-header">
        <div>
          <h1 className="expense-header-title">Expenses & Reimbursements</h1>
          <p className="expense-header-subtitle">
            Submit business expense claims, upload receipts, track approval stages, and disburse employee payouts.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
          {summary?.isApproverOrAdmin && (
            <div className="expense-view-toggle">
              <button
                type="button"
                className={`expense-toggle-btn ${kpiViewMode === "company" ? "active" : ""}`}
                onClick={() => setKpiViewMode("company")}
                title="View organization-wide metrics across all employees"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <IconBuilding size={14} /> Company Overview
              </button>
              <button
                type="button"
                className={`expense-toggle-btn ${kpiViewMode === "personal" ? "active" : ""}`}
                onClick={() => setKpiViewMode("personal")}
                title="View your personal expense claims only"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <IconUser size={14} /> My Personal Claims
              </button>
            </div>
          )}

          {isSuperAdmin && (
            <button
              type="button"
              className="btn-secondary"
              style={{ color: "#ef4444", borderColor: "#fca5a5" }}
              onClick={handleCleanSeedData}
              title="Remove sample/seed expense claims"
            >
              <IconTrash size={14} /> Clear Seed Data
            </button>
          )}

          <button
            type="button"
            className="btn-secondary"
            onClick={handleExportCsv}
            title="Export filtered records to CSV spreadsheet"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditingExpense(null);
              setFormData(initialForm);
              setShowCreateModal(true);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Expense Claim
          </button>
        </div>
      </div>

      {/* ── KPI METRICS CARDS ── */}
      {(() => {
        const isCompanyView = summary?.isApproverOrAdmin && (kpiViewMode === "company" || activeTab !== "my_claims");
        const companyPendingCount = Number(summary?.adminAnalytics?.statusBreakdown?.find(s => s.status === "Pending")?.count || 0);
        const companyPendingAmount = Number(summary?.adminAnalytics?.statusBreakdown?.find(s => s.status === "Pending")?.total || 0);
        const companyApprovedCount = Number(summary?.adminAnalytics?.statusBreakdown?.find(s => s.status === "Approved")?.count || 0);
        const companyApprovedAmount = Number(summary?.adminAnalytics?.statusBreakdown?.find(s => s.status === "Approved")?.total || 0);
        const companyPaidCount = Number(summary?.adminAnalytics?.statusBreakdown?.find(s => s.status === "Paid")?.count || 0);
        const companyPaidAmount = Number(summary?.adminAnalytics?.statusBreakdown?.find(s => s.status === "Paid")?.total || 0);
        const totalSpendThisMonth = Number(summary?.adminAnalytics?.totalSpendThisMonth || 0);

        return (
          <div className="expense-kpi-grid">
            <div className="expense-kpi-card" style={{ "--kpi-accent": "#f59e0b" }}>
              <div className="expense-kpi-title">{isCompanyView ? "Company Pending Approvals" : "Pending Approval"}</div>
              <div className="expense-kpi-value">
                ₹{(isCompanyView ? companyPendingAmount : Number(summary?.mySummary?.pending?.amount || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <div className="expense-kpi-sub">
                <span>{isCompanyView ? `${companyPendingCount} company claims awaiting review` : `${summary?.mySummary?.pending?.count || 0} claims awaiting manager review`}</span>
              </div>
            </div>

            <div className="expense-kpi-card" style={{ "--kpi-accent": "#0ea5e9" }}>
              <div className="expense-kpi-title">{isCompanyView ? "Approved — Ready For Payout" : "Approved — To Be Paid"}</div>
              <div className="expense-kpi-value">
                ₹{(isCompanyView ? companyApprovedAmount : Number(summary?.mySummary?.approved?.amount || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <div className="expense-kpi-sub">
                <span>{isCompanyView ? `${companyApprovedCount} claims queued for disbursement` : `${summary?.mySummary?.approved?.count || 0} claims queued for disbursement`}</span>
              </div>
            </div>

            <div className="expense-kpi-card" style={{ "--kpi-accent": "#10b981" }}>
              <div className="expense-kpi-title">{isCompanyView ? "Company Total Reimbursed" : "Total Reimbursed (Paid)"}</div>
              <div className="expense-kpi-value">
                ₹{(isCompanyView ? companyPaidAmount : Number(summary?.mySummary?.paid?.amount || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <div className="expense-kpi-sub">
                <span>{isCompanyView ? `${companyPaidCount} claims disbursed` : `${summary?.mySummary?.paid?.count || 0} claims successfully paid`}</span>
              </div>
            </div>

            <div className="expense-kpi-card" style={{ "--kpi-accent": "#6366f1" }}>
              <div className="expense-kpi-title">{isCompanyView ? "Spend This Month" : "Drafts & Inactive"}</div>
              <div className="expense-kpi-value">
                ₹{(isCompanyView ? totalSpendThisMonth : Number(summary?.mySummary?.draft?.amount || 0)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <div className="expense-kpi-sub">
                <span>{isCompanyView ? `${new Date().toLocaleString("default", { month: "short", year: "numeric" })} approved & paid` : `${summary?.mySummary?.draft?.count || 0} unsubmitted drafts`}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── NAVIGATION TABS ── */}
      <div className="expense-nav-tabs" style={{ marginBottom: "20px" }}>
        <button
          type="button"
          className={`expense-tab-btn ${activeTab === "my_claims" ? "active" : ""}`}
          onClick={() => { setActiveTab("my_claims"); setPagination(p => ({ ...p, page: 1 })); }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          {summary?.isApproverOrAdmin ? "All Expense Claims" : "My Expense Claims"}
        </button>

        {canApprove && (
          <button
            type="button"
            className={`expense-tab-btn ${activeTab === "approvals" ? "active" : ""}`}
            onClick={() => { setActiveTab("approvals"); setPagination(p => ({ ...p, page: 1 })); }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Approval Center
            {pendingApprovalsCount > 0 && <span className="expense-tab-badge">{pendingApprovalsCount}</span>}
          </button>
        )}

        {canPay && (
          <button
            type="button"
            className={`expense-tab-btn ${activeTab === "payouts" ? "active" : ""}`}
            onClick={() => { setActiveTab("payouts"); setPagination(p => ({ ...p, page: 1 })); }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
            Reimbursement Payouts
            {approvedPayoutsCount > 0 && <span className="expense-tab-badge" style={{ background: "rgba(16, 185, 129, 0.2)", color: "#10b981" }}>{approvedPayoutsCount}</span>}
          </button>
        )}

        {summary?.isApproverOrAdmin && (
          <button
            type="button"
            className={`expense-tab-btn ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => setActiveTab("analytics")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Spend Reports & Analytics
          </button>
        )}

        {canManagePolicy && (
          <button
            type="button"
            className={`expense-tab-btn ${activeTab === "settings" ? "active" : ""}`}
            onClick={() => setActiveTab("settings")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Categories & Policies
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════
          TAB CONTENT: 1. CLAIMS / 2. APPROVALS / 3. PAYOUTS
          ══════════════════════════════════════════════════════════ */}
      {(activeTab === "my_claims" || activeTab === "approvals" || activeTab === "payouts") && (
        <>
          {/* Filter Bar */}
          <div className="expense-filter-bar">
            <div className="expense-filter-inputs">
              <input
                type="text"
                className="expense-input"
                placeholder="Search title, desc, employee..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ minWidth: "220px" }}
              />

              {activeTab === "my_claims" && (
                <select
                  className="expense-select"
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                >
                  <option value="All">All Statuses</option>
                  <option value="Draft">Draft</option>
                  <option value="Pending">Pending Review</option>
                  <option value="Approved">Approved</option>
                  <option value="Paid">Paid (Reimbursed)</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              )}

              <select
                className="expense-select"
                value={categoryFilter}
                onChange={(e) => { setCategoryFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select
                className="expense-select"
                value={projectFilter}
                onChange={(e) => { setProjectFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
              >
                <option value="">All Projects</option>
                {projects.map((p) => (
                  <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
                ))}
              </select>

              {summary?.isApproverOrAdmin && (
                <select
                  className="expense-select"
                  value={employeeFilter}
                  onChange={(e) => { setEmployeeFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                >
                  <option value="">All Employees</option>
                  {staffList.map((s) => (
                    <option key={s.id || s._id} value={s.id || s._id}>
                      {s.name} ({s.position || "Staff"})
                    </option>
                  ))}
                </select>
              )}

              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <input
                  type="date"
                  className="expense-input"
                  title="From date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                />
                <span style={{ color: "#94a3b8" }}>—</span>
                <input
                  type="date"
                  className="expense-input"
                  title="To date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                />
              </div>
            </div>

            {/* Batch Pay Button for Payouts Tab */}
            {activeTab === "payouts" && batchPaySelected.length > 0 && (
              <button
                type="button"
                className="btn-success"
                onClick={() => setShowBatchPayModal(true)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Disburse Batch ({batchPaySelected.length})
              </button>
            )}
          </div>

          {/* Table Container */}
          <div className="expense-table-container">
            {loading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                <div className="loading-spinner" style={{ margin: "0 auto 12px" }}></div>
                Loading expense records...
              </div>
            ) : expenses.length === 0 ? (
              <div style={{ padding: "50px 20px", textAlign: "center", color: "#64748b" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ margin: "0 auto 12px" }}>
                  <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/>
                </svg>
                <h3 style={{ margin: "0 0 6px 0", color: "#334155" }}>No Expense Claims Found</h3>
                <p style={{ margin: 0, fontSize: "13px" }}>
                  {activeTab === "approvals"
                    ? "Hooray! No pending expense claims waiting for approval."
                    : activeTab === "payouts"
                    ? "No approved claims waiting for payout disbursement."
                    : "You haven't submitted any expense claims matching these filters."}
                </p>
              </div>
            ) : (
              <table className="expense-table">
                <thead>
                  <tr>
                    {activeTab === "payouts" && (
                      <th style={{ width: "40px" }}>
                        <input
                          type="checkbox"
                          checked={batchPaySelected.length === expenses.length && expenses.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBatchPaySelected(expenses.map((x) => x.id));
                            } else {
                              setBatchPaySelected([]);
                            }
                          }}
                        />
                      </th>
                    )}
                    <th onClick={() => requestExpSort("title")} style={{ cursor: "pointer", userSelect: "none" }}>
                      Claim Title &amp; Description <SortIndicator sortKey="title" currentKey={expSortConfig.key} direction={expSortConfig.direction} />
                    </th>
                    <th onClick={() => requestExpSort("employee_name")} style={{ cursor: "pointer", userSelect: "none" }}>
                      Employee <SortIndicator sortKey="employee_name" currentKey={expSortConfig.key} direction={expSortConfig.direction} />
                    </th>
                    <th onClick={() => requestExpSort("category_name")} style={{ cursor: "pointer", userSelect: "none" }}>
                      Category &amp; Project <SortIndicator sortKey="category_name" currentKey={expSortConfig.key} direction={expSortConfig.direction} />
                    </th>
                    <th onClick={() => requestExpSort("expense_date")} style={{ cursor: "pointer", userSelect: "none" }}>
                      Expense Date <SortIndicator sortKey="expense_date" currentKey={expSortConfig.key} direction={expSortConfig.direction} />
                    </th>
                    <th onClick={() => requestExpSort("total_amount")} style={{ cursor: "pointer", userSelect: "none" }}>
                      Claimed Amount <SortIndicator sortKey="total_amount" currentKey={expSortConfig.key} direction={expSortConfig.direction} />
                    </th>
                    <th onClick={() => requestExpSort("approved_amount")} style={{ cursor: "pointer", userSelect: "none" }}>
                      Approved / Paid <SortIndicator sortKey="approved_amount" currentKey={expSortConfig.key} direction={expSortConfig.direction} />
                    </th>
                    <th>Receipts</th>
                    <th onClick={() => requestExpSort("status")} style={{ cursor: "pointer", userSelect: "none" }}>
                      Status <SortIndicator sortKey="status" currentKey={expSortConfig.key} direction={expSortConfig.direction} />
                    </th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedExpenses.map((exp) => {
                    const isAuthor = exp.employee_id === user?.id;
                    const canEdit = (exp.status === "Draft" || exp.status === "Pending") && (isAuthor || isSuperAdmin);
                    const canDelete = (exp.status === "Draft" && isAuthor) || isSuperAdmin;
                    const canCancel = exp.status === "Pending" && (isAuthor || isSuperAdmin);
                    const receiptsList = Array.isArray(exp.receipts) ? exp.receipts : [];

                    return (
                      <tr key={exp.id}>
                        {activeTab === "payouts" && (
                          <td>
                            <input
                              type="checkbox"
                              checked={batchPaySelected.includes(exp.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setBatchPaySelected((prev) => [...prev, exp.id]);
                                } else {
                                  setBatchPaySelected((prev) => prev.filter((id) => id !== exp.id));
                                }
                              }}
                            />
                          </td>
                        )}

                        {/* Title & Description */}
                        <td>
                          <div style={{ fontWeight: "700", color: "#0f172a" }}>{exp.title}</div>
                          {exp.description && (
                            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px", maxWidth: "260px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {exp.description}
                            </div>
                          )}
                          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                            Mode: {exp.payment_mode || "UPI"} • ID: {exp.id}
                          </div>
                        </td>

                        {/* Employee */}
                        <td>
                          <div style={{ fontWeight: "600" }}>{exp.employee_name || "Employee"}</div>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>{exp.employee_email}</div>
                        </td>

                        {/* Category & Project */}
                        <td>
                          <div style={{ fontWeight: "600", color: "#334155" }}>{exp.category_name}</div>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>{exp.project_name || "No Project"}</div>
                        </td>

                        {/* Date */}
                        <td style={{ whiteSpace: "nowrap" }}>
                          {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString("en-GB") : "-"}
                        </td>

                        {/* Claimed Amount */}
                        <td style={{ fontWeight: "800", color: "#0f172a", whiteSpace: "nowrap" }}>
                          ₹{Number(exp.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>

                        {/* Approved / Paid Amount */}
                        <td style={{ whiteSpace: "nowrap" }}>
                          {exp.approved_amount !== null && exp.approved_amount !== undefined ? (
                            <span style={{ fontWeight: "800", color: "#10b981" }}>
                              ₹{Number(exp.approved_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>—</span>
                          )}
                        </td>

                        {/* Receipts */}
                        <td>
                          {receiptsList.length > 0 ? (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: "4px 8px", fontSize: "11px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                              onClick={() => setDetailExpense(exp)}
                            >
                              <IconPaperclip size={12} /> {receiptsList.length} receipt{receiptsList.length > 1 ? "s" : ""}
                            </button>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8" }}>None</span>
                          )}
                        </td>

                        {/* Status Chip */}
                        <td>
                          <span className={`expense-status-badge status-${exp.status.toLowerCase()}`}>
                            {exp.status === "Pending" ? "Pending Review" : exp.status}
                          </span>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                            {/* View Detail / Timeline */}
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ padding: "6px 10px", fontSize: "12px" }}
                              title="View timeline and receipt details"
                              onClick={() => setDetailExpense(exp)}
                            >
                              View
                            </button>

                            {/* Submit draft */}
                            {exp.status === "Draft" && isAuthor && (
                              <button
                                type="button"
                                className="btn-success"
                                style={{ padding: "6px 10px", fontSize: "12px" }}
                                onClick={() => handleSubmitDraft(exp.id)}
                              >
                                Submit
                              </button>
                            )}

                            {/* Review decision (Approvals tab or general) */}
                            {exp.status === "Pending" && canApprove && (
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ padding: "6px 10px", fontSize: "12px" }}
                                disabled={exp.employee_id === user?.id && !isSuperAdmin}
                                title={exp.employee_id === user?.id && !isSuperAdmin ? "Approver cannot approve their own expense claim" : "Approve or Reject claim"}
                                onClick={() => {
                                  setReviewExpense(exp);
                                  setReviewAction("approve_full");
                                  setPartialAmount(exp.total_amount);
                                  setReviewComment("");
                                }}
                              >
                                Review
                              </button>
                            )}

                            {/* Record Payment (Payouts tab or approved state) */}
                            {exp.status === "Approved" && canPay && (
                              <button
                                type="button"
                                className="btn-success"
                                style={{ padding: "6px 10px", fontSize: "12px" }}
                                onClick={() => {
                                  setPayExpense(exp);
                                  setPaymentForm({
                                    paymentDate: new Date().toISOString().slice(0, 10),
                                    paymentMode: "Bank Transfer",
                                    transactionReference: "",
                                    note: "",
                                  });
                                }}
                              >
                                Pay
                              </button>
                            )}

                            {/* Edit */}
                            {canEdit && (
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: "6px 8px" }}
                                title="Edit claim details"
                                onClick={() => handleOpenEdit(exp)}
                              >
                                <IconEdit size={13} />
                              </button>
                            )}

                            {/* Cancel Pending */}
                            {canCancel && (
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: "6px 8px", color: "#ef4444" }}
                                title="Cancel claim"
                                onClick={() => handleCancelClaim(exp.id)}
                              >
                                <IconX size={13} />
                              </button>
                            )}

                            {/* Delete Draft */}
                            {canDelete && (
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ padding: "6px 8px", color: "#dc2626" }}
                                title="Delete draft"
                                onClick={() => handleDeleteDraft(exp.id)}
                              >
                                <IconTrash size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Pagination Controls */}
            <Pagination
              currentPage={pagination.page}
              totalRecords={pagination.total}
              pageSize={pagination.limit || 10}
              onPageChange={(newPage) => setPagination((p) => ({ ...p, page: newPage }))}
            />
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB CONTENT: 4. ANALYTICS & SPEND REPORTS
          ══════════════════════════════════════════════════════════ */}
      {activeTab === "analytics" && summary?.adminAnalytics && (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Top Row: Total Spend This Month + Monthly Trend */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: "20px" }}>
            <div className="expense-chart-card">
              <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                Spend This Month
              </h3>
              <div style={{ fontSize: "32px", fontWeight: "900", color: "#2563eb", marginBottom: "8px" }}>
                ₹{Number(summary.adminAnalytics.totalSpendThisMonth || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </div>
              <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                Combined total of all claims Approved or Paid in {new Date().toLocaleString("default", { month: "long", year: "numeric" })}.
              </p>
            </div>

            <div className="expense-chart-card">
              <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                Last 6 Months Spend Trend
              </h3>
              {summary.adminAnalytics.monthlyTrend?.length > 0 ? (
                summary.adminAnalytics.monthlyTrend.map((m) => {
                  const maxTrend = Math.max(...summary.adminAnalytics.monthlyTrend.map((x) => Number(x.total || 0)), 1);
                  const pct = Math.round((Number(m.total || 0) / maxTrend) * 100);
                  return (
                    <div key={m.month} className="expense-bar-row">
                      <div className="expense-bar-label">{m.month}</div>
                      <div className="expense-bar-track">
                        <div className="expense-bar-fill" style={{ width: `${pct}%`, background: "#2563eb" }}></div>
                      </div>
                      <div className="expense-bar-value">
                        ₹{Number(m.total || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ color: "#94a3b8", fontSize: "13px" }}>No previous month expense records.</div>
              )}
            </div>
          </div>

          {/* Second Row: Spend by Category & Spend by Employee */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "20px" }}>
            {/* By Category */}
            <div className="expense-chart-card">
              <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                Spend by Category
              </h3>
              {summary.adminAnalytics.spendByCategory?.length > 0 ? (
                summary.adminAnalytics.spendByCategory.map((c, idx) => {
                  const maxCat = Math.max(...summary.adminAnalytics.spendByCategory.map((x) => Number(x.amount || 0)), 1);
                  const pct = Math.round((Number(c.amount || 0) / maxCat) * 100);
                  const colors = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];
                  const barColor = colors[idx % colors.length];

                  return (
                    <div key={c.name} className="expense-bar-row">
                      <div className="expense-bar-label">{c.name}</div>
                      <div className="expense-bar-track">
                        <div className="expense-bar-fill" style={{ width: `${pct}%`, background: barColor }}></div>
                      </div>
                      <div className="expense-bar-value">
                        ₹{Number(c.amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ color: "#94a3b8", fontSize: "13px" }}>No categorical spend data recorded.</div>
              )}
            </div>

            {/* By Employee */}
            <div className="expense-chart-card">
              <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                Top Spenders by Employee
              </h3>
              {summary.adminAnalytics.spendByEmployee?.length > 0 ? (
                summary.adminAnalytics.spendByEmployee.map((e) => {
                  const maxEmp = Math.max(...summary.adminAnalytics.spendByEmployee.map((x) => Number(x.amount || 0)), 1);
                  const pct = Math.round((Number(e.amount || 0) / maxEmp) * 100);

                  return (
                    <div key={e.name} className="expense-bar-row">
                      <div className="expense-bar-label">{e.name || "Employee"}</div>
                      <div className="expense-bar-track">
                        <div className="expense-bar-fill" style={{ width: `${pct}%`, background: "#10b981" }}></div>
                      </div>
                      <div className="expense-bar-value">
                        ₹{Number(e.amount || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div style={{ color: "#94a3b8", fontSize: "13px" }}>No employee spend data recorded.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB CONTENT: 5. CATEGORIES & POLICIES
          ══════════════════════════════════════════════════════════ */}
      {activeTab === "settings" && canManagePolicy && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: "24px" }}>
          {/* Categories Management Card */}
          <div className="expense-chart-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                Expense Categories
              </h3>
              <button
                type="button"
                className="btn-primary"
                style={{ padding: "6px 12px", fontSize: "12px" }}
                onClick={() => {
                  setCatForm({ name: "", description: "", maxLimit: "", isActive: true });
                  setCategoryModal({ show: true, category: null });
                }}
              >
                + Add Category
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {categories.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 14px",
                    background: "#f8fafc",
                    borderRadius: "10px",
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: "700", color: "#0f172a", fontSize: "13px" }}>
                      {c.name} {!c.is_active && <span style={{ color: "#ef4444", fontSize: "11px" }}>(Disabled)</span>}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b" }}>
                      {c.description || "No description"} • Limit: {c.max_limit ? `₹${c.max_limit}` : "None"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "4px 8px", fontSize: "11px" }}
                      onClick={() => {
                        setCatForm({
                          name: c.name,
                          description: c.description || "",
                          maxLimit: c.max_limit || "",
                          isActive: Boolean(c.is_active),
                        });
                        setCategoryModal({ show: true, category: c });
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "4px 8px", fontSize: "11px", color: "#ef4444" }}
                      onClick={() => handleDeleteCategory(c.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Company Policy Settings Form */}
          <div className="expense-chart-card">
            <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
              Company Reimbursement Policy
            </h3>
            <form onSubmit={handleSavePolicy} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                  Max Amount Per Single Expense Claim (₹)
                </label>
                <input
                  type="number"
                  className="expense-input"
                  style={{ width: "100%" }}
                  value={policyForm.maxAmountPerExpense}
                  onChange={(e) => setPolicyForm({ ...policyForm, maxAmountPerExpense: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                  Max Total Reimbursement Per Employee / Month (₹)
                </label>
                <input
                  type="number"
                  className="expense-input"
                  style={{ width: "100%" }}
                  value={policyForm.maxAmountPerMonth}
                  onChange={(e) => setPolicyForm({ ...policyForm, maxAmountPerMonth: e.target.value })}
                  required
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                  Receipt Attachment Mandatory Above Amount (₹)
                </label>
                <input
                  type="number"
                  className="expense-input"
                  style={{ width: "100%" }}
                  value={policyForm.receiptMandatoryAbove}
                  onChange={(e) => setPolicyForm({ ...policyForm, receiptMandatoryAbove: e.target.value })}
                  required
                />
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="checkbox"
                  id="chk-future-dates"
                  checked={policyForm.allowFutureDates}
                  onChange={(e) => setPolicyForm({ ...policyForm, allowFutureDates: e.target.checked })}
                />
                <label htmlFor="chk-future-dates" style={{ fontSize: "13px", fontWeight: "600", color: "#334155", cursor: "pointer" }}>
                  Allow future dates for expense claims (e.g. advance travel booking)
                </label>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="checkbox"
                  id="chk-duplicate"
                  checked={policyForm.duplicateDetection}
                  onChange={(e) => setPolicyForm({ ...policyForm, duplicateDetection: e.target.checked })}
                />
                <label htmlFor="chk-duplicate" style={{ fontSize: "13px", fontWeight: "600", color: "#334155", cursor: "pointer" }}>
                  Enable duplicate claim detection (warns on same employee + date + category + amount)
                </label>
              </div>

              <div style={{ marginTop: "12px" }}>
                <button type="submit" className="btn-primary">
                  Save Company Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL: NEW / EDIT EXPENSE CLAIM
          ══════════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="expense-modal-backdrop" onClick={() => setShowCreateModal(false)}>
          <div className="expense-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="expense-modal-header">
              <h2 className="expense-modal-title">
                {editingExpense ? "Edit Expense Claim" : "New Expense Claim"}
              </h2>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "4px 10px" }}
                onClick={() => setShowCreateModal(false)}
              >
                <IconX size={14} />
              </button>
            </div>

            <div className="expense-modal-body">
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Title */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    Claim Title <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="expense-input"
                    placeholder="e.g. Client Dinner at Marriott / Taxi to Airport"
                    style={{
                      width: "100%",
                      border: fieldErrors.title ? "1px solid #ef4444" : undefined,
                      background: fieldErrors.title ? "#fff5f5" : undefined
                    }}
                    value={formData.title}
                    onChange={(e) => {
                      setFormData({ ...formData, title: e.target.value });
                      if (fieldErrors.title) setFieldErrors({ ...fieldErrors, title: null });
                    }}
                  />
                  {fieldErrors.title && (
                    <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                      {fieldErrors.title}
                    </span>
                  )}
                </div>

                {/* Category & Project */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                      Category <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
                    </label>
                    <select
                      className="expense-select"
                      style={{
                        width: "100%",
                        border: fieldErrors.categoryId ? "1px solid #ef4444" : undefined,
                        background: fieldErrors.categoryId ? "#fff5f5" : undefined
                      }}
                      value={formData.categoryId}
                      onChange={(e) => {
                        setFormData({ ...formData, categoryId: e.target.value });
                        if (fieldErrors.categoryId) setFieldErrors({ ...fieldErrors, categoryId: null });
                      }}
                    >
                      <option value="">Select category...</option>
                      {categories.filter((c) => c.is_active).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.max_limit ? `(Limit: ₹${c.max_limit})` : ""}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.categoryId && (
                      <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                        {fieldErrors.categoryId}
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                      Project (Optional)
                    </label>
                    <select
                      className="expense-select"
                      style={{ width: "100%" }}
                      value={formData.projectId}
                      onChange={(e) => setFormData({ ...formData, projectId: e.target.value })}
                    >
                      <option value="">No Project</option>
                      {projects.map((p) => (
                        <option key={p.id || p._id} value={p.id || p._id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Expense Date & Payment Mode */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                      Expense Date <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
                    </label>
                    <input
                      type="date"
                      className="expense-input"
                      max={!policy?.allow_future_dates ? new Date().toISOString().slice(0, 10) : undefined}
                      style={{
                        width: "100%",
                        border: fieldErrors.expenseDate ? "1px solid #ef4444" : undefined,
                        background: fieldErrors.expenseDate ? "#fff5f5" : undefined
                      }}
                      value={formData.expenseDate}
                      onChange={(e) => {
                        setFormData({ ...formData, expenseDate: e.target.value });
                        if (fieldErrors.expenseDate) setFieldErrors({ ...fieldErrors, expenseDate: null });
                      }}
                    />
                    {fieldErrors.expenseDate && (
                      <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                        {fieldErrors.expenseDate}
                      </span>
                    )}
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                      Payment Mode Used by Employee *
                    </label>
                    <select
                      className="expense-select"
                      style={{ width: "100%" }}
                      value={formData.paymentMode}
                      onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                    >
                      <option value="UPI">UPI / GPay / PhonePe</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="Debit Card">Debit Card</option>
                      <option value="Cash">Cash</option>
                      <option value="Net Banking">Net Banking</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                {/* Multi-Line Items (Optional but preferred) */}
                <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", fontWeight: "800", color: "#334155", textTransform: "uppercase" }}>
                      Breakdown / Line Items
                    </span>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: "4px 10px", fontSize: "11px" }}
                      onClick={handleAddItem}
                    >
                      + Add Item
                    </button>
                  </div>

                  <table className="line-items-table">
                    <thead>
                      <tr>
                        <th>Item Description</th>
                        <th style={{ width: "140px" }}>Amount (₹)</th>
                        <th style={{ width: "30px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {formData.items.map((item, idx) => (
                        <tr key={item.id || idx}>
                          <td>
                            <input
                              type="text"
                              className="expense-input"
                              placeholder={`Item #${idx + 1} details`}
                              style={{ width: "100%", padding: "6px 10px", fontSize: "12px" }}
                              value={item.description}
                              onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.01"
                              className="expense-input"
                              placeholder="0.00"
                              style={{ width: "100%", padding: "6px 10px", fontSize: "12px" }}
                              value={item.amount}
                              onChange={(e) => handleItemChange(idx, "amount", e.target.value)}
                            />
                          </td>
                          <td>
                            {formData.items.length > 1 && (
                              <button
                                type="button"
                                style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", display: "inline-flex", alignItems: "center" }}
                                onClick={() => handleRemoveItem(idx)}
                              >
                                <IconX size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "8px", borderTop: "1px dashed #cbd5e1" }}>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "#334155" }}>
                      Calculated Total Amount:
                    </span>
                    <span style={{ fontSize: "16px", fontWeight: "900", color: "#2563eb" }}>
                      ₹{lineItemsTotal > 0 ? lineItemsTotal.toFixed(2) : formData.totalAmount || "0.00"}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    Description / Business Purpose
                  </label>
                  <textarea
                    rows={2}
                    className="expense-input"
                    style={{ width: "100%", resize: "vertical" }}
                    placeholder="Provide justification and context for this expenditure..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>

                {/* Receipts Attachments (1 to 5 files, <= 5MB) */}
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    Attach Receipts / Bills (JPG, PNG, PDF up to 5 MB each, max 5)
                  </label>

                  <label className="expense-dropzone" style={{ display: "block" }}>
                    <input
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.pdf"
                      style={{ display: "none" }}
                      onChange={handleReceiptsChange}
                    />
                    <div style={{ marginBottom: "6px", display: "flex", justifyContent: "center" }}>
                      <FolderIcon size={26} color="#2563eb" />
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#2563eb" }}>
                      Click to Browse or Drag & Drop Receipts
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                      Supports multiple receipts per claim
                    </div>
                  </label>

                  {/* Thumbnail Previews */}
                  <div className="receipts-preview-row">
                    {/* Existing receipts */}
                    {formData.existingReceipts?.map((r, idx) => (
                      <div key={`exist_${idx}`} className="receipt-thumb">
                        <button
                          type="button"
                          className="receipt-remove-btn"
                          onClick={() => handleRemoveExistingReceipt(idx)}
                        >
                          <IconX size={11} />
                        </button>
                        {r.url?.endsWith(".pdf") ? (
                          <div className="receipt-thumb-pdf" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <IconFileText size={13} /> PDF
                          </div>
                        ) : (
                          <img src={r.url} alt="Receipt preview" />
                        )}
                      </div>
                    ))}

                    {/* Newly added receipts */}
                    {formData.receipts.map((f, idx) => {
                      const isPdf = f.type === "application/pdf" || f.name.endsWith(".pdf");
                      return (
                        <div key={`new_${idx}`} className="receipt-thumb">
                          <button
                            type="button"
                            className="receipt-remove-btn"
                            onClick={() => handleRemoveNewReceipt(idx)}
                          >
                            <IconX size={11} />
                          </button>
                          {isPdf ? (
                            <div className="receipt-thumb-pdf" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                              <IconFileText size={13} /> PDF
                            </div>
                          ) : (
                            <img src={URL.createObjectURL(f)} alt="Receipt preview" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="expense-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                disabled={formSubmitting}
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="btn-secondary"
                disabled={formSubmitting}
                onClick={() => handleFormSubmit(true)}
              >
                Save as Draft
              </button>

              <button
                type="button"
                className="btn-primary"
                disabled={formSubmitting}
                onClick={() => handleFormSubmit(false)}
              >
                {formSubmitting ? "Submitting..." : "Submit Claim for Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL: CLAIM DETAIL & AUDIT TIMELINE (With PDF Voucher)
          ══════════════════════════════════════════════════════════ */}
      {detailExpense && (
        <div className="expense-modal-backdrop" onClick={() => setDetailExpense(null)}>
          <div className="expense-modal-content" style={{ maxWidth: "720px" }} onClick={(e) => e.stopPropagation()}>
            <div className="expense-modal-header">
              <div>
                <h2 className="expense-modal-title">{detailExpense.title}</h2>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                  Claim #{detailExpense.id} • Submitted by {detailExpense.employee_name}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: "5px 12px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                  onClick={handleDownloadPdf}
                >
                  <DownloadIcon size={13} /> Download PDF Voucher
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ padding: "4px 10px" }}
                  onClick={() => setDetailExpense(null)}
                >
                  <IconX size={14} />
                </button>
              </div>
            </div>

            <div className="expense-modal-body" ref={printVoucherRef}>
              {/* Printable Voucher Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "16px", borderBottom: "1px solid #e2e8f0", marginBottom: "16px" }}>
                <div>
                  <span className={`expense-status-badge status-${detailExpense.status.toLowerCase()}`}>
                    {detailExpense.status}
                  </span>
                  <div style={{ fontSize: "20px", fontWeight: "900", color: "#0f172a", marginTop: "8px" }}>
                    ₹{Number(detailExpense.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  {detailExpense.approved_amount !== null && (
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#10b981" }}>
                      Approved: ₹{Number(detailExpense.approved_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: "right", fontSize: "12px", color: "#64748b" }}>
                  <div><strong>Date:</strong> {detailExpense.expense_date ? new Date(detailExpense.expense_date).toLocaleDateString("en-GB") : "-"}</div>
                  <div><strong>Category:</strong> {detailExpense.category_name}</div>
                  <div><strong>Project:</strong> {detailExpense.project_name || "N/A"}</div>
                  <div><strong>Payment Mode:</strong> {detailExpense.payment_mode || "UPI"}</div>
                </div>
              </div>

              {/* Description */}
              {detailExpense.description && (
                <div style={{ background: "#f8fafc", padding: "12px 16px", borderRadius: "10px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontSize: "11px", fontWeight: "800", color: "#64748b", textTransform: "uppercase" }}>Purpose & Remarks</div>
                  <div style={{ fontSize: "13px", color: "#1e293b", marginTop: "4px" }}>{detailExpense.description}</div>
                </div>
              )}

              {/* Breakdown Line Items */}
              {Array.isArray(detailExpense.items) && detailExpense.items.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "800", color: "#64748b", textTransform: "uppercase", marginBottom: "8px" }}>
                    Itemized Breakdown
                  </div>
                  <table className="line-items-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{ textAlign: "right" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailExpense.items.map((it, idx) => (
                        <tr key={idx}>
                          <td>{it.description || `Item #${idx + 1}`}</td>
                          <td style={{ textAlign: "right", fontWeight: "700" }}>₹{Number(it.amount || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Attached Receipts Preview */}
              {Array.isArray(detailExpense.receipts) && detailExpense.receipts.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "800", color: "#64748b", textTransform: "uppercase", marginBottom: "8px" }}>
                    Attached Receipts ({detailExpense.receipts.length})
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    {detailExpense.receipts.map((r, idx) => (
                      <a
                        key={idx}
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 12px",
                          background: "#f1f5f9",
                          borderRadius: "8px",
                          textDecoration: "none",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#2563eb",
                          border: "1px solid #cbd5e1",
                        }}
                      >
                        <IconFileText size={14} /> {r.name || `Receipt #${idx + 1}`}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Disbursement Info (if Paid) */}
              {detailExpense.payment_info && (
                <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "14px 18px", borderRadius: "10px", marginBottom: "20px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "800", color: "#065f46", textTransform: "uppercase" }}>
                    Disbursement & Payout Details
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "8px", fontSize: "12px", color: "#047857" }}>
                    <div><strong>Paid Date:</strong> {detailExpense.payment_info.date}</div>
                    <div><strong>Mode:</strong> {detailExpense.payment_info.mode}</div>
                    <div><strong>Txn Reference:</strong> {detailExpense.payment_info.reference || "N/A"}</div>
                    <div><strong>Disbursed By:</strong> {detailExpense.payment_info.paidByName || "Accounts"}</div>
                    {detailExpense.payment_info.note && (
                      <div style={{ gridColumn: "span 2" }}><strong>Note:</strong> {detailExpense.payment_info.note}</div>
                    )}
                  </div>
                </div>
              )}

              {/* Audit Trail Timeline */}
              <div style={{ marginTop: "16px" }}>
                <div style={{ fontSize: "12px", fontWeight: "800", color: "#64748b", textTransform: "uppercase" }}>
                  Audit Trail & History
                </div>
                <div className="expense-timeline">
                  {Array.isArray(detailExpense.history) && detailExpense.history.length > 0 ? (
                    detailExpense.history.map((h, idx) => (
                      <div key={idx} className="expense-timeline-item">
                        <div className="expense-timeline-dot"></div>
                        <div className="expense-timeline-title">{h.action}</div>
                        <div className="expense-timeline-meta">
                          by <strong>{h.byName}</strong> on {h.at ? new Date(h.at).toLocaleString() : "-"}
                        </div>
                        {h.remarks && <div className="expense-timeline-remarks">{h.remarks}</div>}
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: "12px", color: "#94a3b8" }}>No history recorded.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="expense-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDetailExpense(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL: APPROVE / PARTIAL APPROVE / REJECT
          ══════════════════════════════════════════════════════════ */}
      {reviewExpense && (
        <div className="expense-modal-backdrop" onClick={() => setReviewExpense(null)}>
          <div className="expense-modal-content" style={{ maxWidth: "560px" }} onClick={(e) => e.stopPropagation()}>
            <div className="expense-modal-header">
              <h2 className="expense-modal-title">Review Expense Claim</h2>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "4px 10px" }}
                onClick={() => setReviewExpense(null)}
              >
                <IconX size={14} />
              </button>
            </div>

            <div className="expense-modal-body">
              <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "10px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontWeight: "800", color: "#0f172a" }}>{reviewExpense.title}</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                  Submitted by {reviewExpense.employee_name} • Category: {reviewExpense.category_name}
                </div>
                <div style={{ fontSize: "18px", fontWeight: "900", color: "#2563eb", marginTop: "8px" }}>
                  Claimed Amount: ₹{Number(reviewExpense.total_amount).toFixed(2)}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "6px" }}>
                    Decision Action
                  </label>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className={`btn-secondary ${reviewAction === "approve_full" ? "btn-success" : ""}`}
                      onClick={() => { setReviewAction("approve_full"); setPartialAmount(reviewExpense.total_amount); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                      <IconCheck size={14} /> Approve Full (₹{Number(reviewExpense.total_amount).toFixed(2)})
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary ${reviewAction === "approve_partial" ? "btn-primary" : ""}`}
                      onClick={() => setReviewAction("approve_partial")}
                    >
                      Partially Approve
                    </button>
                    <button
                      type="button"
                      className={`btn-secondary ${reviewAction === "reject" ? "btn-danger" : ""}`}
                      onClick={() => setReviewAction("reject")}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                    >
                      <IconX size={14} /> Reject
                    </button>
                  </div>
                </div>

                {reviewAction === "approve_partial" && (
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                      Approved Amount (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="expense-input"
                      style={{ width: "100%" }}
                      placeholder="Enter modified approved amount"
                      value={partialAmount}
                      onChange={(e) => setPartialAmount(e.target.value)}
                    />
                  </div>
                )}

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    {reviewAction === "reject" ? "Rejection Reason *" : "Remarks / Comments"}
                  </label>
                  <textarea
                    rows={3}
                    className="expense-input"
                    style={{ width: "100%", resize: "vertical" }}
                    placeholder={reviewAction === "reject" ? "Reason is required when rejecting..." : "Optional comment for employee..."}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="expense-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setReviewExpense(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={reviewAction === "reject" ? "btn-danger" : "btn-primary"}
                onClick={handleReviewDecision}
              >
                Confirm {reviewAction === "reject" ? "Rejection" : "Approval"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL: RECORD SINGLE / BATCH PAYMENT
          ══════════════════════════════════════════════════════════ */}
      {(payExpense || showBatchPayModal) && (
        <div
          className="expense-modal-backdrop"
          onClick={() => { setPayExpense(null); setShowBatchPayModal(false); }}
        >
          <div className="expense-modal-content" style={{ maxWidth: "540px" }} onClick={(e) => e.stopPropagation()}>
            <div className="expense-modal-header">
              <h2 className="expense-modal-title">
                {showBatchPayModal ? `Batch Disburse (${batchPaySelected.length} Claims)` : "Record Reimbursement Payout"}
              </h2>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "4px 10px" }}
                onClick={() => { setPayExpense(null); setShowBatchPayModal(false); }}
              >
                <IconX size={14} />
              </button>
            </div>

            <div className="expense-modal-body">
              {payExpense && (
                <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", padding: "14px", borderRadius: "10px", marginBottom: "16px" }}>
                  <div style={{ fontWeight: "700", color: "#065f46" }}>{payExpense.title}</div>
                  <div style={{ fontSize: "12px", color: "#047857", marginTop: "2px" }}>
                    Pay to: <strong>{payExpense.employee_name}</strong>
                  </div>
                  <div style={{ fontSize: "18px", fontWeight: "900", color: "#059669", marginTop: "6px" }}>
                    Payout Amount: ₹{Number(payExpense.approved_amount || payExpense.total_amount).toFixed(2)}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    Payment Date *
                  </label>
                  <input
                    type="date"
                    className="expense-input"
                    style={{ width: "100%" }}
                    value={paymentForm.paymentDate}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    Payment Mode *
                  </label>
                  <select
                    className="expense-select"
                    style={{ width: "100%" }}
                    value={paymentForm.paymentMode}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}
                  >
                    <option value="Bank Transfer">Bank Transfer (NEFT/RTGS/IMPS)</option>
                    <option value="UPI">UPI</option>
                    <option value="Cash">Cash</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Corporate Card">Corporate Card</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    Transaction / UTR Reference
                  </label>
                  <input
                    type="text"
                    className="expense-input"
                    placeholder="e.g. UTR1203928192 or Cheque #10293"
                    style={{ width: "100%" }}
                    value={paymentForm.transactionReference}
                    onChange={(e) => setPaymentForm({ ...paymentForm, transactionReference: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                    Payment Note / Memo
                  </label>
                  <textarea
                    rows={2}
                    className="expense-input"
                    style={{ width: "100%", resize: "vertical" }}
                    placeholder="Optional note for financial record..."
                    value={paymentForm.note}
                    onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="expense-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => { setPayExpense(null); setShowBatchPayModal(false); }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-success"
                onClick={showBatchPayModal ? handleBatchPaySubmit : handleRecordPayment}
              >
                Mark as Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          MODAL: CATEGORY CREATE / EDIT
          ══════════════════════════════════════════════════════════ */}
      {categoryModal.show && (
        <div className="expense-modal-backdrop" onClick={() => setCategoryModal({ show: false, category: null })}>
          <div className="expense-modal-content" style={{ maxWidth: "480px" }} onClick={(e) => e.stopPropagation()}>
            <div className="expense-modal-header">
              <h2 className="expense-modal-title">
                {categoryModal.category ? "Edit Category" : "New Expense Category"}
              </h2>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: "4px 10px" }}
                onClick={() => setCategoryModal({ show: false, category: null })}
              >
                <IconX size={14} />
              </button>
            </div>

            <form onSubmit={handleSaveCategory}>
              <div className="expense-modal-body">
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                      Category Name *
                    </label>
                    <input
                      type="text"
                      className="expense-input"
                      placeholder="e.g. Travel, Fuel, Food, Software"
                      style={{ width: "100%" }}
                      value={catForm.name}
                      onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                      Description
                    </label>
                    <input
                      type="text"
                      className="expense-input"
                      placeholder="Brief description of permissible expenses"
                      style={{ width: "100%" }}
                      value={catForm.description}
                      onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                    />
                  </div>

                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: "700", color: "#334155", marginBottom: "4px" }}>
                      Optional Per-Claim Limit (₹)
                    </label>
                    <input
                      type="number"
                      className="expense-input"
                      placeholder="Leave blank for no limit"
                      style={{ width: "100%" }}
                      value={catForm.maxLimit}
                      onChange={(e) => setCatForm({ ...catForm, maxLimit: e.target.value })}
                    />
                  </div>

                  {categoryModal.category && (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <input
                        type="checkbox"
                        id="chk-cat-active"
                        checked={catForm.isActive}
                        onChange={(e) => setCatForm({ ...catForm, isActive: e.target.checked })}
                      />
                      <label htmlFor="chk-cat-active" style={{ fontSize: "13px", fontWeight: "600", color: "#334155", cursor: "pointer" }}>
                        Active Category (Available for employees)
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div className="expense-modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCategoryModal({ show: false, category: null })}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        show={confirmConfig.show}
        onClose={() => setConfirmConfig(prev => ({ ...prev, show: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.confirmText}
        confirmColor={confirmConfig.confirmColor}
      />
    </div>
  );
}
