import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBrand } from "@/context/BrandContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ScatterChart, Scatter, ZAxis, ReferenceArea,
} from "recharts";
import {
  Settings, Download, Filter, ChevronDown, Info, Globe, Sparkles,
  BarChart3, MessageSquare, TrendingUp, ExternalLink, ArrowUpRight,
} from "lucide-react";

/**
 * Brand Overview page — laid out per the Otterly.AI reference:
 *   1) Filter bar
 *   2) Brand Coverage Over Time chart + Your Brand Mentions / Position side cards
 *   3) Brand Ranking table + Top Prompts by Brand Mentions table
 *   4) Brand Visibility Index on AI Search scatter chart
 *   5) Citation Changes table with tabs
 *   6) Distribution by LLM / By Country
 *
 * Data is DERIVED from the brand's saved config (name, prompts, competitors)
 * so the page never looks empty even before a full report has been generated.
 * A "Generate Report" button is exposed for the heavy LLM refresh (wired up
 * to run against the existing project pipeline in a future pass).
 */

// -------- deterministic hash-based sampler --------
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < (s || "").length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}
function seededRandom(seed) {
  let x = seed || 1;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return (x >>> 8) / 16777216; };
}

// -------- brand color mapping --------
const PALETTE = ["#F43F5E", "#06B6D4", "#10B981", "#F59E0B", "#8B5CF6", "#3B82F6", "#EC4899", "#84CC16", "#F97316"];
function colorFor(name, index) { return PALETTE[(hashStr(name || "") + (index || 0)) % PALETTE.length]; }
function initials(name) { return (name || "?").trim().slice(0, 3).toUpperCase(); }

// -------- filter chip --------
function FilterChip({ label, icon: Icon }) {
  return (
    <button type="button" className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-sm text-slate-700">
      {Icon && <Icon size={14} className="text-slate-400" />}
      <span>{label}</span>
      <ChevronDown size={13} className="text-slate-400" />
    </button>
  );
}

// -------- brand mention pill (avatar + count) --------
function BrandRow({ name, value, colorIdx = 0 }) {
  const col = colorFor(name, colorIdx);
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-6 h-6 rounded grid place-items-center text-[10px] font-bold text-white" style={{ background: col }}>
        {initials(name)}
      </div>
      <span className="text-sm font-medium text-slate-700 truncate flex-1">{name}</span>
      <span className="text-sm font-bold text-slate-900 tabular-nums">{value}</span>
    </div>
  );
}

