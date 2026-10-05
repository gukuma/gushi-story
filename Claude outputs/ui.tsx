"use client";

// 📈 股市故事 design system — "research house terminal".
// Surfaces, lines and colours come from CSS variables in styles/stock-story-theme.css (paper in
// light mode, graphite in dark). Hairline borders instead of shadows, 4–6px radii, serif
// headlines, tabular mono numerals, one amber signal colour; red = up, green = down.
// Tones are muted *accents* (a coloured rule / text), never pastel fills.

import { ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export const CANVAS = "ss-page bg-[var(--ss-canvas)] text-[var(--ss-text)]";
export const INK = "bg-[#0e1621] text-[#e8e6df] dark:bg-[#0f141a] dark:border dark:border-[var(--ss-line)]";
export const ACCENT = "bg-[var(--ss-signal)]";
export const PANEL = "bg-[var(--ss-panel)] border border-[var(--ss-line)]";
export const SUNKEN = "bg-[var(--ss-sunken)]";
export const HOVER = "hover:bg-[var(--ss-sunken)]";
export const LABEL = "text-[11px] tracking-[0.08em] text-[var(--ss-muted)]";

const TONES = [
  { name: "teal", tile: "bg-[var(--ss-panel)] border border-[var(--ss-line)] border-t-2 border-t-[#2b6f8a] dark:border-t-[#5fb3cf]",
    dot: "bg-[var(--ss-sunken)] text-[#2b6f8a] border border-[var(--ss-line)] dark:text-[#5fb3cf]",
    chip: "border border-[var(--ss-line)] text-[#2b6f8a] dark:text-[#5fb3cf]", bar: "bg-[#2b6f8a] dark:bg-[#5fb3cf]" },
  { name: "amber", tile: "bg-[var(--ss-panel)] border border-[var(--ss-line)] border-t-2 border-t-[var(--ss-signal)]",
    dot: "bg-[var(--ss-sunken)] text-[var(--ss-signal)] border border-[var(--ss-line)]",
    chip: "border border-[var(--ss-line)] text-[#9a6413] dark:text-[#e0a43f]", bar: "bg-[var(--ss-signal)]" },
  { name: "slate", tile: "bg-[var(--ss-panel)] border border-[var(--ss-line)] border-t-2 border-t-[#55606e]",
    dot: "bg-[var(--ss-sunken)] text-[var(--ss-text)] border border-[var(--ss-line)]",
    chip: "border border-[var(--ss-line)] text-[var(--ss-text)]", bar: "bg-[#55606e] dark:bg-[#8a929e]" },
  { name: "violet", tile: "bg-[var(--ss-panel)] border border-[var(--ss-line)] border-t-2 border-t-[#6b5b95]",
    dot: "bg-[var(--ss-sunken)] text-[#6b5b95] border border-[var(--ss-line)] dark:text-[#a99bd6]",
    chip: "border border-[var(--ss-line)] text-[#6b5b95] dark:text-[#a99bd6]", bar: "bg-[#6b5b95] dark:bg-[#a99bd6]" },
] as const;

export type Tone = (typeof TONES)[number];

export function toneOf(key: string | number): Tone {
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length]!;
}
export const tone = (i: number): Tone => TONES[i % TONES.length]!;
export const MINT = TONES[0];
export const SKY = TONES[2];
export const PEACH = TONES[1];
export const STONE = TONES[2];

export function Panel({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-[6px] p-5", PANEL, className)} {...props}>
      {children}
    </section>
  );
}

/** Square icon well used next to every title. */
export function IconWell({ icon: Icon, className, size = "md" }: { icon: LucideIcon; className?: string; size?: "sm" | "md" | "lg" }) {
  const box = size === "sm" ? "size-7" : size === "lg" ? "size-11" : "size-8";
  const ic = size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4";
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-[4px] border border-[var(--ss-line)] bg-[var(--ss-sunken)] text-[var(--ss-text)]", box, className)}>
      <Icon className={ic} strokeWidth={1.75} />
    </span>
  );
}

export function PanelTitle({ children, action, icon, sub }: { children: React.ReactNode; action?: React.ReactNode; icon?: LucideIcon; sub?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3 border-b border-[var(--ss-line)] pb-3">
      {icon && <IconWell icon={icon} size="sm" />}
      <div className="mr-auto min-w-0">
        <h2 className="truncate text-[17px] leading-tight font-semibold">{children}</h2>
        {sub && <div className="truncate text-xs text-[var(--ss-muted)]">{sub}</div>}
      </div>
      {action}
    </div>
  );
}

export function ArrowLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn("grid size-8 shrink-0 place-items-center rounded-[4px] border border-[var(--ss-line)] bg-[var(--ss-panel)] text-[var(--ss-text)] transition hover:border-[var(--ss-line-strong)]", className)}
    >
      <ArrowUpRight className="size-4" strokeWidth={1.75} />
    </Link>
  );
}

/** Square icon-only button (row actions, toolbars). */
export function RoundButton({ icon: Icon, label, className, active, spin, ...props }: React.ComponentProps<"button"> & { icon: LucideIcon; label: string; active?: boolean; spin?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-[4px] border transition disabled:opacity-40",
        active ? "border-[var(--ss-ink)] bg-[var(--ss-ink)] text-[var(--ss-ink-fg)]" : "border-[var(--ss-line)] bg-[var(--ss-panel)] text-[var(--ss-text)] hover:border-[var(--ss-line-strong)] hover:bg-[var(--ss-sunken)]",
        className,
      )}
      {...props}
    >
      <Icon className={cn("size-4", spin && "animate-spin")} strokeWidth={1.75} />
    </button>
  );
}

