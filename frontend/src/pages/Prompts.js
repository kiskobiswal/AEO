import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBrand } from "@/context/BrandContext";
import { http, formatApiErrorDetail } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui-bits";
import { toast } from "sonner";
import { MessageSquare, Plus, X, Loader2, Sparkles, Trash2 } from "lucide-react";

/**
 * Prompts page — shows the prompts the user added for the currently selected
 * brand during setup, and lets them add / remove more. Zero LLM cost:
 * updates the brand config in-place via PUT /api/brands/:id.
 */
export default function Prompts() {
  const navigate = useNavigate();
  const { selected, hasAny, reload } = useBrand();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

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

  const prompts = selected.prompts || [];

  const patch = async (nextPrompts) => {
    setSaving(true);
    try {
      await http.put(`/brands/${selected.id}`, { prompts: nextPrompts });
      await reload();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to update prompts");
    } finally {
      setSaving(false);
    }
  };

  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    if (prompts.includes(t)) { setDraft(""); return; }
    const next = [...prompts, t].slice(0, 40);
    setDraft("");
    await patch(next);
    toast.success("Prompt added");
  };
  const remove = async (i) => {
    const next = prompts.filter((_, j) => j !== i);
    await patch(next);
  };

  return (
    <div>
      <PageHeader
        overline={selected.name}
        title="Prompts"
        subtitle={`Track how AI answer engines mention ${selected.name} for these prompts. Only the prompts you add here are counted in the Brand Overview.`}
      />

      <Card className="p-5 rounded-xl border-slate-200 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder='e.g. "Best content moderation vendors for social platforms"'
            className="flex-1 min-w-[240px]"
            data-testid="prompts-input"
          />
          <Button onClick={add} disabled={saving || !draft.trim() || prompts.length >= 40} className="btn-brand" data-testid="prompts-add-btn">
            {saving ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Plus size={14} className="mr-1.5" />}
            Add prompt
          </Button>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">{prompts.length}/40 tracked. These are what the Brand Overview reports on.</p>
      </Card>

      {prompts.length === 0 ? (
        <Card className="p-12 rounded-xl border-slate-200 text-center">
          <MessageSquare size={30} className="mx-auto text-slate-300 mb-3" />
          <div className="font-head font-bold text-slate-800">No prompts tracked yet</div>
          <p className="text-sm text-slate-500 mt-1">Add search-style prompts a user might ask an AI engine — like "best VOIP vendor for small business".</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {prompts.map((p, i) => (
            <Card key={`${p}-${i}`} className="p-4 rounded-lg border-slate-200 flex items-center gap-3 hover:shadow-sm transition-shadow">
              <Badge className="bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[11px] shrink-0">#{i + 1}</Badge>
              <span className="text-sm text-slate-800 flex-1 truncate">{p}</span>
              <button onClick={() => remove(i)} disabled={saving} className="text-slate-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors" data-testid={`prompts-remove-${i}`}>
                <Trash2 size={14} />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
