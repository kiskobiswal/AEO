import React, { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useBrand, faviconUrl } from "@/context/BrandContext";
import { http } from "@/lib/api";
import {
  Globe, Link2, MessageSquare, FileText, LogOut, Heart, Bot, ShieldCheck, Newspaper, Lock,
  LayoutDashboard, ChevronDown, Plus, Check, CheckCircle2, Radar, FolderKanban, PenSquare,
} from "lucide-react";

/**
 * Redesigned left sidebar:
 *   ┌─────────────────────────────┐
 *   │ Citetail logo               │
 *   │ [Brand dropdown ▾]          │
 *   │  Overview                   │
 *   │  Prompts                    │
 *   │  Citations                  │
 *   │  ── GEO ──                  │
 *   │   Domain Analysis           │
 *   │   Citation Analysis         │
 *   │   Sentiment Analysis        │
 *   │   Reddit Finder             │
 *   │   Brand Consistency         │
 *   │   PR Coverage               │
 *   │  ── AEO ──                  │
 *   │   Content Optimizer         │
 *   │  ── Assistant ──            │
 *   │   AI Agent                  │
 *   └─────────────────────────────┘
 */

const BRAND_TOP = [
  { to: "/app/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/app/site-audit", label: "Site Audit", icon: FolderKanban },
  { to: "/app/prompts", label: "Prompts", icon: MessageSquare, feature: "visibility" },
  { to: "/app/citations", label: "Citations", icon: Link2, feature: "citations" },
];
const GROUPS = [
  {
    label: "GEO",
    items: [
      { to: "/app/domain", label: "Domain Analysis", icon: Globe, feature: "domain" },
      { to: "/app/citation-analysis", label: "Citation Analysis", icon: Radar, feature: "citations" },
      { to: "/app/sentiment", label: "Sentiment Analysis", icon: Heart, feature: "sentiment" },
      { to: "/app/reddit", label: "Reddit Finder", icon: MessageSquare, feature: "reddit" },
      { to: "/app/brand-consistency", label: "Brand Consistency", icon: ShieldCheck, feature: "brand" },
      { to: "/app/pr", label: "PR Coverage", icon: Newspaper, feature: "pr" },
    ],
  },
  {
    label: "AEO",
    items: [
      { to: "/app/optimizer", label: "Content Optimizer", icon: FileText, feature: "aeo" },
      { to: "/app/content-writer", label: "Content Writer", icon: PenSquare, feature: "aeo" },
    ],
  },
];
const ALL_ITEMS = [...BRAND_TOP, ...GROUPS.flatMap((g) => g.items)];

function initials(name) { return (name || "?").trim().slice(0, 2).toUpperCase(); }
function colorFor(id) {
  const palette = ["#F43F5E", "#06B6D4", "#10B981", "#F59E0B", "#8B5CF6", "#3B82F6", "#EC4899", "#84CC16"];
  let h = 0; for (let i = 0; i < (id || "").length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function BrandSwitcher() {
  const { brands, selected, selectBrand } = useBrand();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selectedLogoBroken, setSelectedLogoBroken] = useState(false);
  const ref = useRef(null);

  useEffect(() => { setSelectedLogoBroken(false); }, [selected?.id]);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!selected) {
    return (
      <button
        type="button"
        onClick={() => navigate("/app/brands/new")}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
        data-testid="brand-switcher-empty"
      >
        <Plus size={16} />
        <span className="text-sm font-semibold flex-1 text-left">Add a brand</span>
      </button>
    );
  }

  const selFavicon = faviconUrl(selected.domain, 64);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all ${open ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 bg-white hover:border-slate-300"}`}
        data-testid="brand-switcher"
      >
        <div className="w-8 h-8 rounded-md overflow-hidden border border-slate-200 bg-white grid place-items-center shrink-0" data-testid="brand-switcher-logo">
          {selFavicon && !selectedLogoBroken ? (
            <img src={selFavicon} alt={selected.name} className="w-full h-full object-contain" onError={() => setSelectedLogoBroken(true)} />
          ) : (
            <div className="w-full h-full grid place-items-center text-white text-[11px] font-bold" style={{ background: colorFor(selected.id) }}>{initials(selected.name)}</div>
          )}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Brand</div>
          <div className="text-sm font-bold text-slate-900 truncate">{selected.name}</div>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-lg shadow-lg z-50 overflow-hidden" data-testid="brand-switcher-menu">
          <div className="max-h-[300px] overflow-y-auto">
            {brands.map((b) => (
              <BrandDropdownItem key={b.id} b={b} active={b.id === selected.id} onPick={() => { selectBrand(b.id); setOpen(false); }} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); navigate("/app/brands/new"); }}
            className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-slate-100 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
            data-testid="brand-switcher-add"
          >
            <Plus size={14} />
            Add new brand
          </button>
        </div>
      )}
    </div>
  );
}

