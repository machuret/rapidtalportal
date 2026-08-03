"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  beginClientNavigation,
  configureClientExperienceActor,
  ensureClientNavigation,
  reportClientExperience,
} from "@/lib/client-experience";

function initialNavigationStartedAt(): number {
  if (typeof window === "undefined") return Date.now();
  const navigation = window.performance?.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
  return navigation?.startTime === 0 ? Math.round(window.performance.timeOrigin) : Date.now();
}

/** Records route readiness and captures when an internal navigation started. */
export function ClientExperienceMonitor({ actorId }: { actorId: string }) {
  const pathname = usePathname();
  const firstRender = useRef(true);

  useEffect(() => {
    configureClientExperienceActor(actorId);
  }, [actorId]);

  useEffect(() => {
    function rememberNavigationStart(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === "_blank" || anchor.origin !== window.location.origin) return;
      if (anchor.pathname === window.location.pathname && anchor.search === window.location.search) return;
      beginClientNavigation(anchor.pathname, Date.now(), true);
    }
    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);
    window.history.pushState = function pushState(data, unused, url) {
      if (url) beginClientNavigation(new URL(String(url), window.location.href).pathname);
      return originalPushState(data, unused, url);
    };
    window.history.replaceState = function replaceState(data, unused, url) {
      if (url) beginClientNavigation(new URL(String(url), window.location.href).pathname);
      return originalReplaceState(data, unused, url);
    };
    const rememberPopState = () => beginClientNavigation(window.location.pathname, Date.now(), true);
    document.addEventListener("click", rememberNavigationStart, true);
    window.addEventListener("popstate", rememberPopState);
    return () => {
      document.removeEventListener("click", rememberNavigationStart, true);
      window.removeEventListener("popstate", rememberPopState);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  useEffect(() => {
    const fallbackStartedAt = firstRender.current ? initialNavigationStartedAt() : Date.now();
    firstRender.current = false;
    const navigation = ensureClientNavigation(pathname, fallbackStartedAt);

    const frame = window.requestAnimationFrame(() => {
      reportClientExperience({
        eventType: "page_ready",
        path: pathname,
        durationMs: Math.max(0, Date.now() - navigation.startedAt),
        metadata: { stage: "route_shell" },
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
