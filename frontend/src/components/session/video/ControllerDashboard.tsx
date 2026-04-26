import { JoinRequestPanel } from '@/components/session/video/JoinRequestPanel';
import { ParticipantList } from '@/components/session/video/ParticipantList';
import { PermissionModal } from '@/components/session/video/PermissionModal';

interface ControllerDashboardProps {
  requestUserIds: string[];
  approvedUserIds: string[];
  resolveUserName: (userId: string) => string;
  highlightedRequesterId?: string;
  onApprove: (userId: string) => void;
  onReject: (userId: string) => void;
}

export function ControllerDashboard({
  requestUserIds,
  approvedUserIds,
  resolveUserName,
  highlightedRequesterId,
  onApprove,
  onReject,
}: ControllerDashboardProps) {
  return (
    <div className="space-y-3">
      <PermissionModal
        open={Boolean(highlightedRequesterId)}
        requesterName={highlightedRequesterId ? resolveUserName(highlightedRequesterId) : ''}
        onApprove={() => {
          if (!highlightedRequesterId) {
            return;
          }
          onApprove(highlightedRequesterId);
        }}
        onReject={() => {
          if (!highlightedRequesterId) {
            return;
          }
          onReject(highlightedRequesterId);
        }}
      />

      <JoinRequestPanel
        requestUserIds={requestUserIds}
        resolveUserName={resolveUserName}
        onApprove={onApprove}
        onReject={onReject}
      />

      <ParticipantList approvedUserIds={approvedUserIds} resolveUserName={resolveUserName} />
    </div>
  );
}