function BrandDropdownItem({ b, active, onPick }) {
  const [broken, setBroken] = useState(false);
  const src = faviconUrl(b.domain, 64);
  return (
    <button
      type="button"
      onClick={onPick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left transition-colors ${active ? "bg-indigo-50/60" : ""}`}
      data-testid={`brand-option-${b.id}`}
    >
      <div className="w-6 h-6 rounded overflow-hidden border border-slate-200 bg-white grid place-items-center shrink-0">
        {src && !broken ? (
          <img src={src} alt={b.name} onError={() => setBroken(true)} className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full grid place-items-center text-white text-[10px] font-bold" style={{ background: colorFor(b.id) }}>{initials(b.name)}</div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-800 truncate">{b.name}</div>
        <div className="text-[10px] text-slate-400 truncate">{b.domain}</div>
      </div>
      {active && <Check size={13} className="text-indigo-600 shrink-0" />}
    </button>
  );
}

function NavItem({ it, unread, user }) {
  const { pathname } = useLocation();
  const active = it.to === "/app" ? pathname === "/app" : (pathname === it.to || pathname.startsWith(it.to + "/"));
  const features = user?.entitlements?.features || [];
  const fullAccess = user?.full_access;
  const locked = !fullAccess && it.feature && !features.includes(it.feature);
  const badgeCount = it.badgeKey === "alerts" ? unread : 0;
  if (locked) {
    return (
      <Link to="/app/upgrade" data-testid={`nav-locked-${it.feature}`}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
        <it.icon size={16} strokeWidth={2} className="text-slate-300" />
        <span className="flex-1">{it.label}</span>
        <Lock size={12} className="text-slate-400" />
      </Link>
    );
  }
  return (
    <Link to={it.to} data-testid={`nav-${it.label.toLowerCase().replace(/\s+/g, "-")}`}
      className={`flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all duration-200 ${active ? "nav-active-glow" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}>
      <it.icon size={16} strokeWidth={active ? 2.4 : 2} className={active ? "text-[#6366F1]" : "text-slate-400"} />
      <span className="flex-1">{it.label}</span>
      {badgeCount > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center">
          {badgeCount > 9 ? "9+" : badgeCount}
        </span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      http.get("/alerts").then((r) => {
        if (!cancelled) setUnread(r.data?.unread_count || 0);
      }).catch(() => {});
    };
    load();
    const iv = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [pathname]);

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 sidebar-rail text-slate-600 border-r border-slate-200">
      <div className="px-5 h-16 flex items-center gap-2.5 border-b border-slate-200">
        <img src="/logo.png" alt="Citetail logo" className="w-9 h-9 object-contain" />
        <div className="leading-tight">
          <div className="font-head font-extrabold text-lg tracking-tight">
            <span className="text-slate-900">Cite</span><span className="gradient-text">tail</span>
          </div>
          <div className="text-[10px] text-slate-400 tracking-wider uppercase">AI Answer Visibility</div>
        </div>
      </div>

      <div className="px-3 pt-3">
        <BrandSwitcher />
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
        <div className="space-y-0.5">
          {BRAND_TOP.map((it) => <NavItem key={it.to} it={it} unread={unread} user={user} />)}
        </div>
        {GROUPS.map((g) => (
          <div key={g.label}>
            <div className="px-3 mb-1.5 text-[10px] tracking-[0.16em] uppercase font-bold text-slate-400">{g.label}</div>
            <div className="space-y-0.5">
              {g.items.map((it) => <NavItem key={it.to} it={it} unread={unread} user={user} />)}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-200">
        <div className="flex items-center gap-3 px-2 py-2">
          <Link to="/app/profile" data-testid="sidebar-profile-link"
            className="flex items-center gap-3 flex-1 min-w-0 rounded-md hover:bg-slate-100 px-1 py-1 -mx-1 transition-colors"
            title="Profile & Connect Website">
            <div className="w-8 h-8 rounded-full sidebar-avatar text-white grid place-items-center text-xs font-bold">
              {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-800 truncate">{user?.name}</div>
              <div className="text-[10px] text-slate-400 truncate" data-testid="sidebar-email">{user?.email}</div>
            </div>
          </Link>
          <button data-testid="logout-btn" onClick={async () => { await logout(); navigate("/login"); }}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
  );
}

export function MobileTopbar() {
  const { pathname } = useLocation();
  return (
    <div className="lg:hidden sticky top-0 z-40 bg-white text-slate-800 border-b border-slate-200 shadow-sm">
      <div className="h-14 px-4 flex items-center gap-2">
        <img src="/logo.png" alt="Citetail logo" className="w-7 h-7 object-contain" />
        <span className="font-head font-extrabold tracking-tight text-lg">
          <span className="text-slate-900">Cite</span><span className="gradient-text">tail</span>
        </span>
      </div>
      <div className="flex gap-1 overflow-x-auto px-3 pb-2">
        {ALL_ITEMS.map((it) => {
          const active = it.to === "/app" ? pathname === "/app" : (pathname === it.to || pathname.startsWith(it.to + "/"));
          return (
            <Link key={it.to} to={it.to}
              className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-medium ${active ? "bg-[#6366F1] text-white shadow-[0_4px_16px_-4px_rgba(99,102,241,0.6)]" : "text-slate-500 hover:bg-slate-100"}`}>
              {it.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
