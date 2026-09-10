import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { http, formatApiErrorDetail } from "@/lib/api";
import { useBrand } from "@/context/BrandContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronRight, ChevronLeft, Sparkles, Globe, MessageSquare, Users, Loader2, X, Plus, ArrowLeft, CheckCircle2 } from "lucide-react";

/**
 * 3-step Brand setup wizard: Name+Domain → Prompts → Competitors.
 * Route: /app/brands/new  (optionally ?first=1 to hide the "back to dashboard"
 * escape hatch on the first-run experience).
 */

const STEPS = [
  { key: "brand", label: "Brand", icon: Globe },
  { key: "prompts", label: "Prompts", icon: MessageSquare },
  { key: "competitors", label: "Competitors", icon: Users },
];

function StepPill({ i, active, done, label, Icon }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-8 h-8 rounded-full grid place-items-center text-xs font-bold transition-all
        ${done ? "bg-emerald-500 text-white" : active ? "bg-indigo-600 text-white shadow-[0_6px_16px_-6px_rgba(99,102,241,0.6)]" : "bg-slate-200 text-slate-500"}`}>
        {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
      </div>
      <div className={`text-[13px] font-semibold ${active || done ? "text-slate-900" : "text-slate-400"}`}>{label}</div>
    </div>
  );
}

function TagList({ items, onRemove }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {items.map((v, i) => (
        <Badge key={`${v}-${i}`} className="bg-indigo-50 text-indigo-700 border border-indigo-100 font-medium py-1 px-2 rounded-md flex items-center gap-1.5">
          <span className="max-w-[280px] truncate">{v}</span>
          <button type="button" onClick={() => onRemove(i)} className="text-indigo-400 hover:text-indigo-700"><X size={12} /></button>
        </Badge>
      ))}
    </div>
  );
}

export default function BrandSetup() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const firstRun = sp.get("first") === "1";
  const { reload, selectBrand } = useBrand();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [prompts, setPrompts] = useState([]);
  const [promptDraft, setPromptDraft] = useState("");
  const [competitors, setCompetitors] = useState([]);
  const [compDraft, setCompDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const addPrompt = () => {
    const t = promptDraft.trim();
    if (!t) return;
    if (prompts.includes(t)) { setPromptDraft(""); return; }
    setPrompts((p) => [...p, t].slice(0, 40));
    setPromptDraft("");
  };
  const addCompetitor = () => {
    const t = compDraft.trim();
    if (!t) return;
    if (competitors.includes(t)) { setCompDraft(""); return; }
    setCompetitors((p) => [...p, t].slice(0, 20));
    setCompDraft("");
  };

  const canNext = () => {
    if (step === 0) return name.trim().length > 0 && domain.trim().length >= 3 && domain.includes(".");
    if (step === 1) return prompts.length > 0;
    if (step === 2) return true; // competitors optional
    return true;
  };

  const submit = async () => {
    setSaving(true);
    try {
      const { data } = await http.post("/brands", {
        name: name.trim(),
        domain: domain.trim(),
        prompts, competitors,
      });
      await reload();
      selectBrand(data.id);
      toast.success(`Brand ${data.name} is ready`);
      navigate("/app/overview");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not create brand");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={firstRun ? "min-h-screen bg-slate-50 grid place-items-center p-4" : ""}>
      <div className={firstRun ? "w-full max-w-2xl" : "max-w-2xl mx-auto"}>
        {firstRun && (
          <div className="mb-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white grid place-items-center shadow-lg">
              <Sparkles size={22} />
            </div>
            <h1 className="font-head text-3xl font-extrabold tracking-tight mt-4">Welcome to Citetail</h1>
            <p className="text-slate-500 mt-1">Set up your first brand to unlock the dashboard.</p>
          </div>
        )}

        {!firstRun && (
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-3 text-slate-500 hover:text-slate-900">
            <ArrowLeft size={14} className="mr-1.5" /> Back
          </Button>
        )}

        <Card className="p-7 rounded-2xl border-slate-200/70 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.15)]">
          <div className="flex items-center gap-3 flex-wrap mb-6">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.key}>
                <StepPill i={i} active={i === step} done={i < step} label={s.label} Icon={s.icon} />
                {i < STEPS.length - 1 && <div className={`h-[2px] flex-1 rounded ${i < step ? "bg-emerald-400" : "bg-slate-200"}`} />}
              </React.Fragment>
            ))}
          </div>

          {step === 0 && (
            <div className="space-y-5" data-testid="brand-step-1">
              <div>
                <h2 className="font-head text-xl font-extrabold tracking-tight">Add your brand</h2>
                <p className="text-sm text-slate-500">Give it a display name and the domain we'll track.</p>
              </div>
              <div>
                <Label>Brand name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Foiwe" data-testid="brand-name-input" />
              </div>
              <div>
                <Label>Domain</Label>
                <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. foiwe.com" data-testid="brand-domain-input" />
                <p className="text-[11px] text-slate-400 mt-1">No https:// needed — we'll normalize it.</p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5" data-testid="brand-step-2">
              <div>
                <h2 className="font-head text-xl font-extrabold tracking-tight">Add prompts to track</h2>
                <p className="text-sm text-slate-500">These are the AI-search prompts we'll monitor for your brand. Add at least one.</p>
              </div>
              <div>
                <Label>Prompt</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPrompt(); } }}
                    placeholder='e.g. "Best content moderation vendors for social platforms"'
                    data-testid="brand-prompt-input"
                  />
                  <Button type="button" onClick={addPrompt} className="btn-brand"><Plus size={14} className="mr-1" />Add</Button>
                </div>
                <TagList items={prompts} onRemove={(i) => setPrompts((p) => p.filter((_, j) => j !== i))} />
                <p className="text-[11px] text-slate-400 mt-2">{prompts.length}/40 prompts added.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5" data-testid="brand-step-3">
              <div>
                <h2 className="font-head text-xl font-extrabold tracking-tight">Add your competitors</h2>
                <p className="text-sm text-slate-500">We'll benchmark your brand against these in the Overview and Brand Ranking. Optional but recommended.</p>
              </div>
              <div>
                <Label>Competitor</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={compDraft}
                    onChange={(e) => setCompDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompetitor(); } }}
                    placeholder="e.g. TaskUs"
                    data-testid="brand-competitor-input"
                  />
                  <Button type="button" onClick={addCompetitor} className="btn-brand"><Plus size={14} className="mr-1" />Add</Button>
                </div>
                <TagList items={competitors} onRemove={(i) => setCompetitors((p) => p.filter((_, j) => j !== i))} />
                <p className="text-[11px] text-slate-400 mt-2">{competitors.length}/20 competitors added.</p>
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button
              variant="ghost"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="text-slate-500 hover:text-slate-900"
              data-testid="brand-back-btn"
            >
              <ChevronLeft size={14} className="mr-1" />Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button
                className="btn-brand"
                disabled={!canNext()}
                onClick={() => setStep((s) => s + 1)}
                data-testid="brand-next-btn"
              >
                Continue<ChevronRight size={14} className="ml-1" />
              </Button>
            ) : (
              <Button
                className="btn-brand"
                disabled={!canNext() || saving}
                onClick={submit}
                data-testid="brand-finish-btn"
              >
                {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Sparkles size={14} className="mr-1.5" />}
                Finish setup
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
