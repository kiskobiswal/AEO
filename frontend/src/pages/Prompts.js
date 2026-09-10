import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBrand, faviconUrl, guessDomain } from "@/context/BrandContext";
import { http, formatApiErrorDetail } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, X, Loader2, Sparkles, RefreshCw, Trash2, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, ExternalLink, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Prompts page — card list, top-right actions are "New prompt" and "Rescan".
 * Each card shows the engine icons (green tick if the prompt was answered on
 * that engine), the competitors detected, a Recommended badge and an N/7 score.
 * Clicking a card expands the underlying source URLs from the last scan.
 */

const ENGINES = [
  { key: "chatgpt", label: "ChatGPT", color: "#10A37F", logoDomain: "openai.com" },
  { key: "perplexity", label: "Perplexity", color: "#1FB8CD", logoDomain: "perplexity.ai" },
  { key: "gemini", label: "Gemini", color: "#4285F4", logoDomain: "gemini.google.com" },
  { key: "claude", label: "Claude", color: "#D97757", logoDomain: "claude.ai" },
  { key: "copilot", label: "Copilot", color: "#0067C0", logoDomain: "copilot.microsoft.com" },
  { key: "google_ai", label: "Google AI", color: "#EA4335", logoDomain: "google.com" },
  { key: "grok", label: "Grok", color: "#1F2937", logoDomain: "x.ai" },
];

