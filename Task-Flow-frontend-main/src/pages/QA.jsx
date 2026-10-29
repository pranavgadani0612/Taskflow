import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { useProject } from "../contexts/ProjectContext";
import { usePermissions } from "../contexts/PermissionContext";
import { ClipboardIcon, BugIcon, CheckIcon, CloseIcon, TrashIcon, EditIcon } from "../components/common/Icons";
import ConfirmModal from "../components/common/ConfirmModal";
import FormModal from "../components/common/FormModal";
import Pagination from "../components/common/Pagination";
import { useTableSort, SortIndicator } from "../utils/tableSort";
import "../style/main.css";
import "../style/table.css";

export default function QAManagement() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { selectedProject } = useProject();
  const { hasPermission: ctxHasPermission } = usePermissions();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isOwner = isSuperAdmin || user?.role?.name === "Company Owner";
  const hasPermission = (action = "read") => {
    if (isOwner) return true;
    return ctxHasPermission("qa_management", action);
  };

  const [activeTab, setActiveTab] = useState("testcases"); // "testcases" | "bugs"
  const [testCases, setTestCases] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [tcPage, setTcPage] = useState(1);
  const [tcPageSize, setTcPageSize] = useState(10);
  const { sortedData: sortedTc, sortConfig: tcSortConfig, requestSort: requestTcSort } = useTableSort(testCases, "title", "asc");
  const paginatedTc = sortedTc.slice((tcPage - 1) * tcPageSize, tcPage * tcPageSize);
  const [bugPage, setBugPage] = useState(1);
  const [bugPageSize, setBugPageSize] = useState(10);
  const { sortedData: sortedBugs, sortConfig: bugSortConfig, requestSort: requestBugSort } = useTableSort(bugs, "severity", "desc");
  const paginatedBugs = sortedBugs.slice((bugPage - 1) * bugPageSize, bugPage * bugPageSize);
  const [projects, setProjects] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(false);

  // Modal States
  const [showTcModal, setShowTcModal] = useState(false);
  const [showBugModal, setShowBugModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [tcFieldErrors, setTcFieldErrors] = useState({});
  const [bugFieldErrors, setBugFieldErrors] = useState({});

  const [tcForm, setTcForm] = useState({
    project_id: "",
    project_name: "",
    module_name: "",
    title: "",
    preconditions: "",
    steps: "",
    expected_result: "",
    severity: "Medium"
  });

  const [bugForm, setBugForm] = useState({
    project_id: "",
    project_name: "",
    test_case_id: "",
    title: "",
    description: "",
    steps_to_reproduce: "",
    severity: "Major",
    assigned_to: "",
    environment: "Staging"
  });

  const fetchInitialData = async () => {
    try {
      const [projRes, staffRes] = await Promise.all([
        API.get("/projects"),
        API.get("/staff")
      ]);
      setProjects(projRes.data || []);
      setStaffList(staffRes.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTestCases = async () => {
    setLoading(true);
    try {
      const url = selectedProject ? `/qa/test-cases?projectId=${selectedProject._id}` : "/qa/test-cases";
      const res = await API.get(url);
      setTestCases(res.data || []);
    } catch (err) {
      showToast("Error loading test cases", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchBugs = async () => {
    setLoading(true);
    try {
      const url = selectedProject ? `/qa/bugs?projectId=${selectedProject._id}` : "/qa/bugs";
      const res = await API.get(url);
      setBugs(res.data || []);
    } catch (err) {
      showToast("Error loading QA bugs", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeTab === "testcases") {
      fetchTestCases();
    } else {
      fetchBugs();
    }
  }, [activeTab, selectedProject]);

  // Execute Test Case (Pass / Fail)
  const handleExecuteTestCase = async (id, status) => {
    try {
      await API.put(`/qa/test-cases/${id}`, { status });
      showToast(`Test Case marked as ${status}`);
      fetchTestCases();
    } catch (err) {
      showToast("Failed to update status", "error");
    }
  };

  // Submit Test Case
  const handleSaveTestCase = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setTcFieldErrors({});
    if (!tcForm.title || !tcForm.title.trim()) {
      setTcFieldErrors({ title: "Plese enter test case title" });
      return;
    }
    try {
      const proj = projects.find(p => p._id === tcForm.project_id) || selectedProject;
      const payload = {
        ...tcForm,
        project_id: proj?._id || "",
        project_name: proj?.name || "General Project"
      };

      if (editItem) {
        await API.put(`/qa/test-cases/${editItem.id}`, payload);
        showToast("Test Case updated!");
      } else {
        await API.post("/qa/test-cases", payload);
        showToast("Test Case created successfully!");
      }
      setShowTcModal(false);
      setEditItem(null);
      setTcFieldErrors({});
      fetchTestCases();
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || "Failed to save test case";
      if (errMsg.toLowerCase().includes("title")) {
        setTcFieldErrors({ title: "Plese enter test case title" });
      } else {
        showToast(errMsg, "error");
      }
    }
  };

  // Submit Bug
  const handleSaveBug = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setBugFieldErrors({});
    if (!bugForm.title || !bugForm.title.trim()) {
      setBugFieldErrors({ title: "Plese enter bug title" });
      return;
    }
    try {
      const proj = projects.find(p => p._id === bugForm.project_id) || selectedProject;
      const payload = {
        ...bugForm,
        project_id: proj?._id || "",
        project_name: proj?.name || "General Project"
      };

      if (editItem) {
        await API.put(`/qa/bugs/${editItem.id}`, payload);
        showToast("Bug updated!");
      } else {
        await API.post("/qa/bugs", payload);
        showToast("Bug logged successfully!");
      }
      setShowBugModal(false);
      setEditItem(null);
      setBugFieldErrors({});
      fetchBugs();
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || "Failed to save bug";
      if (errMsg.toLowerCase().includes("title")) {
        setBugFieldErrors({ title: "Plese enter bug title" });
      } else {
        showToast(errMsg, "error");
      }
    }
  };

  // Edit Handlers
  const handleEditTestCase = (tc) => {
    setEditItem(tc);
    setTcForm({
      project_id: tc.project_id || "",
      project_name: tc.project_name || "",
      module_name: tc.module_name || "",
      title: tc.title || "",
      preconditions: tc.preconditions || "",
      steps: tc.steps || "",
      expected_result: tc.expected_result || "",
      severity: tc.severity || "Medium"
    });
    setShowTcModal(true);
  };

  const handleEditBug = (b) => {
    setEditItem(b);
    setBugForm({
      project_id: b.project_id || "",
      project_name: b.project_name || "",
      test_case_id: b.test_case_id || "",
      title: b.title || "",
      description: b.description || "",
      steps_to_reproduce: b.steps_to_reproduce || "",
      severity: b.severity || "Major",
      assigned_to: b.assigned_to || "",
      environment: b.environment || "Staging"
    });
    setShowBugModal(true);
  };

  // Delete Confirmation Handler
  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === "testcase") {
        await API.delete(`/qa/test-cases/${deleteConfirm.id}`);
        showToast("Test Case deleted successfully!", "delete");
        fetchTestCases();
      } else if (deleteConfirm.type === "bug") {
        await API.delete(`/qa/bugs/${deleteConfirm.id}`);
        showToast("Bug deleted successfully!", "delete");
        fetchBugs();
      }
    } catch (err) {
      showToast("Delete failed", "error");
    } finally {
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="task-page" style={{ padding: "24px" }}>
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#1e293b", margin: 0 }}>
            Quality Assurance (QA) & Testing
          </h1>
          <p style={{ color: "#64748b", fontSize: "14px", marginTop: "4px" }}>
            Design test suites, execute test runs, and track defects across software releases.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          {hasPermission("create") && (activeTab === "testcases" ? (
            <button
              onClick={() => {
                setEditItem(null);
                setTcForm({
                  project_id: selectedProject?._id || projects[0]?._id || "",
                  project_name: selectedProject?.name || projects[0]?.name || "",
                  module_name: "Authentication",
                  title: "",
                  preconditions: "",
                  steps: "",
                  expected_result: "",
                  severity: "Medium"
                });
                setShowTcModal(true);
              }}
              style={{ background: "#4f46e5", color: "#fff", padding: "10px 18px", borderRadius: "8px", border: "none", fontWeight: "600", cursor: "pointer" }}
            >
              + Create Test Case
            </button>
          ) : (
            <button
              onClick={() => {
                setEditItem(null);
                setBugForm({
                  project_id: selectedProject?._id || projects[0]?._id || "",
                  project_name: selectedProject?.name || projects[0]?.name || "",
                  test_case_id: "",
                  title: "",
                  description: "",
                  steps_to_reproduce: "",
                  severity: "Major",
                  assigned_to: staffList[0]?.name || "Unassigned",
                  environment: "Staging"
                });
                setShowBugModal(true);
              }}
              style={{ background: "#dc2626", color: "#fff", padding: "10px 18px", borderRadius: "8px", border: "none", fontWeight: "600", cursor: "pointer" }}
            >
              + Log New Bug
            </button>
          ))}
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid #e2e8f0", marginBottom: "20px" }}>
        <button
          onClick={() => setActiveTab("testcases")}
          style={{
            padding: "10px 20px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "testcases" ? "3px solid #4f46e5" : "none",
            fontWeight: activeTab === "testcases" ? "700" : "500",
            color: activeTab === "testcases" ? "#4f46e5" : "#64748b",
            cursor: "pointer",
            fontSize: "15px"
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <ClipboardIcon size={16} /> Test Cases ({testCases.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab("bugs")}
          style={{
            padding: "10px 20px",
            background: "none",
            border: "none",
            borderBottom: activeTab === "bugs" ? "3px solid #dc2626" : "none",
            fontWeight: activeTab === "bugs" ? "700" : "500",
            color: activeTab === "bugs" ? "#dc2626" : "#64748b",
            cursor: "pointer",
            fontSize: "15px"
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <BugIcon size={16} /> QA Defect Board ({bugs.length})
          </span>
        </button>
      </div>

      {/* CONTENT: TEST CASES TABLE */}
      {activeTab === "testcases" && (
        <div className="table-container" style={{ background: "#fff", borderRadius: "10px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <span style={{ fontWeight: "700", color: "#1e293b", fontSize: "14px" }}>Test Cases Repository</span>
            <span className="mobile-scroll-hint" style={{ fontSize: "11px", color: "#4f46e5", fontWeight: "600", background: "#eef2ff", padding: "3px 8px", borderRadius: "6px" }}>
              ⇄ Swipe table horizontally
            </span>
          </div>
          <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: "750px", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", fontSize: "13px" }}>
                <th onClick={() => requestTcSort("title")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Test Case <SortIndicator sortKey="title" currentKey={tcSortConfig.key} direction={tcSortConfig.direction} />
                </th>
                <th onClick={() => requestTcSort("module_name")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Module / Project <SortIndicator sortKey="module_name" currentKey={tcSortConfig.key} direction={tcSortConfig.direction} />
                </th>
                <th onClick={() => requestTcSort("severity")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Severity <SortIndicator sortKey="severity" currentKey={tcSortConfig.key} direction={tcSortConfig.direction} />
                </th>
                <th onClick={() => requestTcSort("last_status")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Status <SortIndicator sortKey="last_status" currentKey={tcSortConfig.key} direction={tcSortConfig.direction} />
                </th>
                <th style={{ padding: "14px 16px" }}>Execute Run</th>
                <th style={{ padding: "14px 16px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ padding: "30px", textAlign: "center" }}>Loading test cases...</td></tr>
              ) : testCases.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No test cases created yet. Click "+ Create Test Case" above.</td></tr>
              ) : (
                paginatedTc.map((tc) => (
                  <tr key={tc.id} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "14px" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <strong style={{ color: "#1e293b" }}>{tc.title}</strong>
                      <span style={{ display: "block", fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                        Expected: {tc.expected_result || "N/A"}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{ fontWeight: "600", color: "#475569" }}>{tc.module_name || "General"}</span>
                      <span style={{ display: "block", fontSize: "12px", color: "#94a3b8" }}>{tc.project_name}</span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        padding: "3px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700",
                        background: tc.severity === "Critical" ? "#fee2e2" : tc.severity === "High" ? "#ffedd5" : "#f1f5f9",
                        color: tc.severity === "Critical" ? "#dc2626" : tc.severity === "High" ? "#c2410c" : "#475569"
                      }}>
                        {tc.severity}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "700",
                        background: tc.status === "Passed" ? "#dcfce7" : tc.status === "Failed" ? "#fee2e2" : "#f1f5f9",
                        color: tc.status === "Passed" ? "#16a34a" : tc.status === "Failed" ? "#dc2626" : "#64748b"
                      }}>
                        {tc.status}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      {hasPermission("update") && (
                        <>
                          <button
                            onClick={() => handleExecuteTestCase(tc.id, "Passed")}
                            style={{
                              padding: "4px 10px", background: "#dcfce7", color: "#15803d", border: "none",
                              borderRadius: "6px", cursor: "pointer", fontWeight: "700", marginRight: "6px",
                              display: "inline-flex", alignItems: "center", gap: "4px"
                            }}
                          >
                            <CheckIcon size={12} color="#15803d" /> Pass
                          </button>
                          <button
                            onClick={() => handleExecuteTestCase(tc.id, "Failed")}
                            style={{
                              padding: "4px 10px", background: "#fee2e2", color: "#b91c1c", border: "none",
                              borderRadius: "6px", cursor: "pointer", fontWeight: "700",
                              display: "inline-flex", alignItems: "center", gap: "4px"
                            }}
                          >
                            <CloseIcon size={12} color="#b91c1c" /> Fail
                          </button>
                        </>
                      )}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div className="action-buttons">
                        {hasPermission("update") && (
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => handleEditTestCase(tc)}
                            title="Edit"
                          >
                            <EditIcon size={16} />
                          </button>
                        )}
                        {hasPermission("delete") && (
                          <button
                            type="button"
                            className="action-btn delete"
                            onClick={() => setDeleteConfirm({ type: "testcase", id: tc.id })}
                            title="Delete"
                          >
                            <TrashIcon size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={tcPage}
            totalRecords={testCases.length}
            pageSize={tcPageSize}
            onPageChange={setTcPage}
            onPageSizeChange={(newSize) => { setTcPageSize(newSize); setTcPage(1); }}
          />
          </div>
        </div>
      )}

      {/* CONTENT: QA BUGS TABLE */}
      {activeTab === "bugs" && (
        <div className="table-container" style={{ background: "#fff", borderRadius: "10px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
            <span style={{ fontWeight: "700", color: "#1e293b", fontSize: "14px" }}>Defect Tracking Board</span>
            <span className="mobile-scroll-hint" style={{ fontSize: "11px", color: "#dc2626", fontWeight: "600", background: "#fef2f2", padding: "3px 8px", borderRadius: "6px" }}>
              ⇄ Swipe table horizontally
            </span>
          </div>
          <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ width: "100%", minWidth: "750px", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", fontSize: "13px" }}>
                <th onClick={() => requestBugSort("title")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Bug Details <SortIndicator sortKey="title" currentKey={bugSortConfig.key} direction={bugSortConfig.direction} />
                </th>
                <th onClick={() => requestBugSort("severity")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Severity <SortIndicator sortKey="severity" currentKey={bugSortConfig.key} direction={bugSortConfig.direction} />
                </th>
                <th onClick={() => requestBugSort("environment")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Environment <SortIndicator sortKey="environment" currentKey={bugSortConfig.key} direction={bugSortConfig.direction} />
                </th>
                <th onClick={() => requestBugSort("assigned_to")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Assigned Developer <SortIndicator sortKey="assigned_to" currentKey={bugSortConfig.key} direction={bugSortConfig.direction} />
                </th>
                <th onClick={() => requestBugSort("status")} style={{ padding: "14px 16px", cursor: "pointer", userSelect: "none" }}>
                  Bug Status <SortIndicator sortKey="status" currentKey={bugSortConfig.key} direction={bugSortConfig.direction} />
                </th>
                <th style={{ padding: "14px 16px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" style={{ padding: "30px", textAlign: "center" }}>Loading bugs...</td></tr>
              ) : bugs.length === 0 ? (
                <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No defects logged. Clean build!</td></tr>
              ) : (
                paginatedBugs.map((b) => (
                  <tr key={b.id} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "14px" }}>
                    <td style={{ padding: "14px 16px" }}>
                      <strong style={{ color: "#dc2626" }}>{b.title}</strong>
                      <span style={{ display: "block", fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                        Project: {b.project_name} • Reported by: {b.reported_by}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "700",
                        background: b.severity === "Critical" ? "#dc2626" : "#f97316",
                        color: "#fff"
                      }}>
                        {b.severity}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", color: "#475569" }}>
                      {b.environment || "Staging"}
                    </td>
                    <td style={{ padding: "14px 16px", fontWeight: "600", color: "#1e293b" }}>
                      {b.assigned_to || "Unassigned"}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <select
                        value={b.status}
                        onChange={async (e) => {
                          await API.put(`/qa/bugs/${b.id}`, { status: e.target.value });
                          fetchBugs();
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: "6px",
                          border: "1px solid #cbd5e1",
                          fontSize: "13px",
                          fontWeight: "600"
                        }}
                      >
                        <option value="Open">Open</option>
                        <option value="In Fixing">In Fixing</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Retest">Retest</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <div className="action-buttons">
                        {hasPermission("update") && (
                          <button
                            type="button"
                            className="action-btn"
                            onClick={() => handleEditBug(b)}
                            title="Edit"
                          >
                            <EditIcon size={16} />
                          </button>
                        )}
                        {hasPermission("delete") && (
                          <button
                            type="button"
                            className="action-btn delete"
                            onClick={() => setDeleteConfirm({ type: "bug", id: b.id })}
                            title="Delete"
                          >
                            <TrashIcon size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <Pagination
            currentPage={bugPage}
            totalRecords={bugs.length}
            pageSize={bugPageSize}
            onPageChange={setBugPage}
            onPageSizeChange={(newSize) => { setBugPageSize(newSize); setBugPage(1); }}
          />
          </div>
        </div>
      )}

      {/* MODAL: CREATE / EDIT TEST CASE */}
      <FormModal
        show={showTcModal}
        onClose={() => {
          setShowTcModal(false);
          setEditItem(null);
        }}
        title={editItem ? "Edit QA Test Case" : "Create QA Test Case"}
        onSave={handleSaveTestCase}
        saveText={editItem ? "Update Test Case" : "Save Test Case"}
        maxWidth="620px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Project</label>
            <select
              value={tcForm.project_id}
              onChange={(e) => setTcForm({ ...tcForm, project_id: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border)", borderRadius: "6px", background: "var(--ui-surface)", color: "var(--text-main)" }}
            >
              {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>
              Test Case Title <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Verify password reset email validation"
              required
              value={tcForm.title}
              onChange={(e) => {
                setTcForm({ ...tcForm, title: e.target.value });
                if (tcFieldErrors.title) setTcFieldErrors(prev => ({ ...prev, title: null }));
              }}
              style={{
                width: "100%", padding: "10px 12px",
                border: tcFieldErrors.title ? "1px solid #ef4444" : "1px solid var(--ui-border)",
                borderRadius: "6px", background: "var(--ui-surface)", color: "var(--text-main)"
              }}
            />
            {tcFieldErrors.title && (
              <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                {tcFieldErrors.title}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Module Name</label>
              <input
                type="text"
                placeholder="e.g. Auth / Dashboard / Tasks"
                value={tcForm.module_name}
                onChange={(e) => setTcForm({ ...tcForm, module_name: e.target.value })}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border)", borderRadius: "6px", background: "var(--ui-surface)", color: "var(--text-main)" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Severity</label>
              <select
                value={tcForm.severity}
                onChange={(e) => setTcForm({ ...tcForm, severity: e.target.value })}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border)", borderRadius: "6px", background: "var(--ui-surface)", color: "var(--text-main)" }}
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Steps to Reproduce</label>
            <textarea
              rows="3"
              placeholder="1. Enter email&#10;2. Click submit button..."
              value={tcForm.steps}
              onChange={(e) => setTcForm({ ...tcForm, steps: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border)", borderRadius: "6px", background: "var(--ui-surface)", color: "var(--text-main)", resize: "vertical" }}
            />
          </div>

          <div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Expected Result</label>
            <input
              type="text"
              placeholder="e.g. Email should be received with reset token"
              value={tcForm.expected_result}
              onChange={(e) => setTcForm({ ...tcForm, expected_result: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border)", borderRadius: "6px", background: "var(--ui-surface)", color: "var(--text-main)" }}
            />
          </div>
        </div>
      </FormModal>

      {/* MODAL: LOG / EDIT BUG */}
      <FormModal
        show={showBugModal}
        onClose={() => {
          setShowBugModal(false);
          setEditItem(null);
        }}
        title={editItem ? "Edit QA Bug / Defect" : "Log QA Bug / Defect"}
        onSave={handleSaveBug}
        saveText={editItem ? "Update Bug" : "Log Bug"}
        maxWidth="620px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Project</label>
            <select
              value={bugForm.project_id}
              onChange={(e) => setBugForm({ ...bugForm, project_id: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border)", borderRadius: "6px", background: "var(--ui-surface)", color: "var(--text-main)" }}
            >
              {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>
              Bug Title <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. 500 Internal Error when submitting timesheet"
              required
              value={bugForm.title}
              onChange={(e) => {
                setBugForm({ ...bugForm, title: e.target.value });
                if (bugFieldErrors.title) setBugFieldErrors(prev => ({ ...prev, title: null }));
              }}
              style={{
                width: "100%", padding: "10px 12px",
                border: bugFieldErrors.title ? "1px solid #ef4444" : "1px solid var(--ui-border)",
                borderRadius: "6px", background: "var(--ui-surface)", color: "var(--text-main)"
              }}
            />
            {bugFieldErrors.title && (
              <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                {bugFieldErrors.title}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Severity</label>
              <select
                value={bugForm.severity}
                onChange={(e) => setBugForm({ ...bugForm, severity: e.target.value })}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border)", borderRadius: "6px", background: "var(--ui-surface)", color: "var(--text-main)" }}
              >
                <option value="Critical">Critical (Blocker)</option>
                <option value="Major">Major</option>
                <option value="Medium">Medium</option>
                <option value="Minor">Minor / Cosmetic</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Assign Developer</label>
              <select
                value={bugForm.assigned_to}
                onChange={(e) => setBugForm({ ...bugForm, assigned_to: e.target.value })}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border)", borderRadius: "6px", background: "var(--ui-surface)", color: "var(--text-main)" }}
              >
                <option value="Unassigned">-- Choose Developer --</option>
                {staffList.map(s => <option key={s._id} value={s.name}>{s.name} ({s.position || "Dev"})</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-main)", display: "block", marginBottom: "6px" }}>Bug Description & Steps</label>
            <textarea
              rows="3"
              placeholder="Details of the bug and steps taken before failure..."
              value={bugForm.description}
              onChange={(e) => setBugForm({ ...bugForm, description: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", border: "1px solid var(--ui-border)", borderRadius: "6px", background: "var(--ui-surface)", color: "var(--text-main)", resize: "vertical" }}
            />
          </div>
        </div>
      </FormModal>

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmModal
        show={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Confirmation"
        message="Are you sure you want to delete this record?"
      />
    </div>
  );
}
