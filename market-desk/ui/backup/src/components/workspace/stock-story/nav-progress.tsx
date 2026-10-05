"use client";

// Thin top progress bar: starts the moment a link is clicked, finishes when the new page shows.
// Gives immediate feedback even when a page takes a few seconds to load.

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function NavProgress() {
  const pathname = usePathname();
  const [p, setP] = useState(0); // 0 = hidden, (0,1) = loading, 1 = finishing
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const last = useRef(pathname);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank") return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setP(0.08);
      if (timer.current) clearInterval(timer.current);
      timer.current = setInterval(() => setP((v) => (v > 0 && v < 0.9 ? v + (0.9 - v) * 0.08 : v)), 200);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (pathname === last.current) return;
    last.current = pathname;
    if (timer.current) clearInterval(timer.current);
    setP(1);
    const t = setTimeout(() => setP(0), 300);
    return () => clearTimeout(t);
  }, [pathname]);

  if (p === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]">
      <div className="h-full bg-[#7ccf94] shadow-[0_0_8px_#7ccf94] transition-[width] duration-200 ease-out" style={{ width: `${p * 100}%` }} />
    </div>
  );
}
