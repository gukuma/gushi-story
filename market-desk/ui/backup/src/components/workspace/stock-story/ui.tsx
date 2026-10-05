"use client";

// 📈 股市故事 design system.
// One palette everywhere: a neutral light canvas, white panels, one deep "ink" navy for the
// hero card / primary actions / active pills, and exactly four pastel tones (mint, sky, peach,
// stone). Prices keep the A-share convention: red = up, green = down.
// Icons come from lucide-react (bundled with DeerFlow, 1,500+ icons): every panel, tile and
// action gets one, always in the same round "icon well".

import { ArrowUpRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

export const CANVAS = "bg-[#f4f4f0] dark:bg-background";
export const INK = "bg-[#1e1c34] text-white dark:bg-[#2c2a48]";
export const ACCENT = "bg-[#7ccf94]"; // mint accent for progress / "on" states (never for prices)

const TONES = [
  { name: "mint", tile: "bg-[#e3f1e6] dark:bg-emerald-400/10", dot: "bg-[#b5dfc0] text-[#173b22]", chip: "bg-[#d3eadb] text-[#1e4a2b] dark:bg-emerald-400/20 dark:text-emerald-100", bar: "bg-[#7ccf94]" },
  { name: "sky", tile: "bg-[#e4ecf8] dark:bg-sky-400/10", dot: "bg-[#bdd2f1] text-[#16325c]", chip: "bg-[#d4e1f5] text-[#1d3d6b] dark:bg-sky-400/20 dark:text-sky-100", bar: "bg-[#6aa6e8]" },
  { name: "peach", tile: "bg-[#fbebdb] dark:bg-orange-400/10", dot: "bg-[#f4cda5] text-[#5a2f0c]", chip: "bg-[#f7dcc0] text-[#6a3a12] dark:bg-orange-400/20 dark:text-orange-100", bar: "bg-[#eea86a]" },
  { name: "stone", tile: "bg-[#eeede8] dark:bg-white/5", dot: "bg-[#d9d6cc] text-[#3b382f]", chip: "bg-[#e3e1da] text-[#3b382f] dark:bg-white/10 dark:text-white", bar: "bg-[#b7b2a4]" },
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
export const SKY = TONES[1];
export const PEACH = TONES[2];
export const STONE = TONES[3];

export function Panel({ className, children, ...props }: React.ComponentProps<"section">) {
  return (
    <section className={cn("dark:bg-card rounded-[28px] bg-white p-5 shadow-[0_1px_2px_rgba(30,28,52,0.04)]", className)} {...props}>
      {children}
    </section>
  );
}

/** Round icon "well" used for every icon next to a title. */
export function IconWell({ icon: Icon, className, size = "md" }: { icon: LucideIcon; className?: string; size?: "sm" | "md" | "lg" }) {
  const box = size === "sm" ? "size-7" : size === "lg" ? "size-12" : "size-9";
  const ic = size === "sm" ? "size-3.5" : size === "lg" ? "size-5" : "size-4";
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-[#f1f0eb] text-[#1e1c34] dark:bg-white/10 dark:text-white", box, className)}>
      <Icon className={ic} />
    </span>
  );
}

export function PanelTitle({ children, action, icon, sub }: { children: React.ReactNode; action?: React.ReactNode; icon?: LucideIcon; sub?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      {icon && <IconWell icon={icon} />}
      <div className="mr-auto min-w-0">
        <h2 className="truncate text-lg font-medium tracking-tight">{children}</h2>
        {sub && <div className="text-muted-foreground truncate text-xs">{sub}</div>}
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
      className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-white text-[#1e1c34] transition hover:scale-105 dark:bg-white/10 dark:text-white", className)}
    >
      <ArrowUpRight className="size-4" />
    </Link>
  );
}

/** Round icon-only button (filters, settings, refresh, row actions). */
export function RoundButton({ icon: Icon, label, className, active, spin, ...props }: React.ComponentProps<"button"> & { icon: LucideIcon; label: string; active?: boolean; spin?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full transition disabled:opacity-40",
        active ? INK : "bg-[#f1f0eb] text-[#1e1c34] hover:bg-[#e6e4dc] dark:bg-white/10 dark:text-white",
        className,
      )}
      {...props}
    >
      <Icon className={cn("size-4", spin && "animate-spin")} />
    </button>
  );
}

/** Pill button with text (+ optional icon). primary = ink navy. */
export function PillButton({ icon: Icon, children, primary, className, ...props }: React.ComponentProps<"button"> & { icon?: LucideIcon; primary?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-sm transition disabled:opacity-40",
        primary ? cn(INK, "hover:opacity-90") : "bg-[#f1f0eb] text-[#1e1c34] hover:bg-[#e6e4dc] dark:bg-white/10 dark:text-white",
        className,
      )}
      {...props}
    >
      {Icon && <Icon className="size-4" />}
      {children}
    </button>
  );
}

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
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition",
        active ? cn(INK, "border-transparent") : "border-black/10 bg-white hover:bg-[#f1f0eb] dark:border-white/10 dark:bg-transparent",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Avatar({ text, keyFor, className }: { text: string; keyFor: string; className?: string }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold", toneOf(keyFor).dot, className)}>
      {text.slice(0, 1)}
    </span>
  );
}

