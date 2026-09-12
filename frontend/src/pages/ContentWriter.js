import { useMemo, useState } from "react";
import { http, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  PenSquare,
  Sparkles,
  Loader2,
  Copy,
  Check,
  Gauge,
  ListChecks,
  Lightbulb,
} from "lucide-react";
import { toast } from "sonner";

/* ---------- helpers ---------- */
function scoreColor(v) {
  if (v >= 80) return "text-emerald-600";
  if (v >= 60) return "text-amber-600";
  return "text-rose-600";
}
function ringColor(v) {
  if (v >= 80) return "#10b981";
  if (v >= 60) return "#f59e0b";
  return "#f43f5e";
}
function ScoreRing({ value = 0, label, size = 96 }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const off = c - (pct / 100) * c;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth="10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ringColor(pct)}
          strokeWidth="10"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="52%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="font-bold"
          fontSize={size * 0.28}
          fill={ringColor(pct)}
        >
          {Math.round(pct)}
        </text>
      </svg>
      {label && <div className="text-xs font-semibold text-slate-600">{label}</div>}
    </div>
  );
}

function Bar({ label, value, detail }) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-slate-700">{label}</span>
        <span className={`text-[12px] font-bold ${scoreColor(v)}`}>{v}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${v}%`, background: ringColor(v) }} />
      </div>
      {detail && <div className="text-[11px] text-slate-400">{detail}</div>}
    </div>
  );
}

/* Simple markdown renderer (headings, lists, bold, code) — no third-party dep. */
function renderMd(md) {
  if (!md) return null;
  const lines = md.split("\n");
  const out = [];
  let inUl = null;
  let inOl = null;
  const flushLists = () => {
    if (inUl) {
      out.push(
        <ul key={`ul-${out.length}`} className="list-disc pl-5 my-2 space-y-1">
          {inUl.map((t, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: inlineMd(t) }} />
          ))}
        </ul>
      );
      inUl = null;
    }
    if (inOl) {
      out.push(
        <ol key={`ol-${out.length}`} className="list-decimal pl-5 my-2 space-y-1">
          {inOl.map((t, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: inlineMd(t) }} />
          ))}
        </ol>
      );
      inOl = null;
    }
  };
  lines.forEach((rawLine, idx) => {
    const line = rawLine.trimEnd();
    if (/^#\s+/.test(line)) {
      flushLists();
      out.push(
        <h1 key={idx} className="text-2xl font-extrabold mt-4 mb-2 text-slate-900">
          {line.replace(/^#\s+/, "")}
        </h1>
      );
    } else if (/^##\s+/.test(line)) {
      flushLists();
      out.push(
        <h2 key={idx} className="text-lg font-bold mt-5 mb-2 text-slate-900">
          {line.replace(/^##\s+/, "")}
        </h2>
      );
    } else if (/^###\s+/.test(line)) {
      flushLists();
      out.push(
        <h3 key={idx} className="text-[15px] font-semibold mt-3 mb-1 text-slate-800">
          {line.replace(/^###\s+/, "")}
        </h3>
      );
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (inOl) { flushLists(); }
      inUl = inUl || [];
      inUl.push(line.replace(/^\s*[-*]\s+/, ""));
    } else if (/^\s*\d+[.)]\s+/.test(line)) {
      if (inUl) { flushLists(); }
      inOl = inOl || [];
      inOl.push(line.replace(/^\s*\d+[.)]\s+/, ""));
    } else if (/^META:/i.test(line)) {
      flushLists();
      out.push(
        <div key={idx} className="text-[12px] text-slate-500 italic mb-1">
          <span className="font-semibold text-slate-600">Meta:</span>{" "}
          {line.replace(/^META:/i, "").trim()}
        </div>
      );
    } else if (/^TL;DR:/i.test(line)) {
      flushLists();
      out.push(
        <div key={idx} className="my-3 px-3 py-2 bg-indigo-50 border-l-4 border-indigo-400 rounded-r text-[13px] text-slate-800">
          <span className="font-bold text-indigo-700 mr-1">TL;DR:</span>
          {line.replace(/^TL;DR:/i, "").trim()}
        </div>
      );
    } else if (line.trim() === "") {
      flushLists();
    } else {
      flushLists();
      out.push(
        <p key={idx} className="text-[14px] leading-relaxed text-slate-700 my-2" dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />
      );
    }
  });
  flushLists();
  return out;
}
function inlineMd(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 text-[12px]">$1</code>');
}

/* ---------- Page ---------- */
export default function ContentWriter() {
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [prompt, setPrompt] = useState("");
  const [tone, setTone] = useState("professional");
  const [length, setLength] = useState("medium");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const kwList = useMemo(
    () => keywords.split(",").map((k) => k.trim()).filter(Boolean),
    [keywords]
  );

  const generate = async () => {
    if (!topic.trim()) {
      toast.error("Please enter a topic.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data } = await http.post("/content-writer/generate", {
        topic: topic.trim(),
        keywords: kwList,
        prompt: prompt.trim() || null,
        tone,
        length,
      });
      setResult(data);
      toast.success("Content generated");
    } catch (e) {
      toast.error(formatApiErrorDetail(e) || "Failed to generate content");
    } finally {
      setLoading(false);
    }
  };

  const copyContent = async () => {
    if (!result?.content) return;
    try {
      await navigator.clipboard.writeText(result.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  const scores = result?.scores || {};
  const breakdown = result?.breakdown || {};

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 text-white grid place-items-center shadow-md">
          <PenSquare size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 leading-tight">Content Writer</h1>
          <p className="text-sm text-slate-500">Generate SEO + AEO optimized content and see live scoring on the right.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 mt-6">
        {/* LEFT — Input + Content */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="grid gap-4">
              <div>
                <label className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide">Topic *</label>
                <Input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. How to optimize content for ChatGPT and Perplexity"
                  className="mt-1"
                  data-testid="cw-topic"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide">
                  Target keywords <span className="text-slate-400 font-normal normal-case">(comma-separated)</span>
                </label>
                <Input
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="AEO, generative engine optimization, ChatGPT SEO"
                  className="mt-1"
                  data-testid="cw-keywords"
                />
              </div>
              <div>
                <label className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide">
                  Additional prompt / instructions <span className="text-slate-400 font-normal normal-case">(optional)</span>
                </label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Audience: SaaS marketers. Include 2 comparison tables and a call-to-action to try Citetail."
                  rows={3}
                  className="mt-1"
                  data-testid="cw-prompt"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide">Tone</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white"
                    data-testid="cw-tone"
                  >
                    <option value="professional">Professional</option>
                    <option value="conversational">Conversational</option>
                    <option value="authoritative">Authoritative</option>
                    <option value="friendly">Friendly</option>
                    <option value="technical">Technical</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide">Length</label>
                  <select
                    value={length}
                    onChange={(e) => setLength(e.target.value)}
                    className="mt-1 w-full h-9 rounded-md border border-slate-200 px-2 text-sm bg-white"
                    data-testid="cw-length"
                  >
                    <option value="short">Short (400-600 words)</option>
                    <option value="medium">Medium (800-1100 words)</option>
                    <option value="long">Long (1400-1800 words)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={generate}
                  disabled={loading}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
                  data-testid="cw-generate"
                >
                  {loading ? <Loader2 className="animate-spin mr-2" size={16} /> : <Sparkles size={16} className="mr-2" />}
                  {loading ? "Generating…" : "Generate content"}
                </Button>
              </div>
            </div>
          </Card>

          {result && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Generated content</h2>
                  <div className="text-[12px] text-slate-500">
                    {result.word_count} words · {result.title}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={copyContent} data-testid="cw-copy">
                  {copied ? <Check size={14} className="mr-1.5" /> : <Copy size={14} className="mr-1.5" />}
                  {copied ? "Copied" : "Copy markdown"}
                </Button>
              </div>
              <div className="prose max-w-none">{renderMd(result.content)}</div>
            </Card>
          )}

          {!result && !loading && (
            <Card className="p-8 text-center border-dashed">
              <div className="mx-auto w-12 h-12 rounded-full bg-indigo-50 grid place-items-center mb-3">
                <Sparkles size={20} className="text-indigo-500" />
              </div>
              <div className="font-semibold text-slate-700 mb-1">Fill in the topic and hit Generate.</div>
              <div className="text-sm text-slate-500">
                Content is scored on SEO, AEO, readability, and structural quality — updated on every generation.
              </div>
            </Card>
          )}
        </div>

        {/* RIGHT — Score panel */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Gauge size={16} className="text-indigo-600" />
              <div className="font-bold text-slate-900">Scores</div>
            </div>
            {result ? (
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <ScoreRing value={scores.overall || 0} label="Overall" />
                  <ScoreRing value={scores.seo || 0} label="SEO" />
                  <ScoreRing value={scores.aeo || 0} label="AEO" />
                  <ScoreRing value={scores.readability || 0} label="Readability" />
                </div>
                <div className="text-[11px] text-slate-500 text-center">
                  Flesch reading ease: <span className="font-semibold text-slate-700">{scores.flesch}</span>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400 py-8 text-center">Scores will appear once you generate content.</div>
            )}
          </Card>

          {result && (
            <>
              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ListChecks size={16} className="text-indigo-600" />
                  <div className="font-bold text-slate-900">SEO breakdown</div>
                </div>
                <div className="space-y-3">
                  {(breakdown.seo || []).map((r, i) => (
                    <Bar key={i} label={r.label} value={r.score} detail={r.detail} />
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <ListChecks size={16} className="text-purple-600" />
                  <div className="font-bold text-slate-900">AEO breakdown</div>
                </div>
                <div className="space-y-3">
                  {(breakdown.aeo || []).map((r, i) => (
                    <Bar key={i} label={r.label} value={r.score} detail={r.detail} />
                  ))}
                </div>
              </Card>

              {breakdown.keywords?.length > 0 && (
                <Card className="p-5">
                  <div className="font-bold text-slate-900 mb-2">Keyword usage</div>
                  <div className="space-y-2">
                    {breakdown.keywords.map((k, i) => (
                      <div key={i} className="flex items-center justify-between text-[13px] py-1 border-b border-slate-100 last:border-0">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-slate-800 truncate">{k.keyword}</div>
                          <div className="text-[11px] text-slate-400">
                            in title: {k.in_title ? "✓" : "—"} · in headings: {k.in_headings ? "✓" : "—"}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-800">{k.count}×</div>
                          <div className="text-[11px] text-slate-400">{k.density}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {result.suggestions?.length > 0 && (
                <Card className="p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb size={16} className="text-amber-500" />
                    <div className="font-bold text-slate-900">Suggestions</div>
                  </div>
                  <ul className="space-y-1.5 text-[13px] text-slate-700">
                    {result.suggestions.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-amber-500 shrink-0">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
