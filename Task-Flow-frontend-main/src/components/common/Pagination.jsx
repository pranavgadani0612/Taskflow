import React from "react";

export default function Pagination({
  currentPage = 1,
  totalRecords = 0,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  showAlways = false,
  pageSizeOptions = [10, 25, 50, 100]
}) {
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  if (!showAlways && totalRecords === 0) return null;

  const startRecord = totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endRecord = Math.min(currentPage * pageSize, totalRecords);

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      if (onPageChange) onPageChange(newPage);
    }
  };

  const handlePageSizeSelect = (e) => {
    const newSize = Number(e.target.value);
    if (onPageSizeChange) {
      onPageSizeChange(newSize);
    }
  };

  return (
    <div className="pagination-controls">
      <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
        <div className="table-stats">
          {startRecord} - {endRecord} of <span>{totalRecords}</span> records
        </div>

        {/* Rows Per Page Selector (10, 25, 50, 100) */}
        {onPageSizeChange && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--text-muted, #64748b)", fontWeight: "600" }}>
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={handlePageSizeSelect}
              style={{
                height: "30px",
                padding: "2px 8px",
                fontSize: "12px",
                fontWeight: "700",
                borderRadius: "6px",
                border: "1px solid var(--ui-border, #cbd5e1)",
                background: "var(--ui-surface, #fff)",
                color: "var(--text-main, #1e293b)",
                cursor: "pointer",
                outline: "none"
              }}
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="pagination-buttons">
        <button
          className="page-btn"
          disabled={currentPage <= 1}
          onClick={() => handlePageChange(currentPage - 1)}
        >
          PREV
        </button>

        {totalPages > 0 &&
          [...Array(totalPages)].map((_, i) => {
            const pageNum = i + 1;
            if (
              pageNum === 1 ||
              pageNum === totalPages ||
              (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
            ) {
              return (
                <button
                  key={pageNum}
                  className={`page-btn ${currentPage === pageNum ? "active" : ""}`}
                  onClick={() => handlePageChange(pageNum)}
                >
                  {pageNum}
                </button>
              );
            } else if (
              pageNum === currentPage - 2 ||
              pageNum === currentPage + 2
            ) {
              return (
                <span
                  key={pageNum}
                  style={{ padding: "0 8px", color: "#94a3b8" }}
                >
                  ...
                </span>
              );
            }
            return null;
          })}

        <button
          className="page-btn"
          disabled={currentPage >= totalPages || totalPages === 0}
          onClick={() => handlePageChange(currentPage + 1)}
        >
          NEXT
        </button>
      </div>
    </div>
  );
}
