/**
 * Loom URL helpers. Admins paste a normal Loom *share* link
 * (https://www.loom.com/share/<id>); we render it as an embed
 * (https://www.loom.com/embed/<id>). Both share and embed links — with or
 * without query strings — are accepted, so paste whatever Loom hands you.
 */

/** Pull the 32-hex video id out of any Loom share/embed URL. */
export function loomVideoId(url: string): string | null {
  const m = url.match(/loom\.com\/(?:share|embed)\/([a-f0-9]{20,})/i);
  return m ? m[1] : null;
}

/** A loom.com share/embed URL we can turn into an iframe src, else null. */
export function isLoomUrl(url: string): boolean {
  return loomVideoId(url.trim()) !== null;
}

/** The iframe `src` for a Loom share/embed URL, or null if it isn't one. */
export function loomEmbedUrl(url: string): string | null {
  const id = loomVideoId(url.trim());
  return id ? `https://www.loom.com/embed/${id}` : null;
}
