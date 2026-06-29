import { useEffect, useRef, useState } from "react";

const SPEEDS = [1, 1.5, 2] as const;

interface Props {
  src: string;
  inverted?: boolean;
  failed?: boolean;
}

export function AudioPlayer({ src, inverted, failed }: Props) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [speed, setSpeed] = useState<number>(1);

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
        preload="metadata"
        className="w-full h-10 rounded-lg"
        style={{ filter: inverted ? "invert(1) hue-rotate(180deg)" : "none" }}
        onLoadedMetadata={(e) => {
          (e.currentTarget as HTMLAudioElement).playbackRate = speed;
        }}
      >
        <source src={src} />
      </audio>
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
