import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";

export default function Sidebar({ mobileOpen, closeMobile }) {
  const { user } = useAuth();
  const { hasPermission: ctxHasPermission } = usePermissions();
  const location = useLocation();

  const isProjectActive = [
    "/project", "/task", "/timesheet", "/task-status", "/team", "/document", "/qa", "/clients"
  ].some(p => location.pathname === p);

  const [closedDropdown, setClosedDropdown] = useState("");

  const isOpen = (isProjectActive && closedDropdown !== "Project") || (!isProjectActive && closedDropdown === "open_Project");

  const roleName = String(user?.role?.name || "").toLowerCase().trim();
  const roleId = String(user?.role?.id || user?.role?._id || user?.role || "").toLowerCase().trim();
  const position = String(user?.position || "").toLowerCase().trim();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || roleName === "super admin";
  const isCompanyOwner = isSuperAdmin ||
                         roleName.includes("owner") || 
                         roleName.includes("admin") || 
                         roleName.includes("manager") ||
                         roleId === "role_owner" || 
                         roleId === "role_superadmin" || 
                         position.includes("manager") || 
                         position.includes("owner") || 
                         position.includes("admin");

  // Permission check
  const hasPermission = (module, action = "read") => {
    if (isSuperAdmin || isCompanyOwner) return true;
    return ctxHasPermission(module, action);
  };

  const menuItems = [
    { name: "Dashboard", path: "/", permission: "view_dashboard", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg> },
    {
      name: "Project",
      permission: "project_management",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-1.22-1.8A2 2 0 0 0 7.53 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" /></svg>,
      subItems: [
        { name: "Projects",    path: "/project",     permission: "project_management" },
        { name: "Task",        path: "/task",        permission: "task_management" },
        { name: "Timesheets",  path: "/timesheet",   permission: "timesheet_management" },
        { name: "Task Status", path: "/task-status", permission: "task_status_management" },
        { name: "Team",        path: "/team",        permission: "team_management" },
        { name: "Document",    path: "/document",   permission: "document" },
        { name: "QA & Testing", path: "/qa",         permission: "qa_management" },
        { name: "Clients",     path: "/clients",    permission: "client_management" },
      ]
    },
    { name: "Staff", path: "/staff", permission: "staff_management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg> },
    { name: "Role", path: "/role", permission: "role_management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg> },
    { name: "Permission", path: "/permission", permission: "permission_management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> },
    { name: "Attendance", path: "/attendance", permission: "attendance_management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { name: "Time & Instances", path: "/timing-manager", permission: "time_instances_management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 10"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M20 12h2"/><path d="M2 12h2"/></svg> },
    { name: "Leave & Absence", path: "/leave", permission: "leave_management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
    { name: "Performance & Rating", path: "/rating", permission: "rating_management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg> },
    { name: "Break Management", path: "/breaks", permission: "break_management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg> },
    { name: "Tickets / Helpdesk", path: "/tickets", permission: "ticket_management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg> },
    {
      name: "Notice Board",
      path: "/notices",
      permission: "notice_board",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 11 18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      )
    },
    {
      name: "Employee Directory",
      path: "/directory",
      permission: "employee_directory",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      name: "Holidays & Calendar",
      path: "/holidays",
      permission: "holiday_calendar",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <path d="m9 16 2 2 4-4" />
        </svg>
      )
    },
    {
      name: "WFH & On-Duty",
      path: "/wfh",
      permission: "wfh_management",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      )
    },
    {
      name: "Expenses & Claims",
      path: "/expenses",
      permission: "expense_management",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="13" y2="16" />
        </svg>
      )
    },
    {
      name: "IT Asset Management",
      path: "/assets",
      permission: "asset_management",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="3" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      )
    },

    {
      name: "Payroll & Payslips",
      path: "/payroll",
      permission: "payroll_management",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
          <path d="M12 18V6" />
        </svg>
      )
    },
    {
      name: "Resource Utilization",
      path: "/resource-allocation",
      permission: "resource_management",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      name: "Client Invoicing & Reports",
      path: "/client-reports",
      permission: "client_reports",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      )
    },
    { name: "Team Chat", path: "/chat", permission: "chat_management", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    {
      name: "Universal Audit Logs",
      path: "/audit-logs",
      permission: "audit_logs",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="12 8 12 12 14 14" />
        </svg>
      )
    },
    {
      name: isCompanyOwner || isSuperAdmin ? "Company Profile" : "Company Policies",
      path: isCompanyOwner || isSuperAdmin ? "/profile" : "/profile?tab=policies",
      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    },

  ];

  const handleDropdownClick = () => {
    setClosedDropdown(isOpen ? "Project" : "open_Project");
  };

  const isDropdownActive = (subItems) => {
    return subItems.some(subItem => location.pathname === subItem.path);
  };

  return (
    <div className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <h2 style={{ fontSize: user?.companyId?.companyName ? '20px' : '24px', margin: 0 }}>
          {user?.companyId?.companyName || "Padhya Soft"}
        </h2>
        {/* Mobile close button */}
        <button
          type="button"
          className="mobile-sidebar-close-btn"
          onClick={closeMobile}
          aria-label="Close menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="sidebar-menu">
        {menuItems.map(item => {
          // Check parent permission OR any child permission
          const hasParentPerm = item.permission ? (isSuperAdmin || hasPermission(item.permission, "read")) : false;
          const hasAnyChildPerm = item.subItems?.some(sub => isSuperAdmin || hasPermission(sub.permission, "read")) || false;
          
          const canViewParent = item.subItems ? (hasParentPerm || hasAnyChildPerm) : (item.permission ? hasParentPerm : true);

          if (!canViewParent) return null;

          if (item.subItems) {
            return (
              <div key={item.name} className="sidebar-dropdown">
                <div
                  onClick={handleDropdownClick}
                  className={`sidebar-dropdown-header ${isDropdownActive(item.subItems) ? 'active' : ''}`}
                >
                  <span className="sidebar-item-text">
                    {item.icon && <span className="sidebar-icon">{item.icon}</span>}
                    {item.name}
                  </span>
                  <span className="dropdown-arrow">{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div className="sidebar-dropdown-items">
                    {item.subItems.map(subItem => {
                      if (isSuperAdmin || hasPermission(subItem.permission)) {
                        const isActive = location.pathname === subItem.path;
                        return (
                          <Link 
                            key={subItem.path} 
                            to={subItem.path} 
                            onClick={closeMobile}
                            className={`sidebar-link ${isActive ? 'active' : ''}`}
                          >
                            {subItem.name}
                          </Link>
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div key={item.path} className="sidebar-item">
              <Link 
                to={item.path} 
                onClick={closeMobile}
                className={`sidebar-link ${location.pathname === item.path ? 'active' : ''}`}
              >
                {item.icon && <span className="sidebar-icon">{item.icon}</span>}
                {item.name}
              </Link>
            </div>
          );
        })}

      </div>
    </div>
  );
}