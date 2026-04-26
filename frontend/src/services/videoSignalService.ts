const DEV_VIDEO_WEBSOCKET_URL = '/ws/video';

export const VIDEO_WEBSOCKET_URL =
  import.meta.env.VITE_VIDEO_WEBSOCKET_URL ?? (import.meta.env.DEV ? DEV_VIDEO_WEBSOCKET_URL : '/ws/video');

export const VIDEO_SIGNAL_DESTINATIONS = {
  startCall: '/app/video/start-call',
  startStream: '/app/video/start-stream',
  syncState: '/app/video/sync-state',
  joinRequest: '/app/video/join-request',
  joinStream: '/app/video/join-stream',
  approveUser: '/app/video/approve-user',
  rejectUser: '/app/video/reject-user',
  toggleMedia: '/app/video/toggle-media',
  removeUser: '/app/video/remove-user',
  offer: '/app/video/offer',
  answer: '/app/video/answer',
  iceCandidate: '/app/video/ice-candidate',
  endCall: '/app/video/end-call',
  endStream: '/app/video/end-stream',
} as const;
