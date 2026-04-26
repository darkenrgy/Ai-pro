import { useEffect, useMemo, useRef, useState } from 'react';
import { Client, type IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuthStore } from '@/store/authStore';
import { VIDEO_SIGNAL_DESTINATIONS, VIDEO_WEBSOCKET_URL } from '@/services/videoSignalService';
import type {
  VideoCallState,
  VideoParticipantRole,
  VideoSessionMode,
  VideoSignalMessage,
  VideoSignalRequest,
} from '@/types/video';
import { ControllerPanel } from '@/components/session/video/ControllerPanel';
import { JoinButton } from '@/components/session/video/JoinButton';
import { MediaControls } from '@/components/session/video/MediaControls';
import { VideoContainer } from '@/components/session/video/VideoContainer';
import { ViewerPanel } from '@/components/session/video/ViewerPanel';
import { WaitingScreen } from '@/components/session/video/WaitingScreen';

interface VideoParticipant {
  id: string;
  name: string;
}

interface VideoCallContainerProps {
  sessionId?: string;
  permissionGranted: boolean;
  participants: VideoParticipant[];
}

interface PendingSignal {
  destination: string;
  payload: VideoSignalRequest;
}

const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const toDisplayName = (userId: string, participants: VideoParticipant[], selfId?: string, selfName?: string) => {
  if (selfId && userId === selfId) {
    return selfName ?? 'You';
  }
  return participants.find((participant) => participant.id === userId)?.name ?? `User ${userId.slice(0, 8)}`;
};

