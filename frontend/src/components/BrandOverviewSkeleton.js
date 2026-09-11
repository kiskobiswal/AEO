import React from "react";
import { Card } from "@/components/ui/card";

/* Shimmer bar — subtle pulsing block used as a content placeholder. */
function Bar({ className = "", w = "100%", h = 10 }) {
  return (
    <div
      className={`animate-pulse rounded bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 bg-[length:200%_100%] ${className}`}
      style={{ width: w, height: h, animationDuration: "1.4s" }}
    />
  );
}

function Block({ children, className = "" }) {
  return <Card className={`rounded-xl border-slate-200 ${className}`}>{children}</Card>;
}

/**
 * Full-dashboard loading state for Brand Overview. Mirrors the real layout
 * so nothing shifts when data arrives — pure skeleton, no demo/mocked data.
 */
export default function BrandOverviewSkeleton() {
  return (
    <div className="space-y-6" data-testid="brand-overview-skeleton">
      {/* header row */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-slate-100 animate-pulse" />
          <div className="space-y-2">
            <Bar w={90} h={9} />
            <Bar w={210} h={24} />
            <Bar w={130} h={8} />
          </div>
        </div>

        {/* visibility score hero placeholder */}
        <Block className="px-5 py-4 shrink-0 min-w-[190px]">
          <Bar w={110} h={9} />
          <div className="mt-3"><Bar w={110} h={40} /></div>
          <div className="mt-2"><Bar w={160} h={10} /></div>
        </Block>

        <div className="flex items-center gap-2">
          <Bar w={110} h={36} className="rounded-md" />
          <Bar w={90} h={36} className="rounded-md" />
          <Bar w={44} h={36} className="rounded-md" />
          <Bar w={150} h={36} className="rounded-md" />
        </div>
      </div>

      <Bar w={360} h={10} />

      {/* main chart + voice share */}
      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <Block className="p-6">
          <div className="flex items-center justify-between mb-4"><Bar w={200} h={14} /><Bar w={80} h={10} /></div>
          <div className="h-[260px] rounded-lg bg-gradient-to-b from-slate-50 to-slate-100 animate-pulse relative overflow-hidden">
            <svg className="absolute inset-0 w-full h-full opacity-60" viewBox="0 0 100 40" preserveAspectRatio="none">
              <polyline points="0,32 10,28 20,30 30,22 40,25 50,18 60,20 70,14 80,17 90,10 100,13" fill="none" stroke="rgb(148 163 184)" strokeWidth="0.6" />
              <polyline points="0,36 10,34 20,33 30,30 40,31 50,28 60,29 70,26 80,27 90,24 100,25" fill="none" stroke="rgb(203 213 225)" strokeWidth="0.5" />
            </svg>
          </div>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            {[64, 72, 56, 80, 60].map((w, i) => <Bar key={i} w={w} h={20} className="rounded-full" />)}
          </div>
        </Block>

        <Block className="p-6">
          <Bar w={110} h={14} className="mb-4" />
          <div className="space-y-3">
            {[86, 72, 60, 50, 40, 32].map((pct, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1"><Bar w={90} h={10} /><Bar w={44} h={10} /></div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-slate-200 animate-pulse" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Block>
      </div>

      {/* ranking + top prompts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Block className="p-5">
          <Bar w={140} h={14} className="mb-4" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Bar w={20} h={20} className="rounded-full" />
                <Bar w={28} h={28} className="rounded-md" />
                <div className="flex-1 space-y-1.5"><Bar w="70%" h={10} /><Bar w="40%" h={8} /></div>
                <Bar w={40} h={10} />
              </div>
            ))}
          </div>
        </Block>
        <Block className="p-5">
          <Bar w={180} h={14} className="mb-4" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1.5"><Bar w="90%" h={12} /><Bar w="55%" h={9} /></div>
            ))}
          </div>
        </Block>
      </div>

      {/* citations + quick fixes */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Block className="p-5">
          <Bar w={170} h={14} className="mb-4" />
          <div className="divide-y divide-slate-100">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <Bar w={16} h={16} className="rounded" />
                <Bar w={26} h={26} className="rounded-md" />
                <div className="flex-1"><Bar w="60%" h={10} /></div>
                <Bar w={70} h={9} />
              </div>
            ))}
          </div>
        </Block>
        <Block className="p-5">
          <Bar w={180} h={14} className="mb-4" />
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5">
                <Bar w={44} h={16} className="rounded" />
                <div className="flex-1 space-y-1"><Bar w="75%" h={10} /><Bar w="40%" h={8} /></div>
                <Bar w={78} h={28} className="rounded-md" />
              </div>
            ))}
          </div>
        </Block>
      </div>

      {/* LLM distribution */}
      <Block className="p-5">
        <Bar w={160} h={14} className="mb-4" />
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="flex items-center gap-2"><Bar w={20} h={20} className="rounded" /><Bar w={90} h={10} /></span>
                <Bar w={50} h={9} />
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-slate-200 animate-pulse" style={{ width: `${20 + i * 10}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Block>

      {/* insights */}
      <Block className="p-5">
        <Bar w={160} h={14} className="mb-3" />
        <div className="space-y-2">
          {[92, 78, 84, 66].map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-200 mt-2" />
              <Bar w={`${w}%`} h={10} />
            </div>
          ))}
        </div>
      </Block>
    </div>
  );
}