function EngineChip({ engine, active }) {
  const [broken, setBroken] = useState(false);
  const src = faviconUrl(engine.logoDomain, 64);
  return (
    <div
      title={engine.label + (active ? " · answered" : " · not detected")}
      className={`relative w-9 h-9 rounded-full grid place-items-center bg-white border-2 shrink-0 ${active ? "border-emerald-200 shadow-[0_2px_6px_-2px_rgba(16,185,129,0.35)]" : "border-slate-200 opacity-60"}`}
    >
      {src && !broken ? (
        <img src={src} alt={engine.label} onError={() => setBroken(true)} className="w-5 h-5 object-contain" />
      ) : (
        <span className="text-[11px] font-bold" style={{ color: engine.color }}>{engine.label.charAt(0)}</span>
      )}
      <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full grid place-items-center ring-2 ring-white ${active ? "bg-emerald-500" : "bg-slate-300"}`}>
        {active ? <CheckCircle2 size={9} className="text-white" /> : <XCircle size={9} className="text-white" />}
      </div>
    </div>
  );
}

function SourceRow({ s }) {
  const [broken, setBroken] = useState(false);
  const favicon = faviconUrl(s.domain, 32);
  return (
    <a href={s.url} target="_blank" rel="noreferrer"
      className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-slate-50 group transition-colors">
      <div className="w-6 h-6 rounded overflow-hidden border border-slate-200 bg-white grid place-items-center shrink-0">
        {favicon && !broken ? (
          <img src={favicon} alt={s.domain} className="w-full h-full object-contain" onError={() => setBroken(true)} />
        ) : (
          <span className="text-[9px] font-bold text-slate-400">{(s.domain || "?").slice(0, 2).toUpperCase()}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-800 truncate group-hover:text-indigo-700">{s.title || s.domain}</div>
        <div className="text-[11px] text-slate-400 truncate">{s.domain} · authority {s.authority}</div>
      </div>
      {(s.engines || []).length > 0 && (
        <div className="hidden md:flex items-center gap-1 pr-2">
          {ENGINES.filter((e) => s.engines.includes(e.key)).slice(0, 5).map((e) => (
            <span key={e.key} title={e.label} className="w-4 h-4 rounded-full" style={{ background: e.color }} />
          ))}
        </div>
      )}
      <ExternalLink size={13} className="text-slate-300 group-hover:text-indigo-500 shrink-0" />
    </a>
  );
}

function PromptCard({ scan, idx, brandName, competitors }) {
  const [open, setOpen] = useState(false);
  const engines = new Set(scan?.engines_covered || []);
  const score = engines.size;
  const total = ENGINES.length;
  const recommended = score >= 4;
  const foundComps = (scan?.competitors_found || []).length ? scan.competitors_found : competitors.slice(0, 4);
  const sources = scan?.sources || [];

  return (
    <Card className="p-4 rounded-xl border-slate-200 hover:border-indigo-200 hover:shadow-[0_4px_16px_-8px_rgba(99,102,241,0.25)] transition-all">
      <div className="flex items-start gap-4">
        <div className="w-7 h-7 rounded-full bg-slate-100 grid place-items-center text-sm font-bold text-slate-500 shrink-0">{idx + 1}</div>

        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-slate-900">"{scan.prompt}"</div>
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {ENGINES.map((e) => <EngineChip key={e.key} engine={e} active={engines.has(e.key)} />)}
          </div>
        </div>

        <div className="hidden lg:flex flex-col items-end gap-2 min-w-[260px] shrink-0">
          <div className="text-[12px] text-slate-500 max-w-[280px] text-right truncate">
            <span className="inline-flex items-center gap-1"><span className="text-slate-400">vs</span> {foundComps.slice(0, 4).join(", ")}</span>
          </div>
          {recommended ? (
            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">Recommended</Badge>
          ) : (
            <Badge className="bg-amber-50 text-amber-700 border border-amber-200 font-bold">Needs work</Badge>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-sm font-bold text-slate-700 tabular-nums w-10 text-right">{score}/{total}</div>
          <button onClick={() => setOpen((v) => !v)} className="p-1.5 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-slate-50 transition-colors" data-testid={`prompt-toggle-${idx}`}>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1">Sources</div>
          {sources.length === 0 ? (
            <div className="py-6 text-sm text-slate-400 text-center">No sources yet — hit Rescan to fetch citations.</div>
          ) : (
            <div className="space-y-0.5">
              {sources.slice(0, 12).map((s, i) => <SourceRow key={s.url + i} s={s} />)}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Prompts() {
  const navigate = useNavigate();
  const { selected, hasAny, reload } = useBrand();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const brandId = selected?.id;

  useEffect(() => {
    if (!brandId) { setReport(null); return; }
    let cancelled = false;
    setLoading(true);
    http.get(`/brands/${brandId}/report`)
      .then((r) => { if (!cancelled) setReport(r.data); })
      .catch(() => { /* ignore first-load errors */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brandId]);

  const scans = useMemo(() => {
    const byPrompt = new Map((report?.prompts || []).map((p) => [p.prompt, p]));
    return (selected?.prompts || []).map((p) => byPrompt.get(p) || { prompt: p, sources: [], engines_covered: [], competitors_found: [], score: "0/7" });
  }, [selected, report]);

  const addPrompt = async () => {
    if (!brandId) return;
    const t = draft.trim();
    if (!t) return;
    if ((selected?.prompts || []).includes(t)) { setDraft(""); setAddOpen(false); return; }
    setSaving(true);
    try {
      const next = [...(selected.prompts || []), t].slice(0, 40);
      await http.put(`/brands/${brandId}`, { prompts: next });
      await reload();
      setDraft("");
      setAddOpen(false);
      toast.success("Prompt added — click Rescan to fetch its citations");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to add prompt");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (prompt) => {
    if (!brandId) return;
    const next = (selected.prompts || []).filter((p) => p !== prompt);
    try {
      await http.put(`/brands/${brandId}`, { prompts: next });
      await reload();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to remove prompt");
    }
  };

  const rescan = async () => {
    if (!brandId) return;
    setRescanning(true);
    try {
      const { data } = await http.post(`/brands/${brandId}/scan`);
      setReport(data);
      toast.success("Scan complete");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Scan failed");
    } finally {
      setRescanning(false);
    }
  };

  if (!hasAny || !selected) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Card className="p-8 max-w-md text-center border-slate-200">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white grid place-items-center mx-auto shadow-lg">
            <Sparkles size={22} />
          </div>
          <h2 className="font-head text-xl font-extrabold tracking-tight mt-4">Set up your first brand</h2>
          <p className="text-sm text-slate-500 mt-1">Prompts are tracked per brand — create one to get started.</p>
          <Button className="btn-brand mt-5" onClick={() => navigate("/app/brands/new?first=1")}>Set up now</Button>
        </Card>
      </div>
    );
  }

  const competitors = selected.competitors || [];

  return (
    <div>
      {/* header */}
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{selected.name}</div>
          <h1 className="font-head text-3xl font-extrabold tracking-tight mt-1">Prompts</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">Real citation coverage across ChatGPT, Perplexity, Gemini, Claude, Copilot, Google AI Overviews and Grok — via Serper + Tavily.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={rescan} disabled={rescanning || loading} data-testid="prompts-rescan-btn" className="h-9">
            {rescanning ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <RefreshCw size={14} className="mr-1.5" />}
            Rescan
          </Button>
          <Button onClick={() => setAddOpen(true)} className="btn-brand h-9" data-testid="prompts-add-open">
            <Plus size={14} className="mr-1.5" />New prompt
          </Button>
        </div>
      </div>

      {/* inline add form */}
      {addOpen && (
        <Card className="p-4 rounded-xl border-indigo-200 bg-indigo-50/40 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPrompt(); } if (e.key === "Escape") { setAddOpen(false); setDraft(""); } }}
              placeholder='e.g. "best content moderation vendors 2026"'
              className="flex-1 min-w-[240px] bg-white" data-testid="prompts-input" />
            <Button onClick={addPrompt} disabled={saving || !draft.trim()} className="btn-brand" data-testid="prompts-add-btn">
              {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Plus size={14} className="mr-1.5" />}
              Add
            </Button>
            <Button variant="ghost" onClick={() => { setAddOpen(false); setDraft(""); }}>Cancel</Button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">{selected.prompts.length}/40 tracked. After adding, click Rescan to fetch fresh citations for it.</p>
        </Card>
      )}

      {loading && !report ? (
        <div className="py-10 text-center text-slate-500 text-sm"><Loader2 className="inline animate-spin mr-2" size={14} />Loading real citations…</div>
      ) : scans.length === 0 ? (
        <Card className="p-12 rounded-xl border-slate-200 text-center">
          <MessageSquare size={30} className="mx-auto text-slate-300 mb-3" />
          <div className="font-head font-bold text-slate-800">No prompts tracked yet</div>
          <p className="text-sm text-slate-500 mt-1">Click "New prompt" and add search-style questions users ask AI engines.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {scans.map((s, i) => (
            <div key={s.prompt + i} className="relative group">
              <PromptCard scan={s} idx={i} brandName={selected.name} competitors={competitors} />
              <button
                onClick={() => remove(s.prompt)}
                className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 grid place-items-center shadow-sm"
                title="Remove prompt"
                data-testid={`prompts-remove-${i}`}
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
