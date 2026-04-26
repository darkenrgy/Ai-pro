import type { VideoParticipantRole } from '@/types/video';
import { BroadcasterPanel } from '@/components/session/video/BroadcasterPanel';

interface ControllerPanelProps {
  requestUserIds: string[];
  approvedUserIds: string[];
  resolveUserName: (userId: string) => string;
  highlightedRequesterId?: string;
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
  onPromote: (userId: string) => void;
  onDemote: (userId: string) => void;
  onAllowScreenShare: (userId: string, enabled: boolean) => void;
  onRemove: (userId: string) => void;
  roleByUserId: Record<string, VideoParticipantRole>;
  screenPermissionByUser: Record<string, boolean>;
}

export function ControllerPanel(props: ControllerPanelProps) {
  return <BroadcasterPanel {...props} />;
}
