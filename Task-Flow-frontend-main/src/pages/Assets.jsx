import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../contexts/PermissionContext";
import FormModal from "../components/common/FormModal";
import ConfirmModal from "../components/common/ConfirmModal";
import { IconLaptop, IconPlus, IconBuilding, IconUser, IconCpu, IconHardDrive, IconKey, IconHistory, IconCheck, IconEdit, IconTrash } from "../components/common/Icons";
import Pagination from "../components/common/Pagination";
import { useTableSort, SortIndicator } from "../utils/tableSort";
import "../style/main.css";

export default function Assets() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { hasPermission: ctxHasPermission } = usePermissions();

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

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isOwner = isSuperAdmin || user?.role?.name === "Company Owner";
  const hasPermission = (action = "read") => {
    if (isOwner) return true;
    return ctxHasPermission("asset_management", action);
  };

  const canCreate = hasPermission("create");
  const canUpdate = hasPermission("update");
  const canDelete = hasPermission("delete");
  const isHRorAdmin = isOwner || canCreate || canUpdate || user?.position?.includes("HR");

  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("all"); // 'all' or 'my'
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { sortedData: sortedAssets, sortConfig: assetSortConfig, requestSort: requestAssetSort } = useTableSort(assets, "asset_tag", "asc");
  const paginatedAssets = sortedAssets.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Create Asset Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    asset_tag: "",
    name: "",
    category: "Laptop",
    brand: "",
    model: "",
    serial_number: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    purchase_cost: "",
    warranty_expiry: "",
    specs_ram: "",
    specs_storage: "",
    specs_os: "",
    notes: ""
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Edit Asset Modal
  const [editModal, setEditModal] = useState({ show: false, asset: null });
  const [editForm, setEditForm] = useState({
    asset_tag: "",
    name: "",
    category: "Laptop",
    brand: "",
    model: "",
    serial_number: "",
    purchase_date: "",
    purchase_cost: "",
    warranty_expiry: "",
    specs_ram: "",
    specs_storage: "",
    specs_os: "",
    status: "Available",
    notes: ""
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Assign Modal
  const [assignModal, setAssignModal] = useState({
    show: false,
    asset: null,
    user_id: "",
    user_name: "",
    user_email: "",
    expected_return_date: "",
    condition: "Excellent",
    notes: ""
  });
  const [submittingAssign, setSubmittingAssign] = useState(false);

  // Return Modal
  const [returnModal, setReturnModal] = useState({
    show: false,
    asset: null,
    condition: "Good",
    return_notes: "",
    new_status: "Available"
  });
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // History Modal
  const [historyModal, setHistoryModal] = useState({
    show: false,
    asset: null,
    history: [],
    loading: false
  });

  const fetchAssets = async () => {
    try {
      setLoading(true);
      const url = activeTab === "my" 
        ? "/assets/my-assets"
        : `/assets?category=${categoryFilter}&status=${statusFilter}&search=${encodeURIComponent(search)}`;
      const res = await API.get(url);
      setAssets(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching assets:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await API.get("/staff");
      setEmployees(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching staff:", err);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    const trimmed = (search || "").trim();
    if (!trimmed || trimmed.length >= 3) {
      const delay = setTimeout(() => {
        fetchAssets();
      }, 300);
      return () => clearTimeout(delay);
    }
  }, [activeTab, categoryFilter, statusFilter, search]);

  useEffect(() => {
    if (isHRorAdmin) {
      fetchEmployees();
    }
  }, [isHRorAdmin]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchAssets();
  };

  // Add Asset Submit
  const handleAddAsset = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!addForm.asset_tag || !addForm.asset_tag.trim()) errs.asset_tag = "Asset Tag is required";
    if (!addForm.category) errs.category = "Category is required";
    if (!addForm.name || !addForm.name.trim()) errs.name = "Asset Name is required";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      showToast("Please fill all required fields", "error");
      return;
    }
    setFieldErrors({});
    setSubmittingAdd(true);
    try {
      const payload = {
        ...addForm,
        purchase_cost: parseFloat(addForm.purchase_cost) || 0,
        specs: {
          ram: addForm.specs_ram,
          storage: addForm.specs_storage,
          os: addForm.specs_os
        }
      };
      await API.post("/assets", payload);
      showToast("Asset added to inventory successfully!", "success");
      setShowAddModal(false);
      setFieldErrors({});
      setAddForm({
        asset_tag: "",
        name: "",
        category: "Laptop",
        brand: "",
        model: "",
        serial_number: "",
        purchase_date: new Date().toISOString().slice(0, 10),
        purchase_cost: "",
        warranty_expiry: "",
        specs_ram: "",
        specs_storage: "",
        specs_os: "",
        notes: ""
      });
      fetchAssets();
    } catch (err) {
      const serverErr = err.response?.data?.error;
      const serverField = err.response?.data?.field;
      if (serverField) {
        setFieldErrors({ [serverField]: serverErr });
      } else if (serverErr) {
        showToast(serverErr, "error");
      } else {
        showToast("Failed to add asset", "error");
      }
    } finally {
      setSubmittingAdd(false);
    }
  };

  // Assign Submit
  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignModal.user_id) {
      showToast("Please select an employee", "error");
      return;
    }
    setSubmittingAssign(true);
    try {
      await API.post(`/assets/${assignModal.asset.id}/assign`, {
        user_id: assignModal.user_id,
        user_name: assignModal.user_name,
        user_email: assignModal.user_email,
        expected_return_date: assignModal.expected_return_date,
        condition_on_assign: assignModal.condition,
        notes: assignModal.notes
      });
      showToast(`Asset assigned to ${assignModal.user_name}!`, "success");
      setAssignModal({ show: false, asset: null, user_id: "", user_name: "", user_email: "", expected_return_date: "", condition: "Excellent", notes: "" });
      fetchAssets();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to assign asset", "error");
    } finally {
      setSubmittingAssign(false);
    }
  };

  // Return Submit
  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    setSubmittingReturn(true);
    try {
      await API.post(`/assets/${returnModal.asset.id}/return`, {
        condition_on_return: returnModal.condition,
        return_notes: returnModal.return_notes,
        new_status: returnModal.new_status
      });
      showToast("Asset returned and marked as Available!", "success");
      setReturnModal({ show: false, asset: null, condition: "Good", return_notes: "", new_status: "Available" });
      fetchAssets();
    } catch (err) {
      showToast(err.response?.data?.error || "Return check-in failed", "error");
    } finally {
      setSubmittingReturn(false);
    }
  };

  // Edit Asset Handlers
  const handleOpenEdit = (ast) => {
    setEditModal({ show: true, asset: ast });
    setEditForm({
      asset_tag: ast.asset_tag || "",
      name: ast.name || "",
      category: ast.category || "Laptop",
      brand: ast.brand || "",
      model: ast.model || "",
      serial_number: ast.serial_number || "",
      purchase_date: ast.purchase_date ? ast.purchase_date.slice(0, 10) : "",
      purchase_cost: ast.purchase_cost || "",
      warranty_expiry: ast.warranty_expiry ? ast.warranty_expiry.slice(0, 10) : "",
      specs_ram: ast.specs?.ram || "",
      specs_storage: ast.specs?.storage || "",
      specs_os: ast.specs?.os || "",
      status: ast.status || "Available",
      notes: ast.notes || ""
    });
  };

  const handleSaveEdit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editModal.asset) return;
    setSavingEdit(true);
    try {
      const payload = {
        ...editForm,
        purchase_cost: parseFloat(editForm.purchase_cost) || 0,
        specs: {
          ram: editForm.specs_ram,
          storage: editForm.specs_storage,
          os: editForm.specs_os
        }
      };
      await API.put(`/assets/${editModal.asset.id}`, payload);
      showToast("Asset updated successfully!", "success");
      setEditModal({ show: false, asset: null });
      fetchAssets();
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to update asset", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteAsset = (ast) => {
    askConfirm("Delete Asset", `Are you sure you want to permanently delete asset ${ast.asset_tag} (${ast.name})?`, async () => {
      try {
        await API.delete(`/assets/${ast.id}`);
        showToast("Asset deleted from inventory", "info");
        fetchAssets();
      } catch (err) {
        showToast(err.response?.data?.error || "Delete failed", "error");
      }
    });
  };

  // View History
  const openHistory = async (asset) => {
    setHistoryModal({ show: true, asset, history: [], loading: true });
    try {
      const res = await API.get(`/assets/${asset.id}/history`);
      setHistoryModal({ show: true, asset, history: Array.isArray(res.data) ? res.data : [], loading: false });
    } catch (err) {
      setHistoryModal({ show: true, asset, history: [], loading: false });
    }
  };

  // KPI calculations
  const totalAssets = assets.length;
  const assignedAssets = assets.filter(a => a.status === "Assigned").length;
  const availableAssets = assets.filter(a => a.status === "Available").length;
  const softwareLicenses = assets.filter(a => a.category === "Software License").length;

  return (
    <div className="main-content-container" style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "var(--text-main, #0f172a)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <IconLaptop size={28} color="#2563eb" /> IT Asset Management
          </h1>
          <p style={{ color: "var(--text-muted, #64748b)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Laptops, Workstations, Mobile Devices, Peripherals & Software Licenses Allocation
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          {canCreate && (
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                padding: "0.6rem 1.2rem",
                fontWeight: "600",
                fontSize: "0.9rem",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(37,99,235,0.25)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem"
              }}
            >
              <IconPlus size={16} /> Add New Asset
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Total Assets</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#2563eb", marginTop: "0.25rem" }}>{totalAssets}</div>
        </div>
        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Assigned / In-Use</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#10b981", marginTop: "0.25rem" }}>{assignedAssets}</div>
        </div>
        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Available in Inventory</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#f59e0b", marginTop: "0.25rem" }}>{availableAssets}</div>
        </div>
        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Software & Tool Seats</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#8b5cf6", marginTop: "0.25rem" }}>{softwareLicenses}</div>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem", alignItems: "center" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => setActiveTab("all")}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                border: "none",
                fontWeight: "600",
                fontSize: "0.9rem",
                cursor: "pointer",
                background: activeTab === "all" ? "#2563eb" : "transparent",
                color: activeTab === "all" ? "#fff" : "var(--text-main, #334155)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <IconBuilding size={16} /> All Company Assets
            </button>
            <button
              onClick={() => setActiveTab("my")}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "8px",
                border: "none",
                fontWeight: "600",
                fontSize: "0.9rem",
                cursor: "pointer",
                background: activeTab === "my" ? "#2563eb" : "transparent",
                color: activeTab === "my" ? "#fff" : "var(--text-main, #334155)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              <IconUser size={16} /> My Assigned Equipment
            </button>
          </div>

          {/* Filters */}
          {activeTab === "all" && (
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <form onSubmit={handleSearchSubmit} style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  type="text"
                  placeholder="Search tag, serial, employee..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    padding: "0.45rem 0.75rem",
                    borderRadius: "6px",
                    border: "1px solid var(--ui-border, #cbd5e1)",
                    fontSize: "0.85rem",
                    minWidth: "220px"
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: "0.45rem 0.85rem",
                    borderRadius: "6px",
                    border: "1px solid #2563eb",
                    background: "#2563eb",
                    color: "#fff",
                    fontWeight: "600",
                    fontSize: "0.85rem",
                    cursor: "pointer"
                  }}
                >
                  Search
                </button>
              </form>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ padding: "0.45rem 0.75rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", fontSize: "0.85rem" }}
              >
                <option value="All">All Categories</option>
                <option value="Laptop">Laptops</option>
                <option value="Monitor">Monitors</option>
                <option value="Mobile">Mobile Devices</option>
                <option value="Software License">Software Licenses</option>
                <option value="Accessory">Accessories / Network</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ padding: "0.45rem 0.75rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", fontSize: "0.85rem" }}
              >
                <option value="All">All Statuses</option>
                <option value="Available">Available</option>
                <option value="Assigned">Assigned</option>
                <option value="Under Repair">Under Repair</option>
                <option value="Retired">Retired</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Asset Inventory Table */}
      <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted, #64748b)" }}>
            Loading assets...
          </div>
        ) : assets.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted, #64748b)" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
              <IconLaptop size={40} color="#94a3b8" />
            </div>
            <p style={{ marginTop: "0.5rem", fontWeight: "600" }}>No assets found matching the criteria.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)", fontWeight: "600", fontSize: "0.8rem", textTransform: "uppercase" }}>
                  <th onClick={() => requestAssetSort("asset_tag")} style={{ padding: "0.85rem 1.25rem", cursor: "pointer", userSelect: "none" }}>
                    Asset Tag & Name <SortIndicator sortKey="asset_tag" currentKey={assetSortConfig.key} direction={assetSortConfig.direction} />
                  </th>
                  <th onClick={() => requestAssetSort("category")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Category & Brand <SortIndicator sortKey="category" currentKey={assetSortConfig.key} direction={assetSortConfig.direction} />
                  </th>
                  <th onClick={() => requestAssetSort("serial_number")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Serial / License <SortIndicator sortKey="serial_number" currentKey={assetSortConfig.key} direction={assetSortConfig.direction} />
                  </th>
                  <th style={{ padding: "0.85rem 1rem" }}>Hardware Specs</th>
                  <th onClick={() => requestAssetSort("status")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Status <SortIndicator sortKey="status" currentKey={assetSortConfig.key} direction={assetSortConfig.direction} />
                  </th>
                  <th onClick={() => requestAssetSort("assigned_to_name")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Current Assignee <SortIndicator sortKey="assigned_to_name" currentKey={assetSortConfig.key} direction={assetSortConfig.direction} />
                  </th>
                  <th style={{ padding: "0.85rem 1.25rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAssets.map((ast) => {
                  const statusColors = {
                    Available: { bg: "#ecfdf5", text: "#059669", border: "#a7f3d0" },
                    Assigned: { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },
                    "Under Repair": { bg: "#fffbeb", text: "#d97706", border: "#fde68a" },
                    Retired: { bg: "#f1f5f9", text: "#64748b", border: "#cbd5e1" }
                  };
                  const color = statusColors[ast.status] || statusColors.Available;

                  return (
                    <tr key={ast.id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)", transition: "background 0.15s ease" }}>
                      <td style={{ padding: "1rem 1.25rem" }}>
                        <div style={{ fontWeight: "700", color: "#1d4ed8" }}>{ast.asset_tag}</div>
                        <div style={{ fontWeight: "600", color: "var(--text-main, #0f172a)", marginTop: "0.15rem" }}>{ast.name}</div>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <div style={{ fontWeight: "600", color: "var(--text-main, #334155)" }}>{ast.category}</div>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted, #64748b)" }}>{ast.brand} {ast.model}</div>
                      </td>
                      <td style={{ padding: "1rem", fontFamily: "monospace", fontSize: "0.85rem", color: "#475569" }}>
                        {ast.serial_number || "—"}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "0.85rem" }}>
                        {ast.specs?.ram && <div style={{ display: "flex", alignItems: "center", gap: "5px" }}><IconCpu size={14} color="#6366f1" /> {ast.specs.ram}</div>}
                        {ast.specs?.storage && <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}><IconHardDrive size={14} color="#059669" /> {ast.specs.storage}</div>}
                        {ast.specs?.os && <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}><IconLaptop size={14} color="#2563eb" /> {ast.specs.os}</div>}
                        {ast.specs?.products && <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "2px" }}><IconKey size={14} color="#d97706" /> {ast.specs.products}</div>}
                        {!ast.specs?.ram && !ast.specs?.products && <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <span style={{
                          padding: "0.25rem 0.65rem",
                          borderRadius: "9999px",
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          background: color.bg,
                          color: color.text,
                          border: `1px solid ${color.border}`
                        }}>
                          {ast.status}
                        </span>
                      </td>
                      <td style={{ padding: "1rem" }}>
                        {ast.assigned_to_name ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#3b82f6", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: "700" }}>
                              {ast.assigned_to_name.charAt(0)}
                            </div>
                            <span style={{ fontWeight: "600", color: "var(--text-main, #1e293b)" }}>{ast.assigned_to_name}</span>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted, #94a3b8)", fontStyle: "italic" }}>Unassigned</span>
                        )}
                      </td>
                      <td style={{ padding: "1rem 1.25rem", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "0.4rem" }}>
                          <button
                            onClick={() => openHistory(ast)}
                            title="Assignment History"
                            style={{ padding: "0.35rem 0.65rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", background: "#fff", cursor: "pointer", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            <IconHistory size={14} /> History
                          </button>

                          {canUpdate && ast.status === "Available" && (
                            <button
                              onClick={() => setAssignModal({ show: true, asset: ast, user_id: "", user_name: "", user_email: "", expected_return_date: "", condition: "Excellent", notes: "" })}
                              style={{ padding: "0.35rem 0.65rem", borderRadius: "6px", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <IconUser size={14} /> Assign
                            </button>
                          )}

                          {canUpdate && ast.status === "Assigned" && (
                            <button
                              onClick={() => setReturnModal({ show: true, asset: ast, condition: "Good", return_notes: "", new_status: "Available" })}
                              style={{ padding: "0.35rem 0.65rem", borderRadius: "6px", border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontSize: "0.8rem", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: "4px" }}
                            >
                              <IconCheck size={14} /> Return
                            </button>
                          )}

                          {canUpdate && (
                            <button
                              onClick={() => handleOpenEdit(ast)}
                              title="Edit Asset Details"
                              style={{ padding: "0.35rem 0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", background: "#fff", color: "#2563eb", cursor: "pointer", fontSize: "0.8rem", display: "inline-flex", alignItems: "center" }}
                            >
                              <IconEdit size={14} color="#2563eb" />
                            </button>
                          )}

                          {canDelete && (
                            <button
                              onClick={() => handleDeleteAsset(ast)}
                              title="Delete Asset"
                              style={{ padding: "0.35rem 0.55rem", borderRadius: "6px", border: "1px solid #fecaca", background: "#fff", color: "#ef4444", cursor: "pointer", fontSize: "0.8rem", display: "inline-flex", alignItems: "center" }}
                            >
                              <IconTrash size={14} color="#ef4444" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination
              currentPage={currentPage}
              totalRecords={assets.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
            />
          </div>
        )}
      </div>

      {/* ─── ADD ASSET MODAL ─── */}
      <FormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Company Asset"
        onSubmit={handleAddAsset}
        submitText={submittingAdd ? "Saving..." : "Add to Inventory"}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>
              Asset Tag <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. PST-LAP-045"
              required
              value={addForm.asset_tag}
              onChange={(e) => {
                setAddForm({ ...addForm, asset_tag: e.target.value });
                if (fieldErrors.asset_tag) setFieldErrors({ ...fieldErrors, asset_tag: null });
              }}
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "6px",
                border: fieldErrors.asset_tag ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
                background: fieldErrors.asset_tag ? "#fff5f5" : undefined
              }}
            />
            {fieldErrors.asset_tag && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {fieldErrors.asset_tag}
              </span>
            )}
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Category *</label>
            <select
              value={addForm.category}
              required
              onChange={(e) => {
                setAddForm({ ...addForm, category: e.target.value });
                if (fieldErrors.category) setFieldErrors(prev => ({ ...prev, category: "" }));
              }}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: fieldErrors.category ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)", background: fieldErrors.category ? "#fff5f5" : undefined }}
            >
              <option value="Laptop">Laptop</option>
              <option value="Monitor">Monitor</option>
              <option value="Mobile">Mobile Phone / Tablet</option>
              <option value="Software License">Software License / Subscription</option>
              <option value="Accessory">Accessory / Networking</option>
            </select>
            {fieldErrors.category && (
              <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
                {fieldErrors.category}
              </span>
            )}
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>
            Asset / Device Name <span style={{ color: "#ef4444", fontWeight: "700" }}>*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. MacBook Pro 16 M2 Max or Dell XPS 15"
            required
            value={addForm.name}
            onChange={(e) => {
              setAddForm({ ...addForm, name: e.target.value });
              if (fieldErrors.name) setFieldErrors({ ...fieldErrors, name: null });
            }}
            style={{
              width: "100%",
              padding: "0.5rem",
              borderRadius: "6px",
              border: fieldErrors.name ? "1px solid #ef4444" : "1px solid var(--ui-border, #cbd5e1)",
              background: fieldErrors.name ? "#fff5f5" : undefined
            }}
          />
          {fieldErrors.name && (
            <span style={{ color: "#ef4444", fontSize: "12px", marginTop: "5px", display: "block", fontWeight: "500" }}>
              {fieldErrors.name}
            </span>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Brand</label>
            <input
              type="text"
              placeholder="Apple, Dell, Lenovo, LG, JetBrains"
              value={addForm.brand}
              onChange={(e) => setAddForm({ ...addForm, brand: e.target.value })}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Model / Plan</label>
            <input
              type="text"
              placeholder="Model number or plan edition"
              value={addForm.model}
              onChange={(e) => setAddForm({ ...addForm, model: e.target.value })}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Serial Number / Key</label>
            <input
              type="text"
              placeholder="Hardware serial or license key"
              value={addForm.serial_number}
              onChange={(e) => setAddForm({ ...addForm, serial_number: e.target.value })}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Purchase Cost (₹)</label>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="e.g. 150000"
              value={addForm.purchase_cost}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setAddForm({ ...addForm, purchase_cost: isNaN(val) ? "" : Math.max(0, val) });
              }}
              style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "0.25rem" }}>RAM</label>
            <input
              type="text"
              placeholder="e.g. 32GB"
              value={addForm.specs_ram}
              onChange={(e) => setAddForm({ ...addForm, specs_ram: e.target.value })}
              style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "0.25rem" }}>Storage</label>
            <input
              type="text"
              placeholder="e.g. 1TB SSD"
              value={addForm.specs_storage}
              onChange={(e) => setAddForm({ ...addForm, specs_storage: e.target.value })}
              style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", fontWeight: "600", marginBottom: "0.25rem" }}>OS / Version</label>
            <input
              type="text"
              placeholder="macOS / Windows 11"
              value={addForm.specs_os}
              onChange={(e) => setAddForm({ ...addForm, specs_os: e.target.value })}
              style={{ width: "100%", padding: "0.45rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>
      </FormModal>

      {/* ─── ASSIGN ASSET MODAL ─── */}
      <FormModal
        isOpen={assignModal.show}
        onClose={() => setAssignModal({ ...assignModal, show: false })}
        title={`Assign Asset: ${assignModal.asset?.asset_tag}`}
        onSubmit={handleAssignSubmit}
        submitText={submittingAssign ? "Assigning..." : "Confirm Handover"}
      >
        <p style={{ margin: "0 0 1rem 0", color: "var(--text-muted, #64748b)", fontSize: "0.9rem" }}>
          Assigning <strong>{assignModal.asset?.name}</strong> to team member.
        </p>

        <div>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Select Employee *</label>
          <select
            required
            value={assignModal.user_id}
            onChange={(e) => {
              const selected = employees.find(emp => emp.id === e.target.value);
              setAssignModal({
                ...assignModal,
                user_id: e.target.value,
                user_name: selected?.name || "",
                user_email: selected?.email || ""
              });
            }}
            style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
          >
            <option value="">-- Choose Employee --</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name} ({emp.position || emp.department || emp.email})</option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Condition at Handover</label>
            <select
              value={assignModal.condition}
              onChange={(e) => setAssignModal({ ...assignModal, condition: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            >
              <option value="Brand New">Brand New</option>
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Expected Return Date</label>
            <input
              type="date"
              value={assignModal.expected_return_date}
              onChange={(e) => setAssignModal({ ...assignModal, expected_return_date: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Handover Notes / Accessories Included</label>
          <textarea
            rows="2"
            placeholder="e.g. Handed over with 96W USB-C charger, original box, and laptop sleeve."
            value={assignModal.notes}
            onChange={(e) => setAssignModal({ ...assignModal, notes: e.target.value })}
            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
          />
        </div>
      </FormModal>

      {/* ─── RETURN ASSET MODAL ─── */}
      <FormModal
        isOpen={returnModal.show}
        onClose={() => setReturnModal({ ...returnModal, show: false })}
        title={`Return Asset: ${returnModal.asset?.asset_tag}`}
        onSubmit={handleReturnSubmit}
        submitText={submittingReturn ? "Checking in..." : "Confirm Return"}
      >
        <p style={{ margin: "0 0 1rem 0", color: "var(--text-muted, #64748b)", fontSize: "0.9rem" }}>
          Returning <strong>{returnModal.asset?.name}</strong> from <strong>{returnModal.asset?.assigned_to_name}</strong>.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Condition on Return</label>
            <select
              value={returnModal.condition}
              onChange={(e) => setReturnModal({ ...returnModal, condition: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            >
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Scratched / Minor Wear">Scratched / Minor Wear</option>
              <option value="Damaged">Damaged / Requires Repair</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Update Asset Status To</label>
            <select
              value={returnModal.new_status}
              onChange={(e) => setReturnModal({ ...returnModal, new_status: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            >
              <option value="Available">Available for Re-assignment</option>
              <option value="Under Repair">Under Repair</option>
              <option value="Retired">Retired / Scrap</option>
            </select>
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Check-in Inspection Remarks</label>
          <textarea
            rows="2"
            placeholder="e.g. Device returned in clean working condition with charger."
            value={returnModal.return_notes}
            onChange={(e) => setReturnModal({ ...returnModal, return_notes: e.target.value })}
            style={{ width: "100%", padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
          />
        </div>
      </FormModal>

      {/* ─── HISTORY MODAL ─── */}
      <FormModal
        isOpen={historyModal.show}
        onClose={() => setHistoryModal({ ...historyModal, show: false })}
        title={`Assignment History: ${historyModal.asset?.asset_tag}`}
        onSubmit={(e) => { e.preventDefault(); setHistoryModal({ ...historyModal, show: false }); }}
        submitText="Close"
      >
        {historyModal.loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>Loading audit records...</div>
        ) : historyModal.history.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
            No prior assignments recorded for this asset yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "350px", overflowY: "auto" }}>
            {historyModal.history.map(h => (
              <div key={h.id} style={{ border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "8px", padding: "0.75rem", background: "var(--ui-bg, #f8fafc)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "700", color: "#1e293b", alignItems: "center" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                    <IconUser size={14} color="#64748b" /> {h.user_name}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: h.status === "Active" ? "#10b981" : "#64748b", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: h.status === "Active" ? "#10b981" : "#94a3b8" }} />
                    {h.status === "Active" ? "Currently Active" : "Returned"}
                  </span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted, #64748b)", marginTop: "0.25rem" }}>
                  Assigned on: {new Date(h.assigned_at).toLocaleDateString()} by {h.assigned_by_name || "Admin"}
                  {h.returned_at && ` | Returned on: ${new Date(h.returned_at).toLocaleDateString()}`}
                </div>
                {h.return_notes && (
                  <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: "0.35rem", fontStyle: "italic" }}>
                    "{h.return_notes}"
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </FormModal>

      {/* ─── EDIT ASSET MODAL ─── */}
      <FormModal
        isOpen={editModal.show}
        onClose={() => setEditModal({ show: false, asset: null })}
        title={`Edit Asset: ${editModal.asset?.asset_tag || ""}`}
        onSubmit={handleSaveEdit}
        submitText={savingEdit ? "Updating..." : "Update Asset"}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Asset Tag *</label>
            <input
              type="text"
              required
              value={editForm.asset_tag}
              onChange={(e) => setEditForm({ ...editForm, asset_tag: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Asset Name *</label>
            <input
              type="text"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Category</label>
            <select
              value={editForm.category}
              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            >
              <option value="Laptop">Laptop</option>
              <option value="Monitor">Monitor</option>
              <option value="Desktop">Desktop / Workstation</option>
              <option value="Phone">Mobile / Phone</option>
              <option value="Accessory">Accessory (Headphones, Mouse)</option>
              <option value="License">Software License / SaaS</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Brand / Maker</label>
            <input
              type="text"
              value={editForm.brand}
              onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Model</label>
            <input
              type="text"
              value={editForm.model}
              onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Serial Number</label>
            <input
              type="text"
              value={editForm.serial_number}
              onChange={(e) => setEditForm({ ...editForm, serial_number: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", fontFamily: "monospace" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Status</label>
            <select
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            >
              <option value="Available">Available (In Inventory)</option>
              <option value="Assigned">Assigned</option>
              <option value="Under Repair">Under Repair</option>
              <option value="Decommissioned">Decommissioned / Scrap</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Purchase Date</label>
            <input
              type="date"
              value={editForm.purchase_date}
              onChange={(e) => setEditForm({ ...editForm, purchase_date: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Warranty Expiry Date</label>
            <input
              type="date"
              value={editForm.warranty_expiry}
              onChange={(e) => setEditForm({ ...editForm, warranty_expiry: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginTop: "1rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>RAM</label>
            <input
              type="text"
              placeholder="e.g. 16 GB DDR5"
              value={editForm.specs_ram}
              onChange={(e) => setEditForm({ ...editForm, specs_ram: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Storage / SSD</label>
            <input
              type="text"
              placeholder="e.g. 512 GB NVMe"
              value={editForm.specs_storage}
              onChange={(e) => setEditForm({ ...editForm, specs_storage: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>OS / Version</label>
            <input
              type="text"
              placeholder="e.g. Windows 11 Pro / macOS"
              value={editForm.specs_os}
              onChange={(e) => setEditForm({ ...editForm, specs_os: e.target.value })}
              style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
            />
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label style={{ display: "block", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.35rem" }}>Internal Notes</label>
          <textarea
            rows="2"
            value={editForm.notes}
            onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
            style={{ width: "100%", padding: "0.55rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)" }}
          />
        </div>
      </FormModal>

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