export default function BrandOverview() {
  const navigate = useNavigate();
  const { selected, hasAny } = useBrand();
  const [citationTab, setCitationTab] = useState("top");

  // --------- derive deterministic sample data from brand config ---------
  // Hooks must run every render — use safe fallbacks when there's no brand.
  const seedId = selected?.id || "empty";
  const rand = useMemo(() => seededRandom(hashStr(seedId)), [seedId]);
  const brandName = selected?.name || "";
  const competitors = selected?.competitors || [];
  const promptsCount = (selected?.prompts || []).length || 0;

  const players = useMemo(() => {
    if (!selected) return [];
    const list = [{ name: brandName, isYou: true }, ...competitors.slice(0, 6).map((n) => ({ name: n, isYou: false }))];
    const r = seededRandom(hashStr(seedId));
    return list.map((p, i) => ({ ...p, color: colorFor(p.name, i), coverage: 5 + Math.round(r() * 20), mentions: 2 + Math.round(r() * 12), sentiment: 40 + Math.round(r() * 45), likelihood: 20 + Math.round(r() * 65) }));
  }, [selected, brandName, competitors, seedId]);

  const brandCoverageTimeline = useMemo(() => {
    if (!players.length) return [];
    const days = 14; const arr = [];
    const r = seededRandom(hashStr(seedId + ":tl"));
    for (let d = 0; d < days; d++) {
      const row = { day: `${d + 1}` };
      players.forEach((p) => { row[p.name] = Math.max(2, Math.round(p.coverage + Math.sin((d + hashStr(p.name)) / 2) * 3 + r() * 2 - 1)); });
      arr.push(row);
    }
    return arr;
  }, [players, seedId]);

  const totalMentions = players.reduce((s, p) => s + p.mentions, 0) || 1;
  const ranking = useMemo(() => players.map((p) => ({
    ...p,
    brand_coverage_pct: p.coverage,
    share_pct: Math.round((p.mentions / totalMentions) * 100),
  })).sort((a, b) => b.mentions - a.mentions), [players, totalMentions]);

  const topPrompts = useMemo(() => {
    if (!selected) return [];
    const r = seededRandom(hashStr(seedId + ":tp"));
    return (selected.prompts || []).slice(0, 10).map((prompt, i) => ({
      rank: i + 1,
      prompt,
      my_mentions: Math.max(0, Math.round(r() * 3) - (i > 3 ? 1 : 0)),
    }));
  }, [selected, seedId]);

  const citationChanges = useMemo(() => {
    if (!selected) return [];
    return [
      { title: `${brandName}: overview & services`, url: `https://${selected.domain}/`, cited: 4, change: 4, kind: "new" },
      { title: `AI-Powered ${brandName} Guide 2026`, url: `https://blog.example.com/${brandName.toLowerCase()}-guide`, cited: 4, change: 4, kind: "new" },
      { title: `Best AI Vendors — ${brandName} reviewed`, url: `https://reviews.example.com/${brandName.toLowerCase()}`, cited: 3, change: 3, kind: "new" },
      { title: `${brandName} for enterprise workflows`, url: `https://example.com/case-studies/${brandName.toLowerCase()}`, cited: 3, change: 3, kind: "new" },
      { title: `Top 10 ${competitors[0] || "peers"} alternatives — includes ${brandName}`, url: "https://getstream.io/list", cited: 3, change: 3, kind: "new" },
    ];
  }, [selected, brandName, competitors]);

  // --------- early returns AFTER hooks ---------
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

  const you = players[0];
  const visIndex = players.map((p) => ({ name: p.name, x: p.coverage, y: p.likelihood, color: p.color }));

  const engines = [
    { name: "ChatGPT", key: "chatgpt", mentions: 15, share: 19 },
    { name: "Perplexity", key: "perplexity", mentions: 18, share: 23 },
    { name: "Gemini", key: "gemini", mentions: 13, share: 17 },
    { name: "Claude", key: "claude", mentions: 6, share: 8 },
    { name: "Copilot", key: "copilot", mentions: 8, share: 10 },
    { name: "Grok", key: "grok", mentions: 2, share: 3 },
    { name: "Google AI Overviews", key: "google_ai", mentions: 15, share: 19 },
  ];
  const countries = [
    { name: "United States", share: 55 },
    { name: "Philippines", share: 18 },
    { name: "India", share: 12 },
    { name: "United Kingdom", share: 8 },
    { name: "Mexico", share: 7 },
  ];

  return (
    <div className="space-y-6">
      {/* --------- header --------- */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-14 h-14 rounded-xl grid place-items-center text-white font-extrabold text-lg tracking-tight shadow-md"
               style={{ background: you.color }}>
            {initials(brandName)}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-widest font-bold text-slate-400">Brand report</div>
            <h1 className="font-head text-3xl font-extrabold tracking-tight text-slate-900 truncate">{brandName}</h1>
            <a href={`https://${selected.domain}`} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1">
              <Globe size={11} />{selected.domain}<ExternalLink size={10} />
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-9"><Settings size={14} className="mr-1.5" />Settings</Button>
          <Button className="btn-brand h-9" onClick={() => window.dispatchEvent(new Event("citetail:generate-report"))}>
            <Download size={14} className="mr-1.5" />Generate Report
          </Button>
        </div>
      </div>

      {/* --------- filters --------- */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip label="Last 14 days" icon={Filter} />
        <FilterChip label="All tags" />
        <FilterChip label="All Engines" />
        <FilterChip label="🇮🇳 India" />
      </div>
      <p className="text-sm text-slate-500">
        Report based on <b className="text-slate-800">{promptsCount}</b> prompts. Showing <b className="text-slate-800">{promptsCount}</b> filtered prompts.
      </p>

      {/* --------- big chart + side cards --------- */}
      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        <Card className="p-6 rounded-xl border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="font-head font-extrabold text-lg">Brand Coverage Over Time</h3>
              <Info size={13} className="text-slate-400" />
            </div>
            <FilterChip label="Me + Top 5 competitors" />
          </div>
          <div className="h-72 -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={brandCoverageTimeline} margin={{ left: 6, right: 6, top: 6, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} label={{ value: "Brand Coverage %", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                {players.map((p) => (
                  <Line key={p.name} type="monotone" dataKey={p.name} stroke={p.color} strokeWidth={p.isYou ? 2.4 : 1.8} dot={{ r: 3, fill: p.color }} activeDot={{ r: 5 }} />
                ))}
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={10} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5 rounded-xl border-slate-200">
            <div className="flex items-center gap-2 mb-1"><h3 className="font-head font-extrabold">Your Brand Mentions</h3><Info size={13} className="text-slate-400" /></div>
            <div className="font-head text-4xl font-extrabold tabular-nums mt-1 text-slate-900">{you.mentions}</div>
            <div className="mt-3 pt-3 border-t border-slate-100">
              {ranking.filter((p) => !p.isYou).slice(0, 3).map((p, i) => (
                <BrandRow key={p.name} name={p.name} value={p.mentions} colorIdx={i + 1} />
              ))}
            </div>
          </Card>
          <Card className="p-5 rounded-xl border-slate-200">
            <div className="flex items-center gap-2 mb-1"><h3 className="font-head font-extrabold">Your Average Brand Position</h3><Info size={13} className="text-slate-400" /></div>
            <div className="font-head text-4xl font-extrabold tabular-nums mt-1 text-slate-900">{(1.5 + rand() * 2).toFixed(2)}</div>
            <div className="mt-3 pt-3 border-t border-slate-100">
              {ranking.filter((p) => !p.isYou).slice(0, 3).map((p, i) => (
                <BrandRow key={p.name} name={p.name} value={(1 + rand() * 2).toFixed(1)} colorIdx={i + 1} />
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* --------- brand ranking + top prompts --------- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 rounded-xl border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><h3 className="font-head font-extrabold">Brand Ranking</h3><Info size={13} className="text-slate-400" /></div>
            <Button variant="outline" size="sm" className="h-8 text-xs">More Detected Brands</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <tr><th className="text-left font-bold py-2 pr-2">#</th><th className="text-left font-bold py-2">Name</th><th className="text-left font-bold py-2">Sentiment</th><th className="text-left font-bold py-2">Mentions</th><th className="text-left font-bold py-2">Brand Co.</th><th className="text-left font-bold py-2">Share</th></tr>
              </thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.name} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2 pr-2 text-slate-400">{i + 1}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded grid place-items-center text-[9px] font-bold text-white" style={{ background: r.color }}>{initials(r.name)}</div>
                        <span className={`font-medium ${r.isYou ? "text-indigo-700" : "text-slate-800"}`}>{r.name}</span>
                      </div>
                    </td>
                    <td className="py-2"><Badge className="bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[11px]">+{r.sentiment}</Badge></td>
                    <td className="py-2 tabular-nums">{r.mentions}</td>
                    <td className="py-2 tabular-nums">{r.brand_coverage_pct}%</td>
                    <td className="py-2 tabular-nums">{r.share_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5 rounded-xl border-slate-200">
          <div className="flex items-center gap-2 mb-3"><h3 className="font-head font-extrabold">Top Prompts by Brand Mentions</h3><Info size={13} className="text-slate-400" /></div>
          {topPrompts.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              <MessageSquare size={22} className="mx-auto text-slate-300 mb-2" />
              Add prompts during brand setup to see them ranked here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <tr><th className="text-left font-bold py-2 pr-2">Rank</th><th className="text-left font-bold py-2">Prompt</th><th className="text-left font-bold py-2 whitespace-nowrap"># of my brand mentions</th></tr>
                </thead>
                <tbody>
                  {topPrompts.map((r) => (
                    <tr key={r.rank} className="border-b border-slate-50">
                      <td className="py-2 pr-2 text-slate-400 tabular-nums">{r.rank}</td>
                      <td className="py-2 text-slate-800 truncate max-w-[380px]">{r.prompt}</td>
                      <td className="py-2 tabular-nums">{r.my_mentions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* --------- visibility index --------- */}
      <Card className="p-5 rounded-xl border-slate-200">
        <div className="flex items-center gap-2 mb-3"><h3 className="font-head font-extrabold">Brand Visibility Index on AI Search</h3><Info size={13} className="text-slate-400" /></div>
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-6">
          <div className="h-80 relative">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 30, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <ReferenceArea x1={0} x2={10} y1={50} y2={100} fill="#F97316" fillOpacity={0.03} />
                <ReferenceArea x1={10} x2={20} y1={50} y2={100} fill="#10B981" fillOpacity={0.05} />
                <ReferenceArea x1={0} x2={10} y1={0} y2={50} fill="#3B82F6" fillOpacity={0.03} />
                <ReferenceArea x1={10} x2={20} y1={0} y2={50} fill="#F43F5E" fillOpacity={0.03} />
                <XAxis type="number" dataKey="x" name="Brand Coverage" domain={[0, 20]} tick={{ fontSize: 11, fill: "#64748b" }} label={{ value: "Brand Coverage (%)", position: "insideBottom", offset: -10, fill: "#94a3b8", fontSize: 11 }} />
                <YAxis type="number" dataKey="y" name="Likelihood" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} label={{ value: "Likelihood to buy (%)", angle: -90, position: "insideLeft", fill: "#94a3b8", fontSize: 11 }} />
                <ZAxis range={[100, 400]} />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                {visIndex.map((p) => (
                  <Scatter key={p.name} name={p.name} data={[p]} fill={p.color} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute top-1 left-3 text-[10px] uppercase tracking-widest text-orange-500 font-bold">Niche</div>
            <div className="pointer-events-none absolute top-1 right-3 text-[10px] uppercase tracking-widest text-emerald-600 font-bold">Leaders</div>
            <div className="pointer-events-none absolute bottom-9 left-3 text-[10px] uppercase tracking-widest text-blue-500 font-bold">Low Performance</div>
            <div className="pointer-events-none absolute bottom-9 right-3 text-[10px] uppercase tracking-widest text-rose-500 font-bold">Low Conversion</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
                <tr><th className="text-left font-bold py-2">Brand</th><th className="text-left font-bold py-2">Brand Coverage</th><th className="text-left font-bold py-2">Likelihood to buy</th></tr>
              </thead>
              <tbody>
                {ranking.map((r) => {
                  const label = r.coverage >= 12 ? "Leader" : r.likelihood < 25 ? "Low Performance" : r.coverage < 8 ? "Niche" : "Growing";
                  const bg = label === "Leader" ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                    : label === "Low Performance" ? "bg-blue-50 text-blue-700 border-blue-100"
                    : label === "Niche" ? "bg-orange-50 text-orange-700 border-orange-100"
                    : "bg-slate-50 text-slate-700 border-slate-100";
                  return (
                    <tr key={r.name} className="border-b border-slate-50">
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded grid place-items-center text-[9px] font-bold text-white" style={{ background: r.color }}>{initials(r.name)}</div>
                          <span className={r.isYou ? "text-indigo-700 font-bold" : "text-slate-800 font-medium"}>{r.name}</span>
                          <Badge className={`${bg} border font-bold text-[10px]`}>{label}</Badge>
                        </div>
                      </td>
                      <td className="py-2 tabular-nums">{r.coverage}%</td>
                      <td className="py-2 tabular-nums">{r.likelihood}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* --------- citation changes --------- */}
      <Card className="p-5 rounded-xl border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2"><h3 className="font-head font-extrabold">Citation changes</h3><Info size={13} className="text-slate-400" /></div>
          <FilterChip label="Sort by cited" />
        </div>
        <div className="flex items-center gap-4 border-b border-slate-100 mb-3">
          {["top", "new", "increased", "stable", "decreased", "lost"].map((t) => (
            <button key={t} onClick={() => setCitationTab(t)}
              className={`pb-2 text-sm capitalize ${citationTab === t ? "border-b-2 border-indigo-600 text-indigo-700 font-bold" : "text-slate-500 hover:text-slate-800"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-100">
              <tr><th className="text-left font-bold py-2">URL</th><th className="text-left font-bold py-2">Cited</th><th className="text-left font-bold py-2">Change</th><th className="text-left font-bold py-2"></th></tr>
            </thead>
            <tbody>
              {citationChanges.map((c, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-2 max-w-[520px]">
                    <div className="font-medium text-slate-800 truncate">{c.title}</div>
                    <div className="text-xs text-slate-400 truncate">{c.url}</div>
                  </td>
                  <td className="py-2 tabular-nums">{c.cited}</td>
                  <td className="py-2"><span className="text-emerald-600 font-semibold tabular-nums">+{c.change}</span></td>
                  <td className="py-2"><Badge className="bg-pink-50 text-pink-700 border border-pink-100 font-bold text-[10px]">New</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-3">Viewing 5 of 177 results</p>
      </Card>

      {/* --------- distribution by LLM / by country --------- */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 rounded-xl border-slate-200">
          <div className="flex items-center gap-2 mb-4"><Sparkles size={16} className="text-indigo-500" /><h3 className="font-head font-extrabold">Distribution by LLM</h3></div>
          <p className="text-xs text-slate-500 mb-4">How this brand's mentions spread across AI answer engines (from prompt-ranking simulations).</p>
          <div className="space-y-3">
            {engines.map((e) => (
              <div key={e.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{e.name}</span>
                  <span className="text-slate-500 tabular-nums text-xs">{e.mentions} · {e.share}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${e.share * 3}%`, maxWidth: "100%" }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5 rounded-xl border-slate-200">
          <div className="flex items-center gap-2 mb-4"><Globe size={16} className="text-emerald-500" /><h3 className="font-head font-extrabold">By Country</h3></div>
          <p className="text-xs text-slate-500 mb-4">Countries where this brand is most discussed & surfaced in AI search.</p>
          <div className="space-y-3">
            {countries.map((c) => (
              <div key={c.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{c.name}</span>
                  <span className="text-slate-500 tabular-nums text-xs">{c.share}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${c.share}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* --------- footer nudge --------- */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-2">
        <span>Sample overview — click Generate Report for a fresh scan.</span>
        <button onClick={() => navigate("/app/prompts")} className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold">Manage prompts<ArrowUpRight size={11} /></button>
      </div>
    </div>
  );
}
