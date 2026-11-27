/* =====================================================================
   Sidebar modules
   ---------------------------------------------------------------------
   MODULES  – every page link (a "module"), by permanent key.
   LAYOUT   – the DEFAULT sidebar: top-level modules and groups
              (a group = a heading like "Project" with related modules under it).
   The Sidebar Manager can change, per company: order, names, show/hide,
   and which group a module is in (or put it at the top level).

   Rules
   - Never change a `key` once released: saved company settings refer to it.
   - A new module / group added here appears automatically at its default place.
   - `locked: true` = cannot be hidden in the Sidebar Manager.
   ===================================================================== */

const svg = (children) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const ICONS = {
  dashboard: svg(<><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></>),
  folder: svg(<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-1.22-1.8A2 2 0 0 0 7.53 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />),
  users: svg(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  shield: svg(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
  lock: svg(<><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  clock: svg(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>),
  timer: svg(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 14 10" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="M20 12h2" /><path d="M2 12h2" /></>),
  calendar: svg(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>),
  star: svg(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />),
  coffee: svg(<><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></>),
  ticket: svg(<><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M13 5v2" /><path d="M13 17v2" /><path d="M13 11v2" /></>),
  megaphone: svg(<><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>),
  calendarCheck: svg(<><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="m9 16 2 2 4-4" /></>),
  home: svg(<><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>),
  receipt: svg(<><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="13" y2="16" /></>),
  monitor: svg(<><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>),
  money: svg(<><circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 18V6" /></>),
  file: svg(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></>),
  chart: svg(<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>),
  globe: svg(<><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>),
  chat: svg(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  audit: svg(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="12 8 12 12 14 14" /></>),
  gear: svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>),
  layout: svg(<><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M9 3v18" /><path d="M13 8h4" /><path d="M13 12h4" /><path d="M13 16h4" /></>),
  briefcase: svg(<><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>),
  wallet: svg(<><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" /></>),
  bell: svg(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>),
  handshake: svg(<><path d="m11 17 2 2a1 1 0 1 0 3-3" /><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" /><path d="m21 3 1 11h-2" /><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" /><path d="M3 4h8" /></>),
};

/* ---------- every module (page link) ---------- */
function modules({ ownerView }) {
  return {
    dashboard:         { name: "Dashboard", path: "/", permission: "view_dashboard", icon: ICONS.dashboard },

    projects:          { name: "Projects", path: "/project", permission: "project_management", icon: ICONS.folder },
    task:              { name: "Task", path: "/task", permission: "task_management", icon: ICONS.file },
    timesheets:        { name: "Timesheets", path: "/timesheet", permission: "timesheet_management", icon: ICONS.timer },
    task_status:       { name: "Task Status", path: "/task-status", permission: "task_status_management", icon: ICONS.chart },
    team:              { name: "Team", path: "/team", permission: "team_management", icon: ICONS.users },
    document:          { name: "Document", path: "/document", permission: "document", icon: ICONS.file },
    qa:                { name: "QA & Testing", path: "/qa", permission: "qa_management", icon: ICONS.shield },
    project_report:    { name: "Project Report", path: "/project-report", superAdminOnly: true, icon: ICONS.chart },

    clients:           { name: "Clients", path: "/clients", permission: "client_management", icon: ICONS.handshake },
    client_reports:    { name: "Client Invoicing & Reports", path: "/client-reports", permission: "client_reports", icon: ICONS.file },

    staff:             { name: "Staff", path: "/staff", permission: "staff_management", icon: ICONS.users },
    directory:         { name: "Employee Directory", path: "/directory", permission: "employee_directory", icon: ICONS.users },
    rating:            { name: "Performance & Rating", path: "/rating", permission: "rating_management", icon: ICONS.star },

    attendance:        { name: "Attendance", path: "/attendance", permission: "attendance_management", icon: ICONS.clock },
    time_instances:    { name: "Time & Instances", path: "/timing-manager", permission: "time_instances_management", icon: ICONS.timer },
    breaks:            { name: "Break Management", path: "/breaks", permission: "break_management", icon: ICONS.coffee },
    leave:             { name: "Leave & Absence", path: "/leave", permission: "leave_management", icon: ICONS.calendar },
    wfh:               { name: "WFH & On-Duty", path: "/wfh", permission: "wfh_management", icon: ICONS.home },
    holidays:          { name: "Holidays & Calendar", path: "/holidays", permission: "holiday_calendar", icon: ICONS.calendarCheck },

    payroll:           { name: "Payroll & Payslips", path: "/payroll", permission: "payroll_management", icon: ICONS.money },
    expenses:          { name: "Expenses & Claims", path: "/expenses", permission: "expense_management", icon: ICONS.receipt },
    assets:            { name: "IT Asset Management", path: "/assets", permission: "asset_management", icon: ICONS.monitor },

    team_chat:         { name: "Team Chat", path: "/chat", permission: "chat_management", icon: ICONS.chat },
    notice_board:      { name: "Notice Board", path: "/notices", permission: "notice_board", icon: ICONS.megaphone },
    tickets:           { name: "Tickets / Helpdesk", path: "/tickets", permission: "ticket_management", icon: ICONS.ticket },

    // padhyasoft.com website – Super Admin always; others only with "Website Enquiries" in Role management
    website_enquiries: { name: "Enquiries", path: "/website-enquiries", permission: "website_enquiries", strictPermission: true, icon: ICONS.globe },
    website_chats:     { name: "Chatbot Conversations", path: "/website-chats", permission: "website_enquiries", strictPermission: true, icon: ICONS.chat },
    website_faqs:      { name: "FAQ", path: "/website-faqs", permission: "website_enquiries", strictPermission: true, icon: ICONS.file },

    role:              { name: "Role", path: "/role", permission: "role_management", icon: ICONS.shield },
    permission:        { name: "Permission", path: "/permission", permission: "permission_management", icon: ICONS.lock },
    audit_logs:        { name: "Universal Audit Logs", path: "/audit-logs", permission: "audit_logs", icon: ICONS.audit },
    company_profile:   { name: ownerView ? "Company Profile" : "Company Policies", path: ownerView ? "/profile" : "/profile?tab=policies", icon: ICONS.gear },
    // the page that manages this list – always visible to whoever may manage it
    sidebar_manager:   { name: "Sidebar Manager", path: "/sidebar-manager", permission: "sidebar_management", manageSidebar: true, locked: true, icon: ICONS.layout },
  };
}

/* ---------- default sidebar: top-level modules and groups ---------- */
const LAYOUT = [
  "dashboard",
  { key: "project",           name: "Project",              icon: ICONS.folder,    children: ["projects", "task", "timesheets", "task_status", "team", "document", "qa", "project_report"] },
  { key: "grp_clients",       name: "Clients & Billing",    icon: ICONS.handshake, children: ["clients", "client_reports"] },
  { key: "grp_people",        name: "People",               icon: ICONS.users,     children: ["staff", "directory", "rating"] },
  { key: "grp_time",          name: "Attendance & Leave",   icon: ICONS.clock,     children: ["attendance", "time_instances", "breaks", "leave", "wfh", "holidays"] },
  { key: "grp_finance",       name: "Payroll & Finance",    icon: ICONS.wallet,    children: ["payroll", "expenses", "assets"] },
  { key: "grp_communication", name: "Communication",        icon: ICONS.bell,      children: ["team_chat", "notice_board", "tickets"] },
  { key: "padhya_enquiry",    name: "Padhya Enquiry",       icon: ICONS.globe,     children: ["website_enquiries", "website_chats", "website_faqs"] },
  { key: "grp_admin",         name: "Administration",       icon: ICONS.gear,      children: ["role", "permission", "audit_logs", "company_profile", "sidebar_manager"] },
];

/** Default sidebar tree: [{ key, name, icon, path?, subItems? }, ...] */
export function getSidebarModules({ isCompanyOwner = false, isSuperAdmin = false } = {}) {
  const M = modules({ ownerView: isCompanyOwner || isSuperAdmin });
  return LAYOUT.map((entry) => {
    if (typeof entry === "string") return { key: entry, ...M[entry] };
    return {
      key: entry.key,
      name: entry.name,
      icon: entry.icon,
      isGroup: true,
      subItems: entry.children.filter((k) => M[k]).map((k) => ({ key: k, ...M[k] })),
    };
  });
}

/* -------------------------------------------------------------------
   Apply a company's saved settings to the default tree.
   Saved config: { items: [ { key, label?, hidden?, children?: [ {key, label?, hidden?} ] } ] }
   - top-level order = items order; a module may sit in any group or at the top level
   - modules / groups missing from the config keep their default place
   Each node gets: name (custom or default), defaultName, hidden, defaultGroup (modules)
   ------------------------------------------------------------------- */
const insertAtDefault = (list, key, defaultOrder) => {
  // put `key` right after the nearest earlier (by default order) key already in the list
  const i = defaultOrder.indexOf(key);
  for (let j = i - 1; j >= 0; j--) {
    const p = list.indexOf(defaultOrder[j]);
    if (p !== -1) { list.splice(p + 1, 0, key); return; }
  }
  list.unshift(key);
};

export function applySidebarConfig(defaults, config) {
  const groups = new Map();      // group key -> default group
  const leaves = new Map();      // module key -> default module (with defaultGroup)
  defaults.forEach((d) => {
    if (d.isGroup) {
      groups.set(d.key, d);
      d.subItems.forEach((s) => leaves.set(s.key, { ...s, defaultGroup: d.key }));
    } else {
      leaves.set(d.key, { ...d, defaultGroup: null });
    }
  });

  const saved = new Map();       // key -> saved { label, hidden }
  const top = [];                // top-level keys in order
  const kids = new Map();        // group key -> child keys in order
  const used = new Set();

  (config?.items || []).forEach((it) => {
    if (!it || used.has(it.key)) return;
    if (groups.has(it.key)) {
      used.add(it.key); top.push(it.key); saved.set(it.key, it);
      const list = [];
      (it.children || []).forEach((c) => {
        if (c && leaves.has(c.key) && !used.has(c.key)) { used.add(c.key); list.push(c.key); saved.set(c.key, c); }
      });
      kids.set(it.key, list);
    } else if (leaves.has(it.key)) {
      used.add(it.key); top.push(it.key); saved.set(it.key, it);
    }
  });

  // groups / modules not in the saved config -> their default place
  const defaultTop = defaults.map((d) => d.key);
  defaults.forEach((d) => {
    if (d.isGroup && !used.has(d.key)) { used.add(d.key); insertAtDefault(top, d.key, defaultTop); kids.set(d.key, []); }
  });
  defaults.forEach((d) => {
    if (d.isGroup) {
      const order = d.subItems.map((s) => s.key);
      d.subItems.forEach((s) => {
        if (!used.has(s.key)) { used.add(s.key); insertAtDefault(kids.get(d.key), s.key, order); }
      });
    } else if (!used.has(d.key)) {
      used.add(d.key); insertAtDefault(top, d.key, defaultTop);
    }
  });

  const node = (base, key) => {
    const s = saved.get(key) || {};
    return { ...base, defaultName: base.name, name: s.label || base.name, hidden: !base.locked && !!s.hidden };
  };
  return top.map((key) => {
    if (groups.has(key)) {
      const g = groups.get(key);
      return { ...node(g, key), subItems: (kids.get(key) || []).map((k) => node(leaves.get(k), k)) };
    }
    return node(leaves.get(key), key);
  });
}

/* tree (as edited in the Sidebar Manager) -> config to save */
export function toSidebarConfig(tree) {
  const pack = (m) => {
    const o = { key: m.key };
    const label = (m.name || "").trim();
    if (label && label !== m.defaultName) o.label = label;
    if (m.hidden && !m.locked) o.hidden = true;
    if (m.isGroup) o.children = (m.subItems || []).map(pack);
    return o;
  };
  return { items: tree.map(pack) };
}
