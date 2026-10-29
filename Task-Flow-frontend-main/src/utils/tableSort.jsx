import React, { useState, useMemo } from "react";

/**
 * Robust comparator for numbers, dates, strings, booleans, and nested values.
 */
export function sortData(items = [], key = null, direction = "asc") {
  if (!key || !Array.isArray(items) || items.length === 0) return items;

  return [...items].sort((a, b) => {
    let aVal = a?.[key];
    let bVal = b?.[key];

    // Handle nested accessor if dot-separated e.g. "user.name"
    if (key.includes(".")) {
      const parts = key.split(".");
      aVal = parts.reduce((o, i) => o?.[i], a);
      bVal = parts.reduce((o, i) => o?.[i], b);
    }

    // Handle object with name or title
    if (typeof aVal === "object" && aVal !== null) aVal = aVal.name || aVal.title || "";
    if (typeof bVal === "object" && bVal !== null) bVal = bVal.name || bVal.title || "";

    if (aVal === null || aVal === undefined || aVal === "") return 1;
    if (bVal === null || bVal === undefined || bVal === "") return -1;

    // Check if both are numeric or numeric strings (e.g. "1200", 45)
    const numA = Number(aVal);
    const numB = Number(bVal);
    if (!isNaN(numA) && !isNaN(numB) && typeof aVal !== "boolean" && typeof bVal !== "boolean") {
      return direction === "asc" ? numA - numB : numB - numA;
    }

    // Check if both are valid dates
    if (typeof aVal === "string" && typeof bVal === "string") {
      const isDateA = !isNaN(Date.parse(aVal)) && (aVal.includes("-") || aVal.includes("/") || aVal.includes("T"));
      const isDateB = !isNaN(Date.parse(bVal)) && (bVal.includes("-") || bVal.includes("/") || bVal.includes("T"));
      if (isDateA && isDateB) {
        const diff = new Date(aVal).getTime() - new Date(bVal).getTime();
        return direction === "asc" ? diff : -diff;
      }

      const cmp = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: "base" });
      return direction === "asc" ? cmp : -cmp;
    }

    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

/**
 * Hook to manage table sorting
 */
export function useTableSort(data = [], defaultKey = null, defaultDirection = "asc") {
  const [sortConfig, setSortConfig] = useState({
    key: defaultKey,
    direction: defaultDirection,
  });

  const requestSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    } else if (sortConfig.key === key && sortConfig.direction === "desc") {
      setSortConfig({ key: null, direction: "asc" });
      return;
    }
    setSortConfig({ key, direction });
  };

  const sortedData = useMemo(() => {
    return sortData(data, sortConfig.key, sortConfig.direction);
  }, [data, sortConfig.key, sortConfig.direction]);

  return { sortedData, sortConfig, requestSort };
}

/**
 * Visual Sort Indicator icon
 */
export function SortIndicator({ sortKey, currentKey, direction }) {
  const isActive = sortKey === currentKey;
  return (
    <span
      style={{
        display: "inline-flex",
        marginLeft: "6px",
        fontSize: "11px",
        fontWeight: "900",
        color: isActive ? "var(--primary-color, #4f46e5)" : "#94a3b8",
        opacity: isActive ? 1 : 0.45,
        userSelect: "none",
        transition: "opacity 0.15s, color 0.15s",
      }}
      title={isActive ? (direction === "asc" ? "Ascending" : "Descending") : "Click to sort"}
    >
      {isActive ? (direction === "asc" ? "▲" : "▼") : "⇅"}
    </span>
  );
}
