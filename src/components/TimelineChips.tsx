"use client";

import Link from "next/link";

export type TimelineChip = {
  href: string;
  label: string;
  step: number;
};

export default function TimelineChips({
  title,
  subtitle,
  currentStep,
  totalSteps,
  items,
}: {
  title: string;
  subtitle?: string;
  currentStep: number;
  totalSteps: number;
  items: TimelineChip[];
}) {
  return (
    <div className="syn-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          {subtitle ? <div className="text-sm text-slate-200/90">{subtitle}</div> : null}
        </div>
        <div className="text-xs text-slate-300">
          Passo atual: {currentStep}/{totalSteps}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        {items.map((it, idx) => {
          const cls =
            "rounded-full px-3 py-1 ring-1 ring-white/10 hover:bg-white/15 " +
            (currentStep === it.step
              ? "bg-amber-500/20 text-amber-200 ring-amber-500/30"
              : currentStep > it.step
                ? "bg-white/10 text-slate-200"
                : "bg-black/20 text-slate-400");
          return (
            <span key={it.step} className="inline-flex items-center gap-2">
              <Link href={it.href} className={cls}>
                {it.label}
              </Link>
              {idx < items.length - 1 ? <span className="text-slate-500">→</span> : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

