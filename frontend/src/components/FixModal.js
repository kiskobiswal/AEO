import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { http, formatApiErrorDetail } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Wrench,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Sparkles,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";

// Issue codes we can auto-fix through the injected script.
export const FIXABLE_ISSUE_CODES = new Set([
  "missing_title",
  "short_title",
  "long_title",
  "missing_meta_description",
  "thin_content",
  "no_answer_paragraph",
  "no_citation_statistics",
  "no_faq_schema",
]);

const PATCH_LABEL = {
  meta_title: "Page title (<title> + og:title)",
  meta_description: "Meta description",
  content_block: "New content block",
};

export function FixButton({ issue, projectId, pageUrl, onApplied }) {
  const [open, setOpen] = useState(false);
  const disabled = !FIXABLE_ISSUE_CODES.has(issue?.code);
  if (disabled) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        data-testid={`fix-btn-${issue.code}`}
        className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#6366F1] text-white hover:bg-[#4F46E5] shadow-sm"
      >
        <Wrench size={11} /> Fix
      </button>
      {open ? (
        <FixModal
          issue={issue}
          projectId={projectId}
          pageUrl={pageUrl}
          onClose={() => setOpen(false)}
          onApplied={(patch) => {
            setOpen(false);
            onApplied?.(patch);
          }}
        />
      ) : null}
    </>
  );
}

function FixModal({ issue, projectId, pageUrl, onClose, onApplied }) {
  const [stage, setStage] = useState("loading"); // loading | needs_conn | review | applying | applied | error
  const [error, setError] = useState("");
  const [needs, setNeeds] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [patchType, setPatchType] = useState("");
  const [edited, setEdited] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await http.post(`/projects/${projectId}/fixes/generate`, {
          issue_code: issue.code,
          page_url: pageUrl || null,
          issue_message: issue.message || "",
          issue_fix: issue.fix || "",
          issue_category: issue.category || "",
        });
        if (data?.needs_connection) {
          setNeeds(data);
          setStage("needs_conn");
          return;
        }
        setSuggestion(data?.suggestion || {});
        setPatchType(data?.patch_type || "");
        const s = data?.suggestion || {};
        setEdited(
          data?.patch_type === "meta_title"
            ? s.value || ""
            : data?.patch_type === "meta_description"
            ? s.description || ""
            : s.html || ""
        );
        setStage("review");
      } catch (e) {
        setError(formatApiErrorDetail(e) || "Couldn't generate the fix. Please retry.");
        setStage("error");
      }
    })();
    // Intentionally run once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const approveAndApply = async () => {
    setStage("applying");
    try {
      const payload =
        patchType === "meta_title"
          ? { value: edited }
          : patchType === "meta_description"
          ? { value: edited, description: edited }
          : { html: edited };
      const { data } = await http.post(`/projects/${projectId}/fixes/apply`, {
        issue_code: issue.code,
        patch_type: patchType,
        payload,
        page_url: pageUrl || null,
        rationale: suggestion?.rationale || "",
      });
      toast.success(data?.message || "Fix queued — your site will apply it shortly.");
      setStage("applied");
      setTimeout(() => onApplied?.(data), 1500);
    } catch (e) {
      setError(formatApiErrorDetail(e) || "Couldn't queue the fix. Please retry.");
      setStage("error");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose?.() : null)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench size={17} className="text-[#6366F1]" /> Fix this issue
          </DialogTitle>
          <DialogDescription className="text-xs">
            <span className="font-semibold">{issue.message}</span>
            {pageUrl ? (
              <span className="block text-muted-foreground truncate mt-0.5">
                Target page: <span className="font-mono">{pageUrl}</span>
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {stage === "loading" && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="animate-spin inline-block mr-2" size={16} />
            Generating the best fix for this issue…
          </div>
        )}

        {stage === "needs_conn" && (
          <div className="py-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-amber-800 mb-1">
                  Connect your website first
                </div>
                <div className="text-amber-900/80 text-xs leading-relaxed">
                  {needs?.message ||
                    "To apply this fix live we need your site connected. Head to your profile, generate a script tag and paste it into your site's <head>."}
                  {needs?.project_domain ? (
                    <span className="block mt-2">
                      This project's domain is{" "}
                      <span className="font-mono font-semibold">
                        {needs.project_domain}
                      </span>{" "}
                      — the connected domain must match.
                    </span>
                  ) : null}
                </div>
                <Link
                  to="/app/profile#connect-website"
                  onClick={onClose}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-[#6366F1] text-white hover:bg-[#4F46E5]"
                >
                  Open profile → Connect Website{" "}
                  <ExternalLink size={12} />
                </Link>
              </div>
            </div>
          </div>
        )}

        {stage === "review" && (
          <div className="py-2 space-y-3">
            <div className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
              <Sparkles size={11} /> {PATCH_LABEL[patchType] || patchType}
            </div>
            <Textarea
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              className={
                patchType === "content_block"
                  ? "min-h-[180px] font-mono text-xs"
                  : "min-h-[80px] text-sm"
              }
            />
            {suggestion?.rationale ? (
              <div className="text-[11px] text-muted-foreground italic">
                Why: {suggestion.rationale}
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2 pt-2">
              <button
                onClick={onClose}
                className="text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5"
              >
                Cancel
              </button>
              <Button
                onClick={approveAndApply}
                disabled={!edited.trim()}
                className="bg-[#6366F1] hover:bg-[#4F46E5]"
                data-testid="approve-apply-btn"
              >
                <Rocket size={13} className="mr-1.5" /> Approve & apply live
              </Button>
            </div>
          </div>
        )}

        {stage === "applying" && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="animate-spin inline-block mr-2" size={16} />
            Queuing the fix for your site…
          </div>
        )}

        {stage === "applied" && (
          <div className="py-6 text-center">
            <CheckCircle2 className="mx-auto text-emerald-500" size={30} />
            <div className="mt-2 font-head font-bold text-sm">Fix queued live!</div>
            <div className="text-xs text-muted-foreground mt-1">
              Your website will apply this on its next check (within ~20 seconds).
            </div>
          </div>
        )}

        {stage === "error" && (
          <div className="py-6">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={onClose}
                className="text-xs text-slate-500 hover:text-slate-800 px-3 py-1.5"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
