import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SocketProvider } from "./contexts/SocketContext";
import { PermissionProvider, usePermissions } from "./contexts/PermissionContext";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./contexts/ToastContext";
import Layout from "./layout/Layout";
import Dashboard from "./pages/Dashboard";
import Staff from "./pages/Staff";
import Task from "./pages/Task";
import Role from "./pages/Role";
import Permission from "./pages/Permission";
import TaskStatus from "./pages/TaskStatus";
import Login from "./pages/Login";
import Project from "./pages/Project";
import Team from "./pages/Team";
import Document from "./pages/Document";
import ResetPassword from "./pages/ResetPassword";
import CompanyRegister from "./pages/CompanyRegister";
import ForgotPassword from "./pages/ForgotPassword";
import CompanyList from "./pages/CompanyList";
import Subscription from "./pages/Subscription";
import Profile from "./pages/Profile";
import Chat from "./pages/Chat";
import Client from "./pages/Client";
import Attendance from "./pages/Attendance";
import QA from "./pages/QA";
import Leave from "./pages/Leave";
import Timesheet from "./pages/Timesheet";
import Rating from "./pages/Rating";
import BreakManagement from "./pages/BreakManagement";
import Tickets from "./pages/Tickets";
import TimeManager from "./pages/TimeManager";
import Expenses from "./pages/Expenses";
import NoticeBoard from "./pages/NoticeBoard";
import HolidayCalendar from "./pages/HolidayCalendar";
import WfhRequests from "./pages/WfhRequests";
import EmployeeDirectory from "./pages/EmployeeDirectory";
import AuditLogs from "./pages/AuditLogs";
import Assets from "./pages/Assets";
import Payroll from "./pages/Payroll";
import ResourceAllocation from "./pages/ResourceAllocation";
import ClientInvoicing from "./pages/ClientInvoicing";

import { CompanyProvider } from "./contexts/CompanyContext";
import PWAInstallPrompt from "./components/common/PWAInstallPrompt";


// ============ Inner component (uses AuthContext + PermissionContext) ============
function AppRoutes() {


  const { user, loading: authLoading } = useAuth();
  const { hasPermission: ctxHasPermission, loading: permissionLoading } = usePermissions();

  // Super Admin check
  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";

  // hasPermission — always from MongoDB via PermissionContext
  const hasPermission = (module, action = "read") => {
    if (isSuperAdmin) return true;
    return ctxHasPermission(module, action);
  };

  // Wait for auth & permission check before rendering routes
  if (authLoading || (user && permissionLoading)) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", fontSize: "18px", color: "#6b7280", background: 'var(--neu-bg)' }}>
        <div className="loading-spinner"></div>
        Loading permissions...
      </div>
    );
  }

  const isOwnerOrAdmin = isSuperAdmin || user?.role?.name === "Company Owner";

  return (
    <Routes>

      {/* LOGIN */}
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/register-company" element={<Navigate to="/login" replace />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />

      {/* PROTECTED ROUTES */}
      <Route
        path="/"
        element={user ? <Layout /> : <Navigate to={`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`} />}
      >
        <Route index element={<Dashboard />} />
        <Route path="dashboard" element={<Navigate to="/" replace />} />
        <Route path="projects" element={<Navigate to="/project" replace />} />
        <Route path="tasks" element={<Navigate to="/task" replace />} />
        <Route path="issues" element={<Navigate to="/task" replace />} />
        <Route path="issue" element={<Navigate to="/task" replace />} />
        <Route path="timesheets" element={<Navigate to="/timesheet" replace />} />
        <Route path="staff" element={hasPermission("staff_management", "read") ? <Staff /> : <Navigate to="/" />} />
        <Route path="task" element={hasPermission("task_management", "read") ? <Task key="task-page" /> : <Navigate to="/" />} />
        <Route path="role" element={hasPermission("role_management", "read") ? <Role /> : <Navigate to="/" />} />
        <Route path="project" element={hasPermission("project_management", "read") ? <Project /> : <Navigate to="/" />} />
        <Route path="permission" element={hasPermission("permission_management", "read") ? <Permission /> : <Navigate to="/" />} />
        <Route path="task-status" element={hasPermission("task_status_management", "read") ? <TaskStatus /> : <Navigate to="/" />} />
        <Route path="team" element={hasPermission("team_management", "read") || hasPermission("project_management", "read") ? <Team /> : <Navigate to="/" />} />
        <Route path="document" element={hasPermission("document", "read") ? <Document /> : <Navigate to="/" />} />
        <Route path="attendance" element={hasPermission("attendance_management", "read") ? <Attendance /> : <Navigate to="/" />} />
        <Route path="timing-manager" element={hasPermission("time_instances_management", "read") ? <TimeManager /> : <Navigate to="/" />} />
        <Route path="time-manager" element={<Navigate to="/timing-manager" replace />} />
        <Route path="qa" element={hasPermission("qa_management", "read") ? <QA /> : <Navigate to="/" />} />
        <Route path="leave" element={hasPermission("leave_management", "read") ? <Leave /> : <Navigate to="/" />} />
        <Route path="timesheet" element={hasPermission("timesheet_management", "read") ? <Timesheet /> : <Navigate to="/" />} />
        <Route path="rating" element={hasPermission("rating_management", "read") ? <Rating /> : <Navigate to="/" />} />
        <Route path="breaks" element={hasPermission("break_management", "read") ? <BreakManagement /> : <Navigate to="/" />} />
        <Route path="tickets" element={hasPermission("ticket_management", "read") ? <Tickets /> : <Navigate to="/" />} />
        <Route path="expenses" element={hasPermission("expense_management", "read") ? <Expenses /> : <Navigate to="/" />} />
        <Route path="expense" element={<Navigate to="/expenses" replace />} />
        <Route path="notices" element={hasPermission("notice_board", "read") ? <NoticeBoard /> : <Navigate to="/" />} />
        <Route path="holidays" element={hasPermission("holiday_calendar", "read") ? <HolidayCalendar /> : <Navigate to="/" />} />
        <Route path="wfh" element={hasPermission("wfh_management", "read") ? <WfhRequests /> : <Navigate to="/" />} />
        <Route path="directory" element={hasPermission("employee_directory", "read") ? <EmployeeDirectory /> : <Navigate to="/" />} />
        <Route path="audit-logs" element={hasPermission("audit_logs", "read") ? <AuditLogs /> : <Navigate to="/" />} />
        <Route path="assets" element={hasPermission("asset_management", "read") ? <Assets /> : <Navigate to="/" />} />
        <Route path="payroll" element={hasPermission("payroll_management", "read") ? <Payroll /> : <Navigate to="/" />} />
        <Route path="resource-allocation" element={hasPermission("resource_management", "read") ? <ResourceAllocation /> : <Navigate to="/" />} />
        <Route path="client-reports" element={hasPermission("client_reports", "read") ? <ClientInvoicing /> : <Navigate to="/" />} />
        <Route path="profile" element={<Profile />} />

        <Route path="policies" element={<Navigate to="/profile?tab=policies" replace />} />
        <Route path="chat" element={hasPermission("chat_management", "read") ? <Chat /> : <Navigate to="/" />} />
        <Route path="clients" element={hasPermission("client_management", "read") ? <Client /> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>

    </Routes>
  );
}

// ============ Root App ============
function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <PermissionProvider>
              <CompanyProvider>
                <AppRoutes />
                <PWAInstallPrompt />
              </CompanyProvider>
            </PermissionProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;