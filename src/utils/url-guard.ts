/**
 * URL safety guard for SSRF prevention.
 *
 * Blocks HTTP requests to private / loopback / link-local / metadata
 * addresses unless the user explicitly opts out via
 * `DIRGHA_ALLOW_PRIVATE_FETCH=1`.
 *
 * Only checks literal hostnames and IP strings — no DNS resolution
 * (sync, dependency-free).
 */

const LOCAL_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "127.1",
  "[::1]",
]);

/**
 * Parse the hostname from a URL string. Returns null on parse failure.
 */
function parseHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Return the first octet of an IPv4 address string, or -1.
 */
function firstOctet(ip: string): number {
  const dot = ip.indexOf(".");
  if (dot === -1) return -1;
  const octet = Number.parseInt(ip.slice(0, dot), 10);
  return Number.isFinite(octet) ? octet : -1;
}

/**
 * Returns one of: "loopback", "linklocal", "rfc1918", "zero", null.
 */
function classifyIp(hostname: string): string | null {
  // IPv6
  if (hostname.startsWith("[")) {
    const inner = hostname.slice(1, -1);
    if (inner === "::1") return "loopback";
    if (inner.startsWith("fe80:")) return "linklocal";
    return null;
  }
  if (hostname.includes(":")) return null; // other IPv6, leave alone

  // IPv4
  const first = firstOctet(hostname);
  if (first < 0) return null;

  // 0.0.0.0/8 (0.x.x.x)
  if (first === 0) return "zero";

  // 10.0.0.0/8
  if (first === 10) return "rfc1918";

  // 127.0.0.0/8
  if (first === 127) return "loopback";

  // 169.254.0.0/16
  if (first === 169 && hostname.split(".").length >= 2) {
    const second = Number.parseInt(hostname.split(".")[1], 10);
    if (second === 254) return "linklocal";
  }

  // 172.16.0.0/12
  if (first === 172 && hostname.split(".").length >= 2) {
    const second = Number.parseInt(hostname.split(".")[1], 10);
    if (second >= 16 && second <= 31) return "rfc1918";
  }

  // 192.168.0.0/16
  if (first === 192 && hostname.split(".").length >= 2) {
    const second = Number.parseInt(hostname.split(".")[1], 10);
    if (second === 168) return "rfc1918";
  }

  return null;
}

/**
 * Throw if `url` resolves to a private / loopback / link-local / metadata
 * address. Checks the literal hostname only (no DNS). Opt out with
 * DIRGHA_ALLOW_PRIVATE_FETCH=1.
 *
 * @throws Error if the URL targets a blocked address.
 */
export function assertSafeFetchUrl(url: string): void {
  if (process.env.DIRGHA_ALLOW_PRIVATE_FETCH === "1") return;

  const hostname = parseHostname(url);
  if (hostname === null) {
    throw new Error(`SSRF guard: cannot parse URL "${url}"`);
  }

  // Check scheme — only http/https allowed for outbound fetch
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(
        `SSRF guard: blocked non-http(s) scheme "${parsed.protocol}" in URL "${url}"`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("SSRF guard")) throw err;
    throw new Error(`SSRF guard: invalid URL "${url}"`);
  }

  // Check well-known hostnames
  if (LOCAL_HOSTNAMES.has(hostname.toLowerCase())) {
    throw new Error(
      `SSRF guard: blocked fetch to loopback address "${hostname}" (set DIRGHA_ALLOW_PRIVATE_FETCH=1 to override)`,
    );
  }

  // Check IP ranges
  const classification = classifyIp(hostname);
  if (classification !== null) {
    const labels: Record<string, string> = {
      loopback: "loopback",
      linklocal: "link-local",
      rfc1918: "private (RFC1918)",
      zero: "zero-config (0.0.0.0/8)",
    };
    throw new Error(
      `SSRF guard: blocked fetch to ${labels[classification] ?? classification} address "${hostname}" (set DIRGHA_ALLOW_PRIVATE_FETCH=1 to override)`,
    );
  }
}
