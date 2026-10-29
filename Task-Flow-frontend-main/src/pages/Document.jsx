import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import API from "../api/api";
import { useProject } from "../contexts/ProjectContext";
import FormModal from "../components/common/FormModal";
import PageHeader from "../components/common/PageHeader";
import DataTable from "../components/common/DataTable";
import { CKEditor } from "@ckeditor/ckeditor5-react";
import { 
    DecoupledEditor, Essentials, Bold, Italic, Paragraph, Link, List, BlockQuote, 
    Table, TableToolbar, Heading, Undo,
    Alignment, FontSize, FontFamily, FontColor, FontBackgroundColor,
    Strikethrough, Subscript, Superscript, Underline, Code, CodeBlock,
    FindAndReplace, HorizontalLine, Indent, IndentBlock, TodoList
} from "ckeditor5";
import "ckeditor5/ckeditor5.css";
import html2pdf from "html2pdf.js";
import ConfirmModal from "../components/common/ConfirmModal";
import { BellIcon } from "../components/common/Icons";
import "../style/main.css";
import { encryptContent, decryptContent } from "../utils/cryptoUtils";


const BASE_URL = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
  ? "http://localhost:5000/uploads/"
  : window.location.origin.replace("-5173", "-5000") + "/uploads/";
const SUPERADMIN_EMAIL = "gadanipranav@gmail.com";

