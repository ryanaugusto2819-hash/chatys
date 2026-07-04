import { supabase } from "@/integrations/supabase/client";

// Buckets that are actually public — anything else needs a signed URL.
const PUBLIC_BUCKETS = new Set(["automation-media", "knowledge-base", "follow-up-images"]);

export function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

export function needsSignedUrl(url: string): boolean {
  const parsed = parseStorageUrl(url);
  return !!(parsed && !PUBLIC_BUCKETS.has(parsed.bucket));
}

const cache = new Map<string, { url: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string | null>>();

export async function getSignedMediaUrl(bucket: string, path: string): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60)
    .then(({ data, error }) => {
      inflight.delete(key);
      if (error || !data?.signedUrl) {
        if (error) console.error("getSignedMediaUrl error", error);
        return null;
      }
      cache.set(key, { url: data.signedUrl, expiresAt: Date.now() + 60 * 60 * 1000 });
      return data.signedUrl;
    });
  inflight.set(key, p);
  return p;
}

export function getCachedSignedUrl(bucket: string, path: string): string | null {
  const cached = cache.get(`${bucket}/${path}`);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  return null;
}
