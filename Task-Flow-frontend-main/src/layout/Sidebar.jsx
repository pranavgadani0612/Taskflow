import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { getSidebarModules, applySidebarConfig } from "../config/sidebarModules";
import { useSidebarConfig } from "../hooks/useSidebarConfig";

export default function Sidebar({ mobileOpen, closeMobile }) {
  const { user } = useAuth();
  const { hasPermission: ctxHasPermission } = usePermissions();
  const location = useLocation();

  // each dropdown group (Project, Padhya Enquiry, ...) opens by itself while one of its pages is active;
  // a click on the header overrides that: toggled[name] = true (open) / false (closed)
  const [toggled, setToggled] = useState({});

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

  // every module, in the order / with the names / show-hide saved in the Sidebar Manager
  const { config: sidebarConfig } = useSidebarConfig();
  const menuItems = useMemo(
    () => applySidebarConfig(getSidebarModules({ isCompanyOwner, isSuperAdmin }), sidebarConfig),
    [isCompanyOwner, isSuperAdmin, sidebarConfig]
  );

<<<<<<< HEAD
  // Sidebar Manager: same rule as the server (Super Admin / Company Owner / "Sidebar Manager" permission)
  const canManageSidebar = isSuperAdmin || roleName === "company owner" || ctxHasPermission("sidebar_management", "read");
=======
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
    {
      name: "Project Report",
      path: "/project-report",
      superAdminOnly: true,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      )
    },
    {
      // Super Admin always; other roles only when "Website Enquiries" is granted in Role management
      name: "Website Enquiries",
      path: "/website-enquiries",
      permission: "website_enquiries",
      strictPermission: true,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
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
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1

  // may this user see this module? (same rules whether it sits in a group or at the top level)
  const canSeeModule = (m) => {
    if (m.hidden) return false;
    if (m.manageSidebar) return canManageSidebar;
    if (m.superAdminOnly) return isSuperAdmin;
    if (m.strictPermission) return isSuperAdmin || ctxHasPermission(m.permission, "read");
    return m.permission ? hasPermission(m.permission, "read") : true;
  };

  // "/profile?tab=policies" is active on "/profile"
  const isPathActive = (path) => location.pathname === String(path || "").split("?")[0];

  const isDropdownActive = (subItems) => subItems.some(subItem => isPathActive(subItem.path));

  const isGroupOpen = (item, subs = item.subItems) =>
    toggled[item.key] !== undefined ? toggled[item.key] : isDropdownActive(subs);

  const handleDropdownClick = (item, subs) => {
    setToggled(t => ({ ...t, [item.key]: !isGroupOpen(item, subs) }));
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
<<<<<<< HEAD
          if (item.hidden) return null;                       // switched off in the Sidebar Manager
=======
          if (item.superAdminOnly && !isSuperAdmin) return null;
          if (item.strictPermission && !(isSuperAdmin || ctxHasPermission(item.permission, "read"))) return null;
>>>>>>> a93f31fb1a8946888b22ee7c71720679c8bc94b1

          // ---- group (Project, People, ...): shown when at least one of its modules is visible ----
          if (item.isGroup) {
            const visibleSubs = item.subItems.filter(canSeeModule);
            if (!visibleSubs.length) return null;
            const isOpen = isGroupOpen(item, visibleSubs);
            const isActive = isDropdownActive(visibleSubs);
            return (
              <div key={item.key} className="sidebar-dropdown">
                <div
                  onClick={() => handleDropdownClick(item, visibleSubs)}
                  className={`sidebar-dropdown-header ${isActive ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleDropdownClick(item, visibleSubs); } }}
                >
                  <span className="sidebar-item-text">
                    {item.icon && <span className="sidebar-icon">{item.icon}</span>}
                    {item.name}
                  </span>
                  <span className="dropdown-arrow">{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div className="sidebar-dropdown-items">
                    {visibleSubs.map(subItem => (
                      <Link
                        key={subItem.key}
                        to={subItem.path}
                        onClick={closeMobile}
                        className={`sidebar-link ${isPathActive(subItem.path) ? 'active' : ''}`}
                      >
                        {subItem.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          // ---- single module at the top level ----
          if (!canSeeModule(item)) return null;
          return (
            <div key={item.key} className="sidebar-item">
              <Link
                to={item.path}
                onClick={closeMobile}
                className={`sidebar-link ${isPathActive(item.path) ? 'active' : ''}`}
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
