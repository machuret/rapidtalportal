"use client";

import { createContext, useContext } from "react";
import type { FeatureVideoMap } from "@/lib/tutorials/server";

/**
 * Makes the per-feature tutorial-video map (loaded once server-side in the
 * portal layout) available to PageIntro on every page, so the "Video Tutorial"
 * button can appear without each of the ~17 call sites passing a prop.
 */
const FeatureVideosContext = createContext<FeatureVideoMap>({});

export function FeatureVideosProvider({
  value,
  children,
}: {
  value: FeatureVideoMap;
  children: React.ReactNode;
}) {
  return <FeatureVideosContext.Provider value={value}>{children}</FeatureVideosContext.Provider>;
}

/** The Loom URL for a feature slug, or undefined if none is set. */
export function useFeatureVideo(slug: string): string | undefined {
  return useContext(FeatureVideosContext)[slug];
}
