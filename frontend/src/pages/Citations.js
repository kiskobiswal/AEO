import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBrand, faviconUrl } from "@/context/BrandContext";
import { http, formatApiErrorDetail } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Link2, Loader2, Sparkles, RefreshCw, ExternalLink, ShieldCheck, Globe,
  Newspaper, MessageSquare, BookOpen, FileText, Video, Users,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Citations page — brand-scoped list of the real web pages that already cite
 * the currently selected brand. Data is pulled from the cached brand report
 * (`GET /api/brands/:id/report`) which uses TinyFish + Serper + Tavily under
 * the hood — zero LLM cost.
 */

const TYPE_META = {
  reference: { label: "Reference", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: BookOpen },
  encyclopedia: { label: "Encyclopedia", color: "bg-blue-50 text-blue-700 border-blue-200", icon: BookOpen },
  review: { label: "Review", color: "bg-purple-50 text-purple-700 border-purple-200", icon: ShieldCheck },
  news: { label: "News", color: "bg-orange-50 text-orange-700 border-orange-200", icon: Newspaper },
  editorial: { label: "Editorial", color: "bg-orange-50 text-orange-700 border-orange-200", icon: Newspaper },
  directory: { label: "Directory", color: "bg-slate-50 text-slate-700 border-slate-200", icon: FileText },
  social: { label: "Social", color: "bg-sky-50 text-sky-700 border-sky-200", icon: Users },
  video: { label: "Video", color: "bg-red-50 text-red-700 border-red-200", icon: Video },
  forum: { label: "Forum", color: "bg-amber-50 text-amber-700 border-amber-200", icon: MessageSquare },
  community: { label: "Community", color: "bg-amber-50 text-amber-700 border-amber-200", icon: MessageSquare },
  documentation: { label: "Docs", color: "bg-slate-50 text-slate-700 border-slate-200", icon: FileText },
  official: { label: "Official", color: "bg-blue-50 text-blue-700 border-blue-200", icon: ShieldCheck },
  web: { label: "Web", color: "bg-slate-50 text-slate-700 border-slate-200", icon: Globe },
};
const TYPES_ORDER = ["all", "reference", "review", "news", "forum", "directory", "social", "video"];

function typeMeta(k) { return TYPE_META[k] || TYPE_META.web; }

