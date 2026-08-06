/**
 * Shared SSRF URL guard. `isBlockedUrl(raw)` returns true when a user-supplied
 * URL should be refused as a fetch target: anything that isn't plain https, or
 * that resolves — by literal form — to a private / loopback / link-local /
 * CGNAT address. It hardens the naive dotted-quad regex the routes used to
 * inline by also catching bracketed IPv6, IPv6 loopback/link-local/ULA,
 * IPv4-mapped IPv6, and decimal/octal/hex-encoded IPv4.
 *
 * It cannot defeat DNS rebinding (that needs resolve-then-pin at fetch time);
 * today every caller hands the URL to an external fetcher (Firecrawl/Apify), so
 * the server never connects to the target itself — this is defense-in-depth,
 * applied uniformly so no single route drifts.
 */

type Quad = [number, number, number, number];

function isPrivateIpv4(a: number, b: number, c: number, d: number): boolean {
  if ([a, b, c, d].some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // malformed → block
  if (a === 0 || a === 127) return true; // this-host / loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 255 && b === 255 && c === 255 && d === 255) return true; // broadcast
  return false;
}

/** Parse an IPv4 in dotted / decimal / octal / hex forms → [a,b,c,d] or null. */
function parseIpv4(host: string): Quad | null {
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) return null;
  const nums = parts.map((p) => {
    if (/^0x[0-9a-f]+$/i.test(p)) return parseInt(p, 16);
    if (/^0[0-7]+$/.test(p)) return parseInt(p, 8);
    if (/^\d+$/.test(p)) return parseInt(p, 10);
    return NaN;
  });
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null;
  const n = nums.length;
  // Leading parts (all but the packed tail) must each fit in a byte.
  if (nums.slice(0, n - 1).some((x) => x > 255)) return null;
  let value: number;
  if (n === 1) value = nums[0];
  else if (n === 2) value = nums[0] * 2 ** 24 + nums[1];
  else if (n === 3) value = nums[0] * 2 ** 24 + nums[1] * 2 ** 16 + nums[2];
  else value = nums[0] * 2 ** 24 + nums[1] * 2 ** 16 + nums[2] * 2 ** 8 + nums[3];
  if (value < 0 || value > 0xffffffff) return null;
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").replace(/%.*$/, "").toLowerCase();
  if (h === "::1" || h === "::" || h === "0:0:0:0:0:0:0:1") return true; // loopback / unspecified
  if (/^fe80/.test(h)) return true; // link-local
  if (/^f[cd]/.test(h)) return true; // unique local fc00::/7
  // IPv4-mapped IPv6. The URL parser may serialize the tail either as dotted
  // (::ffff:169.254.169.254) or as two hex hextets (::ffff:a9fe:a9fe).
  if (h.startsWith("::ffff:")) {
    const rest = h.slice("::ffff:".length);
    const dotted = /^\d{1,3}(?:\.\d{1,3}){3}$/.exec(rest);
    if (dotted) {
      const quad = parseIpv4(rest);
      return quad ? isPrivateIpv4(quad[0], quad[1], quad[2], quad[3]) : true;
    }
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(rest);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateIpv4((hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff);
    }
    return true; // unrecognised mapped form → block
  }
  return false;
}

export function isBlockedUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return true;
  }
  if (parsed.protocol !== "https:") return true;
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  // URL.hostname returns IPv6 literals bracketed, e.g. "[::1]".
  if (host.startsWith("[") || host.includes(":")) return isPrivateIpv6(host);
  const quad = parseIpv4(host);
  if (quad) return isPrivateIpv4(quad[0], quad[1], quad[2], quad[3]);
  return false; // ordinary DNS hostname — literal check only (no resolution here)
}
