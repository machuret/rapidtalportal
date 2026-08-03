"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { reportClientExperience } from "@/lib/client-experience";

const NAVIGATION_START_KEY = "rapidtal:navigation-start";

function initialNavigationStartedAt(): number {
  if (typeof window === "undefined") return Date.now();
  const navigation = window.performance?.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
  return navigation?.startTime === 0 ? Math.round(window.performance.timeOrigin) : Date.now();
}

/** Records route readiness and captures when an internal navigation started. */
export function ClientExperienceMonitor() {
  const pathname = usePathname();
  const firstRender = useRef(true);

  useEffect(() => {
    function rememberNavigationStart(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      if (anchor.pathname === window.location.pathname && anchor.search === window.location.search) return;
      try { sessionStorage.setItem(NAVIGATION_START_KEY, String(Date.now())); } catch { /* ignore */ }
    }
    document.addEventListener("click", rememberNavigationStart, true);
    return () => document.removeEventListener("click", rememberNavigationStart, true);
  }, []);

  useEffect(() => {
    let startedAt = firstRender.current ? initialNavigationStartedAt() : Date.now();
    firstRender.current = false;
    try {
      const stored = Number(sessionStorage.getItem(NAVIGATION_START_KEY));
      if (Number.isFinite(stored) && stored > 0) startedAt = stored;
      sessionStorage.removeItem(NAVIGATION_START_KEY);
    } catch { /* ignore */ }

    const frame = window.requestAnimationFrame(() => {
      reportClientExperience({
        eventType: "page_ready",
        path: pathname,
        durationMs: Math.max(0, Date.now() - startedAt),
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
