import React, { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, MessageSquare, Users } from "lucide-react";
import { http, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";

const MAX_PROMPTS = 40;
const MAX_COMPETITORS = 20;

/**
 * Brand settings — edits ONLY prompts + competitors. Brand name/domain are
 * intentionally not shown here (per product spec).
 */
export default function BrandSettingsModal({ open, brand, onClose, onSaved }) {
  const [prompts, setPrompts] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [newPrompt, setNewPrompt] = useState("");
  const [newCompetitor, setNewCompetitor] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!brand) return;
    setPrompts(brand.prompts || []);
    setCompetitors(brand.competitors || []);
    setNewPrompt("");
    setNewCompetitor("");
  }, [brand, open]);

  const canAddPrompt = newPrompt.trim().length > 0 && prompts.length < MAX_PROMPTS;
  const canAddCompetitor = newCompetitor.trim().length > 0 && competitors.length < MAX_COMPETITORS;

  const addPrompt = () => {
    const v = newPrompt.trim();
    if (!v || prompts.includes(v)) { setNewPrompt(""); return; }
    setPrompts((xs) => [...xs, v].slice(0, MAX_PROMPTS));
    setNewPrompt("");
  };
  const addCompetitor = () => {
    const v = newCompetitor.trim();
    if (!v || competitors.some((c) => c.toLowerCase() === v.toLowerCase())) { setNewCompetitor(""); return; }
    setCompetitors((xs) => [...xs, v].slice(0, MAX_COMPETITORS));
    setNewCompetitor("");
  };

  const dirty = useMemo(() => {
    const a = JSON.stringify(brand?.prompts || []);
    const b = JSON.stringify(brand?.competitors || []);
    return a !== JSON.stringify(prompts) || b !== JSON.stringify(competitors);
  }, [brand, prompts, competitors]);

  const save = async () => {
    if (!brand?.id) return;
    setSaving(true);
    try {
      await http.patch(`/brands/${brand.id}`, { prompts, competitors });
      toast.success("Brand settings updated");
      onSaved && onSaved({ prompts, competitors });
      onClose && onClose();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose && onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="brand-settings-modal">
        <DialogHeader>
          <DialogTitle className="font-head text-xl font-extrabold tracking-tight">Brand settings</DialogTitle>
          <p className="text-sm text-slate-500">Update the prompts you track and the competitors you compare against.</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1 space-y-6">
          {/* prompts */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare size={14} className="text-indigo-500" />
              <h3 className="font-head font-extrabold text-sm">Tracked prompts</h3>
              <span className="text-xs text-slate-400 tabular-nums ml-auto">{prompts.length}/{MAX_PROMPTS}</span>
            </div>
            <div className="flex gap-2 mb-3">
              <Input
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPrompt(); } }}
                placeholder='e.g. "Best AEO tools for agencies"'
                data-testid="new-prompt-input"
              />
              <Button type="button" onClick={addPrompt} disabled={!canAddPrompt} data-testid="add-prompt-btn">
                <Plus size={14} className="mr-1" />Add
              </Button>
            </div>
            {prompts.length === 0 ? (
              <div className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-lg">No prompts yet. Add one above.</div>
            ) : (
              <ul className="space-y-1.5" data-testid="prompts-list">
                {prompts.map((p, i) => (
                  <li key={p + i} className="flex items-center gap-2 rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
                    <span className="text-xs text-slate-300 font-head font-extrabold w-5 text-center shrink-0">{i + 1}</span>
                    <span className="flex-1 text-sm text-slate-800 break-words">{p}</span>
                    <button
                      onClick={() => setPrompts((xs) => xs.filter((_, k) => k !== i))}
                      className="text-slate-400 hover:text-red-500 shrink-0"
                      data-testid={`remove-prompt-${i}`}
                      aria-label="Remove prompt"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* competitors */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-indigo-500" />
              <h3 className="font-head font-extrabold text-sm">Competitors</h3>
              <span className="text-xs text-slate-400 tabular-nums ml-auto">{competitors.length}/{MAX_COMPETITORS}</span>
            </div>
            <div className="flex gap-2 mb-3">
              <Input
                value={newCompetitor}
                onChange={(e) => setNewCompetitor(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompetitor(); } }}
                placeholder="e.g. Profound, Peec AI"
                data-testid="new-competitor-input"
              />
              <Button type="button" onClick={addCompetitor} disabled={!canAddCompetitor} data-testid="add-competitor-btn">
                <Plus size={14} className="mr-1" />Add
              </Button>
            </div>
            {competitors.length === 0 ? (
              <div className="text-xs text-slate-400 py-3 text-center border border-dashed border-slate-200 rounded-lg">No competitors yet. Add one above.</div>
            ) : (
              <div className="flex flex-wrap gap-2" data-testid="competitors-list">
                {competitors.map((c, i) => (
                  <span key={c + i} className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-3 py-1.5 text-sm text-slate-800">
                    {c}
                    <button
                      onClick={() => setCompetitors((xs) => xs.filter((_, k) => k !== i))}
                      className="text-slate-400 hover:text-red-500"
                      data-testid={`remove-competitor-${i}`}
                      aria-label="Remove competitor"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>

        <DialogFooter className="pt-4 border-t border-slate-100">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="btn-brand" onClick={save} disabled={saving || !dirty} data-testid="save-brand-settings">
            {saving ? <><Loader2 size={14} className="mr-1.5 animate-spin" />Saving…</> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
