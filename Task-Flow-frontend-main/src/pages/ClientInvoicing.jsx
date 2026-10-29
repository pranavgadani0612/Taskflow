import React, { useState, useEffect } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../contexts/ToastContext";
import { usePermissions } from "../contexts/PermissionContext";
import FormModal from "../components/common/FormModal";
import { IconFileText, IconPrinter, IconX } from "../components/common/Icons";
import Pagination from "../components/common/Pagination";
import { useTableSort, SortIndicator } from "../utils/tableSort";
import "../style/main.css";

export default function ClientInvoicing() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { hasPermission: ctxHasPermission } = usePermissions();

  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || user?.role?.name === "Super Admin";
  const isOwner = isSuperAdmin || user?.role?.name === "Company Owner";
  const hasPermission = (action = "read") => {
    if (isOwner) return true;
    return ctxHasPermission("client_reports", action);
  };
  const isManager = isOwner || hasPermission("create") || hasPermission("update") || user?.position?.includes("Manager");

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Invoice Modal
  const [invoiceModal, setInvoiceModal] = useState({
    show: false,
    client: null,
    invoiceData: null,
    loading: false
  });

  const fetchReports = async () => {
    try {
      setLoading(true);
      let url = "/client-reports/summary?";
      if (startDate && endDate) {
        url += `start_date=${startDate}&end_date=${endDate}`;
      }
      const res = await API.get(url);
      setReport(res.data);
    } catch (err) {
      console.error("Error loading client billing report:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    fetchReports();
  };

  const generateInvoiceForClient = async (client) => {
    setInvoiceModal({ show: true, client, invoiceData: null, loading: true });
    try {
      const res = await API.post("/client-reports/generate-invoice", {
        client_id: client.client_id,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        tax_rate: 18.0
      });
      setInvoiceModal({ show: true, client, invoiceData: res.data, loading: false });
    } catch (err) {
      showToast(err.response?.data?.error || "Invoice generation failed", "error");
      setInvoiceModal({ show: false, client: null, invoiceData: null, loading: false });
    }
  };

  const summary = report?.summary || {
    total_billable_hours: 0,
    total_non_billable_hours: 0,
    total_invoiced_value: 0,
    client_count: 0
  };

  const clients = report?.clients || [];
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const { sortedData: sortedClients, sortConfig: clientSortConfig, requestSort: requestClientSort } = useTableSort(clients, "client_name", "asc");
  const paginatedClients = sortedClients.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="main-content-container" style={{ padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: "700", color: "var(--text-main, #0f172a)", margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <IconFileText size={24} color="#2563eb" /> Billable Hours & Client Invoicing
          </h1>
          <p style={{ color: "var(--text-muted, #64748b)", margin: "0.25rem 0 0 0", fontSize: "0.95rem" }}>
            Timesheet hours converted into client reports, billing rates & invoice generator
          </p>
        </div>

        {/* Date Filter */}
        <form onSubmit={handleFilterSubmit} style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{ padding: "0.45rem 0.65rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", fontSize: "0.85rem" }}
          />
          <span style={{ color: "var(--text-muted)" }}>to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{ padding: "0.45rem 0.65rem", borderRadius: "6px", border: "1px solid var(--ui-border, #cbd5e1)", fontSize: "0.85rem" }}
          />
          <button
            type="submit"
            style={{ padding: "0.45rem 0.85rem", borderRadius: "6px", border: "none", background: "#2563eb", color: "#fff", fontWeight: "600", fontSize: "0.85rem", cursor: "pointer" }}
          >
            Apply Date Range
          </button>
        </form>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Total Billable Hours</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#2563eb", marginTop: "0.25rem" }}>
            {summary.total_billable_hours} hrs
          </div>
        </div>

        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Internal / Non-Billable Hours</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#64748b", marginTop: "0.25rem" }}>
            {summary.total_non_billable_hours} hrs
          </div>
        </div>

        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Total Billable Value</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#10b981", marginTop: "0.25rem" }}>
            ₹{summary.total_invoiced_value.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-muted, #64748b)", fontWeight: "600", textTransform: "uppercase" }}>Active Billed Clients</div>
          <div style={{ fontSize: "1.8rem", fontWeight: "700", color: "#8b5cf6", marginTop: "0.25rem" }}>
            {summary.client_count}
          </div>
        </div>
      </div>

      {/* Clients Breakdown Table */}
      <div style={{ background: "var(--ui-surface, #ffffff)", border: "1px solid var(--ui-border, #e2e8f0)", borderRadius: "12px", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid var(--ui-border, #e2e8f0)", fontWeight: "700", color: "var(--text-main, #0f172a)" }}>
          Client-Wise Timesheet Aggregation & Invoicing
        </div>

        {loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>Loading client billing data...</div>
        ) : clients.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>No client reports available.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--ui-bg, #f8fafc)", borderBottom: "1px solid var(--ui-border, #e2e8f0)", color: "var(--text-muted, #64748b)", fontWeight: "600", fontSize: "0.8rem", textTransform: "uppercase" }}>
                  <th onClick={() => requestClientSort("client_name")} style={{ padding: "0.85rem 1.25rem", cursor: "pointer", userSelect: "none" }}>
                    Client Organization <SortIndicator sortKey="client_name" currentKey={clientSortConfig.key} direction={clientSortConfig.direction} />
                  </th>
                  <th onClick={() => requestClientSort("hourly_rate")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Hourly Rate <SortIndicator sortKey="hourly_rate" currentKey={clientSortConfig.key} direction={clientSortConfig.direction} />
                  </th>
                  <th onClick={() => requestClientSort("billable_hours")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Billable Hours <SortIndicator sortKey="billable_hours" currentKey={clientSortConfig.key} direction={clientSortConfig.direction} />
                  </th>
                  <th onClick={() => requestClientSort("non_billable_hours")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Non-Billable <SortIndicator sortKey="non_billable_hours" currentKey={clientSortConfig.key} direction={clientSortConfig.direction} />
                  </th>
                  <th onClick={() => requestClientSort("total_invoiced_value")} style={{ padding: "0.85rem 1rem", cursor: "pointer", userSelect: "none" }}>
                    Total Invoiced Amount <SortIndicator sortKey="total_invoiced_value" currentKey={clientSortConfig.key} direction={clientSortConfig.direction} />
                  </th>
                  <th style={{ padding: "0.85rem 1.25rem", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedClients.map(c => (
                  <tr key={c.client_id} style={{ borderBottom: "1px solid var(--ui-border, #f1f5f9)" }}>
                    <td style={{ padding: "1rem 1.25rem" }}>
                      <div style={{ fontWeight: "700", color: "#1d4ed8", fontSize: "0.95rem" }}>{c.client_name}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-muted, #64748b)" }}>{c.company}</div>
                    </td>
                    <td style={{ padding: "1rem", fontWeight: "600" }}>
                      ₹{c.hourly_rate} / hr ({c.currency || "INR"})
                    </td>
                    <td style={{ padding: "1rem", fontWeight: "700", color: "#059669" }}>
                      {c.billable_hours} hrs
                    </td>
                    <td style={{ padding: "1rem", color: "#64748b" }}>
                      {c.non_billable_hours} hrs
                    </td>
                    <td style={{ padding: "1rem", fontWeight: "800", color: "#0f172a", fontSize: "1.05rem" }}>
                      ₹{c.total_amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "1rem 1.25rem", textAlign: "right" }}>
                      <button
                        onClick={() => generateInvoiceForClient(c)}
                        style={{
                          padding: "0.45rem 0.95rem",
                          borderRadius: "6px",
                          border: "none",
                          background: "#2563eb",
                          color: "#fff",
                          fontWeight: "700",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          boxShadow: "0 2px 6px rgba(37,99,235,0.2)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem"
                        }}
                      >
                        <IconFileText size={15} color="#fff" /> Generate Invoice
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              currentPage={currentPage}
              totalRecords={clients.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => { setPageSize(newSize); setCurrentPage(1); }}
            />
          </div>
        )}
      </div>

      {/* ─── INVOICE PREVIEW MODAL ─── */}
      {invoiceModal.show && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(15, 23, 42, 0.7)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          zIndex: 9999,
          padding: "1rem"
        }}>
          <div style={{
            background: "#ffffff",
            width: "100%",
            maxWidth: "800px",
            maxHeight: "92vh",
            borderRadius: "12px",
            boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column"
          }}>
            {/* Top Toolbar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.5rem", borderBottom: "1px solid #e2e8f0" }}>
              <span style={{ fontWeight: "700", color: "#334155" }}>
                Commercial Client Invoice &bull; {invoiceModal.invoiceData?.invoice_number || "Calculating..."}
              </span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  onClick={() => window.print()}
                  style={{ padding: "0.4rem 0.85rem", borderRadius: "6px", border: "none", background: "#2563eb", color: "#fff", fontWeight: "600", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <IconPrinter size={15} color="#fff" /> Print / Save as PDF
                </button>
                <button
                  onClick={() => setInvoiceModal({ show: false, client: null, invoiceData: null, loading: false })}
                  style={{ padding: "0.4rem 0.85rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#fff", color: "#64748b", fontWeight: "600", fontSize: "0.85rem", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}
                >
                  <IconX size={15} color="#64748b" /> Close
                </button>
              </div>
            </div>

            {invoiceModal.loading ? (
              <div style={{ padding: "3rem", textAlign: "center" }}>Generating invoice calculations...</div>
            ) : invoiceModal.invoiceData && (
              <div style={{ padding: "2rem" }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #2563eb", paddingBottom: "1.25rem", marginBottom: "1.5rem" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: "800", color: "#1e3a8a" }}>
                      PADHYA SOFTWARE TECHNOLOGIES
                    </h2>
                    <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.25rem" }}>
                      High Performance Software Engineering &bull; billing@padhyasoft.com
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "1.25rem", fontWeight: "800", color: "#0f172a" }}>INVOICE</div>
                    <div style={{ fontSize: "0.95rem", color: "#2563eb", fontWeight: "700" }}>{invoiceModal.invoiceData.invoice_number}</div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Date: {invoiceModal.invoiceData.invoice_date}</div>
                  </div>
                </div>

                {/* Billed To */}
                <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: "8px", border: "1px solid #e2e8f0", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
                  <div style={{ fontSize: "0.75rem", fontWeight: "700", textTransform: "uppercase", color: "#64748b", marginBottom: "0.25rem" }}>BILLED TO:</div>
                  <div style={{ fontSize: "1.05rem", fontWeight: "700", color: "#0f172a" }}>{invoiceModal.invoiceData.client.name}</div>
                  <div style={{ color: "#475569" }}>{invoiceModal.invoiceData.client.company} &bull; {invoiceModal.invoiceData.client.email || "accounts@client.com"}</div>
                  <div style={{ color: "#64748b", marginTop: "0.2rem" }}>Contract Hourly Rate: <strong>₹{invoiceModal.invoiceData.billing_rate}/hr</strong></div>
                </div>

                {/* Itemized Timesheet Entries */}
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.85rem", marginBottom: "1.5rem" }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #cbd5e1", color: "#334155", fontWeight: "700" }}>
                      <th style={{ padding: "0.6rem 0.8rem" }}>Date</th>
                      <th style={{ padding: "0.6rem 0.8rem" }}>Consultant / Dev</th>
                      <th style={{ padding: "0.6rem 0.8rem" }}>Task Deliverable</th>
                      <th style={{ padding: "0.6rem 0.8rem", textAlign: "right" }}>Hours</th>
                      <th style={{ padding: "0.6rem 0.8rem", textAlign: "right" }}>Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceModal.invoiceData.items?.slice(0, 10).map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "0.55rem 0.8rem" }}>{it.date}</td>
                        <td style={{ padding: "0.55rem 0.8rem", fontWeight: "600" }}>{it.developer}</td>
                        <td style={{ padding: "0.55rem 0.8rem" }}>{it.task}</td>
                        <td style={{ padding: "0.55rem 0.8rem", textAlign: "right", fontWeight: "600" }}>{it.hours} hrs</td>
                        <td style={{ padding: "0.55rem 0.8rem", textAlign: "right", fontWeight: "700" }}>₹{it.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Subtotal & Tax */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <div style={{ width: "300px", fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Subtotal ({invoiceModal.invoiceData.total_hours} hrs):</span>
                      <strong>₹{invoiceModal.invoiceData.subtotal.toFixed(2)}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>GST / Service Tax ({invoiceModal.invoiceData.tax_rate}%):</span>
                      <span>₹{invoiceModal.invoiceData.tax_amount.toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.15rem", fontWeight: "800", color: "#1e3a8a", borderTop: "2px solid #2563eb", paddingTop: "0.5rem" }}>
                      <span>Grand Total:</span>
                      <span>₹{invoiceModal.invoiceData.grand_total.toFixed(2)} INR</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "2rem", paddingTop: "1rem", borderTop: "1px dashed #cbd5e1", fontSize: "0.75rem", color: "#64748b", textAlign: "center" }}>
                  Payment Terms: Net 30 days &bull; Bank Wire Transfer / Swift Accepted &bull; Thank you for your partnership!
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
