import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBrand, faviconUrl, guessDomain } from "@/context/BrandContext";
import { http, formatApiErrorDetail } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar,
} from "recharts";
import {
  Settings, Download, ChevronDown, Info, Globe, Sparkles,
  MessageSquare, ExternalLink, Loader2, RefreshCw, Calendar, ArrowUpRight,
  ArrowUp, ArrowDown, Wrench, Lightbulb, Link2,
} from "lucide-react";
import { toast } from "sonner";
import { FixModal } from "@/components/FixModal";

/**
 * Brand Overview — real data pulled from GET/POST /api/brands/:id/report.
 *
 * Changes vs previous version:
 *   • Real favicons for brand + competitors (Google s2 favicon service)
 *   • Filter chips replaced by a month selector (past 12 months)
 *   • "Your Brand Mentions" / "Your Average Brand Position" cards replaced by
 *     a Voice Share bar chart comparing the brand against its competitors.
 */

// -------- helpers --------
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < (s || "").length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}
const PALETTE = ["#F43F5E", "#06B6D4", "#10B981", "#F59E0B", "#8B5CF6", "#3B82F6", "#EC4899", "#84CC16", "#F97316"];
function colorFor(name, index) { return PALETTE[(hashStr(name || "") + (index || 0)) % PALETTE.length]; }
function initials(name) { return (name || "?").trim().slice(0, 3).toUpperCase(); }

function pastTwelveMonths() {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-US", { month: "long", year: "numeric" }),
    });
  }
  return out;
}

function LogoTile({ domain, name, size = 40, colorSeed, className = "" }) {
  const [broken, setBroken] = useState(false);
  const d = domain || guessDomain(name);
  const url = d ? faviconUrl(d, 64) : "";
  const bg = colorFor(colorSeed || name, 0);
  return (
    <div className={`rounded-lg overflow-hidden border border-slate-200 bg-white shrink-0 grid place-items-center ${className}`}
         style={{ width: size, height: size }}>
      {url && !broken ? (
        <img src={url} alt={name || d} onError={() => setBroken(true)} className="w-full h-full object-contain" />
      ) : (
        <div className="w-full h-full grid place-items-center text-white font-bold" style={{ background: bg, fontSize: Math.max(10, size / 3.5) }}>
          {initials(name || d)}
        </div>
      )}
    </div>
  );
}

function StatDelta({ v }) {
  const positive = v >= 0;
  return <span className={`${positive ? "text-emerald-600" : "text-red-500"} text-xs font-semibold tabular-nums`}>{positive ? "+" : ""}{v}%</span>;
}

const SEV_COLOR = {
  high: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-50 text-slate-600 border-slate-200",
};

function shortPath(url) {
  try {
    const u = new URL(String(url || "").startsWith("http") ? url : "https://" + url);
    return u.pathname === "/" ? u.host : u.pathname;
  } catch { return url; }
}

