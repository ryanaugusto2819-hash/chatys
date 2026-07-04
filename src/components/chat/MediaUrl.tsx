import { useEffect, useMemo, useState } from "react";
import { getCachedSignedUrl, getSignedMediaUrl, needsSignedUrl, parseStorageUrl } from "@/lib/mediaUrl";

export function useResolvedMediaUrl(src: string | null | undefined): string {
  const parsed = useMemo(() => (src ? parseStorageUrl(src) : null), [src]);
  const signed = !!src && needsSignedUrl(src);
  const initial = signed && parsed ? getCachedSignedUrl(parsed.bucket, parsed.path) : null;
  const [resolved, setResolved] = useState<string>(initial || (signed ? "" : src || ""));

  useEffect(() => {
    let cancelled = false;
    if (!src) return setResolved("");
    if (!signed) return setResolved(src);
    if (!parsed) return;
    const cached = getCachedSignedUrl(parsed.bucket, parsed.path);
    if (cached) return setResolved(cached);
    getSignedMediaUrl(parsed.bucket, parsed.path).then((url) => {
      if (!cancelled && url) setResolved(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src, signed, parsed]);

  return resolved;
}

export function MediaImage({
  src,
  alt,
  className,
  onClick,
}: {
  src: string;
  alt?: string;
  className?: string;
  onClick?: (resolved: string) => void;
}) {
  const resolved = useResolvedMediaUrl(src);
  return (
    <img
      src={resolved || undefined}
      alt={alt}
      className={className}
      loading="lazy"
      onClick={() => resolved && onClick?.(resolved)}
    />
  );
}

export function MediaVideo({ src, className }: { src: string; className?: string }) {
  const resolved = useResolvedMediaUrl(src);
  return (
    <video controls preload="metadata" className={className} src={resolved || undefined} />
  );
}

export function useMediaOpener() {
  return async (src: string) => {
    const parsed = parseStorageUrl(src);
    if (parsed && needsSignedUrl(src)) {
      const url = await getSignedMediaUrl(parsed.bucket, parsed.path);
      if (url) return window.open(url, "_blank");
    }
    window.open(src, "_blank");
  };
}
