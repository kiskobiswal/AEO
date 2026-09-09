import React, { useCallback, useEffect, useState } from "react";
import { http, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Globe,
  Plus,
  Copy,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  User as UserIcon,
  Code2,
  Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/ui-bits";

function CopyBox({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <textarea
        readOnly
        value={value}
        className="w-full text-xs font-mono bg-slate-900 text-slate-100 rounded-lg p-3 pr-11 h-24 resize-none border border-slate-800"
        onFocus={(e) => e.target.select()}
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            toast.error("Couldn't copy to clipboard");
          }
        }}
        className="absolute top-2.5 right-2.5 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100"
        title="Copy"
      >
        {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function ConnectionCard({ conn, onRefresh, onDelete }) {
  const verified = !!conn.verified;
  return (
    <Card className="p-5 rounded-xl border-border/60">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`w-9 h-9 rounded-lg grid place-items-center shrink-0 ${
              verified ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"
            }`}
          >
            <Globe size={18} />
          </div>
          <div className="min-w-0">
            <div className="font-head font-bold text-sm truncate">
              {conn.domain || <span className="text-slate-400">Waiting for first ping…</span>}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Script ID: <span className="font-mono">{conn.script_id.slice(0, 14)}…</span>
            </div>
            <div className="mt-1.5">
              {verified ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={11} /> Verified & live
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  <AlertCircle size={11} /> Waiting for install
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-slate-100"
            title="Refresh status"
          >
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-red-500 hover:text-red-700 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-50"
            title="Remove connection"
          >
            <Trash2 size={13} /> Remove
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-1.5 flex items-center gap-1.5">
          <Code2 size={11} /> Paste this into your site's &lt;head&gt;
        </div>
        <CopyBox value={conn.script_tag || ""} />
        <div className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
          After adding the tag, visit any page of your site. We'll detect the domain
          on the first ping and mark this connection verified automatically. Then any
          "Fix" you approve inside a project report will apply live within ~20&nbsp;seconds.
        </div>
      </div>
    </Card>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const [conns, setConns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [domainHint, setDomainHint] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await http.get("/site-connections");
      setConns(data?.connections || []);
    } catch (e) {
      toast.error(formatApiErrorDetail(e) || "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 10s so a fresh install flips to Verified without the user hitting reload.
  useEffect(() => {
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const createConnection = async () => {
    setCreating(true);
    try {
      const { data } = await http.post("/site-connections", {
        domain: domainHint.trim() || null,
      });
      setConns((prev) => [data, ...prev]);
      setDomainHint("");
      toast.success("Script generated — paste it into your site's <head>.");
    } catch (e) {
      toast.error(formatApiErrorDetail(e) || "Couldn't generate a script");
    } finally {
      setCreating(false);
    }
  };

  const removeConnection = async (id) => {
    if (!window.confirm("Remove this connection and stop applying fixes to that site?")) return;
    try {
      await http.delete(`/site-connections/${id}`);
      setConns((prev) => prev.filter((c) => c.id !== id));
      toast.success("Connection removed");
    } catch (e) {
      toast.error(formatApiErrorDetail(e) || "Failed to remove");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-6" id="connect-website">
      <PageHeader
        title="Profile"
        subtitle="Manage your account and connect your website so fixes can be applied live."
      />

      <Card className="p-5 rounded-xl border-border/60 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white grid place-items-center font-bold">
            {(user?.name || user?.email || "U").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-head font-bold text-base truncate">{user?.name || "—"}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
        </div>
      </Card>

      <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-head font-extrabold text-lg flex items-center gap-2">
            <Globe size={18} className="text-[#6366F1]" /> Connect Website
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            Generate a unique script tag for each website you want Citetail to
            fix. Once installed, you can approve fixes inside a project report
            and we'll apply them live — no code changes on your end.
          </p>
        </div>
      </div>

      <Card className="p-5 rounded-xl border-border/60 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Optional: which domain will you install this on? e.g. mysite.com"
            value={domainHint}
            onChange={(e) => setDomainHint(e.target.value)}
            className="flex-1 min-w-[220px]"
            data-testid="new-conn-domain"
          />
          <Button
            onClick={createConnection}
            disabled={creating}
            className="bg-[#6366F1] hover:bg-[#4F46E5]"
            data-testid="generate-script-btn"
          >
            {creating ? (
              <>
                <Loader2 size={14} className="mr-2 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Plus size={14} className="mr-2" /> Generate script tag
              </>
            )}
          </Button>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          The domain is auto-detected from the first ping — the hint above is just
          for your reference.
        </div>
      </Card>

      {loading ? (
        <Card className="p-10 rounded-xl border-border/60 text-center text-muted-foreground text-sm">
          <Loader2 size={18} className="animate-spin inline-block mr-2" />
          Loading your connections…
        </Card>
      ) : conns.length === 0 ? (
        <Card className="p-10 rounded-xl border-border/60 text-center">
          <UserIcon size={28} className="mx-auto text-slate-300 mb-2" />
          <div className="font-head font-bold text-sm mb-1">No websites connected yet</div>
          <div className="text-xs text-muted-foreground">
            Generate a script tag above and paste it into your site's &lt;head&gt;.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {conns.map((c) => (
            <ConnectionCard
              key={c.id}
              conn={c}
              onRefresh={load}
              onDelete={() => removeConnection(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