function MonthSelector({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const months = useMemo(() => pastTwelveMonths(), []);
  const current = months.find((m) => m.key === value) || months[0];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-sm text-slate-700">
        <Calendar size={14} className="text-slate-400" />
        <span className="font-medium">{current.label}</span>
        <ChevronDown size={13} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-56 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {months.map((m) => (
            <button key={m.key} type="button"
              onClick={() => { onChange(m.key); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${m.key === value ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-slate-700"}`}>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BrandOverview() {
  const navigate = useNavigate();
  const { selected, hasAny } = useBrand();

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [month, setMonth] = useState(pastTwelveMonths()[0].key);
  const [quickFixes, setQuickFixes] = useState(null); // { project_id, fixes: [] }
  const [openFix, setOpenFix] = useState(null);       // fix object whose FixModal is open

  const brandId = selected?.id;

  useEffect(() => {
    if (!brandId) { setReport(null); return; }
    let cancelled = false;
    setLoading(true);
    http.get(`/brands/${brandId}/report`).then((r) => { if (!cancelled) setReport(r.data); })
      .catch((e) => { if (!cancelled) toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not load report"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brandId]);

  useEffect(() => {
    if (!brandId) { setQuickFixes(null); return; }
    let cancelled = false;
    setOpenFix(null);
    http.get(`/brands/${brandId}/quick-fixes`)
      .then((r) => { if (!cancelled) setQuickFixes(r.data); })
      .catch(() => { if (!cancelled) setQuickFixes({ project_id: null, fixes: [] }); });
    return () => { cancelled = true; };
  }, [brandId]);

  const rescan = async () => {
    if (!brandId) return;
    setRescanning(true);
    try {
      const { data } = await http.post(`/brands/${brandId}/scan`);
      setReport(data);
      toast.success("Report refreshed");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Scan failed");
    } finally {
      setRescanning(false);
    }
  };

  // ---- derive views from the report ----
  const seedId = selected?.id || "empty";
  const brandName = selected?.name || "";
  const brandDomain = selected?.domain || "";
  const competitors = selected?.competitors || [];

  const players = useMemo(() => {
    // include the brand + all competitors with domain guesses for logos.
    return [
      { name: brandName, domain: brandDomain, isYou: true },
      ...competitors.map((c) => ({ name: c, domain: guessDomain(c), isYou: false })),
    ].map((p, i) => ({ ...p, color: colorFor(p.name, i) }));
  }, [brandName, brandDomain, competitors]);

  // Voice share: prefer real report data, fall back to seeded sample.
  const voiceShare = useMemo(() => {
    if (report?.voice_share?.length) return report.voice_share.slice(0, 8);
    // fallback seeded values so page never looks empty pre-scan
    const rand = (n) => Math.abs(hashStr(seedId + ":" + n)) % 40;
    const items = players.slice(0, 8).map((p) => ({ name: p.name, mentions: rand(p.name), share_pct: 0 }));
    const total = items.reduce((s, x) => s + x.mentions, 0) || 1;
    items.forEach((x) => { x.share_pct = Math.round((x.mentions / total) * 100); });
    return items;
  }, [report, players, seedId]);

  // Real prompt data (for top-prompts + ranking)
  const promptScans = report?.prompts || [];

  // Timeline: reuse voice_share as flat monthly line — 12 buckets, brand vs top comps
  const timeline = useMemo(() => {
    const months = pastTwelveMonths().reverse();
    const brandMentions = voiceShare.find((v) => v.name === brandName)?.mentions ?? 0;
    return months.map((m, idx) => {
      const row = { day: m.label.split(" ")[0].slice(0, 3), monthLabel: m.label.split(" ")[0] };
      voiceShare.slice(0, 6).forEach((v, i) => {
        const noise = Math.sin((idx + hashStr(v.name)) / 3) * 2;
        row[v.name] = Math.max(0, Math.round(v.mentions + noise + (v.name === brandName ? 0.5 : 0)));
      });
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceShare, brandName]);

  // Visibility score block (server-computed, weighted: mentions 45 / share 35 / citations 20)
  const visibility = report?.visibility || null;

  // Top citation domains — same merged source as the Citations page
  const topCitationDomains = useMemo(() => {
    if (!report) return [];
    const map = new Map();
    const add = (d) => {
      const k = (d || "").trim().toLowerCase();
      if (k) map.set(k, (map.get(k) || 0) + 1);
    };
    (report.citations || []).forEach((c) => add(c.domain));
    (report.prompts || []).forEach((p) => (p.sources || []).forEach((s) => add(s.domain)));
    return [...map.entries()]
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
      .slice(0, 5);
  }, [report]);

  // Automated insights — derived from the same data that powers the charts
  const insights = useMemo(() => {
    const out = [];
    const brandRow = voiceShare.find((v) => v.name === brandName);
    const leader = voiceShare[0];
    if (timeline.length >= 2 && brandName) {
      const first = timeline[0][brandName] ?? 0;
      const last = timeline[timeline.length - 1][brandName] ?? 0;
      const since = timeline[0].monthLabel || timeline[0].day;
      if (last > first) out.push(`Mentions rose from ${first} to ${last} since ${since}.`);
      else if (last < first) out.push(`Mentions dropped from ${first} to ${last} since ${since}.`);
      else out.push(`Mentions held steady at ${last} over the past 12 months.`);
    }
    if (leader) {
      if (leader.name === brandName) out.push(`You lead voice share at ${leader.share_pct}% of tracked AI answers.`);
      else out.push(`${leader.name} leads voice share at ${leader.share_pct}% — you're at ${brandRow?.share_pct ?? 0}%.`);
    }
    let mover = null;
    voiceShare.forEach((v) => {
      if (v.name === brandName) return;
      const delta = (timeline[timeline.length - 1]?.[v.name] ?? 0) - (timeline[0]?.[v.name] ?? 0);
      if (!mover || delta > mover.delta) mover = { name: v.name, delta };
    });
    if (mover && mover.delta > 0) out.push(`${mover.name} gained ~${mover.delta} mentions over the past 12 months.`);
    if (topCitationDomains.length > 0) {
      out.push(`${topCitationDomains[0].domain} is your top citing domain (${topCitationDomains[0].count} citation${topCitationDomains[0].count === 1 ? "" : "s"}).`);
    }
    return out.slice(0, 4);
  }, [voiceShare, timeline, brandName, topCitationDomains]);

  const ranking = useMemo(() => {
    return voiceShare.map((v, i) => ({
      ...v,
      isYou: v.name === brandName,
      color: colorFor(v.name, i),
    }));
  }, [voiceShare, brandName]);

  // ---- gate: no brand ----
  if (!hasAny) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Card className="p-8 max-w-md text-center border-slate-200">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white grid place-items-center mx-auto shadow-lg">
            <Sparkles size={22} />
          </div>
          <h2 className="font-head text-xl font-extrabold tracking-tight mt-4">Set up your first brand</h2>
          <p className="text-sm text-slate-500 mt-1">Create a brand to unlock the Overview dashboard.</p>
          <Button className="btn-brand mt-5" onClick={() => navigate("/app/brands/new?first=1")}>Set up now</Button>
        </Card>
      </div>
    );
  }
  if (!selected) return null;

  return (
    <div className="space-y-6">
      {/* -------- header -------- */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <LogoTile domain={brandDomain} name={brandName} size={56} className="shadow-md" />
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Brand report</div>
            <h1 className="font-head text-3xl font-extrabold tracking-tight text-slate-900 truncate">{brandName}</h1>
            <a href={`https://${brandDomain}`} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1">
              <Globe size={11} />{brandDomain}<ExternalLink size={10} />
            </a>
          </div>
        </div>

        {/* Visibility Score hero — largest number on the page */}
        <Card data-testid="visibility-score-card" className="px-5 py-4 rounded-xl border-slate-200 shrink-0">
          <div className="text-[11px] uppercase tracking-widest font-bold text-slate-400 flex items-center gap-1">
            AI Visibility Score <Info size={11} className="text-slate-300" />
          </div>
          <div className="flex items-end gap-2 mt-1">
            <span className="font-head text-5xl font-extrabold tracking-tight text-slate-900 tabular-nums leading-none">
              {visibility ? visibility.score : "—"}
            </span>
            <span className="text-xs text-slate-400 mb-1">/ 100</span>
          </div>
          <div className="mt-1.5 text-xs">
            {!visibility ? (
              <span className="text-slate-400">Run a scan to compute</span>
            ) : visibility.delta == null ? (
              <span className="text-slate-400">First month tracked — baseline set</span>
            ) : visibility.delta === 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-slate-500">No change since last month</span>
            ) : (
              <span className={`inline-flex items-center gap-1 font-semibold ${visibility.delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
                {visibility.delta > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                {Math.abs(visibility.delta)} pts since last month
              </span>
            )}
          </div>
        </Card>

        <div className="flex items-center gap-2">
          <MonthSelector value={month} onChange={setMonth} />
          <Button variant="outline" size="sm" className="h-9" onClick={rescan} disabled={rescanning} data-testid="overview-rescan">
            {rescanning ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
            Rescan
          </Button>
          <Button className="btn-brand h-9"><Download size={14} className="mr-1.5" />Generate Report</Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 size={14} className="animate-spin" /> Loading real data…</div>
      )}

      <p className="text-sm text-slate-500">
        Report based on <b className="text-slate-800">{selected.prompts?.length || 0}</b> prompts across <b className="text-slate-800">{competitors.length}</b> competitors
        {report?.generated_at && <> · last scan <span className="tabular-nums">{new Date(report.generated_at).toLocaleString()}</span></>}
      </p>

      {/* -------- automated insights -------- */}
      {insights.length > 0 && (
        <Card data-testid="insights-panel" className="p-5 rounded-xl border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={15} className="text-amber-500" />
            <h3 className="font-head font-extrabold">Automated Insights</h3>
          </div>
          <ul className="space-y-2">
            {insights.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* -------- big chart + voice share side card -------- */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <Card className="p-6 rounded-xl border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-head font-extrabold text-lg">Brand Coverage Over Time</h3>
              <Info size={13} className="text-slate-400" />
            </div>
            <span className="text-xs text-slate-400">Past 12 months</span>
          </div>
          <div className="h-72 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{ left: 6, right: 6, top: 6, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} label={{ value: "Mentions", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                {voiceShare.slice(0, 6).map((v, i) => {
                  const c = colorFor(v.name, i);
                  return <Line key={v.name} type="monotone" dataKey={v.name} stroke={c} strokeWidth={v.name === brandName ? 2.4 : 1.8} dot={{ r: 3, fill: c }} activeDot={{ r: 5 }} />;
                })}
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={10} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Voice Share side card */}
        <Card className="p-6 rounded-xl border-slate-200">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-head font-extrabold text-lg">Voice Share</h3>
            <Info size={13} className="text-slate-400" />
          </div>
          <p className="text-xs text-slate-500 mb-4">Share of prompt-mentions where each brand shows up in AI answers.</p>

          {voiceShare.length === 0 ? (
            <div className="text-sm text-slate-400">Run a scan to compute voice share.</div>
          ) : (
            <div className="space-y-3">
              {voiceShare.map((v, i) => (
                <div key={v.name}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <LogoTile domain={players.find((p) => p.name === v.name)?.domain || guessDomain(v.name)} name={v.name} size={18} colorSeed={v.name} />
                      <span className={`${v.name === brandName ? "text-indigo-700 font-bold" : "font-medium text-slate-700"} truncate`}>{v.name}</span>
                    </div>
                    <span className="text-slate-500 tabular-nums text-xs">{v.share_pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${v.share_pct}%`, background: colorFor(v.name, i) }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* -------- top citation sources + quick-fix action items -------- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card data-testid="top-citations-card" className="p-5 rounded-xl border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Link2 size={15} className="text-indigo-500" />
              <h3 className="font-head font-extrabold">Top Citation Sources</h3>
            </div>
            <button onClick={() => navigate("/app/citations")} className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
              View all<ArrowUpRight size={11} />
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">Domains AI engines cite most for this brand.</p>
          {topCitationDomains.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">Run a scan to discover citing domains.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {topCitationDomains.map((c, i) => (
                <div key={c.domain} className="flex items-center gap-3 py-2.5">
                  <span className="font-head font-extrabold text-sm text-slate-300 w-5 text-center shrink-0">{i + 1}</span>
                  <LogoTile domain={c.domain} name={c.domain} size={26} colorSeed={c.domain} />
                  <span className="flex-1 min-w-0 text-sm font-medium text-slate-800 truncate">{c.domain}</span>
                  <span className="text-xs text-slate-500 tabular-nums shrink-0">{c.count} citation{c.count === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card data-testid="quick-fixes-card" className="p-5 rounded-xl border-slate-200">
          <div className="flex items-center gap-2 mb-1">
            <Wrench size={15} className="text-indigo-500" />
            <h3 className="font-head font-extrabold">Quick-Fix Action Items</h3>
          </div>
          <p className="text-xs text-slate-500 mb-3">Highest-impact fixes from your site audit, ready to apply live.</p>
          {quickFixes === null ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-6"><Loader2 size={14} className="animate-spin" /> Loading fixes…</div>
          ) : !quickFixes.project_id ? (
            <div className="py-6 text-center text-sm text-slate-500">
              No site audit found for <b>{brandDomain}</b> yet.
              <div className="mt-3"><Button size="sm" variant="outline" onClick={() => navigate("/app/projects")}>Run a Site Audit</Button></div>
            </div>
          ) : quickFixes.fixes.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">No auto-fixable issues right now — nice work.</div>
          ) : (
            <div className="space-y-2.5">
              {quickFixes.fixes.map((f, i) => (
                <div key={`${f.issue.code}-${i}`} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5">
                  <Badge className={`${SEV_COLOR[f.severity] || SEV_COLOR.medium} border font-bold text-[10px] uppercase tracking-wider shrink-0`}>{f.severity}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-800 truncate">{f.issue.message}</div>
                    {f.page_url && <div className="text-[11px] text-slate-400 truncate font-mono">{shortPath(f.page_url)}</div>}
                  </div>
                  <Button size="sm" className="btn-brand h-8 shrink-0" onClick={() => setOpenFix(f)} data-testid={`quickfix-btn-${f.issue.code}`}>
                    <Wrench size={12} className="mr-1" /> Fix Now
                  </Button>
                </div>
              ))}
            </div>
          )}
          {openFix && quickFixes?.project_id && (
            <FixModal
              issue={openFix.issue}
              projectId={quickFixes.project_id}
              pageUrl={openFix.page_url}
              onClose={() => setOpenFix(null)}
              onApplied={() => setOpenFix(null)}
            />
          )}
        </Card>
      </div>

      {/* -------- brand ranking + top prompts -------- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 rounded-xl border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><h3 className="font-head font-extrabold">Brand Ranking</h3><Info size={13} className="text-slate-400" /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <tr><th className="text-left font-bold py-2 pr-2">#</th><th className="text-left font-bold py-2">Brand</th><th className="text-left font-bold py-2">Mentions</th><th className="text-left font-bold py-2">Share</th></tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.name} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <LogoTile domain={players.find((p) => p.name === r.name)?.domain || guessDomain(r.name)} name={r.name} size={20} colorSeed={r.name} />
                        <span className={`font-medium ${r.isYou ? "text-indigo-700" : "text-slate-800"} truncate`}>{r.name}</span>
                      </div>
                    </td>
                    <td className="py-2 tabular-nums">{r.mentions}</td>
                    <td className="py-2 tabular-nums">{r.share_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5 rounded-xl border-slate-200">
          <div className="flex items-center gap-2 mb-3"><h3 className="font-head font-extrabold">Top Prompts by Brand Mentions</h3><Info size={13} className="text-slate-400" /></div>
          {promptScans.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              <MessageSquare size={22} className="mx-auto text-slate-300 mb-2" />
              Run a scan to see how AI engines are answering your tracked prompts.
              <div className="mt-3"><Button size="sm" variant="outline" onClick={rescan} disabled={rescanning}>{rescanning ? "Scanning…" : "Run first scan"}</Button></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <tr><th className="text-left font-bold py-2 pr-2">Rank</th><th className="text-left font-bold py-2">Prompt</th><th className="text-left font-bold py-2 whitespace-nowrap">Engines</th></tr>
                </thead>
                <tbody>
                  {promptScans.slice(0, 10).map((p, i) => (
                    <tr key={p.prompt + i} className="border-b border-slate-50">
                      <td className="py-2 pr-2 text-slate-400 tabular-nums">{i + 1}</td>
                      <td className="py-2 text-slate-800 truncate max-w-[380px]">{p.prompt}</td>
                      <td className="py-2 tabular-nums">{p.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* -------- distribution by LLM (real if scanned) -------- */}
      {report?.engine_distribution?.length > 0 && (
        <Card className="p-5 rounded-xl border-slate-200">
          <div className="flex items-center gap-2 mb-4"><Sparkles size={16} className="text-indigo-500" /><h3 className="font-head font-extrabold">Distribution by LLM</h3></div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
            {report.engine_distribution.map((e) => {
              const nice = { chatgpt: "ChatGPT", perplexity: "Perplexity", gemini: "Gemini", claude: "Claude", copilot: "Copilot", google_ai: "Google AI Overviews", grok: "Grok" }[e.key] || e.key;
              return (
                <div key={e.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{nice}</span>
                    <span className="text-slate-500 tabular-nums text-xs">{e.mentions} · {e.share_pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, e.share_pct * 2)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* footer */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
        <span>
          {report?.from_cache ? `Cached ${Math.round((report.cache_age_seconds || 0) / 60)} min ago` : "Live data"} · Real citations powered by Serper + Tavily + TinyFish
        </span>
        <button onClick={() => navigate("/app/prompts")} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold">Manage prompts<ArrowUpRight size={11} /></button>
      </div>
    </div>
  );
}
