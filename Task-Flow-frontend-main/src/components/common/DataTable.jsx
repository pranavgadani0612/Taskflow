import React, { useState, useMemo } from "react";
import ConfirmModal from "./ConfirmModal";
import Pagination from "./Pagination";
import { sortData, SortIndicator } from "../../utils/tableSort";

export default function DataTable({
  data = [],
  columns = [],
  onView,
  onEdit,
  onDelete,
  onSendToQA,
  renderActions,
  rowKey = "_id",
  emptyText = "No records found",
  pageSize = 10,
  onPageSizeChange,
  searchPlaceholder = "Search...",
  // Server-side pagination props
  serverSide = false,
  totalRecords = 0,
  serverCurrentPage = 1,
  onPageChange = null,
}) {
  const [search, setSearch] = useState("");
  const [localPageSize, setLocalPageSize] = useState(10);
  const [localCurrentPage, setLocalCurrentPage] = useState(1);
  const [deleteId, setDeleteId] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });

  const effectivePageSize = serverSide ? (pageSize || 10) : localPageSize;

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    } else if (sortConfig.key === key && sortConfig.direction === "desc") {
      setSortConfig({ key: null, direction: "asc" });
      return;
    }
    setSortConfig({ key, direction });
  };

  // Filter data based on search (triggers only when search query is at least 3 characters or cleared)
  const filteredData = useMemo(() => {
    const trimmed = (search || "").trim();
    if (!trimmed || trimmed.length < 3) return data;
    const lowerSearch = trimmed.toLowerCase();
    return data.filter((item) => {
      return columns.some((col) => {
        const value = item[col.key];
        if (value === null || value === undefined) return false;

        // Handle strings, numbers, and arrays/objects by their name
        const stringValue = Array.isArray(value)
          ? value.map((v) => v.name || v).join(" ")
          : typeof value === "object"
            ? value.name || ""
            : String(value);

        return stringValue.toLowerCase().includes(lowerSearch);
      });
    });
  }, [data, search, columns]);

  // Sort filtered data
  const sortedData = useMemo(() => {
    return sortData(filteredData, sortConfig.key, sortConfig.direction);
  }, [filteredData, sortConfig]);

  // Paginate filtered data (only for client-side)
  const totalPages = serverSide ? Math.ceil(totalRecords / effectivePageSize) : Math.ceil(sortedData.length / effectivePageSize);

  const paginatedData = useMemo(() => {
    if (serverSide) {
      // If user typed a search term (>= 3 chars), filter the visible records client-side
      const trimmed = (search || "").trim();
      if (trimmed.length >= 3) {
        return sortedData;
      }
      return data;
    }
    const start = (localCurrentPage - 1) * effectivePageSize;
    return sortedData.slice(start, start + effectivePageSize);
  }, [sortedData, localCurrentPage, effectivePageSize, serverSide, data, search]);

  // Reset page when search or sort changes
  React.useEffect(() => {
    if (!serverSide) setLocalCurrentPage(1);
  }, [search, sortConfig, serverSide]);

  const handlePageChange = (newPage) => {
    if (serverSide && onPageChange) {
      onPageChange(newPage);
    } else {
      setLocalCurrentPage(newPage);
    }
  };

  const displayCurrentPage = serverSide ? serverCurrentPage : localCurrentPage;
  const isSearchActive = (search || "").trim().length >= 3;
  const displayTotalRecords = serverSide ? (isSearchActive ? filteredData.length : totalRecords) : filteredData.length;

  const hasActions = Boolean(onView || onEdit || onDelete || renderActions);

  const getRowKey = (row, index) => {
    if (typeof rowKey === "function") return rowKey(row, index);
    return row?.[rowKey] ?? index;
  };

  return (
    <div className="table-container">
      {/* Search Bar & Stats */}
      <div className="table-controls">
        <div className="search-wrapper">
          <div className="search-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" x2="16.65" y1="21" y2="16.65" /></svg>
          </div>
          <input
            type="text"
            className="search-input"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="table-stats">
          Total: <span>{displayTotalRecords}</span> records
        </div>
      </div>

      <div className="table-responsive" style={{ width: "100%", overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key || i}
                  style={{
                    textAlign: c.align || "left",
                    cursor: c.sortable !== false ? "pointer" : "default",
                    userSelect: "none"
                  }}
                  onClick={() => c.sortable !== false && handleSort(c.key)}
                  title={c.sortable !== false ? `Sort by ${c.header}` : ""}
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "2px" }}>
                    <span>{c.header}</span>
                    {c.sortable !== false && (
                      <SortIndicator
                        sortKey={c.key}
                        currentKey={sortConfig.key}
                        direction={sortConfig.direction}
                      />
                    )}
                  </div>
                </th>
              ))}
              {hasActions && <th>Actions</th>}
            </tr>
          </thead>

          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (hasActions ? 1 : 0)} style={{ padding: 24, color: "#94a3b8", textAlign: "center" }}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => (
                <tr key={getRowKey(row, index)}>
                  {columns.map((c, i) => {
                    const value = row?.[c.key];
                    return (
                      <td key={c.key || i} style={{ textAlign: c.align || 'left' }}>
                        {c.render
                          ? c.render(value, row)
                          : Array.isArray(value)
                            ? value.length > 0 ? value.map(v => v.name || v).join(", ") : "-"
                            : typeof value === "object"
                              ? value?.name || "-"
                              : value ?? "-"}
                      </td>
                    );
                  })}

                  {hasActions && (
                    <td>
                      <div className="action-buttons">
                        {renderActions ? (
                          renderActions(row)
                        ) : (
                          <>
                            {onView && (
                              <button
                                className="action-btn view-btn"
                                onClick={() => onView(row)}
                                title="Quick View"
                                style={{
                                  background: "#f1f5f9",
                                  border: "1px solid #cbd5e1",
                                  color: "#475569",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "30px",
                                  height: "30px",
                                  transition: "all 0.2s"
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "#e0e7ff"; e.currentTarget.style.color = "#4338ca"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "#f1f5f9"; e.currentTarget.style.color = "#475569"; }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                                  <circle cx="12" cy="12" r="3" />
                                </svg>
                              </button>
                            )}
                            {onSendToQA && (
                              <button
                                className="action-btn"
                                onClick={() => onSendToQA(row)}
                                title="Send to QA & Testing"
                                style={{
                                  background: "#f0fdf4",
                                  border: "1px solid #bbf7d0",
                                  color: "#16a34a",
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  width: "30px",
                                  height: "30px",
                                  transition: "all 0.2s"
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.color = "#fff"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "#f0fdf4"; e.currentTarget.style.color = "#16a34a"; }}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                  <path d="m9 12 2 2 4-4" />
                                </svg>
                              </button>
                            )}
                            {onEdit && (
                              <button
                                className="action-btn"
                                onClick={() => onEdit(row)}
                                title="Edit"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                              </button>
                            )}
                            {onDelete && (
                              <button
                                className="action-btn delete"
                                onClick={() => setDeleteId(row?._id)}
                                title="Delete"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <Pagination
        currentPage={displayCurrentPage}
        totalRecords={displayTotalRecords}
        pageSize={effectivePageSize}
        onPageChange={handlePageChange}
        onPageSizeChange={(newSize) => {
          if (serverSide) {
            if (onPageSizeChange) onPageSizeChange(newSize);
          } else {
            setLocalPageSize(newSize);
            setLocalCurrentPage(1);
          }
        }}
        pageSizeOptions={[10, 25, 50, 100]}
      />

      <ConfirmModal
        show={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={() => {
          onDelete(deleteId);
          setDeleteId(null);
        }}
        title="Delete Confirmation"
        message={
          (() => {
            const item = data.find((d) => (d[rowKey] || d._id || d.id) === deleteId);
            const itemName = item?.name || item?.title || item?.companyName || item?.email || "";
            return itemName
              ? `Are you sure you want to delete "${itemName}"? This action cannot be undone.`
              : "Are you sure you want to delete this record? This action cannot be undone.";
          })()
        }
      />
    </div>
  );
}