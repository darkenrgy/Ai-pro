import { useEffect, useRef } from 'react';

interface VideoTileProps {
  label: string;
  stream?: MediaStream;
  isLocal?: boolean;
  muted?: boolean;
  status: string;
}

export function VideoTile({ label, stream, isLocal = false, muted = false, status }: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    videoRef.current.srcObject = stream ?? null;
    if (stream) {
      void videoRef.current.play().catch(() => {
        // Autoplay can be blocked by browser policy; user interaction will resume playback.
      });
    }
  }, [stream]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="h-48 w-full bg-slate-950 object-cover"
      />
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-slate-950/90 to-transparent px-3 py-2 text-xs text-slate-200">
        <span className="font-medium">{label}{isLocal ? ' (you)' : ''}</span>
        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5">{status}</span>
      </div>
    </div>
  );
}
