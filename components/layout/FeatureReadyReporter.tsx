"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { reportClientFeatureReady } from "@/lib/client-experience";

/** Mount only after a feature's required data is available, not merely its route shell. */
export function FeatureReadyReporter({ feature }: { feature: string }) {
  const pathname = usePathname();
  useEffect(() => reportClientFeatureReady(pathname, feature), [feature, pathname]);
  return null;
}