export function VideoCallContainer({ sessionId, permissionGranted, participants }: VideoCallContainerProps) {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const hydrated = useAuthStore((state) => state.hydrated);

  const [callState, setCallState] = useState<VideoCallState>('idle');
  const [callActive, setCallActive] = useState(false);
  const [sessionMode, setSessionMode] = useState<VideoSessionMode>('call');
  const [isController, setIsController] = useState(false);
  const [controllerId, setControllerId] = useState<string | null>(null);
  const [pendingRequestUserIds, setPendingRequestUserIds] = useState<string[]>([]);
  const [approvedUserIds, setApprovedUserIds] = useState<string[]>([]);
  const [roleByUserId, setRoleByUserId] = useState<Record<string, VideoParticipantRole>>({});
  const [allowedScreenShareUserIds, setAllowedScreenShareUserIds] = useState<string[]>([]);
  const [highlightedRequesterId, setHighlightedRequesterId] = useState<string>('');
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(0);
  const [error, setError] = useState('');
  const [signalingConnected, setSignalingConnected] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(true);
  const [diagnosticsTick, setDiagnosticsTick] = useState(0);

  const clientRef = useRef<Client | null>(null);
  const pendingSignalsRef = useRef<PendingSignal[]>([]);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const iceQueuedCountRef = useRef<Map<string, number>>(new Map());
  const iceAppliedCountRef = useRef<Map<string, number>>(new Map());
  const disconnectTimersRef = useRef<Map<string, number>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const originalCameraTrackRef = useRef<MediaStreamTrack | null>(null);

  const bumpDiagnostics = () => {
    setDiagnosticsTick((current) => current + 1);
  };

  const resolveUserName = (userId: string) => toDisplayName(userId, participants, user?.id, user?.name);
  const selfRole: VideoParticipantRole = roleByUserId[user?.id ?? ''] ?? (isController ? 'speaker' : 'viewer');
  const isApproved = Boolean(user?.id && approvedUserIds.includes(user.id));

  const screenPermissionByUser = useMemo(
    () => Object.fromEntries(allowedScreenShareUserIds.map((id) => [id, true])),
    [allowedScreenShareUserIds]
  );

  const canPublish = useMemo(() => {
    if (!callActive || !isApproved) {
      return false;
    }
    if (sessionMode === 'call') {
      return true;
    }
    return selfRole === 'speaker' || isController;
  }, [callActive, isApproved, isController, selfRole, sessionMode]);

  const canShareScreen = useMemo(() => {
    if (!canPublish) {
      return false;
    }
    if (sessionMode === 'call') {
      return true;
    }
    return Boolean(user?.id && allowedScreenShareUserIds.includes(user.id));
  }, [allowedScreenShareUserIds, canPublish, sessionMode, user?.id]);

  useEffect(() => {
    if (!retryAfterSeconds) {
      return;
    }
    const timer = window.setInterval(() => {
      setRetryAfterSeconds((current) => (current > 1 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAfterSeconds]);

  useEffect(() => {
    if (callState !== 'waiting') {
      return;
    }

    const timeoutHandle = window.setTimeout(() => {
      setCallState('rejected');
      setRetryAfterSeconds(5);
      setError('Join request timed out. Please retry.');
    }, 45000);

    return () => {
      window.clearTimeout(timeoutHandle);
    };
  }, [callState]);

  const sendSignal = (destination: string, payload: VideoSignalRequest) => {
    const client = clientRef.current;

    const shouldQueue =
      destination === VIDEO_SIGNAL_DESTINATIONS.startCall ||
      destination === VIDEO_SIGNAL_DESTINATIONS.startStream ||
      destination === VIDEO_SIGNAL_DESTINATIONS.joinRequest ||
      destination === VIDEO_SIGNAL_DESTINATIONS.joinStream ||
      destination === VIDEO_SIGNAL_DESTINATIONS.approveUser ||
      destination === VIDEO_SIGNAL_DESTINATIONS.rejectUser;

    const publishNow = () => {
      if (!client?.connected) {
        return false;
      }

      try {
        client.publish({ destination, body: JSON.stringify(payload) });
        return true;
      } catch {
        return false;
      }
    };

    if (publishNow()) {
      return;
    }

    if (shouldQueue) {
      pendingSignalsRef.current.push({ destination, payload });
      if (pendingSignalsRef.current.length > 40) {
        pendingSignalsRef.current.shift();
      }
      setError('Video signaling is still connecting. Action queued.');
      return;
    }

    setError('Video signaling is disconnected.');
  };

  const stopLocalStream = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setMuted(false);
    setCameraOff(false);
    setScreenSharing(false);
    originalCameraTrackRef.current = null;
  };

  const closeAllPeerConnections = () => {
    disconnectTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    disconnectTimersRef.current.clear();
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();
    iceQueuedCountRef.current.clear();
    iceAppliedCountRef.current.clear();
    setRemoteStreams({});
    bumpDiagnostics();
  };

  const resetCallState = () => {
    closeAllPeerConnections();
    stopLocalStream();
    setCallState('idle');
    setCallActive(false);
    setSessionMode('call');
    setIsController(false);
    setControllerId(null);
    setPendingRequestUserIds([]);
    setApprovedUserIds([]);
    setRoleByUserId({});
    setAllowedScreenShareUserIds([]);
    setHighlightedRequesterId('');
    setRetryAfterSeconds(0);
  };

  const ensureLocalMedia = async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  };

  const removeRemoteParticipant = (remoteUserId: string) => {
    const pendingTimer = disconnectTimersRef.current.get(remoteUserId);
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
      disconnectTimersRef.current.delete(remoteUserId);
    }

    const current = peerConnectionsRef.current.get(remoteUserId);
    if (current) {
      current.close();
      peerConnectionsRef.current.delete(remoteUserId);
    }
    pendingIceCandidatesRef.current.delete(remoteUserId);
    iceQueuedCountRef.current.delete(remoteUserId);
    iceAppliedCountRef.current.delete(remoteUserId);
    setRemoteStreams((existing) => {
      if (!existing[remoteUserId]) {
        return existing;
      }
      const next = { ...existing };
      delete next[remoteUserId];
      return next;
    });
    bumpDiagnostics();
  };

  const queueIceCandidate = (remoteUserId: string, candidate: RTCIceCandidateInit) => {
    const queued = pendingIceCandidatesRef.current.get(remoteUserId) ?? [];
    queued.push(candidate);
    pendingIceCandidatesRef.current.set(remoteUserId, queued);
    const totalQueued = iceQueuedCountRef.current.get(remoteUserId) ?? 0;
    iceQueuedCountRef.current.set(remoteUserId, totalQueued + 1);
    bumpDiagnostics();
  };

  const flushQueuedIceCandidates = async (remoteUserId: string, pc: RTCPeerConnection) => {
    if (!pc.remoteDescription) {
      return;
    }

    const queued = pendingIceCandidatesRef.current.get(remoteUserId);
    if (!queued || queued.length === 0) {
      return;
    }

    pendingIceCandidatesRef.current.delete(remoteUserId);
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        const totalApplied = iceAppliedCountRef.current.get(remoteUserId) ?? 0;
        iceAppliedCountRef.current.set(remoteUserId, totalApplied + 1);
      } catch {
        // Ignore stale candidates; a fresh offer/answer exchange will re-sync.
      }
    }
    bumpDiagnostics();
  };

  const createPeerConnection = async (remoteUserId: string, attachLocalTracks: boolean) => {
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing) {
      return existing;
    }

    const pc = new RTCPeerConnection(rtcConfig);

    if (attachLocalTracks) {
      const stream = await ensureLocalMedia();
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    pc.onicecandidate = (event) => {
      if (!event.candidate || !sessionId) {
        return;
      }
      sendSignal(VIDEO_SIGNAL_DESTINATIONS.iceCandidate, {
        sessionId,
        targetUserId: remoteUserId,
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid ?? undefined,
        sdpMLineIndex: event.candidate.sdpMLineIndex ?? undefined,
      });
    };

    pc.ontrack = (event) => {
      const [streamEvent] = event.streams;
      if (streamEvent) {
        setRemoteStreams((existing) => ({ ...existing, [remoteUserId]: streamEvent }));
        setCallState('connected');
        bumpDiagnostics();
        return;
      }

      setRemoteStreams((existing) => {
        const current = existing[remoteUserId];
        if (current) {
          const alreadyPresent = current.getTracks().some((track) => track.id === event.track.id);
          if (!alreadyPresent) {
            current.addTrack(event.track);
          }
          return { ...existing, [remoteUserId]: current };
        }

        return { ...existing, [remoteUserId]: new MediaStream([event.track]) };
      });
      setCallState('connected');
      bumpDiagnostics();
    };

    pc.oniceconnectionstatechange = () => {
      bumpDiagnostics();
    };

    pc.onsignalingstatechange = () => {
      bumpDiagnostics();
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      bumpDiagnostics();

      if (state === 'connected') {
        const pendingTimer = disconnectTimersRef.current.get(remoteUserId);
        if (pendingTimer !== undefined) {
          window.clearTimeout(pendingTimer);
          disconnectTimersRef.current.delete(remoteUserId);
        }
        setCallState('connected');
        return;
      }

      if (state === 'disconnected') {
        if (disconnectTimersRef.current.has(remoteUserId)) {
          return;
        }

        const timerId = window.setTimeout(() => {
          const latestPc = peerConnectionsRef.current.get(remoteUserId);
          if (!latestPc) {
            disconnectTimersRef.current.delete(remoteUserId);
            return;
          }

          if (latestPc.connectionState === 'disconnected' || latestPc.connectionState === 'failed') {
            removeRemoteParticipant(remoteUserId);
          } else {
            disconnectTimersRef.current.delete(remoteUserId);
          }
        }, 8000);

        disconnectTimersRef.current.set(remoteUserId, timerId);
        return;
      }

      if (state === 'failed' || state === 'closed') {
        removeRemoteParticipant(remoteUserId);
      }
    };

    peerConnectionsRef.current.set(remoteUserId, pc);
    bumpDiagnostics();
    return pc;
  };

  const createAndSendOffer = async (remoteUserId: string) => {
    if (!sessionId) {
      return;
    }
    const attachLocalTracks = canPublish || sessionMode === 'call' || selfRole === 'speaker';
    const pc = await createPeerConnection(remoteUserId, attachLocalTracks);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    sendSignal(VIDEO_SIGNAL_DESTINATIONS.offer, {
      sessionId,
      targetUserId: remoteUserId,
      sdp: offer.sdp ?? '',
    });
  };

  const shouldInitiateOffer = (selfId: string, remoteId: string, mode: VideoSessionMode, role: VideoParticipantRole) => {
    if (mode === 'call') {
      return selfId.localeCompare(remoteId) < 0;
    }
    return role === 'speaker' && selfId !== remoteId;
  };

  useEffect(() => {
    if (!sessionId || !user?.id || !callActive || !isApproved || !signalingConnected) {
      return;
    }

    const mode = sessionMode;
    const role = selfRole;
    const canInitiate = mode === 'call' || role === 'speaker';
    if (!canInitiate) {
      return;
    }

    for (const participantId of approvedUserIds) {
      if (participantId === user.id) {
        continue;
      }
      if (peerConnectionsRef.current.has(participantId)) {
        continue;
      }
      if (!shouldInitiateOffer(user.id, participantId, mode, role)) {
        continue;
      }

      void createAndSendOffer(participantId);
    }
  }, [approvedUserIds, callActive, isApproved, selfRole, sessionId, sessionMode, signalingConnected, user?.id]);

  const applySessionStateFromMessage = (message: VideoSignalMessage) => {
    if (message.controllerId !== undefined) {
      setControllerId(message.controllerId ?? null);
      setIsController(message.controllerId === user?.id);
    }
    if (message.mode) {
      setSessionMode(message.mode);
    }
    if (message.pendingRequestUserIds) {
      setPendingRequestUserIds(message.pendingRequestUserIds);
    }
    if (message.approvedUserIds) {
      setApprovedUserIds(message.approvedUserIds);
      setCallActive(message.approvedUserIds.length > 0);
    }
    if (message.participantRoles) {
      setRoleByUserId(message.participantRoles);
    }
    if (message.allowedScreenShareUserIds) {
      setAllowedScreenShareUserIds(message.allowedScreenShareUserIds);
    }
  };

  const handleSignalMessage = (raw: string) => {
    void (async () => {
      let message: VideoSignalMessage;
      try {
        message = JSON.parse(raw) as VideoSignalMessage;
      } catch {
        return;
      }

      if (!sessionId || message.sessionId !== sessionId) {
        return;
      }

      if (message.type === 'call-started' || message.type === 'stream-started') {
        applySessionStateFromMessage(message);
        setCallActive(true);
        if (message.controllerId === user?.id) {
          setCallState('connected');
        } else {
          setCallState('idle');
        }
        return;
      }

      if (message.type === 'controller-state' || message.type === 'state-updated') {
        applySessionStateFromMessage(message);

        const currentUserId = user?.id;
        if (currentUserId && (message.approvedUserIds ?? []).includes(currentUserId)) {
          const effectiveMode = message.mode ?? sessionMode;
          const effectiveRole = (message.participantRoles?.[currentUserId] ?? selfRole) as VideoParticipantRole;

          if (callState === 'idle' || callState === 'waiting' || callState === 'rejected') {
            if (effectiveRole === 'speaker' || effectiveMode === 'call') {
              await ensureLocalMedia();
            }
            setCallState('connecting');
          }
        }
        return;
      }

      if (message.type === 'join-request') {
        applySessionStateFromMessage(message);
        const userIsController = message.controllerId === user?.id;
        if (!userIsController || !message.fromUserId) {
          return;
        }
        setHighlightedRequesterId(message.fromUserId);
        return;
      }

      if (message.type === 'waiting') {
        if (callState === 'approved' || callState === 'connecting' || callState === 'connected') {
          return;
        }
        applySessionStateFromMessage(message);
        setCallState('waiting');
        return;
      }

      if (message.type === 'approved') {
        applySessionStateFromMessage(message);
        setCallActive(true);
        setCallState('approved');
        if ((message.role ?? selfRole) === 'speaker' || sessionMode === 'call') {
          await ensureLocalMedia();
        }
        setCallState('connecting');
        return;
      }

      if (message.type === 'rejected') {
        setCallState('rejected');
        setRetryAfterSeconds(message.retryAfterSeconds ?? 0);
        return;
      }

      if (message.type === 'removed-user') {
        resetCallState();
        setCallState('ended');
        return;
      }

      if (message.type === 'user-joined') {
        applySessionStateFromMessage(message);

        if (!user?.id || !(message.approvedUserIds ?? []).includes(user.id)) {
          return;
        }

        const joinedUserId = message.fromUserId;
        if (!joinedUserId) {
          return;
        }

        const mode = message.mode ?? sessionMode;
        const role = (message.participantRoles?.[user.id] ?? selfRole) as VideoParticipantRole;

        if (joinedUserId === user.id) {
          for (const participantId of message.approvedUserIds ?? []) {
            if (participantId === user.id) {
              continue;
            }
            if (shouldInitiateOffer(user.id, participantId, mode, role)) {
              await createAndSendOffer(participantId);
            }
          }
          return;
        }

        if (shouldInitiateOffer(user.id, joinedUserId, mode, role)) {
          await createAndSendOffer(joinedUserId);
        }
        return;
      }

      if (message.type === 'offer') {
        if (!message.fromUserId || !message.sdp) {
          return;
        }

        const modeForMessage = message.mode ?? sessionMode;
        const attachLocalTracks = canPublish || modeForMessage === 'call' || selfRole === 'speaker';
        const pc = await createPeerConnection(message.fromUserId, attachLocalTracks);
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: message.sdp }));
        await flushQueuedIceCandidates(message.fromUserId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        sendSignal(VIDEO_SIGNAL_DESTINATIONS.answer, {
          sessionId,
          targetUserId: message.fromUserId,
          sdp: answer.sdp ?? '',
        });
        return;
      }

      if (message.type === 'answer') {
        if (!message.fromUserId || !message.sdp) {
          return;
        }

        const pc = peerConnectionsRef.current.get(message.fromUserId);
        if (!pc) {
          return;
        }

        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: message.sdp }));
        await flushQueuedIceCandidates(message.fromUserId, pc);
        return;
      }

      if (message.type === 'ice-candidate') {
        if (!message.fromUserId || !message.candidate) {
          return;
        }

        const candidate: RTCIceCandidateInit = {
          candidate: message.candidate,
          sdpMid: message.sdpMid ?? undefined,
          sdpMLineIndex: message.sdpMLineIndex ?? undefined,
        };

        const pc = peerConnectionsRef.current.get(message.fromUserId);
        if (!pc) {
          queueIceCandidate(message.fromUserId, candidate);
          return;
        }

        if (!pc.remoteDescription) {
          queueIceCandidate(message.fromUserId, candidate);
          return;
        }

        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        const totalApplied = iceAppliedCountRef.current.get(message.fromUserId) ?? 0;
        iceAppliedCountRef.current.set(message.fromUserId, totalApplied + 1);
        bumpDiagnostics();
        return;
      }

      if (message.type === 'media-updated') {
        if (message.affectedUserId !== user?.id) {
          return;
        }
        if (message.mediaType === 'audio') {
          setMuted(message.enabled === false);
        }
        if (message.mediaType === 'video') {
          setCameraOff(message.enabled === false);
        }
        return;
      }

      if (message.type === 'end-call' || message.type === 'end-stream') {
        resetCallState();
      }
    })().catch(() => {
      setError('Video signaling error occurred.');
    });
  };

  useEffect(() => {
    if (!sessionId || !hydrated || !token || !user || !permissionGranted) {
      return;
    }

    setSignalingConnected(false);
    const client = new Client({
      webSocketFactory: () =>
        new SockJS(
          `${VIDEO_WEBSOCKET_URL}${VIDEO_WEBSOCKET_URL.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`
        ),
      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },
      reconnectDelay: 3000,
      debug: () => undefined,
      onConnect: () => {
        setSignalingConnected(true);
        setError('');

        while (pendingSignalsRef.current.length > 0 && client.connected) {
          const nextSignal = pendingSignalsRef.current.shift();
          if (!nextSignal) {
            break;
          }
          try {
            client.publish({
              destination: nextSignal.destination,
              body: JSON.stringify(nextSignal.payload),
            });
          } catch {
            pendingSignalsRef.current.unshift(nextSignal);
            break;
          }
        }

        client.subscribe(`/topic/video/sessions/${sessionId}`, (message: IMessage) => {
          handleSignalMessage(message.body);
        });
        client.subscribe('/user/queue/video', (message: IMessage) => {
          handleSignalMessage(message.body);
        });
        client.publish({
          destination: VIDEO_SIGNAL_DESTINATIONS.syncState,
          body: JSON.stringify({ sessionId }),
        });
      },
      onStompError: (frame) => {
        setSignalingConnected(false);
        setError(frame.body || 'Video signaling connection failed.');
      },
      onWebSocketClose: () => {
        setSignalingConnected(false);
        closeAllPeerConnections();
      },
    });

    clientRef.current = client;
    client.activate();

    return () => {
      void client.deactivate();
      clientRef.current = null;
      pendingSignalsRef.current = [];
      setSignalingConnected(false);
      resetCallState();
    };
  }, [hydrated, permissionGranted, sessionId, token, user]);

  const startSession = async (mode: VideoSessionMode) => {
    if (!sessionId || !user?.id) {
      return;
    }

    try {
      await ensureLocalMedia();
      setSessionMode(mode);
      setIsController(true);
      setControllerId(user.id);
      setCallActive(true);
      setCallState('connecting');
      setApprovedUserIds([user.id]);
      setRoleByUserId({ [user.id]: 'speaker' });
      setAllowedScreenShareUserIds([user.id]);

      sendSignal(mode === 'stream' ? VIDEO_SIGNAL_DESTINATIONS.startStream : VIDEO_SIGNAL_DESTINATIONS.startCall, {
        sessionId,
        mode,
      });
    } catch {
      setError('Camera/microphone permission is required to start this session.');
    }
  };

  const requestJoin = () => {
    if (!sessionId || retryAfterSeconds > 0) {
      return;
    }

    setCallState('waiting');
    sendSignal(sessionMode === 'stream' ? VIDEO_SIGNAL_DESTINATIONS.joinStream : VIDEO_SIGNAL_DESTINATIONS.joinRequest, {
      sessionId,
      mode: sessionMode,
    });
  };

  const approveRequest = (targetUserId: string) => {
    if (!sessionId) {
      return;
    }
    sendSignal(VIDEO_SIGNAL_DESTINATIONS.approveUser, { sessionId, targetUserId });
    if (highlightedRequesterId === targetUserId) {
      setHighlightedRequesterId('');
    }
  };

  const rejectRequest = (targetUserId: string) => {
    if (!sessionId) {
      return;
    }
    sendSignal(VIDEO_SIGNAL_DESTINATIONS.rejectUser, { sessionId, targetUserId });
    if (highlightedRequesterId === targetUserId) {
      setHighlightedRequesterId('');
    }
  };

  const promoteUser = (targetUserId: string) => {
    if (!sessionId) {
      return;
    }
    sendSignal(VIDEO_SIGNAL_DESTINATIONS.toggleMedia, {
      sessionId,
      targetUserId,
      mediaType: 'role',
      role: 'speaker',
    });
  };

  const demoteUser = (targetUserId: string) => {
    if (!sessionId) {
      return;
    }
    sendSignal(VIDEO_SIGNAL_DESTINATIONS.toggleMedia, {
      sessionId,
      targetUserId,
      mediaType: 'role',
      role: 'viewer',
    });
  };

  const allowScreenShare = (targetUserId: string, enabled: boolean) => {
    if (!sessionId) {
      return;
    }
    sendSignal(VIDEO_SIGNAL_DESTINATIONS.toggleMedia, {
      sessionId,
      targetUserId,
      mediaType: 'screen-permission',
      enabled,
    });
  };

  const removeUser = (targetUserId: string) => {
    if (!sessionId) {
      return;
    }
    sendSignal(VIDEO_SIGNAL_DESTINATIONS.removeUser, { sessionId, targetUserId });
  };

  const endSession = () => {
    if (sessionId && isController) {
      sendSignal(sessionMode === 'stream' ? VIDEO_SIGNAL_DESTINATIONS.endStream : VIDEO_SIGNAL_DESTINATIONS.endCall, {
        sessionId,
      });
    }
    resetCallState();
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    const nextMuted = !muted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
    if (sessionId) {
      sendSignal(VIDEO_SIGNAL_DESTINATIONS.toggleMedia, {
        sessionId,
        mediaType: 'audio',
        enabled: !nextMuted,
      });
    }
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }

    const nextCameraOff = !cameraOff;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    setCameraOff(nextCameraOff);
    if (sessionId) {
      sendSignal(VIDEO_SIGNAL_DESTINATIONS.toggleMedia, {
        sessionId,
        mediaType: 'video',
        enabled: !nextCameraOff,
      });
    }
  };

  const toggleScreenShare = async () => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }

    if (!screenSharing) {
      if (!canShareScreen) {
        setError('Controller has not granted screen sharing permission.');
        return;
      }
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const displayTrack = display.getVideoTracks()[0];
        const cameraTrack = stream.getVideoTracks()[0] ?? null;
        originalCameraTrackRef.current = cameraTrack;

        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders().find((candidate) => candidate.track?.kind === 'video');
          if (sender) {
            void sender.replaceTrack(displayTrack);
          }
        });

        if (cameraTrack) {
          stream.removeTrack(cameraTrack);
        }
        stream.addTrack(displayTrack);
        setLocalStream(new MediaStream(stream.getTracks()));
        setScreenSharing(true);
        if (sessionId) {
          sendSignal(VIDEO_SIGNAL_DESTINATIONS.toggleMedia, {
            sessionId,
            mediaType: 'screen',
            enabled: true,
          });
        }

        displayTrack.onended = () => {
          void toggleScreenShare();
        };
      } catch {
        setError('Unable to start screen share.');
      }
      return;
    }

    const fallbackTrack = originalCameraTrackRef.current;
    if (!fallbackTrack) {
      setScreenSharing(false);
      return;
    }

    stream.getVideoTracks().forEach((track) => {
      if (track.id !== fallbackTrack.id) {
        track.stop();
        stream.removeTrack(track);
      }
    });
    stream.addTrack(fallbackTrack);

    peerConnectionsRef.current.forEach((pc) => {
      const sender = pc.getSenders().find((candidate) => candidate.track?.kind === 'video');
      if (sender) {
        void sender.replaceTrack(fallbackTrack);
      }
    });

    setLocalStream(new MediaStream(stream.getTracks()));
    setScreenSharing(false);
    if (sessionId) {
      sendSignal(VIDEO_SIGNAL_DESTINATIONS.toggleMedia, {
        sessionId,
        mediaType: 'screen',
        enabled: false,
      });
    }
  };

  const controllerName = controllerId ? resolveUserName(controllerId) : 'controller';
  const remoteTiles = useMemo(
    () =>
      Object.entries(remoteStreams).map(([userId, stream]) => ({
        userId,
        stream,
      })),
    [remoteStreams]
  );

  const diagnosticsPeers = useMemo(() => {
    const peerIds = new Set<string>();
    approvedUserIds.filter((id) => id !== user?.id).forEach((id) => peerIds.add(id));
    peerConnectionsRef.current.forEach((_, id) => peerIds.add(id));
    Object.keys(remoteStreams).forEach((id) => peerIds.add(id));
    pendingIceCandidatesRef.current.forEach((_, id) => peerIds.add(id));
    iceQueuedCountRef.current.forEach((_, id) => peerIds.add(id));
    iceAppliedCountRef.current.forEach((_, id) => peerIds.add(id));

    return Array.from(peerIds)
      .sort((a, b) => a.localeCompare(b))
      .map((peerId) => {
        const pc = peerConnectionsRef.current.get(peerId);
        const remoteStream = remoteStreams[peerId];
        return {
          peerId,
          name: resolveUserName(peerId),
          connectionState: pc?.connectionState ?? 'none',
          iceConnectionState: pc?.iceConnectionState ?? 'none',
          signalingState: pc?.signalingState ?? 'none',
          localTracks: pc?.getSenders().filter((sender) => sender.track != null).length ?? 0,
          remoteTracks: remoteStream?.getTracks().length ?? 0,
          iceQueuedNow: pendingIceCandidatesRef.current.get(peerId)?.length ?? 0,
          iceQueuedTotal: iceQueuedCountRef.current.get(peerId) ?? 0,
          iceAppliedTotal: iceAppliedCountRef.current.get(peerId) ?? 0,
        };
      });
  }, [approvedUserIds, diagnosticsTick, remoteStreams, user?.id]);

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-cyan-300">Live Video</p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {sessionMode === 'stream' ? 'Live Stream with host controls' : 'Privacy-first peer call'}
          </h3>
        </div>

        {!callActive ? (
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => {
                void startSession('call');
              }}
              disabled={!permissionGranted}
              className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              Start Call
            </button>
            <button
              type="button"
              onClick={() => {
                void startSession('stream');
              }}
              disabled={!permissionGranted}
              className="rounded-full border border-cyan-300/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Start Stream
            </button>
          </div>
        ) : (
          <span className="ml-auto rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
            {callState}
          </span>
        )}
      </div>

      {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}

      <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-500/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">WebRTC Diagnostics</p>
          <button
            type="button"
            onClick={() => setShowDiagnostics((current) => !current)}
            className="rounded-full border border-cyan-300/40 px-3 py-1 text-[11px] font-semibold text-cyan-100"
          >
            {showDiagnostics ? 'Hide' : 'Show'}
          </button>
        </div>

        {showDiagnostics ? (
          <div className="mt-3 space-y-2 text-[11px] text-slate-200">
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-slate-950/50 px-2 py-1.5">
                <span className="text-slate-400">Call State</span>
                <p className="font-semibold text-white">{callState}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/50 px-2 py-1.5">
                <span className="text-slate-400">Local Tracks</span>
                <p className="font-semibold text-white">{localStream?.getTracks().length ?? 0}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/50 px-2 py-1.5">
                <span className="text-slate-400">Remote Peers</span>
                <p className="font-semibold text-white">{diagnosticsPeers.length}</p>
              </div>
            </div>

            {diagnosticsPeers.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-slate-950/40 px-2 py-2 text-slate-300">
                No peer connection telemetry yet. Start or join a call to capture states.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="bg-slate-950/80 text-slate-300">
                    <tr>
                      <th className="px-2 py-1.5">Peer</th>
                      <th className="px-2 py-1.5">Connection</th>
                      <th className="px-2 py-1.5">ICE</th>
                      <th className="px-2 py-1.5">Signaling</th>
                      <th className="px-2 py-1.5">Tracks L/R</th>
                      <th className="px-2 py-1.5">ICE Q now</th>
                      <th className="px-2 py-1.5">ICE queued</th>
                      <th className="px-2 py-1.5">ICE applied</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnosticsPeers.map((peer) => (
                      <tr key={peer.peerId} className="border-t border-white/10 bg-slate-950/40">
                        <td className="px-2 py-1.5 text-slate-100">{peer.name}</td>
                        <td className="px-2 py-1.5">{peer.connectionState}</td>
                        <td className="px-2 py-1.5">{peer.iceConnectionState}</td>
                        <td className="px-2 py-1.5">{peer.signalingState}</td>
                        <td className="px-2 py-1.5">{peer.localTracks}/{peer.remoteTracks}</td>
                        <td className="px-2 py-1.5">{peer.iceQueuedNow}</td>
                        <td className="px-2 py-1.5">{peer.iceQueuedTotal}</td>
                        <td className="px-2 py-1.5">{peer.iceAppliedTotal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {!permissionGranted ? (
        <p className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          Video access requires active session chat permission.
        </p>
      ) : null}

      {callActive && isController ? (
        <div className="mt-4">
          <ControllerPanel
            requestUserIds={pendingRequestUserIds}
            approvedUserIds={approvedUserIds.filter((id) => id !== user?.id)}
            resolveUserName={resolveUserName}
            highlightedRequesterId={highlightedRequesterId}
            onApprove={approveRequest}
            onReject={rejectRequest}
            onPromote={promoteUser}
            onDemote={demoteUser}
            onAllowScreenShare={allowScreenShare}
            onRemove={removeUser}
            roleByUserId={roleByUserId}
            screenPermissionByUser={screenPermissionByUser}
          />
        </div>
      ) : null}

      {callActive && !isController ? (
        <div className="mt-4">
          {(callState === 'waiting' || callState === 'rejected') ? (
            <div className="mb-3">
              <WaitingScreen
                controllerName={controllerName}
                retryAfterSeconds={retryAfterSeconds}
                state={callState === 'rejected' ? 'rejected' : 'waiting'}
              />
            </div>
          ) : null}
          <ViewerPanel
            open={callState !== 'connected'}
            state={callState}
            controllerName={controllerName}
            retryAfterSeconds={retryAfterSeconds}
            onRequestJoin={requestJoin}
            roleLabel={selfRole}
          />
          {callState === 'idle' || callState === 'rejected' ? (
            <div className="mt-3">
              <JoinButton
                mode={sessionMode}
                disabled={retryAfterSeconds > 0}
                onClick={requestJoin}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <VideoContainer
        sessionMode={sessionMode}
        localStream={localStream}
        remoteTiles={remoteTiles}
        showLocalPublisher={canPublish}
        resolveUserName={resolveUserName}
        selfUserId={user?.id}
        muted={muted}
        cameraOff={cameraOff}
        screenSharing={screenSharing}
      />

      {localStream && canPublish ? (
        <div className="mt-4">
          <MediaControls
            muted={muted}
            cameraOff={cameraOff}
            screenSharing={screenSharing}
            canShareScreen={canShareScreen}
            modeLabel={sessionMode === 'stream' ? 'Stream Speaker' : 'Video Call'}
            onToggleMute={toggleMute}
            onToggleCamera={toggleCamera}
            onToggleScreenShare={() => {
              void toggleScreenShare();
            }}
            onEndSession={endSession}
          />
        </div>
      ) : null}
    </section>
  );
}