export function Metric({ label, value, icon: Icon, className }: { label: string; value: React.ReactNode; icon?: LucideIcon; className?: string }) {
  return (
    <div className={cn("rounded-2xl bg-white/70 px-3 py-2 dark:bg-white/5", className)}>
      <div className="text-muted-foreground flex items-center gap-1 text-[11px] leading-tight">
        {Icon && <Icon className="size-3" />}
        {label}
      </div>
      <div className="truncate text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

export function BigNumber({ children, unit, className }: { children: React.ReactNode; unit?: string; className?: string }) {
  return (
    <div className={cn("flex items-start gap-0.5 font-light tracking-tight tabular-nums", className)}>
      <span>{children}</span>
      {unit && <span className="mt-1 text-sm font-normal opacity-60">{unit}</span>}
    </div>
  );
}

/** Header statistic (label on top, big light numeral below). */
export function Stat({ label, icon: Icon, children, unit, foot, className, ...props }: React.ComponentProps<"div"> & {
  label: string; icon: LucideIcon; unit?: string; foot?: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)} {...props}>
      <div className="text-muted-foreground flex items-center gap-1.5 text-sm"><Icon className="size-3.5" />{label}</div>
      <BigNumber className="mt-1 text-3xl md:text-4xl" unit={unit}>{children}</BigNumber>
      {foot && <div className="mt-0.5 text-xs">{foot}</div>}
    </div>
  );
}

/** Pastel tile with icon, title and an optional round arrow link. */
export function Tile({ t, title, icon: Icon, href, children, className, ...props }: React.ComponentProps<"div"> & {
  t: Tone; title: string; icon: LucideIcon; href?: string;
}) {
  return (
    <div className={cn("flex min-h-[172px] flex-col rounded-[28px] p-5", t.tile, className)} {...props}>
      <div className="flex items-start gap-2">
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", t.dot)}><Icon className="size-4" /></span>
        <span className="mr-auto pt-1.5 text-sm leading-tight font-medium">{title}</span>
        {href && <ArrowLink href={href} label={title} />}
      </div>
      <div className="mt-auto pt-3">{children}</div>
    </div>
  );
}

export function Empty({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 px-4 py-8 text-center text-sm">
      <IconWell icon={Icon} size="lg" />
      <div>{children}</div>
    </div>
  );
}

export const inputCls =
  "h-10 w-full rounded-full border border-black/10 bg-white px-4 text-sm outline-none focus:border-[#1e1c34]/40 dark:border-white/10 dark:bg-transparent";
export const textareaCls =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm outline-none focus:border-[#1e1c34]/40 dark:border-white/10 dark:bg-transparent";
