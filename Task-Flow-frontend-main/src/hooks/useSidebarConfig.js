import { useCallback, useEffect, useSyncExternalStore } from "react";
import API from "../api/api";
import { useAuth } from "../contexts/AuthContext";
import { useCompany } from "../contexts/CompanyContext";
import { useSocket } from "../contexts/SocketContext";

/* ---------------------------------------------------------------
   One shared copy of the company's sidebar settings.
   The Sidebar and the Sidebar Manager page read the same store, so a save
   shows in the sidebar immediately; other users get it via socket.
   --------------------------------------------------------------- */
let state = { config: null, updatedBy: null, updatedAt: null, loaded: false, companyKey: null };
const listeners = new Set();
const set = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => state;

let inflight = null;
async function load(companyKey, force = false) {
  if (!force && state.loaded && state.companyKey === companyKey) return;
  if (inflight && !force) return inflight;
  inflight = API.get("/sidebar-settings")
    .then(({ data }) => set({ config: data?.config || null, updatedBy: data?.updatedBy || null, updatedAt: data?.updatedAt || null, loaded: true, companyKey }))
    .catch(() => set({ config: null, loaded: true, companyKey }))   // on error the default sidebar is shown
    .finally(() => { inflight = null; });
  return inflight;
}

export function useSidebarConfig() {
  const { user } = useAuth();
  const company = useCompany();
  const socket = useSocket()?.socket;
  const companyKey = `${user?._id || user?.id || ""}|${company?.selectedCompany?._id || ""}`;
  const snap = useSyncExternalStore(subscribe, getSnapshot);

  useEffect(() => {
    if (user) load(companyKey);
  }, [user, companyKey]);

  // another admin saved the sidebar -> reload (the server only returns this user's company)
  useEffect(() => {
    if (!socket || !user) return;
    const onUpdate = () => load(companyKey, true);
    socket.on("sidebar_settings_updated", onUpdate);
    return () => socket.off("sidebar_settings_updated", onUpdate);
  }, [socket, user, companyKey]);

  const save = useCallback(async (config) => {
    const { data } = await API.put("/sidebar-settings", config);
    set({ config: data.config, updatedBy: data.updatedBy || null, updatedAt: data.updatedAt || null, loaded: true, companyKey });
    return data;
  }, [companyKey]);

  const reset = useCallback(async () => {
    await API.delete("/sidebar-settings");
    set({ config: null, updatedBy: null, updatedAt: null, loaded: true, companyKey });
  }, [companyKey]);

  return { ...snap, save, reset, reload: () => load(companyKey, true) };
}
