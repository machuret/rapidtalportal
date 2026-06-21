"use client";

import { loomEmbedUrl } from "@/lib/loom";

/**
 * Responsive Loom video embed. Renders nothing for a URL that isn't a
 * recognisable Loom share/embed link, so a bad paste degrades gracefully.
 */
export function LoomEmbed({ url, title = "Tutorial video" }: { url: string; title?: string }) {
  const src = loomEmbedUrl(url);
  if (!src) return null;
  return (
    <div className="relative w-full aspect-video overflow-hidden rounded-lg border border-zinc-800 bg-black">
      <iframe
        src={src}
        title={title}
        allowFullScreen
        className="absolute inset-0 h-full w-full"
        allow="fullscreen"
      />
    </div>
  );
}
