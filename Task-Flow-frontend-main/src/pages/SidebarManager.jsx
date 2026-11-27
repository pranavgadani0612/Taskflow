import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../contexts/PermissionContext";
import { useToast } from "../contexts/ToastContext";
import ConfirmModal from "../components/common/ConfirmModal";
import { getSidebarModules, applySidebarConfig, toSidebarConfig } from "../config/sidebarModules";
import { useSidebarConfig } from "../hooks/useSidebarConfig";

/* =====================================================================
   Sidebar Manager
   Decide for the whole company:
     - the ORDER of groups and modules (1, 2, 3 …) – type a number, use ↑ ↓ or drag
     - which GROUP a module is in (e.g. Staff under "People"), or the top level
     - the NAME shown in the sidebar
     - SHOW / HIDE of each group and module
   Hiding only removes the link from the sidebar; who may open a page is still
   decided by Role permissions.
   ===================================================================== */

const CSS = `
.sbm { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; align-items: start; }
.sbm-card { background: var(--ui-surface, #fff); border: 1px solid var(--ui-border, #e2e8f0); border-radius: 12px; }
.sbm-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--ui-border, #e2e8f0); }
.sbm-stats { display: flex; gap: 8px; flex-wrap: wrap; }
.sbm-stat { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; background: var(--ui-bg, #f1f5f9); color: var(--text-muted, #64748b); }
.sbm-stat b { color: var(--text-main, #1e293b); }
.sbm-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.sbm-btn { padding: 8px 14px; border-radius: 8px; border: 1px solid var(--ui-border, #cbd5e1); background: var(--ui-surface, #fff); color: var(--text-main, #334155); font-weight: 600; font-size: 13px; cursor: pointer; }
.sbm-btn:hover:not(:disabled) { background: var(--ui-bg, #f8fafc); }
.sbm-btn:disabled { opacity: .5; cursor: not-allowed; }
.sbm-btn--primary { background: #4f46e5; border-color: #4f46e5; color: #fff; }
.sbm-btn--primary:hover:not(:disabled) { background: #4338ca; }
.sbm-btn--danger { color: #dc2626; }
.sbm-list { list-style: none; margin: 0; padding: 8px; }
.sbm-list > li + li { margin-top: 4px; }
.sbm-row { display: grid; grid-template-columns: 20px 52px 28px minmax(0, 1fr) 170px auto auto; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 10px; border: 1px solid transparent; background: var(--ui-surface, #fff); }
.sbm-row:hover { background: var(--ui-bg, #f8fafc); }
.sbm-row.is-group { background: var(--ui-bg, #f8fafc); border-color: var(--ui-border, #e2e8f0); }
.sbm-row.is-group .sbm-name { font-weight: 700; }
.sbm-row.is-hidden .sbm-name, .sbm-row.is-hidden .sbm-icon { opacity: .45; }
.sbm-row.is-drag { opacity: .4; }
.sbm-row.is-over { border-color: #4f46e5; border-style: dashed; }
.sbm-handle { cursor: grab; color: var(--text-muted, #94a3b8); font-size: 16px; line-height: 1; user-select: none; text-align: center; }
.sbm-pos { width: 52px; height: 34px; text-align: center; border-radius: 8px; border: 1px solid var(--ui-border, #cbd5e1); background: var(--ui-surface, #fff); font-weight: 700; font-size: 14px; color: var(--text-main, #1e293b); }
.sbm-pos:focus, .sbm-group:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.15); }
.sbm-icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: rgba(79,70,229,.08); color: #4f46e5; }
.sbm-namewrap { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.sbm-name { width: 100%; height: 34px; padding: 0 10px; border-radius: 8px; border: 1px solid transparent; background: transparent; font-size: 14px; font-weight: 600; color: var(--text-main, #1e293b); font-family: inherit; }
.sbm-name:hover { border-color: var(--ui-border, #cbd5e1); }
.sbm-name:focus { outline: none; border-color: #4f46e5; background: var(--ui-surface, #fff); box-shadow: 0 0 0 3px rgba(79,70,229,.15); }
.sbm-default { font-size: 11px; color: var(--text-muted, #64748b); padding-left: 11px; }
.sbm-default button { border: 0; background: none; color: #4f46e5; font-size: 11px; cursor: pointer; padding: 0 4px; font-weight: 600; }
.sbm-group { width: 100%; height: 34px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--ui-border, #cbd5e1); background: var(--ui-surface, #fff); color: var(--text-main, #334155); font-size: 12.5px; font-family: inherit; cursor: pointer; }
.sbm-groupinfo { font-size: 12px; color: var(--text-muted, #64748b); font-weight: 600; }
.sbm-ctrl { display: flex; gap: 4px; align-items: center; }
.sbm-icobtn { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--ui-border, #cbd5e1); background: var(--ui-surface, #fff); color: var(--text-main, #334155); cursor: pointer; font-size: 13px; line-height: 1; }
.sbm-icobtn:disabled { opacity: .35; cursor: not-allowed; }
.sbm-icobtn:hover:not(:disabled) { background: var(--ui-bg, #f1f5f9); }
.sbm-switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; font-weight: 600; color: var(--text-muted, #64748b); min-width: 86px; user-select: none; }
.sbm-switch input { position: absolute; opacity: 0; pointer-events: none; }
.sbm-switch__track { position: relative; width: 36px; height: 20px; border-radius: 10px; background: #cbd5e1; transition: background .15s; flex-shrink: 0; }
.sbm-switch__track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .15s; }
.sbm-switch input:checked + .sbm-switch__track { background: #16a34a; }
.sbm-switch input:checked + .sbm-switch__track::after { transform: translateX(16px); }
.sbm-switch input:focus-visible + .sbm-switch__track { box-shadow: 0 0 0 3px rgba(79,70,229,.3); }
.sbm-switch.is-locked { cursor: not-allowed; opacity: .7; }
.sbm-sub { list-style: none; margin: 4px 0 10px 46px; padding: 2px 0 2px 12px; border-left: 2px solid var(--ui-border, #e2e8f0); }
.sbm-sub .sbm-row { grid-template-columns: 20px 52px minmax(0, 1fr) 170px auto auto; padding: 5px 8px; }
.sbm-sub .sbm-pos { height: 30px; font-size: 13px; }
.sbm-sub .sbm-name, .sbm-sub .sbm-group { height: 30px; font-size: 13px; }
.sbm-sub .sbm-name { font-weight: 500; }
.sbm-empty { margin: 4px 0 10px 58px; padding: 10px 12px; border: 1px dashed var(--ui-border, #cbd5e1); border-radius: 8px; font-size: 12.5px; color: var(--text-muted, #64748b); }
.sbm-expand { border: 0; background: none; color: var(--text-muted, #64748b); font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 0 2px 108px; }
.sbm-note { margin: 0; padding: 12px 16px; font-size: 12.5px; color: var(--text-muted, #64748b); border-top: 1px solid var(--ui-border, #e2e8f0); line-height: 1.5; }
.sbm-preview { position: sticky; top: 16px; overflow: hidden; }
.sbm-preview h4 { margin: 0; padding: 12px 14px; font-size: 13px; border-bottom: 1px solid var(--ui-border, #e2e8f0); color: var(--text-main, #1e293b); }
.sbm-preview ol { list-style: none; margin: 0; padding: 8px; max-height: 72vh; overflow-y: auto; }
.sbm-preview li { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; font-size: 13px; color: var(--text-main, #334155); font-weight: 600; }
.sbm-preview li .n { width: 22px; text-align: right; font-size: 11px; color: var(--text-muted, #94a3b8); font-weight: 700; }
.sbm-preview li.sub { padding: 4px 8px 4px 62px; font-size: 12.5px; color: var(--text-muted, #64748b); font-weight: 500; position: relative; }
.sbm-preview li.sub::before { content: ""; position: absolute; left: 50px; top: 0; bottom: 0; border-left: 2px solid var(--ui-border, #e2e8f0); }
.sbm-preview li .ic { color: #4f46e5; display: grid; }
.sbm-dirty { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #b45309; background: #fef3c7; padding: 4px 10px; border-radius: 20px; }
@media (max-width: 1200px) { .sbm { grid-template-columns: minmax(0, 1fr); } .sbm-preview { position: static; } }
@media (max-width: 760px) {
  .sbm-row, .sbm-sub .sbm-row { grid-template-columns: 44px minmax(0, 1fr) auto; row-gap: 6px; padding: 10px 8px; }
  .sbm-row .sbm-handle, .sbm-row .sbm-icon { display: none; }
  .sbm-row .sbm-switch { grid-column: 3; grid-row: 1; min-width: 0; }
  .sbm-row .sbm-group, .sbm-row .sbm-groupinfo { grid-column: 1 / 3; grid-row: 2; }
  .sbm-row .sbm-ctrl { grid-column: 3; grid-row: 2; justify-content: flex-end; }
  .sbm-pos { width: 44px; }
  .sbm-sub { margin-left: 8px; padding-left: 8px; }
  .sbm-empty { margin-left: 16px; }
  .sbm-expand { padding-left: 52px; }
  .sbm-toolbar { flex-direction: column; align-items: stretch; }
  .sbm-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .sbm-actions .sbm-btn { width: 100%; }
}
`;

