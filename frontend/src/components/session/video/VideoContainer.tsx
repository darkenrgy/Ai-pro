import type { VideoSessionMode } from '@/types/video';
import { StreamPlayer } from '@/components/session/video/StreamPlayer';
import { VideoTile } from '@/components/session/video/VideoTile';

interface RemoteTile {
  userId: string;
  stream: MediaStream;
}

interface VideoContainerProps {
  sessionMode: VideoSessionMode;
  localStream: MediaStream | null;
  remoteTiles: RemoteTile[];
  showLocalPublisher: boolean;
  resolveUserName: (userId: string) => string;
  selfUserId?: string;
  muted: boolean;
  cameraOff: boolean;
  screenSharing: boolean;
}

export function VideoContainer({
  sessionMode,
  localStream,
  remoteTiles,
  showLocalPublisher,
  resolveUserName,
  selfUserId,
  muted,
  cameraOff,
  screenSharing,
}: VideoContainerProps) {
  if (!localStream && remoteTiles.length === 0) {
    return null;
  }

  const primaryRemote = remoteTiles[0];

  return (
    <div className="mt-4 space-y-3">
      {sessionMode === 'stream' ? (
        <StreamPlayer
          title={primaryRemote ? resolveUserName(primaryRemote.userId) : resolveUserName(selfUserId ?? '')}
          subtitle={primaryRemote ? 'Live stream feed' : 'Broadcast preview'}
          stream={primaryRemote?.stream ?? localStream ?? undefined}
          muted={!primaryRemote}
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {localStream && showLocalPublisher ? (
          <VideoTile
            label={resolveUserName(selfUserId ?? '')}
            stream={localStream}
            isLocal={true}
            muted={true}
            status={screenSharing ? 'sharing' : cameraOff ? 'camera off' : muted ? 'muted' : 'live'}
          />
        ) : null}

        {remoteTiles.map((tile) => (
          <VideoTile key={tile.userId} label={resolveUserName(tile.userId)} stream={tile.stream} status={'live'} />
        ))}
      </div>
    </div>
  );
}
