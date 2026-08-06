/**
 * @jest-environment node
 *
 * SSRF guard — proves the shared helper blocks the encodings the old per-route
 * dotted-quad regex missed (bracketed IPv6, IPv4-mapped IPv6, numeric IPv4),
 * while still allowing ordinary public https hosts.
 */
import { isBlockedUrl } from "@/lib/security/ssrf";

describe("isBlockedUrl", () => {
  const blocked = [
    "http://example.com", // not https
    "ftp://example.com",
    "https://localhost",
    "https://app.localhost",
    "https://127.0.0.1",
    "https://10.1.2.3",
    "https://172.16.5.5",
    "https://192.168.0.1",
    "https://169.254.169.254", // cloud metadata
    "https://100.64.1.1", // CGNAT
    "https://2130706433", // decimal form of 127.0.0.1
    "https://0x7f000001", // hex form of 127.0.0.1
    "https://[::1]", // ipv6 loopback (bracketed)
    "https://[fe80::1]", // ipv6 link-local
    "https://[fc00::1]", // ipv6 unique-local
    "https://[::ffff:169.254.169.254]", // ipv4-mapped ipv6 metadata
    "not a url",
  ];
  const allowed = [
    "https://example.com",
    "https://sub.example.com/path?q=1",
    "https://8.8.8.8",
    "https://1.2.3.4",
    "https://172.15.0.1", // just outside the 172.16–31 private range
  ];

  test.each(blocked)("blocks %s", (url) => expect(isBlockedUrl(url)).toBe(true));
  test.each(allowed)("allows %s", (url) => expect(isBlockedUrl(url)).toBe(false));
});