export default function Document() {
    const { selectedProject } = useProject();
    const { user } = useAuth();
    const { hasPermission: ctxHasPermission } = usePermissions();
    const navigate = useNavigate();
    const isSuperAdmin = user?.email === SUPERADMIN_EMAIL || user?.role?.name === "Super Admin";
    const userRole = user?.role?.name?.toLowerCase() || "";
    const isCompanyOwner = userRole.includes("company owner") || userRole.includes("admin");

    const hasDocPermission = (action = "read") => {
        if (isSuperAdmin || isCompanyOwner) return true;
        return ctxHasPermission("document", action);
    };

    const canCreate = isSuperAdmin || isCompanyOwner || hasDocPermission("create") || hasDocPermission("all");
    const canUpdate = isSuperAdmin || isCompanyOwner || hasDocPermission("update") || hasDocPermission("all");
    const canDelete = isSuperAdmin || isCompanyOwner || hasDocPermission("delete") || hasDocPermission("all");
    const canRead = isSuperAdmin || isCompanyOwner || hasDocPermission("read") || hasDocPermission("all");
    const canManageDocs = isSuperAdmin || isCompanyOwner || hasDocPermission("all") || (canCreate && canUpdate);
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const viewDocId = params.get("view");
    const grantDocId = params.get("grant"); // superadmin clicks from email

    const [documents, setDocuments] = useState([]);
    const [projectMembers, setProjectMembers] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [memberSearch, setMemberSearch] = useState("");
    const [viewFile, setViewFile] = useState(null);
    const [projects, setProjects] = useState([]);
    const [deleteId, setDeleteId] = useState(null);

    // Mention system state for description
    const [mentionQuery, setMentionQuery] = useState(null);
    const [cursorPos, setCursorPos] = useState(0);
    const [grantPopup, setGrantPopup] = useState(null); // { doc } for superadmin grant confirmation
    const [requestingDocId, setRequestingDocId] = useState(null); // loading state
    const [toast, setToast] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null); // NEW: for tracking last save time
    const [fullEditorMode, setFullEditorMode] = useState(false);
    const [currentPage, setCurrentPage] = useState(0);
    const [showTextTypeDropdown, setShowTextTypeDropdown] = useState(false);
    const editorRef = React.useRef(null);
    const [pageCount, setPageCount] = React.useState(1);
    const pageOverlayRef = React.useRef(null);

    // Persist AutoSave preference in localStorage
    const [autoSaveEnabled, setAutoSaveEnabled] = useState(() => {
        const saved = localStorage.getItem("document-autosave");
        return saved === null ? true : JSON.parse(saved);
    });

    const [form, setForm] = useState({
        documentType: "",
        description: "",
        access: "All",
        assignedTo: [],
        project: "",
        file: null,
        oldFile: "",
        accessGranted: false,
        textType: "upload", // 'upload', 'notepad', 'doc'
        content: [{ id: `p-${Date.now()}-0`, content: "" }], // Array of STABLE unique pages
    });

    const [fieldErrors, setFieldErrors] = useState({});
    const editorsRef = React.useRef({}); // Changed to object mapping ID to editor instance

    const ckEditorEnabled = true; // Always ON
 
    // Persist AutoSave preference
    useEffect(() => {
        localStorage.setItem("document-autosave", JSON.stringify(autoSaveEnabled));
    }, [autoSaveEnabled]);


    // ================= TOAST =================
    const showToast = (msg, type = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    // Ref to track last saved content to avoid redundant loops
    const lastSavedRef = React.useRef("");

    // ================= AUTO SAVE EFFECT =================
    useEffect(() => {
        if (!autoSaveEnabled || !fullEditorMode) return;
        const currentContentStr = (typeof form.content === 'string' ? form.content : JSON.stringify(form.content)) + (form.description || "") + (form.project || "");
        if (currentContentStr === lastSavedRef.current) return;
        const hasTitle = form.description && form.description.trim().length > 0;
        if (!editId && !hasTitle) return;
        const timer = setTimeout(() => {
            save(true);
            lastSavedRef.current = currentContentStr;
        }, 2000);
        return () => clearTimeout(timer);
    }, [form.content, form.description, form.project, autoSaveEnabled, fullEditorMode, editId]);

    // ================= DYNAMIC MEMBERS =================
    useEffect(() => {
        const fetchMembers = async () => {
            const currentProjectId = form.project || selectedProject?._id;
            const staffRes = await API.get("/staff");
            const allStaff = staffRes.data || [];

            if (currentProjectId) {
                const targetProj = projects.find(p => p._id === currentProjectId);
                if (targetProj && targetProj.assignedTo) {
                    const assignedIds = targetProj.assignedTo.map(u => u._id || u);
                    setProjectMembers(allStaff.filter(s => assignedIds.includes(s._id)));
                } else {
                    // Fallback to project fetch if not in projects list (unlikely)
                    setProjectMembers(allStaff);
                }
            } else {
                setProjectMembers(allStaff);
            }
        };
        fetchMembers();
    }, [form.project, projects, selectedProject]);

    const [focusIdx, setFocusIdx] = useState(0);

    // Aggressive Focus migration for multi-sheet paging (Stitching) - EXCLUDED for Seamless Word Mode
    useEffect(() => {
        if (fullEditorMode) return; // Don't snap scroll in seamless mode
        const pages = Array.isArray(form.content) ? form.content : [];
        const targetPage = pages[focusIdx];
        if (targetPage && editorsRef.current[targetPage.id]) {
            setTimeout(() => {
                const targetEditor = editorsRef.current[targetPage.id];
                if (targetEditor) {
                    targetEditor.editing.view.focus();
                    
                    // Physical anchor scroll
                    const editorEl = targetEditor.ui.view.editable.element;
                    if (editorEl) {
                        editorEl.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                }
            }, 100);
        }
    }, [focusIdx, form.content.length, fullEditorMode]);

    // ================= LOAD =================
    const load = async () => {
        try {
            const url = selectedProject
                ? `/documents?project=${selectedProject._id}`
                : "/documents";
            const res = await API.get(url);
            const docs = res.data || [];
            setDocuments(docs);

            // Load projects for selection
            const projRes = await API.get("/projects");
            setProjects(projRes.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => { load(); }, [selectedProject]);

    // ================= KEYBOARD SHORTCUTS =================
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                save(false);
            }
            if (e.ctrlKey && e.key === 'Enter' && fullEditorMode && editorRef.current) {
                // Global fallback for Page Break
                editorRef.current.execute('manualPageBreak');
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [form, editId, autoSaveEnabled, fullEditorMode]);

    // ================= RESET FORM =================
    const resetForm = () => {
        setForm({
            documentType: "Document",
            description: "",
            access: "All",
            assignedTo: [],
            project: selectedProject?._id || "",
            file: null,
            oldFile: "",
            accessGranted: false,
            textType: "upload",
            content: [{ id: `p-${Date.now()}`, content: "" }],
        });
        setFieldErrors({});
        setEditId(null);
        setFocusIdx(0);
        setFullEditorMode(false);
    };

    // ================= SAVE =================
    const save = async (silent = false) => {
        if (!form.description || !form.description.trim()) {
            showToast("Document description / title is required", "error");
            return;
        }
        if (isSaving) return; // Prevent concurrent saves
        setFieldErrors({});
        if (!silent) showToast("Saving document...");
        
        setIsSaving(true);
        const fd = new FormData();
        fd.append("documentType", form.documentType);
        fd.append("description", form.description || "");
        fd.append("access", form.access || "All");
        fd.append("project", form.project || selectedProject?._id || "");
        form.assignedTo.forEach(id => fd.append("assignedTo", id));
        if (form.file) fd.append("file", form.file);
        fd.append("accessGranted", form.accessGranted);
        fd.append("textType", form.textType || "upload");
        
        // Serialize array of pages back to backend format with localized encryption
        if (form.textType !== 'upload') {
            const encryptedContent = Array.isArray(form.content)
                ? form.content.map(p => ({ ...p, content: encryptContent(p.content) }))
                : encryptContent(form.content);
            fd.append("content", JSON.stringify(encryptedContent));
        }

        try {
            let res;
            if (editId) {
                res = await API.put(`/documents/${editId}`, fd);
            } else {
                res = await API.post("/documents", fd);
                if (res.data?._id) setEditId(res.data._id);
            }
            
            const updatedDoc = res.data;
            // Update local documents list so table reflects changes without full reload
            setDocuments(prev => {
                const index = prev.findIndex(d => d._id === updatedDoc._id);
                if (index > -1) {
                    const newDocs = [...prev];
                    newDocs[index] = updatedDoc;
                    return newDocs;
                }
                return [updatedDoc, ...prev];
            });

            if (!silent) {
                showToast(editId ? "Changes saved." : "Document created.");
                setShowForm(false);
                setFullEditorMode(false);
                resetForm();
                load(); // Only reload projects/sidebar etc. if explicit save
            }
            
            // Sync current form state with updated data to keep text consistent
            if (updatedDoc?.content && silent) {
                 setForm(prev => ({ ...prev, content: updatedDoc.content }));
            }
            setLastSaved(new Date()); // Update last saved timestamp

        } catch (err) {
            console.error("Save error:", err);
            const errStr = err.response?.data?.error || err.response?.data?.message || err.message || "";
            if (errStr.toLowerCase().includes("description") || errStr.toLowerCase().includes("title")) {
                setFieldErrors({ description: "Plese enter description" });
            }
            if (!silent) showToast(errStr || "Error saving document", "error");
        } finally {
            setIsSaving(false);
        }
    };

    // ================= EDIT =================
    const edit = (doc) => {
        let rawContent = Array.isArray(doc.content) ? doc.content : [{ id: `p-${Date.now()}`, content: "" }];
        
        // Decrypt content for frontend display/edit
        rawContent = rawContent.map(p => ({ ...p, content: decryptContent(p.content) }));
        
        setForm({
            documentType: doc.documentType || "",
            description: doc.description || "",
            access: doc.access || "All",
            assignedTo: (doc.assignedTo || []).map(u => u._id || u),
            project: doc.project?._id || doc.project || "",
            file: null,
            oldFile: doc.file || "",
            accessGranted: doc.accessGranted || false,
            textType: doc.textType || "upload",
            content: rawContent,
        });
        setEditId(doc._id);
        setFocusIdx(0);
        setShowForm(true);
    };

    // ================= DELETE =================
    const handleConfirmDelete = async () => {
        if (!deleteId) return;
        try {
            await API.delete(`/documents/${deleteId}`);
            setDeleteId(null);
            load();
            showToast("Document deleted.");
        } catch (err) {
            console.error("Delete error:", err);
            showToast(err.response?.data?.error || err.message || "Error deleting document", "error");
        }
    };

    // ================= MEMBER TOGGLE =================
    const toggleMember = (id) => {
        setForm(prev => ({
            ...prev,
            assignedTo: prev.assignedTo.includes(id)
                ? prev.assignedTo.filter(m => m !== id)
                : [...prev.assignedTo, id],
        }));
    };

    // ================= FILE ICON =================
    const getFileIcon = (filename) => {
        const defaultIcon = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></svg>;
        if (!filename) return defaultIcon;
        const ext = filename.split(".").pop().toLowerCase();
        if (["pdf"].includes(ext)) return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><path d="M8 13h2a2 2 0 1 0 0-4H8v8" /><path d="M14 17h-2v-8h2a2 2 0 1 1 0 4h-2" /></svg>;
        if (["doc", "docx"].includes(ext)) return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><line x1="10" x2="8" y1="9" y2="9" /></svg>;
        if (["xls", "xlsx", "csv"].includes(ext)) return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><path d="M8 13h8M8 17h8M8 9h2" /></svg>;
        if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>;
        if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="4" rx="2" /><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" /><path d="M10 13h4" /></svg>;
        return defaultIcon;
    };

    // ================= REQUEST ACCESS (assigned user) =================
    const requestAccess = async (docId) => {
        setRequestingDocId(docId);
        try {
            await API.post(`/documents/${docId}/request-access`);
            showToast("Access request sent to admin! You will be notified.");
            // Update local state
            setDocuments(prev => prev.map(d =>
                d._id === docId ? { ...d, accessRequested: true } : d
            ));
        } catch (e) {
            showToast(e.response?.data?.error || "Failed to send request.", "error");
        } finally {
            setRequestingDocId(null);
        }
    };

    // ================= GRANT ACCESS (superadmin from popup) =================
    const grantAccess = async (docId) => {
        try {
            const res = await API.patch(`/documents/${docId}/access`);
            setDocuments(prev => prev.map(d => d._id === docId ? res.data : d));
            setGrantPopup(null);
            showToast("Access granted successfully!", "success");
        } catch (e) {
            showToast(e.response?.data?.error || "Failed to grant access.", "error");
        }
    };

    // ================= REVOKE ACCESS (superadmin) =================
    const revokeAccess = async (docId) => {
        try {
            const res = await API.patch(`/documents/${docId}/revoke-access`);
            setDocuments(prev => prev.map(d => d._id === docId ? res.data : d));
            showToast("Access revoked.");
        } catch (e) {
            showToast(e.response?.data?.error || "Failed to revoke access.", "error");
        }
    };

    // ================= FORCE DOWNLOAD =================
    const handleDownload = async (url, filename) => {
        try {
            const res = await fetch(url);
            if (!res.ok) {
                showToast("File could not be downloaded (Server error or file not found).", "error");
                return;
            }
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename || "document";
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch (e) {
            showToast("Download failed: " + e.message, "error");
        }
    };

    const downloadAsPDF = (doc) => {
        let pages = Array.isArray(doc.content) ? doc.content : [{ content: doc.content || "" }];
        
        // Decrypt pages for PDF export
        pages = pages.map(p => ({ ...p, content: decryptContent(p.content) }));
        
        const element = document.createElement('div');
        
        // Build a temporary container for PDF rendering
        element.style.padding = "0";
        element.style.margin = "0";
        element.innerHTML = pages.map(p => `
            <div style="padding:40px; background:#fff; page-break-after:always;">
                <div class="ck-content">${p.content}</div>
            </div>
        `).join("");

        const opt = {
            margin: 0,
            filename: `${doc.description || "document"}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(element).save();
    };

    const downloadAsTXT = (doc) => {
        let pages = Array.isArray(doc.content) ? doc.content : [{ content: doc.content || "" }];
        
        // Decrypt content for TXT export
        const fullHTML = pages.map(p => decryptContent(p.content)).join("\n\n");
        
        // Strip HTML tags for clean text content
        const tmp = document.createElement("DIV");
        tmp.innerHTML = fullHTML;
        const text = tmp.textContent || tmp.innerText || "";
        
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${doc.description || "document"}.txt`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    // ================= MENTIONS LOGIC =================
    const handleDescriptionChange = (e) => {
        const val = e.target.value;
        setForm({ ...form, description: val });
        const cursor = e.target.selectionStart;

        const textBeforeCursor = val.slice(0, cursor);
        const words = textBeforeCursor.split(/\s/);
        const currentWord = words[words.length - 1];

        if (currentWord.startsWith("@")) {
            setMentionQuery(currentWord.slice(1).toLowerCase());
            setCursorPos(cursor);
        } else {
            setMentionQuery(null);
        }
    };

    const handleMentionSelect = (memberName) => {
        const val = form.description || "";
        const textBeforeCursor = val.slice(0, cursorPos);
        const textAfterCursor = val.slice(cursorPos);

        const lastAtIndex = textBeforeCursor.lastIndexOf("@");
        if (lastAtIndex !== -1) {
            const newText = val.slice(0, lastAtIndex) + "@" + memberName + " " + textAfterCursor;
            setForm({ ...form, description: newText });
        }
        setMentionQuery(null);
    };

    // ================= PENDING REQUESTS (for superadmin) =================
    const pendingRequests = isSuperAdmin
        ? documents.filter(d => d.accessRequested && !d.accessGranted)
        : [];

    return (
        <div className="page">
            {/* ===== TOAST ===== */}
            {toast && (
                <div className={`toast toast-${toast.type || 'success'}`}>
                    {toast.type === 'success' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                    {toast.type === 'error' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>}
                    {toast.msg}
                </div>
            )}

            {/* ================= PAGE HEADER WITH SEPARATE BUTTONS ================= */}
            <div style={{ position: "relative" }}>
                <PageHeader
                    title={selectedProject ? `${selectedProject.name} — Documents` : "All Documents"}
                    buttonText={canCreate ? "+ Add Text" : null}
                    onButtonClick={canCreate ? () => setShowTextTypeDropdown(!showTextTypeDropdown) : null}
                    secondaryButtonText={canCreate ? "+ Upload File" : null}
                    onSecondaryButtonClick={canCreate ? () => { resetForm(); setForm(f => ({ ...f, textType: 'upload' })); setShowForm(true); } : null}
                />
                
                {showTextTypeDropdown && (
                    <div className="text-type-dropdown" style={{ right: '0' }}>
                        <div className="text-type-item" onClick={() => { resetForm(); setForm(f => ({ ...f, textType: 'notepad' })); setFullEditorMode(true); setShowTextTypeDropdown(false); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>
                            Notepad (.txt)
                        </div>
                        <div className="text-type-item" onClick={() => { resetForm(); setForm(f => ({ ...f, textType: 'doc' })); setFullEditorMode(true); setShowTextTypeDropdown(false); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                            DOC (A4 Pages)
                        </div>
                    </div>
                )}
            </div>

            {/* Banner & Popup Logic */}
            {isSuperAdmin && pendingRequests.length > 0 && (
                <div style={{ background: "rgba(245, 158, 11, 0.12)", border: "1.5px solid #f59e0b", borderRadius: "12px", padding: "16px 20px", marginBottom: "20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", color: "#f59e0b" }}><BellIcon size={20} color="#f59e0b" /></span>
                        <span style={{ fontWeight: "700", fontSize: "15px", color: "var(--text-main, #92400e)" }}>Pending Access Requests ({pendingRequests.length})</span>
                    </div>
                    {pendingRequests.map(doc => (
                        <div key={doc._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--ui-surface, #fff)", borderRadius: "8px", padding: "10px 16px", border: "1px solid var(--ui-border, #fde68a)", marginBottom: "8px" }}>
                            <div><span style={{ fontWeight: "600", fontSize: "14px", color: "var(--text-main)" }}>{doc.description || "Untitled"}</span></div>
                            <button onClick={() => setGrantPopup({ doc })} className="btn btn-primary">Grant Access</button>
                        </div>
                    ))}
                </div>
            )}

            {grantPopup && (
                <div onClick={() => setGrantPopup(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: "var(--ui-surface, #fff)", border: "1px solid var(--ui-border, #e2e8f0)", padding: "30px", borderRadius: "16px", textAlign: "center", color: "var(--text-main)" }}>
                        <h3 style={{ margin: "0 0 10px 0", color: "var(--text-main)" }}>Grant Access?</h3>
                        <p style={{ margin: "0 0 20px 0", color: "var(--text-muted)", fontSize: "14px" }}>Are you sure you want to grant access to this document?</p>
                        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                            <button onClick={() => setGrantPopup(null)} className="btn btn-secondary">Cancel</button>
                            <button onClick={() => grantAccess(grantPopup.doc._id)} className="btn btn-primary">Yes, Grant</button>
                        </div>
                    </div>
                </div>
            )}
            {/* ================= FORM MODAL ================= */}
            <FormModal
                show={showForm}
                onClose={() => { setShowForm(false); resetForm(); }}
                title={editId ? `Edit ${form.textType}` : `Add ${form.textType}`}
                onSave={save}
                width={form.textType !== 'upload' ? '1000px' : '600px'}
            >
                <div style={{ marginBottom: "15px" }}>
                    <label style={labelStyle}>Description / Title <span style={{ color: "#ef4444" }}>*</span></label>
                    <input
                        className="form-control"
                        placeholder="Enter title..."
                        required
                        value={form.description}
                        onChange={(e) => {
                            setForm({ ...form, description: e.target.value });
                            if (fieldErrors.description) setFieldErrors(prev => ({ ...prev, description: null }));
                        }}
                        style={fieldErrors.description ? { borderColor: "#ef4444" } : {}}
                    />
                    {fieldErrors.description && (
                        <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "4px" }}>
                            {fieldErrors.description}
                        </div>
                    )}
                </div>

                {isSuperAdmin && (
                    <div style={{ marginBottom: "15px", display: "flex", alignItems: "center", gap: "10px" }}>
                        <input
                            type="checkbox"
                            id="accessGranted"
                            checked={form.accessGranted}
                            onChange={e => setForm({ ...form, accessGranted: e.target.checked })}
                            style={{ width: "18px", height: "18px", cursor: "pointer" }}
                        />
                        <label htmlFor="accessGranted" style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>
                            Grant Instant Access to Assigned Users
                        </label>
                    </div>
                )}

                {/* ===== PROJECT SELECTION ===== */}
                <div style={{ marginBottom: "15px" }}>
                    <label style={labelStyle}>Link to Project</label>
                    <select
                        className="form-control"
                        value={form.project}
                        onChange={e => setForm({ ...form, project: e.target.value })}
                    >
                        <option value="">No Project (Global)</option>
                        {projects.map(p => (
                            <option key={p._id} value={p._id}>{p.name}</option>
                        ))}
                    </select>
                </div>

                {form.textType === 'upload' ? (
                    <div style={{ marginBottom: "15px" }}>
                        <label style={labelStyle}>Upload File</label>
                        <input type="file" className="form-control" onChange={e => setForm({ ...form, file: e.target.files[0] })} />
                        {form.oldFile && !form.file && (
                            <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                                <span>{getFileIcon(form.oldFile)}</span>
                                <a href={`${BASE_URL}${form.oldFile}`} target="_blank" rel="noreferrer" style={{ color: "#3b82f6", fontSize: "13px" }}>{form.oldFile}</a>
                                <span style={{ color: "#9ca3af", fontSize: "12px" }}>(current)</span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="ck-editor-container">
                        <div id="modal-editor-toolbar" style={{ marginBottom: "10px", borderBottom: "1px solid #e2e8f0" }}></div>
                        <div className={form.textType === 'doc' ? "a4-page" : ""}>
                            <CKEditor
                                editor={DecoupledEditor}
                                data={typeof form.content === 'string' ? form.content : (form.content?.[0]?.content || "")}
                                onReady={editor => {
                                    const tb = document.querySelector('#modal-editor-toolbar');
                                    if (tb && !tb.contains(editor.ui.view.toolbar.element)) {
                                        tb.innerHTML = '';
                                        tb.appendChild(editor.ui.view.toolbar.element);
                                    }
                                }}
                                onChange={(evt, editor) => {
                                    setForm(prev => ({ ...prev, content: editor.getData() }));
                                }}
                                config={{
                                    plugins: [ Essentials, Paragraph, Bold, Italic, Link, List, BlockQuote, Table, TableToolbar, Heading, Undo ],
                                    toolbar: [ 'heading', '|', 'bold', 'italic', 'link', 'bulletedList', 'numberedList', 'blockQuote', 'insertTable', 'undo', 'redo' ],
                                    licenseKey: 'GPL'
                                }}
                            />
                        </div>
                    </div>
                )}

                <div style={{ marginTop: '20px' }}>
                    <label style={labelStyle}>Assign Members</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxHeight: '120px', overflowY: 'auto', border: '1px solid var(--ui-border, #e5e7eb)', background: 'var(--ui-bg, #f8fafc)', padding: '10px', borderRadius: '8px' }}>
                        {projectMembers.map(m => (
                            <div 
                                key={m._id} 
                                onClick={() => toggleMember(m._id)}
                                style={{
                                    padding: '4px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                                    background: form.assignedTo.includes(m._id) ? 'var(--primary-color)' : 'var(--ui-surface, #f3f4f6)',
                                    color: form.assignedTo.includes(m._id) ? '#fff' : 'var(--text-main, #374151)',
                                    border: `1px solid ${form.assignedTo.includes(m._id) ? 'var(--primary-color)' : 'var(--ui-border, #e2e8f0)'}`
                                }}
                            >
                                {m.name}
                            </div>
                        ))}
                    </div>
                </div>
            </FormModal>

            {/* ================= TABLE ================= */}
            <DataTable
                data={documents}
                emptyText={selectedProject ? `No documents for "${selectedProject.name}"` : "No documents found"}
                columns={[
                    {
                        header: "Name",
                        key: "description",
                        render: (val, doc) => (
                            <div style={{ maxWidth: "250px" }}>
                                <div style={{ color: "var(--text-main)", fontWeight: "600" }}>{val || "Untitled Document"}</div>
                                {doc.textType && doc.textType !== 'upload' && (
                                    <span style={{ fontSize: '10px', background: doc.textType === 'notepad' ? '#fde68a' : '#bfdbfe', color: doc.textType === 'notepad' ? '#92400e' : '#1e40af', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: '700', marginTop: '4px', display: 'inline-block' }}>
                                        {doc.textType}
                                    </span>
                                )}
                            </div>
                        )
                    },
                    {
                        header: "Project",
                        render: (p) => p ? (
                            <span style={{ padding: "4px 10px", borderRadius: "8px", fontSize: "11px", fontWeight: "700", background: "var(--primary-light)", color: "var(--primary-color)" }}>
                                {p.name}
                            </span>
                        ) : <span style={{ color: "#aaa" }}>Global</span>
                    },
                    {
                        header: "File / Content",
                        align: "center",
                        render: (val, doc) => (canManageDocs || doc.accessGranted || canRead) ? (
                            <button
                                onClick={() => {
                                    if (doc.textType && doc.textType !== 'upload') {
                                        const rawContent = Array.isArray(doc.content) ? doc.content : [{ id: `p-${Date.now()}`, content: "" }];
                                        const decrypted = rawContent.map(p => ({ ...p, content: decryptContent(p.content) }));
                                        setViewFile({ isText: true, textType: doc.textType, content: decrypted, name: doc.description || "Document" });
                                    } else {
                                        setViewFile({ url: `${BASE_URL}${doc.file}`, name: doc.file });
                                    }
                                }}
                                className="doc-view-btn"
                                title="View Content"
                            >
                                {doc.textType !== 'upload' ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                )}
                                View
                            </button>
                        ) : (
                            <div className="doc-locked-badge">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                                Locked
                            </div>
                        )
                    },
                    {
                        header: "Assigned",
                        align: "center",
                        render: (members) => (
                            <div style={{ display: "flex", gap: "-8px", flexWrap: "wrap", justifyContent: "center" }}>
                                {members?.map(m => (
                                    <div key={m._id} title={m.name} className="assigned-avatar" style={{ marginLeft: "-6px" }}>
                                        {m.name?.charAt(0).toUpperCase()}
                                    </div>
                                ))}
                                {(!members || members.length === 0) && <span style={{ color: "#94a3b8", fontWeight: "800", fontSize: "14px" }}>—</span>}
                            </div>
                        )
                    }
                ]}
                renderActions={(doc) => (
                    <div className="action-buttons">
                         {(canManageDocs || doc.accessGranted || canRead) && (doc.file || doc.textType !== 'upload') && (
                            <button className="action-btn" title="Download" onClick={() => {
                                if (doc.textType === 'doc') {
                                    downloadAsPDF(doc);
                                } else if (doc.textType === 'notepad') {
                                    downloadAsTXT(doc);
                                } else if (doc.file) {
                                    handleDownload(`${BASE_URL}${doc.file}`, doc.file);
                                }
                            }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            </button>
                        )}
                        {canUpdate && (
                            <>
                                <button className="action-btn" title="Edit" onClick={() => {
                                    if (doc.textType !== 'upload') {
                                        setEditId(doc._id);
                                        const rawContent = Array.isArray(doc.content) ? doc.content : [{ id: `p-${Date.now()}`, content: "" }];
                                        const decrypted = rawContent.map(p => ({ ...p, content: decryptContent(p.content) }));
                                        setForm({ ...doc, project: doc.project?._id || doc.project, content: decrypted });
                                        setCurrentPage(0);
                                        setFullEditorMode(true);
                                    } else {
                                        edit(doc);
                                    }
                                }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                            </>
                        )}
                        {canDelete && (
                            <button className="action-btn delete" title="Delete" onClick={() => setDeleteId(doc._id)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        )}
                        {!canManageDocs && !doc.accessGranted && !canRead && (
                            <button className="btn btn-primary" onClick={() => requestAccess(doc._id)} disabled={doc.accessRequested || requestingDocId === doc._id} style={{ fontSize: '11px', padding: '6px 12px' }}>
                                {doc.accessRequested ? "Pending" : "Request Access"}
                            </button>
                        )}
                    </div>
                )}
            />

            {/* ================= FULL PAGE EDITOR (NOTEPAD / DOC) ================= */}
            {fullEditorMode && (
                <div style={{
                    position: "fixed", inset: 0, background: "var(--ui-surface)", zIndex: 11000,
                    display: "flex", flexDirection: "column", animation: "fadeIn 0.2s ease"
                }}>
                    {/* Header Toolbar */}
                    <div style={{
                        height: "64px", borderBottom: "1px solid var(--ui-border)", display: "flex",
                        alignItems: "center", justifyContent: "space-between", padding: "0 24px",
                        background: "var(--ui-bg)", flexShrink: 0
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                            <button onClick={() => setFullEditorMode(false)} className="btn btn-secondary" style={{ padding: '8px 12px', border: 'none' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                            </button>
                            <div style={{ borderLeft: "1px solid var(--ui-border)", height: "24px", margin: "0 8px" }}></div>
                            <div className="doc-title-wrapper">
                                <input 
                                    className="doc-title-input"
                                    value={form.description}
                                    placeholder="Untitled Document"
                                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                                />
                                {form.textType && (
                                    <span className="doc-ext-badge">
                                        {form.textType === 'notepad' ? ".txt" : ".doc"}
                                    </span>
                                )}
                            </div>
                            <div style={{ borderLeft: "1px solid var(--ui-border)", height: "24px", margin: "0 8px" }}></div>
                            
                            {/* Toggle AutoSave */}
                            <div className="autosave-container" onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}>
                                <span className="autosave-text">AutoSave</span>
                                <div className={`premium-switch ${autoSaveEnabled ? 'active' : ''}`}>
                                    <div className="switch-knob"></div>
                                </div>
                            </div>

                            {!autoSaveEnabled && (
                                <button onClick={() => save(false)} className="btn btn-primary" style={{ padding: '8px 20px', fontSize: '13px', marginLeft: '8px' }}>Save</button>
                            )}
                        </div>
                    </div>

                    {/* Toolbar Container for Decoupled Editor (Positioned Below Title Header) */}
                    <div id="editor-toolbar-container"></div>

                    {/* Main Content Area */}
                    <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
                        
                        {/* Sidebar: Metadata & Project Linking */}
                        <div style={{ width: "320px", borderRight: "1px solid var(--ui-border)", padding: "24px", overflowY: "auto", background: "var(--ui-surface)" }}>
                            <div className="form-group">
                                <label>Assign to Project</label>
                                <select 
                                    className="form-control" 
                                    value={form.project} 
                                    onChange={e => setForm({ ...form, project: e.target.value })}
                                >
                                    <option value="">No Project (Global)</option>
                                    {projects.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Assign Members ({projectMembers.length})</label>
                                <div style={{ display: "flex", flexDirection: "column", gap: "2px", background: "var(--ui-bg)", borderRadius: "12px", border: "1px solid var(--ui-border)", padding: "10px", minHeight: "150px" }}>
                                    {projectMembers.map(m => (
                                        <div 
                                            key={m._id} 
                                            onClick={() => toggleMember(m._id)}
                                            style={{
                                                padding: "10px 12px", borderRadius: "8px", fontSize: "14px", cursor: "pointer",
                                                display: "flex", alignItems: "center", gap: "10px", transition: "0.2s",
                                                background: form.assignedTo.includes(m._id) ? "var(--primary-light)" : "transparent",
                                                color: form.assignedTo.includes(m._id) ? "var(--primary-color)" : "var(--text-main)",
                                                fontWeight: form.assignedTo.includes(m._id) ? "700" : "600"
                                            }}
                                        >
                                            <div style={{ 
                                              width: "20px", height: "20px", borderRadius: "6px", 
                                              border: "2px solid", 
                                              borderColor: form.assignedTo.includes(m._id) ? "var(--primary-color)" : "var(--ui-border)", 
                                              background: form.assignedTo.includes(m._id) ? "var(--primary-color)" : "transparent", 
                                              display: "flex", alignItems: "center", justifyContent: "center",
                                              transition: "0.2s"
                                            }}>
                                                {form.assignedTo.includes(m._id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                            </div>

                                            {m.name}
                                        </div>
                                    ))}
                                    {projectMembers.length === 0 && <div style={{ textAlign: "center", padding: "20px", color: "#94a3b8", fontSize: "12px" }}>No users in this project.</div>}
                                </div>
                            </div>
                            
                            {isSuperAdmin && (
                                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", background: "var(--ui-bg)", borderRadius: "12px", border: "1px solid var(--ui-border)", cursor: "pointer" }} onClick={() => setForm({ ...form, accessGranted: !form.accessGranted })}>
                                    <div style={{ 
                                      width: "20px", height: "20px", borderRadius: "6px", 
                                      border: "2px solid", 
                                      borderColor: form.accessGranted ? "var(--primary-color)" : "var(--ui-border)", 
                                      background: form.accessGranted ? "var(--primary-color)" : "transparent", 
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                      transition: "0.2s"
                                    }}>
                                        {form.accessGranted && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                    </div>
                                    <label style={{ margin: 0, fontSize: "14px", fontWeight: '700', cursor: "pointer", color: 'var(--text-main)' }}>Grant Instant Access</label>
                                </div>
                            )}
                        </div>

                        {/* ULTIMATE SEAMLESS SINGLE-EDITOR CANVAS (Enhanced Pushing Logic) */}
                        <div className="editor-canvas-container" id="word-editor-canvas">
                            <div
                                className={`word-doc-wrapper ${form.textType === 'notepad' ? 'notepad-mode' : 'doc-mode'}`}
                                style={{
                                    minHeight: `${pageCount * (1123 + 40) - 40}px`,
                                    backgroundImage: `repeating-linear-gradient(
                                        to bottom,
                                        #ffffff 0px,
                                        #ffffff 1123px,
                                        #e8ecf0 1123px,
                                        #e8ecf0 1163px
                                    )`,
                                }}
                            >
                                {Array.from({ length: pageCount }).map((_, i) => {
                                    const topPos = i * (1123 + 40);
                                    return (
                                        <div 
                                            key={`badge-${i}`}
                                            className="word-page-badge-external" 
                                            style={{ top: `${topPos + 12}px`, left: '-50px', transform: 'translateX(-100%)' }}
                                        >
                                            <span>PAGE {i + 1} / {pageCount}</span>
                                        </div>
                                    );
                                })}

                                {/* Page dividers with enhanced user snippet logic */}
                                {Array.from({ length: pageCount - 1 }).map((_, i) => {
                                    const topPos = (i + 1) * 1123 + i * 40;
                                    return (
                                        <div 
                                            key={`divider-${i}`} 
                                            className="word-page-divider-overlay"
                                            style={{ 
                                                top: `${topPos}px`, 
                                                height: '40px',
                                                zIndex: 10,
                                                overflow: 'hidden'
                                            }}
                                        >
                                            <div className="divider-gap"></div>
                                        </div>
                                    );
                                })}

                                <CKEditor
                                    editor={DecoupledEditor}
                                    initialData={typeof form.content === 'string' ? form.content : (Array.isArray(form.content) ? form.content.map(p => p.content).join('') : "")}
                                    onReady={editor => {
                                        editorRef.current = editor;
                                        const toolbarContainer = document.querySelector('#editor-toolbar-container');
                                        if (toolbarContainer) {
                                            toolbarContainer.innerHTML = '';
                                            toolbarContainer.appendChild(editor.ui.view.toolbar.element);
                                        }

                                        // Register a Formal Word-Standard Page Break Command
                                        editor.commands.add('manualPageBreak', {
                                            execute: () => {
                                                const canvasContainer = document.getElementById('word-editor-canvas');
                                                const editableEl = editor.ui.view.editable.element;
                                                if (!canvasContainer || !editableEl) return;
                                                
                                                const A4_HEIGHT = 1123;
                                                const PAGE_GAP = 40;
                                                const currentScrollTop = canvasContainer.scrollTop;
                                                const currentPageIdx = Math.floor((currentScrollTop + 10) / (A4_HEIGHT + PAGE_GAP));
                                                const nextPageIndex = currentPageIdx + 1;
                                                
                                                let newP;
                                                editor.model.change(writer => {
                                                    const hr = writer.createElement('horizontalLine');
                                                    newP = writer.createElement('paragraph');
                                                    editor.model.insertContent(hr);
                                                    editor.model.insertContent(newP);
                                                    writer.setSelection(newP, 'end');
                                                });

                                                // High-Priority View-Lock Engine (Accelerated)
                                                setTimeout(() => {
                                                    const targetScrollTop = nextPageIndex * (A4_HEIGHT + PAGE_GAP);
                                                    
                                                    // Instant Page Expansion
                                                    setPageCount(prev => Math.max(prev, nextPageIndex + 1));
                                                    
                                                    // Double-Lock Scroll (Instant + Smooth)
                                                    canvasContainer.scrollTo({ top: targetScrollTop, behavior: 'auto' });
                                                    
                                                    // Force a layout change to trigger the margin-top pushing
                                                    const event = new Event('input', { bubbles: true });
                                                    editableEl.dispatchEvent(event);

                                                    // Final Focus Lockdown
                                                    editor.editing.view.focus();
                                                    setTimeout(() => {
                                                        editor.model.change(writer => {
                                                            writer.setSelection(newP, 'end');
                                                        });
                                                        editor.editing.view.focus();
                                                        editor.editing.view.scrollToTheSelection();
                                                        
                                                        // Fallback physical scroll if CKEditor's built-in one fails
                                                        canvasContainer.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
                                                    }, 300);
                                                }, 50);
                                            },
                                            isEnabled: true
                                        });

                                        // ULTIMATE WORD-LEVEL KEYSTROKE ENGINE
                                        // Robust handling of standard Word shortcuts
                                        editor.keystrokes.set('Ctrl+Enter', (data, stop) => {
                                            editor.execute('manualPageBreak');
                                            stop();
                                        });

                                        editor.keystrokes.set('Shift+Enter', (data, stop) => {
                                            // Soft break is default, but we stop event to avoid side effects
                                            editor.execute('shiftEnter');
                                            stop();
                                        });

                                        // Fallback Raw View Document Listener (Enhanced Backup)
                                        editor.editing.view.document.on('keydown', (evt, data) => {
                                            const isEnter = data.domEvent.key === 'Enter' || data.keyCode === 13;
                                            const isModifier = data.domEvent.ctrlKey || data.domEvent.metaKey;
                                            const isShift = data.domEvent.shiftKey;
                                            
                                            if (isEnter && isModifier) {
                                                editor.execute('manualPageBreak');
                                                evt.stop();
                                            } else if (isEnter && isShift) {
                                                editor.execute('shiftEnter');
                                                evt.stop();
                                            }
                                        });

                                        // ULTIMATE CLICK-TO-TYPE ENGINE (Fixes the dead zone between sheets)
                                        const editable = editor.ui.view.editable.element;
                                        if (editable) {
                                            editable.addEventListener('mousedown', (e) => {
                                                // If clicking the empty space between blocks/on the A4 background
                                                if (e.target === editable) {
                                                    setTimeout(() => {
                                                        editor.model.change(writer => {
                                                            const lastBlock = editor.model.document.selection.getLastPosition().parent;
                                                            if (lastBlock) writer.setSelection(lastBlock, 'end');
                                                        });
                                                        editor.editing.view.focus();
                                                    }, 50);
                                                }
                                            });
                                        }
                                    }}

                                    onChange={(evt, editor) => {
                                        const html = editor.getData();
                                        setForm(prev => ({ ...prev, content: html }));
                                        
                                        const editable = editor.ui.view.editable.element;
                                        if (editable) {
                                            const A4 = 1123;
                                            const GAP = 40;
                                            const blocks = editable.querySelectorAll(":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > li, :scope > table, :scope > .ck-widget, :scope > hr");
                                                                                 let maxPageIdx = 0;
                                            blocks.forEach(block => {
                                                const rect = block.getBoundingClientRect();
                                                const edRect = editable.getBoundingClientRect();
                                                const currentMargin = parseFloat(block.style.marginTop || "0");
                                                const relTop = rect.top - edRect.top + editable.scrollTop - currentMargin;
                                                const relBottom = rect.bottom - edRect.top + editable.scrollTop - currentMargin;
                                                const pageIdx = Math.floor(relTop / (A4 + GAP));
                                                const pageBottom = (pageIdx + 1) * A4 + pageIdx * GAP;
                                                const hasHR = block.tagName === 'HR' || block.querySelector('hr') !== null;
                                                const spansBoundary = relBottom > pageBottom && relTop < pageBottom;

                                                if (hasHR || spansBoundary) {
                                                    const pushDown = pageBottom + GAP - relTop + 2;
                                                    block.style.marginTop = `${pushDown}px`;
                                                    // This block now physically resides on the next page
                                                    maxPageIdx = Math.max(maxPageIdx, pageIdx + 1);
                                                } else {
                                                    block.style.marginTop = "";
                                                    maxPageIdx = Math.max(maxPageIdx, pageIdx);
                                                }
                                            });

                                            // The sheet count is based on the PHYSICAL placement of the furthest block
                                            const finalPages = maxPageIdx + 1;
                                            if (finalPages !== pageCount) setPageCount(finalPages);
                                        }
                                    }}
                                    config={{
                                        plugins: [
                                            Essentials, Paragraph, Bold, Italic, Link, List, BlockQuote, Table, TableToolbar, Heading, Undo,
                                            Alignment, FontSize, FontFamily, FontColor, FontBackgroundColor,
                                            Strikethrough, Subscript, Superscript, Underline, Code, CodeBlock, TodoList,
                                            FindAndReplace, HorizontalLine, Indent, IndentBlock
                                        ],
                                        toolbar: [
                                            'undo', 'redo', '|', 'heading', '|', 'fontFamily', 'fontSize', 'fontColor', 'fontBackgroundColor', '|',
                                            'alignment', '|', 'outdent', 'indent', 'bulletedList', 'numberedList', 'todoList', '|',
                                            'bold', 'italic', 'underline', 'strikethrough', 'code', 'codeBlock', 'subscript', 'superscript', '|',
                                            'link', 'insertTable', 'blockQuote', 'horizontalLine', 'findAndReplace'
                                        ],
                                        licenseKey: 'GPL'
                                    }}
                                />
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* ================= PREVIEW MODAL ================= */}
            {viewFile && (
                <div
                    onClick={() => setViewFile(null)}
                    style={{
                        position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.75)",
                        zIndex: 10000, display: "flex",
                        alignItems: "center", justifyContent: "center", padding: "20px"
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: "var(--ui-surface)", borderRadius: "16px", width: "95%",
                            maxWidth: viewFile.isText && viewFile.textType === 'doc' ? "900px" : "1100px",
                            height: "90vh", display: "flex", flexDirection: "column",
                            overflow: "hidden"
                        }}
                    >
                        <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "16px 24px", borderBottom: "1px solid var(--ui-border)", background: "var(--ui-surface)"
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                <div style={{ 
                                    padding: '4px 10px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--primary-color)', 
                                    borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' 
                                }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--primary-color)', boxShadow: '0 0 8px var(--primary-color)', animation: 'pulse-glow 1.5s infinite' }}></span>
                                    <span style={{ fontSize: '9px', fontWeight: '950', color: 'var(--primary-color)', letterSpacing: '1px' }}>ENCRYPTED NODE</span>
                                </div>
                                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "750", color: "var(--text-main)", letterSpacing: '-0.3px' }}>{viewFile.name}</h3>
                            </div>
                            <button onClick={() => setViewFile(null)} className="btn btn-secondary" style={{ padding: '6px 12px' }}>&times;</button>
                        </div>
                        <div style={{ flex: 1, overflow: "auto", background: viewFile.isText && viewFile.textType === 'doc' ? "var(--ui-bg)" : "var(--ui-surface)" }}>
                            {viewFile.isText ? (
                                <div id="printable-doc" style={{ padding: viewFile.textType === 'doc' ? "0" : "40px" }}>
                                    {(viewFile.content || []).map((page, idx) => (
                                        <div key={idx} className={viewFile.textType === 'doc' ? "a4-page" : "notepad-page"}>
                                            <div className="ck-content" dangerouslySetInnerHTML={{ __html: page.content }} />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <iframe src={viewFile.url} title="preview" width="100%" height="100%" style={{ border: "none" }} />
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* ================= CONFIRM DELETE MODAL ================= */}
            <ConfirmModal 
                show={!!deleteId}
                onClose={() => setDeleteId(null)}
                onConfirm={handleConfirmDelete}
                title="Delete Document"
                message="Are you sure you want to permanently delete this document?"
                confirmText="Delete Now"
                confirmColor="#ef4444"
            />
        </div>
    );
}

const labelStyle = { fontWeight: "600", display: "block", marginBottom: "8px", fontSize: "13px", color: "var(--text-main)" };
