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

export function DocumentBubble({ url, content, isAgent, failed }: { url: string; content?: string; isAgent: boolean; failed?: boolean }) {
  const open = useMediaOpener();
  return (
    <div
      className={`mb-1.5 flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border ${isAgent ? 'border-primary-foreground/20 bg-primary-foreground/10' : 'border-border bg-muted/50'} ${failed ? 'opacity-50' : ''}`}
      onClick={() => open(url)}
    >
      <span className="text-2xl">📄</span>
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">{content || 'Documento'}</span>
        <span className="text-[10px] opacity-60">Clique para abrir</span>
      </div>
    </div>
  );
}
