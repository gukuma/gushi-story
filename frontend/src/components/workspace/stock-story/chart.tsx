"use client";

// K 线图: daily candles (red up / green down, A-share convention), MA20, volume, hover details.

import { useQuery } from "@tanstack/react-query";
import { CandlestickChart } from "lucide-react";
import { useMemo, useState } from "react";

import {
  deskGet,
  fmtNum,
  fmtPct,
  moveClass,
  type Candle,
} from "@/core/stock-story/api";
import { cn } from "@/lib/utils";

import { Chip, Panel, PanelTitle, Skeleton } from "./ui";

const RANGES: Array<[string, number]> = [
  ["1月", 22],
  ["3月", 66],
  ["6月", 130],
  ["1年", 250],
];
const UP = "var(--ss-up)";
const DOWN = "var(--ss-down)";

export function CandleChart({ code }: { code: string }) {
  const [days, setDays] = useState(66);
  const [hover, setHover] = useState<number | null>(null);
  const { data, error, isLoading } = useQuery({
    queryKey: ["stock-story", "history", code, days],
    queryFn: () => deskGet<Candle[]>(`/api/history?code=${code}&days=${days}`),
    enabled: !!code,
    staleTime: 300_000,
  });
  const c = useMemo(
    () => (data ?? []).filter((x) => x.high != null && x.low != null),
    [data],
  );
  const W = 760;
  const H = 260;
  const VH = 56;
  const pad = 6;
  const geo = useMemo(() => {
    if (!c.length) return null;
    const hi = Math.max(...c.map((x) => x.high));
    const lo = Math.min(...c.map((x) => x.low));
    const vmax = Math.max(1, ...c.map((x) => x.volume || 0));
    const step = (W - pad * 2) / c.length;
    const y = (v: number) =>
      pad + (1 - (v - lo) / (hi - lo || 1)) * (H - pad * 2);
    const ma = c.map((_, i) =>
      i >= 19
        ? c.slice(i - 19, i + 1).reduce((a, x) => a + x.close, 0) / 20
        : null,
    );
    return { hi, lo, vmax, step, y, ma };
  }, [c]);
  const cur = hover != null ? c[hover] : c[c.length - 1];
  const prev = hover != null ? c[hover - 1] : c[c.length - 2];
  const first = c[0];
  const last = c[c.length - 1];
  const rangePct =
    first && last ? ((last.close - first.close) / first.close) * 100 : null;

  return (
    <Panel
      data-tip-title="K 线图"
      data-tip="每根柱子是一天：红色 = 收盘比开盘高，绿色 = 收盘比开盘低。细线是最高和最低价，橙线是 20 日均线，下面是成交量。鼠标移上去看当天数字。"
    >
      <PanelTitle
        icon={CandlestickChart}
        sub={
          rangePct != null ? (
            <span>
              区间涨跌{" "}
              <span className={moveClass(rangePct)}>{fmtPct(rangePct)}</span>
            </span>
          ) : undefined
        }
        action={
          <div className="flex gap-1">
            {RANGES.map(([l, d]) => (
              <Chip
                key={l}
                active={days === d}
                onClick={() => setDays(d)}
                className="px-2.5 py-0.5 text-xs"
              >
                {l}
              </Chip>
            ))}
          </div>
        }
      >
        走势
      </PanelTitle>
      {cur && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
          <span className="text-muted-foreground">{cur.date}</span>
          <span>开 {fmtNum(cur.open)}</span>
          <span>高 {fmtNum(cur.high)}</span>
          <span>低 {fmtNum(cur.low)}</span>
          <span className={moveClass(prev ? cur.close - prev.close : 0)}>
            收 {fmtNum(cur.close)}
            {prev
              ? `（${fmtPct(((cur.close - prev.close) / prev.close) * 100)}）`
              : ""}
          </span>
          <span className="text-muted-foreground">
            量 {fmtNum(cur.volume / 10000, 1)} 万手
          </span>
        </div>
      )}
      {isLoading && <Skeleton className="h-[316px]" />}
      {error && (
        <p className="text-muted-foreground text-sm">走势图暂时取不到。</p>
      )}
      {geo && (
        <svg
          viewBox={`0 0 ${W} ${H + VH + 8}`}
          className="w-full select-none"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (
              e.currentTarget as SVGSVGElement
            ).getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * W;
            setHover(
              Math.max(
                0,
                Math.min(c.length - 1, Math.floor((x - pad) / geo.step)),
              ),
            );
          }}
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <g key={f}>
              <line
                x1={0}
                x2={W}
                y1={pad + f * (H - pad * 2)}
                y2={pad + f * (H - pad * 2)}
                stroke="currentColor"
                strokeOpacity={0.07}
              />
              <text
                x={W - 2}
                y={pad + f * (H - pad * 2) - 3}
                textAnchor="end"
                fontSize={10}
                fill="currentColor"
                fillOpacity={0.45}
              >
                {fmtNum(geo.hi - f * (geo.hi - geo.lo))}
              </text>
            </g>
          ))}
          {c.map((d, i) => {
            const x = pad + i * geo.step + geo.step / 2;
            const col = d.close >= d.open ? UP : DOWN;
            const bw = Math.max(1, geo.step * 0.62);
            const top = geo.y(Math.max(d.open, d.close));
            const bot = geo.y(Math.min(d.open, d.close));
            return (
              <g key={d.date}>
                <line
                  x1={x}
                  x2={x}
                  y1={geo.y(d.high)}
                  y2={geo.y(d.low)}
                  stroke={col}
                  strokeWidth={1}
                />
                <rect
                  x={x - bw / 2}
                  y={top}
                  width={bw}
                  height={Math.max(1, bot - top)}
                  fill={d.close >= d.open ? "transparent" : col}
                  stroke={col}
                  strokeWidth={1}
                />
                <rect
                  x={x - bw / 2}
                  y={H + 8 + VH - ((d.volume || 0) / geo.vmax) * VH}
                  width={bw}
                  height={((d.volume || 0) / geo.vmax) * VH}
                  fill={col}
                  fillOpacity={0.35}
                />
              </g>
            );
          })}
          <polyline
            fill="none"
            stroke="var(--ss-signal)"
            strokeWidth={1.5}
            points={geo.ma
              .map((v, i) =>
                v == null
                  ? null
                  : `${pad + i * geo.step + geo.step / 2},${geo.y(v)}`,
              )
              .filter(Boolean)
              .join(" ")}
          />
          {hover != null && (
            <line
              x1={pad + hover * geo.step + geo.step / 2}
              x2={pad + hover * geo.step + geo.step / 2}
              y1={0}
              y2={H + VH + 8}
              stroke="currentColor"
              strokeOpacity={0.3}
              strokeDasharray="3 3"
            />
          )}
        </svg>
      )}
      <div
        className={cn(
          "text-muted-foreground mt-1 flex justify-between text-[10px]",
          !geo && "hidden",
        )}
      >
        <span>{first?.date}</span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-[var(--ss-signal)]" />
          20 日均线
        </span>
        <span>{last?.date}</span>
      </div>
    </Panel>
  );
}
