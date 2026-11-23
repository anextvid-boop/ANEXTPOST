import { Agent } from 'undici';
import dns from 'node:dns';
import net from 'node:net';
import { isBlockedIp } from './webhook.url.validator';

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function isLocalEcosystemAllowed(hostnameOrIp: string): boolean {
  const normalized = hostnameOrIp.toLowerCase().replace(/^\[|\]$/g, '');
  const isLoopback = normalized === 'localhost' || LOOPBACK_IPS.has(normalized);
  if (!isLoopback) {
    return false;
  }
  if (process.env.ALLOW_LOCAL_WEBHOOK_TARGETS === 'true') {
    return true;
  }
  const allowlist = (process.env.WEBHOOK_ALLOWLIST_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return allowlist.some((origin) => {
    try {
      const host = new URL(origin).hostname.toLowerCase().replace(/^\[|\]$/g, '');
      return host === normalized || (host === 'localhost' && isLoopback);
    } catch {
      return false;
    }
  });
}

export function ssrfSafeLookup(hostname: string, options: any, callback: any) {
  if (net.isIP(hostname)) {
    const family = net.isIP(hostname);
    if (isBlockedIp(hostname) && !isLocalEcosystemAllowed(hostname)) {
      return callback(new Error('Blocked IP'), '', 0);
    }
    return options && (options as any).all
      ? callback(null, [{ address: hostname, family }] as any, family)
      : callback(null, hostname, family);
  }

  dns.lookup(hostname, options, (err, address: any, family: any) => {
    if (err) return callback(err, '', 0);
    if (Array.isArray(address)) {
      for (const entry of address) {
        if (isBlockedIp(entry.address) && !isLocalEcosystemAllowed(entry.address)) {
          return callback(new Error('Blocked IP'), '', 0);
        }
      }
      return callback(null, address as any, 0);
    }
    if (isBlockedIp(address) && !isLocalEcosystemAllowed(address)) {
      return callback(new Error('Blocked IP'), '', 0);
    }
    callback(null, address, family);
  });
}

// Pins DNS resolution: every resolved IP is checked with `isBlockedIp` and
// the caller (undici) connects to that same set. Closes the TOCTOU window
// `isSafePublicHttpsUrl` alone leaves open (see GHSA-f7jj-p389-4w45).
export const ssrfSafeDispatcher = new Agent({
  connect: {
    lookup: ssrfSafeLookup,
  },
});
