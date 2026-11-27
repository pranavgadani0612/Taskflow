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

  // Sidebar Manager: same rule as the server (Super Admin / Company Owner / "Sidebar Manager" permission)
  const canManageSidebar = isSuperAdmin || roleName === "company owner" || ctxHasPermission("sidebar_management", "read");

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
          if (item.hidden) return null;                       // switched off in the Sidebar Manager

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
