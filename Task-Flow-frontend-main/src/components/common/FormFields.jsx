import React from "react";

export function FormField({ label, hint, children, className = "", required, style, error }) {
  return (
    <div className={`form-group ${className}`.trim()} style={style}>
      {label ? (
        <label>
          {typeof label === 'string' && required ? label.replace(/\s*\*+\s*$/, '') : label}{" "}
          {required && <span style={{ color: 'var(--danger-color, #ef4444)', fontWeight: '700' }}>*</span>}
        </label>
      ) : null}
      {children}
      {error ? (
        <span style={{ color: '#ef4444', fontSize: '12px', marginTop: '5px', display: 'block', fontWeight: '500' }}>
          {error}
        </span>
      ) : hint ? (
        <small style={{ display: 'block', marginTop: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>{hint}</small>
      ) : null}
    </div>
  );
}

export function TextInput({ label, hint, type, className = "", inputClassName = "", required, style, value, error, ...props }) {
  const [showPassword, setShowPassword] = React.useState(false);
  const isPasswordField = type === "password" || props.type === "password";
  const effectiveType = isPasswordField ? (showPassword ? "text" : "password") : (type || props.type);

  if (isPasswordField) {
    return (
      <FormField label={label} hint={hint} className={className} required={required} style={style} error={error}>
        <div style={{ position: "relative", display: "flex", alignItems: "center", width: "100%" }}>
          <input
            {...props}
            type={effectiveType}
            className={`form-control ${inputClassName}`.trim()}
            style={{ paddingRight: "42px", ...(error ? { borderColor: "#ef4444", background: "#fff5f5" } : {}), ...(props.style || {}) }}
            required={required}
            value={value ?? ""}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              position: "absolute",
              right: "12px",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted, #94a3b8)",
              transition: "color 0.2s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-main, #334155)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted, #94a3b8)")}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
        </div>
      </FormField>
    );
  }

  return (
    <FormField label={label} hint={hint} className={className} required={required} style={style} error={error}>
      <input
        type={type}
        className={`form-control ${inputClassName}`.trim()}
        required={required}
        value={value ?? ""}
        style={{ ...(error ? { borderColor: "#ef4444", background: "#fff5f5" } : {}), ...(props.style || {}) }}
        {...props}
      />
    </FormField>
  );
}

export function TextAreaField({ label, hint, className = "", inputClassName = "", value, error, required, ...props }) {
  return (
    <FormField label={label} hint={hint} className={className} required={required} error={error}>
      <textarea
        className={`form-control ${inputClassName}`.trim()}
        style={{ height: '100px', resize: 'none', ...(error ? { borderColor: "#ef4444", background: "#fff5f5" } : {}), ...(props.style || {}) }}
        value={value ?? ""}
        {...props}
      />
    </FormField>
  );
}

export function SelectField({ label, hint, className = "", selectClassName = "", options, children, required, style, error, ...props }) {
  return (
    <FormField label={label} hint={hint} className={className} required={required} style={style} error={error}>
      <select
        className={`form-control ${selectClassName}`.trim()}
        style={{ appearance: 'auto', ...(error ? { borderColor: "#ef4444", background: "#fff5f5" } : {}), ...(props.style || {}) }}
        required={required}
        {...props}
      >
        {options ? options.map((opt) => (
            <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>{opt.label}</option>
          )) : children}
      </select>
    </FormField>
  );
}
