import React from "react";

export default function FormModal({
  show,
  isOpen,
  onClose,
  title,
  children,
  onSave,
  onSubmit,
  saveText = "Save",
  submitText,
  saveColor,
  cancelText = "Cancel",
  maxWidth = "500px",
  loading = false,
}) {
  const visible = Boolean(show !== undefined ? show : isOpen);
  const handleAction = onSave || onSubmit;
  const actionLabel = submitText || saveText;

  React.useEffect(() => {
    if (visible) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => document.body.classList.remove("modal-open");
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth }}>
        <div className="modal-header">
          <h3>{title}</h3>
        </div>

        <div className="modal-body" style={{ overflow: 'visible' }}>
          {children}
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-primary"
            onClick={handleAction}
            disabled={loading}
            style={saveColor ? { background: saveColor, border: 'none' } : {}}
          >
            {loading ? "Saving..." : actionLabel}
          </button>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
}

