import React, { createContext, useContext, useEffect, useCallback, useState, useMemo } from "react";
import { http } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const BrandContext = createContext(null);
const STORAGE_KEY = "citetail:selected_brand_id";

export function BrandProvider({ children }) {
  const { user, ready: authReady } = useAuth();
  const [brands, setBrands] = useState([]);
  const [selectedId, setSelectedId] = useState(() => {
    try { return window.localStorage.getItem(STORAGE_KEY) || null; } catch { return null; }
  });
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!user) { setBrands([]); return []; }
    try {
      const { data } = await http.get("/brands");
      const list = data?.brands || [];
      setBrands(list);
      return list;
    } catch {
      setBrands([]);
      return [];
    }
  }, [user]);

  // Only mark "ready" once auth has resolved (so BrandGate never redirects
  // to setup while the auth session is still hydrating).
  useEffect(() => {
    let cancelled = false;
    if (!authReady) { setReady(false); return; }
    if (!user) {
      setBrands([]);
      setReady(true);
      return;
    }
    setReady(false);
    reload().finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [authReady, user, reload]);

  // Keep selection in sync with the latest brand list — if the stored ID
  // no longer exists, fall back to the newest brand (or null).
  useEffect(() => {
    if (!ready) return;
    if (!brands.length) { setSelectedId(null); try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } return; }
    const still = brands.find((b) => b.id === selectedId);
    if (!still) {
      const first = brands[0].id;
      setSelectedId(first);
      try { window.localStorage.setItem(STORAGE_KEY, first); } catch { /* ignore */ }
    }
  }, [brands, ready, selectedId]);

  const selectBrand = useCallback((id) => {
    setSelectedId(id);
    try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
  }, []);

  const selected = useMemo(() => brands.find((b) => b.id === selectedId) || null, [brands, selectedId]);

  const value = useMemo(() => ({
    brands,
    selected,
    selectedId,
    ready,
    hasAny: brands.length > 0,
    selectBrand,
    reload,
  }), [brands, selected, selectedId, ready, selectBrand, reload]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

/** Small helper for pretty logos: Google's favicon service is free and CORS-friendly. */
export function faviconUrl(host, size = 64) {
  if (!host) return "";
  const h = String(host).trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=${size}`;
}

/** Rough domain guess for a competitor when only a display name is stored. */
export function guessDomain(nameOrDomain) {
  const raw = String(nameOrDomain || "").trim();
  if (!raw) return "";
  if (raw.includes(".") && !raw.includes(" ")) return raw.toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "") + ".com";
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error("useBrand must be used within BrandProvider");
  return ctx;
}
