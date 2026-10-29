import axios from "axios";

const getBaseURL = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") return "http://localhost:5000/api";
  
  // Dynamic Dev Tunnel Support: Replace -5173 (Vite) with -5000 (Express)
  if (hostname.includes("devtunnels.ms")) {
    const tunnelOrigin = window.location.origin.replace("-5173", "-5000");
    return `${tunnelOrigin}/api`;
  }
  // Production: same origin /api for Plesk/VPS
  return "/api";
};

const API = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true,
});

// Global Interceptor: Automatically attach selectedCompany to all outgoing requests
API.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const saved = localStorage.getItem("selectedCompany");
    if (saved) {
      const company = JSON.parse(saved);
      if (company?._id) {
        config.params = {
          ...config.params,
          companyId: company._id
        };
      }
    }
  } catch (err) {
    console.error("API Interceptor Error:", err);
  }
  return config;
});

// Global Response Interceptor: Handle plan limit errors
API.interceptors.response.use(
  (response) => response,
  (error) => {
    const data = error?.response?.data;
    if (error?.response?.status === 403 && data?.inactive) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    if (error?.response?.status === 403 && data?.limitReached) {
      error.planLimitError = true;
      error.planLimitMessage = data.message || "Plan limit reached. Please upgrade your subscription.";
      error.planName = data.planName;
    }
    return Promise.reject(error);
  }
);

export default API;