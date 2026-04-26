import { useEffect, useRef } from 'react';

interface StreamPlayerProps {
  title: string;
  subtitle: string;
  stream?: MediaStream;
  muted?: boolean;
}

export function StreamPlayer({ title, subtitle, stream, muted = false }: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }
    videoRef.current.srcObject = stream ?? null;
    if (stream) {
      void videoRef.current.play().catch(() => {
        // Autoplay may require a prior user gesture in some browsers.
      });
    }
  }, [stream]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/90">
      <video ref={videoRef} autoPlay playsInline muted={muted} className="h-72 w-full bg-slate-950 object-cover md:h-96" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/95 to-transparent px-4 py-3">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-slate-300">{subtitle}</p>
      </div>
    </div>
  );
}