/** Text button (+ optional icon). primary = ink. */
export function PillButton({ icon: Icon, children, primary, className, ...props }: React.ComponentProps<"button"> & { icon?: LucideIcon; primary?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[4px] border px-3 text-[13px] font-medium transition disabled:opacity-40",
        primary ? "border-[var(--ss-ink)] bg-[var(--ss-ink)] text-[var(--ss-ink-fg)] hover:opacity-90"
          : "border-[var(--ss-line)] bg-[var(--ss-panel)] text-[var(--ss-text)] hover:border-[var(--ss-line-strong)] hover:bg-[var(--ss-sunken)]",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-3.5" strokeWidth={1.75} />}
      {children}
    </button>
  );
}

/** Segmented / filter tag. */
export function Chip({
  active,
  children,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[3px] border px-2.5 py-1 text-[13px] transition",
        active ? "border-[var(--ss-ink)] bg-[var(--ss-ink)] text-[var(--ss-ink-fg)]"
          : "border-[var(--ss-line)] bg-[var(--ss-panel)] text-[var(--ss-text)] hover:border-[var(--ss-line-strong)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Monogram tile for a stock / agent. */
export function Avatar({ text, keyFor, className }: { text: string; keyFor: string; className?: string }) {
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-[4px] font-serif text-sm font-semibold", toneOf(keyFor).dot, className)}>
      {text.slice(0, 1)}
    </span>
  );
}

export function Metric({ label, value, icon: Icon, className }: { label: string; value: React.ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <div className={cn("rounded-[4px] border border-[var(--ss-line)] bg-[var(--ss-panel)] px-3 py-2", className)}>
      <div className="flex items-center gap-1 text-[11px] leading-tight text-[var(--ss-muted)]">
        {Icon && <Icon className="size-3" strokeWidth={1.75} />}
        {label}
      </div>
      <div className="truncate font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

export function BigNumber({ children, unit, className }: { children: React.ReactNode; unit?: string; className?: string }) {
  return (
    <div className={cn("flex items-start gap-0.5 font-mono font-normal tracking-tight tabular-nums", className)}>
      <span>{children}</span>
      {unit && <span className="mt-1 font-sans text-xs font-normal text-[var(--ss-muted)]">{unit}</span>}
    </div>
  );
}

/** Header statistic (label on top, numeral below). */
export function Stat({ label, icon: Icon, children, unit, foot, className, ...props }: React.ComponentProps<"div"> & {
  label: string; icon: LucideIcon; unit?: string; foot?: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 border-l border-[var(--ss-line)] pl-4", className)} {...props}>
      <div className={cn("flex items-center gap-1.5", LABEL)}><Icon className="size-3" strokeWidth={1.75} />{label}</div>
      <BigNumber className="mt-1 text-2xl md:text-3xl" unit={unit}>{children}</BigNumber>
      {foot && <div className="mt-0.5 text-xs">{foot}</div>}
    </div>
  );
}

/** Data tile with a coloured top rule, icon, title and optional arrow link. */
export function Tile({ t, title, icon: Icon, href, children, className, ...props }: React.ComponentProps<"div"> & {
  t: Tone; title: string; icon: LucideIcon; href?: string;
}) {
  return (
    <div className={cn("flex min-h-[160px] flex-col rounded-[6px] p-4", t.tile, className)} {...props}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 text-[var(--ss-muted)]" strokeWidth={1.75} />
        <span className="mr-auto text-[13px] leading-tight font-medium">{title}</span>
        {href && <ArrowLink href={href} label={title} />}
      </div>
      <div className="mt-auto pt-3">{children}</div>
    </div>
  );
}

export function Empty({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-[var(--ss-muted)]">
      <IconWell icon={Icon} size="lg" />
      <div>{children}</div>
    </div>
  );
}

export const inputCls =
  "h-9 w-full rounded-[4px] border border-[var(--ss-line)] bg-[var(--ss-panel)] px-3 text-sm outline-none transition focus:border-[var(--ss-signal)] focus:ring-2 focus:ring-[var(--ss-signal-soft)]";
export const textareaCls =
  "w-full rounded-[4px] border border-[var(--ss-line)] bg-[var(--ss-panel)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--ss-signal)] focus:ring-2 focus:ring-[var(--ss-signal-soft)]";

/** Soft shimmering placeholder while data loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[4px] bg-[var(--ss-sunken-2)]", className)} />;
}

/** Full-area loader used by route loading screens and first loads. */
export function PageLoader({ label = "正在加载…" }: { label?: string }) {
  return (
    <div className={cn("flex size-full flex-col gap-5 px-4 py-6 md:px-8", CANVAS)}>
      <div className="flex items-center gap-3">
        <span className="relative grid size-9 place-items-center rounded-[4px] border border-[var(--ss-line)] bg-[var(--ss-panel)]">
          <span className="absolute inset-x-1 bottom-1 h-0.5 animate-pulse bg-[var(--ss-signal)]" />
          <span className="font-serif text-sm font-semibold">股</span>
        </span>
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs text-[var(--ss-muted)]">第一次打开某个页面可能要多等几秒</div>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

/** Render children only in the browser (all 股市故事 data is fetched client-side anyway). Avoids
 *  server/client hydration mismatches from time-, storage- and query-dependent UI. */
export function ClientGate({ children, label }: { children: React.ReactNode; label?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <>{children}</> : <PageLoader label={label} />;
}
