"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { reportClientFeatureReady } from "@/lib/client-experience";

const EXPLICIT_FEATURE_ROUTES = [
  "/dashboard", "/team", "/reports", "/crm", "/vault", "/lead-generation",
  "/brain/analytics", "/brain/learning",
];

/** Server-rendered pages mount this only after their required page data has
 * resolved. Workspaces with a more precise client-side readiness signal opt
 * out and report from their owning component instead. */
export function PortalFeatureReadyFallback() {
  const pathname = usePathname();
  useEffect(() => {
    if (EXPLICIT_FEATURE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) return;
    reportClientFeatureReady(pathname, "portal_workspace");
  }, [pathname]);
  return null;
}