function CitationRow({ s, i, action }) {
  const [broken, setBroken] = useState(false);
  const m = typeMeta(s.type);
  const Icon = m.icon;
  const engines = s.engines || [];
  return (
    <Card className="p-4 rounded-xl border-slate-200 hover:border-indigo-200 hover:shadow-[0_4px_16px_-8px_rgba(99,102,241,0.2)] transition-all flex items-start gap-4 group">
      <span className="font-head font-extrabold text-base text-slate-300 w-6 text-center shrink-0 pt-1">{i + 1}</span>
      <div className="w-10 h-10 rounded-lg border border-slate-200 bg-white overflow-hidden shrink-0 grid place-items-center">
        {!broken ? (
          <img src={faviconUrl(s.domain, 64)} alt={s.domain} className="w-full h-full object-contain" onError={() => setBroken(true)} />
        ) : (
          <Icon size={16} className="text-slate-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <a href={s.url} target="_blank" rel="noreferrer" className="text-[15px] font-semibold text-slate-900 hover:text-indigo-700 line-clamp-1 flex items-center gap-1">
          {s.title || s.domain}<ExternalLink size={12} className="text-slate-400 shrink-0" />
        </a>
        <div className="text-[12px] text-slate-500 mt-0.5 truncate">{s.domain}</div>
        {s.why && <div className="text-[13px] text-slate-600 mt-2 line-clamp-2">{s.why}</div>}
        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          <Badge className={`${m.color} border font-bold text-[10px] uppercase tracking-wider`}>{m.label}</Badge>
          <Badge className="bg-white border border-slate-200 text-slate-600 font-bold text-[10px]">Authority {s.authority || 0}</Badge>
          {action ? action : (s.verified && <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[10px]"><ShieldCheck size={9} className="mr-0.5" />Verified</Badge>)}
          {engines.length > 0 && (
            <div className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
              <span className="uppercase tracking-widest font-bold">Cited by</span>
              {engines.slice(0, 5).map((e) => (
                <span key={e} className="capitalize text-slate-700 font-semibold">{e.replace("_", " ")}{engines.indexOf(e) < Math.min(engines.length, 5) - 1 ? "," : ""}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* Sources within a prompt scan that mention any tracked competitor. */
function competitorSourcesOf(p, competitors) {
  const needles = (competitors || []).map((c) => (c || "").toLowerCase()).filter(Boolean);
  if (!needles.length) return [];
  return (p.sources || []).filter((s) => {
    const hay = `${s.title || ""} ${s.why || ""} ${s.domain || ""}`.toLowerCase();
    return needles.some((n) => hay.includes(n));
  });
}

const CITATION_TABS = [
  { key: "brand", label: "Brand" },
  { key: "prompts", label: "Prompts" },
  { key: "missing", label: "Missing" },
];

export default function Citations() {
  const navigate = useNavigate();
  const { selected, hasAny } = useBrand();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [tab, setTab] = useState("brand");
  const brandId = selected?.id;

  useEffect(() => {
    if (!brandId) { setReport(null); return; }
    let cancelled = false;
    setLoading(true);
    http.get(`/brands/${brandId}/report`)
      .then((r) => { if (!cancelled) setReport(r.data); })
      .catch(() => { /* silent — user can Rescan */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brandId]);

  const rescan = async () => {
    if (!brandId) return;
    setRescanning(true);
    try {
      const { data } = await http.post(`/brands/${brandId}/scan`);
      setReport(data);
      toast.success("Citations refreshed");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Scan failed");
    } finally {
      setRescanning(false);
    }
  };

  // Merge brand citations with prompt-source citations (dedupe by URL).
  const allCitations = useMemo(() => {
    if (!report) return [];
    const map = new Map();
    (report.citations || []).forEach((c) => { if (c.url) map.set(c.url, c); });
    (report.prompts || []).forEach((p) => {
      (p.sources || []).forEach((s) => {
        if (s.url && !map.has(s.url)) map.set(s.url, s);
      });
    });
    return Array.from(map.values());
  }, [report]);

  // ---- tab data (all derived from the same cached brand report) ----
  const promptScans = report?.prompts || [];
  const promptsWithCitation = promptScans.filter((p) => (p.sources || []).length > 0).length;
  const missing = promptScans.filter((p) => !p.brand_found && (p.competitors_found || []).length > 0);

  // Prompts tab: every citation link returned across prompt scans (deduped by URL)
  const promptCitations = useMemo(() => {
    const map = new Map();
    promptScans.forEach((p) => (p.sources || []).forEach((s) => {
      if (s.url && !map.has(s.url)) map.set(s.url, s);
    }));
    return Array.from(map.values());
  }, [promptScans]);

  // Missing tab: citation links that mention a competitor on prompts where the brand is absent
  const missingCitations = useMemo(() => {
    const map = new Map();
    missing.forEach((p) => competitorSourcesOf(p, selected?.competitors || []).forEach((s) => {
      if (s.url && !map.has(s.url)) map.set(s.url, s);
    }));
    return Array.from(map.values());
  }, [report, selected]);

  if (!hasAny || !selected) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Card className="p-8 max-w-md text-center border-slate-200">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white grid place-items-center mx-auto shadow-lg">
            <Sparkles size={22} />
          </div>
          <h2 className="font-head text-xl font-extrabold tracking-tight mt-4">Set up your first brand</h2>
          <p className="text-sm text-slate-500 mt-1">Citations are tracked per brand — create one to get started.</p>
          <Button className="btn-brand mt-5" onClick={() => navigate("/app/brands/new?first=1")}>Set up now</Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {/* header */}
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{selected.name}</div>
          <h1 className="font-head text-3xl font-extrabold tracking-tight mt-1">Citations</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Every third-party page currently citing <b>{selected.domain}</b> across the open web — real URLs fetched via TinyFish.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={rescan} disabled={rescanning || loading} className="h-9" data-testid="citations-rescan-btn">
            {rescanning ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
            Rescan
          </Button>
        </div>
      </div>

      {/* tab bar — minimal underline tabs */}
      <div className="flex items-center gap-6 border-b border-slate-200 mb-4" data-testid="citations-tabs">
        {CITATION_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            data-testid={`citations-tab-${t.key}`}
            className={`pb-2.5 -mb-px text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !report ? (
        <div className="py-10 text-center text-slate-500 text-sm"><Loader2 className="inline animate-spin mr-2" size={14} />Loading real citations…</div>
      ) : tab === "brand" ? (
        allCitations.length === 0 ? (
          <Card className="p-12 rounded-xl border-slate-200 text-center">
            <Link2 size={30} className="mx-auto text-slate-300 mb-3" />
            <div className="font-head font-bold text-slate-800">No citations found yet</div>
            <p className="text-sm text-slate-500 mt-1">Click Rescan to fetch every page currently citing your brand.</p>
            <Button className="btn-brand mt-4" onClick={rescan} disabled={rescanning}>
              {rescanning ? "Scanning…" : "Rescan now"}
            </Button>
          </Card>
        ) : (
          <>
            <div className="text-xs text-slate-400 mb-3 tabular-nums" data-testid="citations-count">
              {allCitations.length} citation{allCitations.length === 1 ? "" : "s"} · {new Set(allCitations.map((c) => c.domain)).size} unique domain{new Set(allCitations.map((c) => c.domain)).size === 1 ? "" : "s"}
            </div>
            <div className="space-y-3" data-testid="citations-list">
              {allCitations.map((s, i) => <CitationRow key={s.url + i} s={s} i={i} />)}
            </div>
          </>
        )
      ) : tab === "prompts" ? (
        promptScans.length === 0 ? (
          <Card className="p-12 rounded-xl border-slate-200 text-center">
            <MessageSquare size={30} className="mx-auto text-slate-300 mb-3" />
            <div className="font-head font-bold text-slate-800">No prompts scanned yet</div>
            <p className="text-sm text-slate-500 mt-1">Click Rescan to see which engines cite your brand per prompt.</p>
            <Button className="btn-brand mt-4" onClick={rescan} disabled={rescanning}>
              {rescanning ? "Scanning…" : "Rescan now"}
            </Button>
          </Card>
        ) : (
          <>
            <div className="text-xs text-slate-400 mb-3 tabular-nums" data-testid="prompts-count">
              {promptScans.length} prompt{promptScans.length === 1 ? "" : "s"} tracked · {promptsWithCitation} with at least one citation
            </div>
            <div className="space-y-3" data-testid="prompts-list">
              {promptCitations.map((s, i) => <CitationRow key={s.url + i} s={s} i={i} />)}
            </div>
          </>
        )
      ) : (
        missing.length === 0 ? (
          <Card className="p-12 rounded-xl border-slate-200 text-center">
            <ShieldCheck size={30} className="mx-auto text-emerald-300 mb-3" />
            <div className="font-head font-bold text-slate-800">No citation gaps</div>
            <p className="text-sm text-slate-500 mt-1">You&rsquo;re cited everywhere your competitors are — nice work.</p>
          </Card>
        ) : (
          <>
            <div className="text-xs text-slate-400 mb-3 tabular-nums" data-testid="missing-count">
              {missing.length} prompt{missing.length === 1 ? "" : "s"} where competitors are cited but {selected.name} isn&rsquo;t
            </div>
            <div className="space-y-3" data-testid="missing-list">
              {missingCitations.map((s, i) => (
                <CitationRow
                  key={s.url + i}
                  s={s}
                  i={i}
                  action={
                    <button
                      onClick={() => navigate("/app/agent")}
                      data-testid={`fix-this-${i}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-md bg-[#6366F1] text-white hover:bg-[#4F46E5] shadow-sm"
                    >
                      <Wrench size={11} /> Fix This
                    </button>
                  }
                />
              ))}
            </div>
          </>
        )
      )}
    </div>
  );
}
