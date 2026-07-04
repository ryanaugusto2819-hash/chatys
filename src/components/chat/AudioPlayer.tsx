import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SPEEDS = [1, 1.5, 2] as const;

interface Props {
  src: string;
  inverted?: boolean;
  failed?: boolean;
}

// Parse a Supabase Storage URL and return { bucket, path } when it points to a
// non-public bucket that needs a signed URL to be playable.
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    // .../storage/v1/object/{public|sign|authenticated}/{bucket}/{path}
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

// Buckets that are actually public — anything else needs a signed URL.
const PUBLIC_BUCKETS = new Set(["automation-media", "knowledge-base", "follow-up-images"]);

// Cache signed URLs across mounts so scrolling/re-render doesn't re-fetch them.
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const inflight = new Map<string, Promise<string | null>>();

async function getSignedUrl(bucket: string, path: string): Promise<string | null> {
  const key = `${bucket}/${path}`;
  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60)
    .then(({ data, error }) => {
      inflight.delete(key);
      if (error || !data?.signedUrl) {
        if (error) console.error("AudioPlayer signed URL error", error);
        return null;
      }
      signedUrlCache.set(key, { url: data.signedUrl, expiresAt: Date.now() + 60 * 60 * 1000 });
      return data.signedUrl;
    });
  inflight.set(key, p);
  return p;
}

export function AudioPlayer({ src, inverted, failed }: Props) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [speed, setSpeed] = useState<number>(1);
  const parsed = useMemo(() => parseStorageUrl(src), [src]);
  const needsSigned = !!(parsed && !PUBLIC_BUCKETS.has(parsed.bucket));
  const cachedInitial = needsSigned && parsed ? signedUrlCache.get(`${parsed.bucket}/${parsed.path}`)?.url : null;
  const [resolved, setResolved] = useState<string>(cachedInitial || (needsSigned ? "" : src));

  useEffect(() => {
    let cancelled = false;
    if (!needsSigned) {
      setResolved(src);
      return;
    }
    if (!parsed) return;
    const cached = signedUrlCache.get(`${parsed.bucket}/${parsed.path}`);
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      setResolved(cached.url);
      return;
    }
    getSignedUrl(parsed.bucket, parsed.path).then((url) => {
      if (!cancelled && url) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src, parsed, needsSigned]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
  }, [speed]);

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed as 1 | 1.5 | 2) + 1) % SPEEDS.length];
    setSpeed(next);
  };

  return (
    <div className={`mb-1.5 flex items-center gap-2 min-w-[220px] ${failed ? "opacity-50" : ""}`}>
      <audio
        ref={ref}
        controls
        preload="auto"
        className="w-full h-10 rounded-lg"
        style={{ filter: inverted ? "invert(1) hue-rotate(180deg)" : "none" }}
        onLoadedMetadata={(e) => {
          (e.currentTarget as HTMLAudioElement).playbackRate = speed;
        }}
        src={resolved || undefined}
      />

      <button
        type="button"
        onClick={cycleSpeed}
        title="Velocidade de reprodução"
        className="shrink-0 rounded-full bg-background/60 hover:bg-background border border-border text-foreground text-xs font-semibold px-2 py-1 min-w-[40px]"
      >
        {speed}x
      </button>
    </div>
  );
}