const move = (list, from, to) => {
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, it);
  return next;
};

/* drag & drop inside one list (the top level or one group) */
function useDrag(onMove) {
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  return {
    dragging, over,
    start: (i) => setDragging(i),
    enter: (i) => { if (dragging !== null) setOver(i); },
    drop: (i) => { if (dragging !== null && dragging !== i) onMove(dragging, i); setDragging(null); setOver(null); },
    end: () => { setDragging(null); setOver(null); },
  };
}

/* one row: a group heading or a module */
function Row({ item, index, count, level, onChange, onMove, drag, groups, groupKey, onGroup }) {
  const [pos, setPos] = useState(String(index + 1));
  useEffect(() => setPos(String(index + 1)), [index]);
  const commitPos = () => {
    const n = parseInt(pos, 10);
    if (!Number.isFinite(n)) return setPos(String(index + 1));
    const to = Math.max(1, Math.min(count, n)) - 1;
    if (to !== index) onMove(index, to); else setPos(String(index + 1));
  };
  const renamed = item.name.trim() !== item.defaultName;
  const noDrag = { draggable: false, onDragStart: (e) => e.preventDefault() };

  return (
    <div
      className={`sbm-row ${item.isGroup ? "is-group" : ""} ${item.hidden ? "is-hidden" : ""} ${drag.dragging === index ? "is-drag" : ""} ${drag.over === index && drag.dragging !== index ? "is-over" : ""}`}
      draggable
      onDragStart={(e) => { drag.start(index); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", item.key); }}
      onDragOver={(e) => { e.preventDefault(); drag.enter(index); }}
      onDrop={(e) => { e.preventDefault(); drag.drop(index); }}
      onDragEnd={drag.end}
    >
      <span className="sbm-handle" title="Drag to move" aria-hidden="true">⋮⋮</span>
      <input
        className="sbm-pos"
        value={pos}
        inputMode="numeric"
        aria-label={`Position of ${item.defaultName}`}
        title="Type a number to move"
        onChange={(e) => setPos(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onBlur={commitPos}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
        onFocus={(e) => e.target.select()}
        {...noDrag}
      />
      {level === 0 && <span className="sbm-icon">{item.icon}</span>}
      <div className="sbm-namewrap">
        <input
          className="sbm-name"
          value={item.name}
          maxLength={40}
          aria-label={`Name of ${item.defaultName}`}
          placeholder={item.defaultName}
          onChange={(e) => onChange({ name: e.target.value })}
          onBlur={() => { if (!item.name.trim()) onChange({ name: item.defaultName }); }}
          {...noDrag}
        />
        {renamed && (
          <span className="sbm-default">
            Default: {item.defaultName}
            <button type="button" onClick={() => onChange({ name: item.defaultName })}>Undo</button>
          </span>
        )}
      </div>
      {item.isGroup ? (
        <span className="sbm-groupinfo">{item.subItems.length} module{item.subItems.length === 1 ? "" : "s"}</span>
      ) : (
        <select
          className="sbm-group"
          value={groupKey || ""}
          aria-label={`Group of ${item.defaultName}`}
          title="Move this module into a group"
          onChange={(e) => onGroup(item.key, e.target.value || null)}
          {...noDrag}
        >
          <option value="">— Top level —</option>
          {groups.map((g) => <option key={g.key} value={g.key}>In: {g.name.trim() || g.defaultName}</option>)}
        </select>
      )}
      <label className={`sbm-switch ${item.locked ? "is-locked" : ""}`} title={item.locked ? "This module is always shown" : item.hidden ? "Hidden from the sidebar" : "Shown in the sidebar"}>
        <input type="checkbox" checked={!item.hidden} disabled={item.locked} onChange={(e) => onChange({ hidden: !e.target.checked })} />
        <span className="sbm-switch__track" />
        {item.locked ? "Always" : item.hidden ? "Hidden" : "Shown"}
      </label>
      <div className="sbm-ctrl">
        <button type="button" className="sbm-icobtn" disabled={index === 0} onClick={() => onMove(index, index - 1)} aria-label="Move up" title="Move up">↑</button>
        <button type="button" className="sbm-icobtn" disabled={index === count - 1} onClick={() => onMove(index, index + 1)} aria-label="Move down" title="Move down">↓</button>
      </div>
    </div>
  );
}

function SubList({ group, groups, onChangeSubs, onGroup }) {
  const subs = group.subItems;
  const moveSub = (from, to) => onChangeSubs(move(subs, from, to));
  const drag = useDrag(moveSub);
  if (!subs.length) {
    return <div className="sbm-empty">No modules in this group – it is not shown in the sidebar. Use a module’s group list to move one here.</div>;
  }
  return (
    <ul className="sbm-sub">
      {subs.map((s, i) => (
        <li key={s.key}>
          <Row
            item={s} index={i} count={subs.length} level={1} drag={drag} onMove={moveSub}
            groups={groups} groupKey={group.key} onGroup={onGroup}
            onChange={(patch) => onChangeSubs(subs.map((x) => (x.key === s.key ? { ...x, ...patch } : x)))}
          />
        </li>
      ))}
    </ul>
  );
}

export default function SidebarManager() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const { config, loaded, updatedBy, updatedAt, save, reset } = useSidebarConfig();

  const roleName = String(user?.role?.name || "").toLowerCase();
  const isSuperAdmin = user?.email === "gadanipranav@gmail.com" || roleName === "super admin";
  const isCompanyOwner = isSuperAdmin || ["owner", "admin", "manager"].some((w) => roleName.includes(w));
  // same rule as the server: Super Admin / Company Owner, or "Sidebar Manager" update permission
  const canEdit = isSuperAdmin || roleName === "company owner" || hasPermission("sidebar_management", "update");
  const defaults = useMemo(() => getSidebarModules({ isCompanyOwner, isSuperAdmin }), [isCompanyOwner, isSuperAdmin]);

  const [items, setItems] = useState([]);
  const [closed, setClosed] = useState({});     // groups are open unless closed here
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const baseline = useRef("");

  // (re)load the editor whenever the saved config changes
  useEffect(() => {
    if (!loaded) return;
    const merged = applySidebarConfig(defaults, config);
    setItems(merged);
    baseline.current = JSON.stringify(toSidebarConfig(merged));
  }, [loaded, config, defaults]);

  const current = useMemo(() => JSON.stringify(toSidebarConfig(items)), [items]);
  const dirty = loaded && items.length > 0 && current !== baseline.current;

  // warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const groups = items.filter((m) => m.isGroup);
  const moveTop = (from, to) => setItems((list) => move(list, from, to));
  const drag = useDrag(moveTop);
  const patch = (key, p) => setItems((list) => list.map((m) => (m.key === key ? { ...m, ...p } : m)));

  // move a module into a group (at its end) or to the top level (at the end)
  const moveToGroup = (key, target) => {
    setItems((list) => {
      let mod = null;
      const without = list
        .filter((m) => { if (m.key === key) { mod = m; return false; } return true; })
        .map((m) => {
          if (!m.isGroup) return m;
          const found = m.subItems.find((s) => s.key === key);
          if (found) mod = found;
          return found ? { ...m, subItems: m.subItems.filter((s) => s.key !== key) } : m;
        });
      if (!mod) return list;
      if (!target) return [...without, mod];
      setClosed((c) => ({ ...c, [target]: false }));
      return without.map((m) => (m.key === target ? { ...m, subItems: [...m.subItems, mod] } : m));
    });
    const g = groups.find((x) => x.key === target);
    showToast(target ? `Moved to “${g?.name.trim() || g?.defaultName}”` : "Moved to the top level");
  };

  const leaves = items.flatMap((m) => (m.isGroup ? m.subItems : [m]));
  const all = [...groups, ...leaves];
  const stats = {
    groups: groups.length,
    modules: leaves.length,
    hidden: all.filter((m) => m.hidden).length,
    renamed: all.filter((m) => m.name.trim() !== m.defaultName).length,
  };

  const onSave = async () => {
    const bad = all.find((m) => !m.name.trim());
    if (bad) return showToast(`Name of "${bad.defaultName}" cannot be empty`, "error");
    setSaving(true);
    try {
      await save(toSidebarConfig(items));
      showToast("Sidebar saved – everyone in the company sees the new sidebar");
    } catch (err) {
      showToast(err.response?.data?.error || "Could not save the sidebar", "error");
    } finally {
      setSaving(false);
    }
  };

  const onDiscard = () => setItems(applySidebarConfig(defaults, config));

  const onReset = async () => {
    setConfirmReset(false);
    setSaving(true);
    try {
      await reset();
      showToast("Sidebar reset to the default groups, order, names and visibility");
    } catch (err) {
      showToast(err.response?.data?.error || "Could not reset the sidebar", "error");
    } finally {
      setSaving(false);
    }
  };

  const showAll = () =>
    setItems((list) => list.map((m) => ({ ...m, hidden: false, subItems: m.subItems?.map((s) => ({ ...s, hidden: false })) })));

  return (
    <div className="page-container">
      <style>{CSS}</style>
      <div className="header">
        <div>
          <h2 style={{ margin: 0 }}>Sidebar Manager</h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--text-muted, #64748b)" }}>
            Arrange the sidebar for your whole company: groups (like Project) with their related modules, order (1, 2, 3 …), names and visibility.
          </p>
        </div>
        {dirty && <span className="sbm-dirty">● Unsaved changes</span>}
      </div>

      {!loaded ? (
        <div className="sbm-card" style={{ padding: 40, textAlign: "center", color: "var(--text-muted, #64748b)" }}>Loading sidebar…</div>
      ) : (
        <div className="sbm">
          <div className="sbm-card">
            <div className="sbm-toolbar">
              <div className="sbm-stats">
                <span className="sbm-stat"><b>{stats.groups}</b> groups</span>
                <span className="sbm-stat"><b>{stats.modules}</b> modules</span>
                <span className="sbm-stat"><b>{stats.hidden}</b> hidden</span>
                <span className="sbm-stat"><b>{stats.renamed}</b> renamed</span>
              </div>
              {canEdit ? (
                <div className="sbm-actions">
                  <button type="button" className="sbm-btn" onClick={showAll} disabled={saving}>Show all</button>
                  <button type="button" className="sbm-btn sbm-btn--danger" onClick={() => setConfirmReset(true)} disabled={saving || (!config && !dirty)}>Reset to default</button>
                  <button type="button" className="sbm-btn" onClick={onDiscard} disabled={!dirty || saving}>Discard</button>
                  <button type="button" className="sbm-btn sbm-btn--primary" onClick={onSave} disabled={!dirty || saving}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              ) : (
                <span className="sbm-stat">View only – ask an admin for “Sidebar Manager” update permission</span>
              )}
            </div>

            <ul className="sbm-list">
              {items.map((m, i) => (
                <li key={m.key}>
                  <Row
                    item={m} index={i} count={items.length} level={0} drag={drag} onMove={moveTop}
                    groups={groups} groupKey={null} onGroup={moveToGroup}
                    onChange={(p) => patch(m.key, p)}
                  />
                  {m.isGroup && (
                    <>
                      <button type="button" className="sbm-expand" onClick={() => setClosed((c) => ({ ...c, [m.key]: !c[m.key] }))} aria-expanded={!closed[m.key]}>
                        {closed[m.key] ? "▸ Show" : "▾ Hide"} modules in {m.name.trim() || m.defaultName}
                        {m.subItems.some((s) => s.hidden) ? ` · ${m.subItems.filter((s) => s.hidden).length} hidden` : ""}
                      </button>
                      {!closed[m.key] && (
                        <SubList group={m} groups={groups} onGroup={moveToGroup} onChangeSubs={(subs) => patch(m.key, { subItems: subs })} />
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>

            <p className="sbm-note">
              Hiding a group hides all modules inside it. Hiding only removes links from the sidebar – who can open a page is
              still set in <b>Role</b> permissions, and each person sees only the modules they have permission for. A group with
              no visible modules is not shown.
              {updatedAt && <> Last saved {new Date(updatedAt).toLocaleString()}{updatedBy ? ` by ${updatedBy}` : ""}.</>}
            </p>
          </div>

          <aside className="sbm-card sbm-preview" aria-label="Sidebar preview">
            <h4>Preview</h4>
            <ol>
              {items
                .filter((m) => !m.hidden && (!m.isGroup || m.subItems.some((s) => !s.hidden)))
                .map((m, i) => <PreviewItem key={m.key} m={m} n={i + 1} />)}
            </ol>
          </aside>
        </div>
      )}

      <ConfirmModal
        show={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={onReset}
        title="Reset sidebar"
        message="Go back to the default groups, order, names and visibility for everyone in the company?"
        confirmText="Reset"
      />
    </div>
  );
}

function PreviewItem({ m, n }) {
  return (
    <>
      <li>
        <span className="n">{n}</span>
        <span className="ic">{m.icon}</span>
        <span>{m.name.trim() || m.defaultName}</span>
      </li>
      {m.isGroup && m.subItems.filter((s) => !s.hidden).map((s) => (
        <li key={s.key} className="sub">{s.name.trim() || s.defaultName}</li>
      ))}
    </>
  );
}
