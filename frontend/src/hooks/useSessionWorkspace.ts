import { useEffect, useMemo, useRef, useState } from 'react';
import { Client, type IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import type { AxiosError } from 'axios';
import { useAuthStore } from '@/store/authStore';
import { CHAT_WEBSOCKET_URL, chatService, type ChatMessageResponseDto } from '@/services/chatService';
import { sessionService } from '@/services/sessionService';
import { userService, type UserProfileDto } from '@/services/userService';
import { refreshAuthSession } from '@/services/authSession';
import { deriveChatKey } from '@/utils/chatEncryption';
import { sanitizePlainText } from '@/utils/sanitize';
import type { ChatMediaReference, ChatMessage, ChatMessageType } from '@/types/chat';
import type { SessionDto, UserNodeDto } from '@/types/session';
import type { ModerationResult } from '@/types/chat';
import { analyzeModerationInput, analyzeModerationText } from '@/utils/moderation';
import { encryptMediaReference, decryptMediaReference, encryptFile } from '@/utils/mediaCrypto';
import { compressMediaFile } from '@/utils/mediaCompression';
import { fileService } from '@/services/fileService';
import { getModerationSignalState, sendModerationSignal, type ModerationSignalStateResponse } from '@/services/moderationSignalService';

type WireMessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE';

interface PresenceUpdate {
  userId: string;
  online: boolean;
}

const parsePresenceUpdate = (body: string): PresenceUpdate | null => {
  const match = body.match(/^([0-9a-fA-F-]+) is now (online|offline)$/);
  if (!match) {
    return null;
  }

  return {
    userId: match[1],
    online: match[2] === 'online',
  };
};

const PENDING_REQUESTS_POLL_INTERVAL_MS = 30000;
const PRESENCE_POLL_INTERVAL_MS = 30000;
const CHAT_HISTORY_CACHE_LIMIT = 300;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Unable to read media for moderation.'));
    };
    reader.onerror = () => reject(new Error('Unable to read media for moderation.'));
    reader.readAsDataURL(blob);
  });
}

const toPersistentModeration = (state: ModerationSignalStateResponse): ModerationResult => {
  const action: ModerationResult['action'] = state.blockSession
    ? 'block'
    : state.userViolationCount > 0 || state.sessionViolationCount > 0
      ? 'warn'
      : 'allow';

  return {
    riskScore: state.lastRiskScore,
    flagged: state.userViolationCount > 0 || state.sessionViolationCount > 0,
    category: 'none',
    action,
    blockSession: state.blockSession,
    detectedLanguage: 'unknown',
    userViolationCount: state.userViolationCount,
    sessionViolationCount: state.sessionViolationCount,
    matchedKeywords: [],
    matchedPatterns: [],
    risk_score: state.lastRiskScore,
    flagged_content: state.userViolationCount > 0 || state.sessionViolationCount > 0,
    block_session: state.blockSession,
    warning: action !== 'allow',
    blocked: action === 'block',
  };
};

const flattenDescendants = (node: UserNodeDto | null | undefined): UserNodeDto[] => {
  if (!node?.children || node.children.length === 0) {
    return [];
  }

  const nodes: UserNodeDto[] = [];
  const stack = [...node.children];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    nodes.push(current);
    if (current.children?.length) {
      stack.push(...current.children);
    }
  }

  return nodes;
};

export function useSessionWorkspace(sessionId: string | undefined) {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const hydrated = useAuthStore((state) => state.hydrated);
  const [session, setSession] = useState<SessionDto | null>(null);
  const [selfNode, setSelfNode] = useState<UserNodeDto | null>(null);
  const [connectedUserIds, setConnectedUserIds] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfileDto>>({});
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [chatKey, setChatKey] = useState<CryptoKey | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingRequests, setPendingRequests] = useState<UserNodeDto[]>([]);
  const [connectionState, setConnectionState] = useState<'locked' | 'connecting' | 'connected' | 'disconnected'>('locked');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [moderation, setModeration] = useState<ModerationResult | null>(null);
  const [persistentModerationState, setPersistentModerationState] = useState<ModerationSignalStateResponse | null>(null);
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const stompRef = useRef<Client | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const profilesRef = useRef<Record<string, UserProfileDto>>({});
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const cacheLoadedKeyRef = useRef('');
  const authRetryRef = useRef(0);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  const chatHistoryCacheKey = useMemo(() => {
    if (!sessionId || !user?.id) {
      return '';
    }
    return `ai-pro:chat-history:${sessionId}:${user.id}`;
  }, [sessionId, user?.id]);

  const sessionParticipantIds = useMemo(() => {
    return session?.participants?.map((participant) => participant.userId) ?? [];
  }, [session?.participants]);

  const recipientIds = useMemo(() => {
    const sourceIds = sessionParticipantIds.length > 0 ? sessionParticipantIds : connectedUserIds;
    return sourceIds.filter((participantId) => participantId !== user?.id);
  }, [connectedUserIds, sessionParticipantIds, user?.id]);

  const revocableNodes = useMemo(() => flattenDescendants(selfNode), [selfNode]);

  const handleUnauthorized = () => {
    setError('Session expired.');
    window.dispatchEvent(new Event('ai-pro:unauthorized'));
  };

  const isUnauthorizedError = (requestError: unknown) => {
    const axiosError = requestError as AxiosError<{ statusCode?: number }>;
    return axiosError.response?.status === 401 || axiosError.response?.data?.statusCode === 401;
  };

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    if (!chatHistoryCacheKey || cacheLoadedKeyRef.current === chatHistoryCacheKey) {
      return;
    }

    cacheLoadedKeyRef.current = chatHistoryCacheKey;
    try {
      const raw = localStorage.getItem(chatHistoryCacheKey);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as ChatMessage[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return;
      }

      for (const cachedMessage of parsed) {
        if (cachedMessage?.messageId) {
          seenMessageIdsRef.current.add(cachedMessage.messageId);
        }
      }

      setMessages((current) => {
        if (current.length > 0) {
          return current;
        }
        return parsed;
      });
    } catch {
      // Ignore cache parsing failures; realtime/API history remains source of truth.
    }
  }, [chatHistoryCacheKey]);

  useEffect(() => {
    if (!chatHistoryCacheKey) {
      return;
    }

    try {
      const persisted = messages
        .slice(-CHAT_HISTORY_CACHE_LIMIT)
        .map((message) => {
          const { localPreviewUrl: _ignoredPreview, ...serializable } = message;
          return serializable;
        });

      localStorage.setItem(chatHistoryCacheKey, JSON.stringify(persisted));
    } catch {
      // Ignore storage quota/serialization errors in dev.
    }
  }, [chatHistoryCacheKey, messages]);

  useEffect(() => {
    if (selectedRecipientId || recipientIds.length === 0) {
      return;
    }

    const fallbackRecipient = recipientIds[0];
    if (fallbackRecipient) {
      setSelectedRecipientId(fallbackRecipient);
    }
  }, [recipientIds, selectedRecipientId]);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      if (!sessionId) {
        return;
      }

      setLoading(true);
      setError('');

      try {
        const [sessionResponse, nodeResponse, connectedResponse] = await Promise.all([
          sessionService.getSessionDetails(sessionId),
          sessionService.getUserSessionView(sessionId),
          chatService.getConnectedUsers(sessionId),
        ]);

        if (!active) {
          return;
        }

        setSession(sessionResponse.data);
        setSelfNode(nodeResponse.data);
        setConnectedUserIds(connectedResponse.data);
        setLastActivity(new Date().toISOString());
      } catch (requestError) {
        if (active) {
          if (isUnauthorizedError(requestError)) {
            handleUnauthorized();
          } else {
            setError('Unable to load the session workspace.');
          }
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    // Only load session if hydrated and authenticated
    if (hydrated && token) {
      void loadSession();
    }

    return () => {
      active = false;
    };
  }, [sessionId, hydrated, token]);

  useEffect(() => {
    let active = true;

    const loadPendingRequests = async () => {
      if (!sessionId || !token || !hydrated) {
        return;
      }

      try {
        const response = await sessionService.getPendingPermissions(sessionId);
        if (active) {
          setPendingRequests(response.data);
        }
      } catch {
        if (active) {
          setPendingRequests([]);
        }
      }
    };

    void loadPendingRequests();
    const timer = window.setInterval(() => {
      void loadPendingRequests();
    }, PENDING_REQUESTS_POLL_INTERVAL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [sessionId, token, hydrated]);

  useEffect(() => {
    if (!sessionId || !token || !hydrated) {
      return undefined;
    }

    const pollPresence = async () => {
      try {
        const [connectedResponse, sessionResponse, nodeResponse] = await Promise.all([
          chatService.getConnectedUsers(sessionId),
          sessionService.getSessionDetails(sessionId),
          sessionService.getUserSessionView(sessionId),
        ]);
        setConnectedUserIds(connectedResponse.data);
        setSession(sessionResponse.data);
        setSelfNode(nodeResponse.data);
        setLastActivity(new Date().toISOString());
      } catch (requestError) {
        if (isUnauthorizedError(requestError)) {
          handleUnauthorized();
        }
      }
    };

    const timer = window.setInterval(() => {
      // Presence/state updates already stream over STOMP once connected.
      if (connectionState === 'connected') {
        return;
      }

      // Avoid background-tab polling bursts when the tab regains focus.
      if (document.hidden) {
        return;
      }

      void pollPresence();
    }, PRESENCE_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [connectionState, sessionId, token, hydrated]);

  useEffect(() => {
    const trackedIds = new Set<string>();
    recipientIds.forEach((participantId) => trackedIds.add(participantId));
    pendingRequests.forEach((requestNode) => trackedIds.add(requestNode.userId));
    revocableNodes.forEach((node) => trackedIds.add(node.userId));

    const missingProfiles = Array.from(trackedIds).filter((participantId) => !profilesRef.current[participantId]);

    if (missingProfiles.length === 0) {
      return;
    }

    let active = true;

    const loadProfiles = async () => {
      const entries = await Promise.all(
        missingProfiles.map(async (participantId) => {
          const response = await userService.getUserById(participantId);
          return [participantId, response.data] as const;
        })
      );

      if (!active) {
        return;
      }

      setProfiles((current) => {
        const nextProfiles = { ...current };
        for (const [participantId, profile] of entries) {
          nextProfiles[participantId] = profile;
        }
        return nextProfiles;
      });
    };

    void loadProfiles();

    return () => {
      active = false;
    };
  }, [pendingRequests, recipientIds, revocableNodes]);

  useEffect(() => {
    if (!draftMessage.trim()) {
      if (persistentModerationState) {
        setModeration(toPersistentModeration(persistentModerationState));
      } else {
        setModeration(null);
      }
      return;
    }

    let active = true;

    const evaluate = async () => {
      const nextResult = await analyzeModerationText(draftMessage, {
        sessionId,
        userId: user?.id,
      });
      if (active) {
        setModeration(nextResult);
      }
    };

    void evaluate();

    return () => {
      active = false;
    };
  }, [draftMessage, persistentModerationState, sessionId, user?.id]);

  useEffect(() => {
    if (!sessionId || !user?.id || !token || !hydrated) {
      return;
    }

    let active = true;

    const loadModerationState = async () => {
      const state = await getModerationSignalState(sessionId, user.id);
      if (!active || !state) {
        return;
      }

      setPersistentModerationState(state);
      setModeration((current) => {
        if (current) {
          return current;
        }
        return toPersistentModeration(state);
      });

      if (state.blockSession) {
        setError('Chat is blocked due to repeated moderation violations.');
      }
    };

    void loadModerationState();

    return () => {
      active = false;
    };
  }, [hydrated, sessionId, token, user?.id]);

  useEffect(() => {
    if (!sessionId) {
      setChatKey(null);
      return;
    }

    void deriveChatKey(sessionId, `permission:${sessionId}`).then(setChatKey).catch(() => {
      setChatKey(null);
      setError('Unable to initialize encrypted chat context.');
    });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !chatKey || !user || !token || !hydrated) {
      return;
    }

    let active = true;

    const loadHistory = async () => {
      try {
        const response = await chatService.getSessionMessages(sessionId);
        const history = response.data ?? [];

        const nextMessages = await Promise.all(
          history.map(async (payload: ChatMessageResponseDto) => {
            const dedupeId = payload.messageId || `${payload.timestamp}-${payload.senderId}-${payload.receiverId}-${payload.encryptedMessage}`;

            if (seenMessageIdsRef.current.has(dedupeId)) {
              return null;
            }

            const senderProfile = profilesRef.current[payload.senderId] ?? (await userService.getUserById(payload.senderId)).data;
            if (!profilesRef.current[payload.senderId]) {
              setProfiles((current) => ({ ...current, [payload.senderId]: senderProfile }));
            }

            const encryptedEnvelope = payload.content ?? payload.encryptedMessage;
            const decryptedPayload = await decryptMediaReference(chatKey, encryptedEnvelope);
            const messageType = decryptedPayload.type ?? 'text';
            const textContent = decryptedPayload.text ?? '';
            const media = decryptedPayload.media;
            seenMessageIdsRef.current.add(dedupeId);

            return {
              id: dedupeId,
              messageId: dedupeId,
              senderId: payload.senderId,
              senderName: senderProfile.name,
              content: textContent,
              type: messageType,
              media,
              timestamp: payload.timestamp,
              isOwn: payload.senderId === user.id,
            } as ChatMessage;
          })
        );

        if (!active) {
          return;
        }

        setMessages((current) => {
          const merged = [...current];
          for (const message of nextMessages) {
            if (!message) {
              continue;
            }
            const alreadyExists = merged.some((existing) => existing.messageId === message.messageId);
            if (!alreadyExists) {
              merged.push(message);
            }
          }

          merged.sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
          return merged;
        });
      } catch {
        if (active) {
          setError('Unable to load chat history right now.');
        }
      }
    };

    void loadHistory();

    const historyTimer = window.setInterval(() => {
      // Keep history sync active as a resilience path even when realtime is connected.
      if (document.hidden) {
        return;
      }
      void loadHistory();
    }, 4000);

    return () => {
      active = false;
      window.clearInterval(historyTimer);
    };
  }, [chatKey, connectionState, hydrated, sessionId, token, user]);

  useEffect(() => {
    const authToken = token ?? localStorage.getItem('accessToken');
    if (!sessionId || !user || !chatKey || !authToken) {
      setConnectionState('locked');
      return undefined;
    }

    if (!selfNode?.permissionGranted) {
      setConnectionState('locked');
      return undefined;
    }

    if (!selfNode?.active) {
      setConnectionState('locked');
      return undefined;
    }

    setConnectionState('connecting');
    setError('');
    let connectedOnce = false;
    let handshakeRetryCount = 0;
    let disposed = false;

    const client = new Client({
      webSocketFactory: () => new SockJS(`${CHAT_WEBSOCKET_URL}${CHAT_WEBSOCKET_URL.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(authToken)}`),
      connectHeaders: {
        Authorization: `Bearer ${authToken}`,
      },
      reconnectDelay: 4000,
      debug: () => undefined,
      onConnect: () => {
        if (disposed) {
          return;
        }
        connectedOnce = true;
        authRetryRef.current = 0;
        setConnectionState('connected');
        setError('');

        const handleIncomingMessage = (messageBody: string) => {
          void (async () => {
            try {
              const payload = JSON.parse(messageBody) as {
                messageId?: string;
                senderId: string;
                receiverId: string;
                encryptedMessage?: string;
                content?: string;
                timestamp: string;
                sessionId?: string;
              };

              const payloadContent = payload.content ?? payload.encryptedMessage ?? '';
              const dedupeId = payload.messageId ?? `${payload.timestamp}-${payload.senderId}-${payload.receiverId}-${payloadContent}`;
              if (seenMessageIdsRef.current.has(dedupeId)) {
                return;
              }
              seenMessageIdsRef.current.add(dedupeId);

              const senderProfile = profilesRef.current[payload.senderId] ?? (await userService.getUserById(payload.senderId)).data;
              if (!profilesRef.current[payload.senderId]) {
                setProfiles((current) => ({ ...current, [payload.senderId]: senderProfile }));
              }

              const encryptedEnvelope = payloadContent;
              const decryptedPayload = await decryptMediaReference(chatKey, encryptedEnvelope);
              const messageType = decryptedPayload.type ?? 'text';
              const textContent = decryptedPayload.text ?? '';
              const media = decryptedPayload.media;

              setMessages((current) => [
                ...current,
                {
                  id: dedupeId,
                  messageId: dedupeId,
                  senderId: payload.senderId,
                  senderName: senderProfile.name,
                  content: textContent,
                  type: messageType,
                  media,
                  status: 'sent',
                  timestamp: payload.timestamp,
                  isOwn: payload.senderId === user.id,
                },
              ]);

              setLastActivity(new Date().toISOString());
            } catch {
              setError('A message could not be decrypted.');
            }
          })();
        };

        client.subscribe('/user/queue/messages', (message: IMessage) => {
          handleIncomingMessage(message.body);
        });

        if (sessionId) {
          client.subscribe(`/topic/sessions/${sessionId}/messages`, (message: IMessage) => {
            handleIncomingMessage(message.body);
          });
        }

        client.subscribe('/user/queue/errors', (message: IMessage) => {
          try {
            const payload = JSON.parse(message.body) as { error: string };
            setError(payload.error);
          } catch {
            setError('An error occurred while sending your message. Check your chat permissions.');
          }
        });

        const handlePresenceMessage = (message: IMessage) => {
          const update = parsePresenceUpdate(message.body);
          if (!update) {
            return;
          }

          setConnectedUserIds((current) => {
            const alreadyTracked = current.includes(update.userId);
            if (update.online && !alreadyTracked) {
              return [...current, update.userId];
            }
            if (!update.online && alreadyTracked) {
              return current.filter((participantId) => participantId !== update.userId);
            }
            return current;
          });
        };

        client.subscribe('/topic/online-users', handlePresenceMessage);
        client.subscribe('/topic/online-status', handlePresenceMessage);
      },
      onStompError: (frame) => {
        if (disposed) {
          return;
        }
        setConnectionState('disconnected');
        const details = frame.body || 'Unable to establish a chat connection.';
        const looksLikeAuthError = /auth|jwt|token|unauthor/i.test(details);
        const shouldRetryPreConnect = !connectedOnce && authRetryRef.current < 2;

        // First pre-connect failure is often transient; retry once with the same token.
        if (!connectedOnce && handshakeRetryCount < 1) {
          handshakeRetryCount += 1;
          setReconnectNonce((value) => value + 1);
          return;
        }

        if ((looksLikeAuthError || shouldRetryPreConnect) && authRetryRef.current < 2) {
          authRetryRef.current += 1;
          void refreshAuthSession().then((payload) => {
            if (payload?.accessToken) {
              setReconnectNonce((value) => value + 1);
            } else {
              setError('Chat authentication failed. Please sign in again.');
            }
          });
        } else {
          setError(details);
        }
      },
      onWebSocketError: () => {
        if (disposed) {
          return;
        }
        setConnectionState('disconnected');
        setError('Unable to connect to realtime chat.');
      },
      onWebSocketClose: () => {
        if (disposed) {
          return;
        }
        setConnectionState('disconnected');

        if (!connectedOnce && handshakeRetryCount < 1) {
          handshakeRetryCount += 1;
          setReconnectNonce((value) => value + 1);
          return;
        }

        if (!connectedOnce && authRetryRef.current < 2) {
          authRetryRef.current += 1;
          void refreshAuthSession().then((payload) => {
            if (payload?.accessToken) {
              setReconnectNonce((value) => value + 1);
            } else {
              setError('Chat handshake closed before authentication completed. Please unlock chat again.');
            }
          });
        }
      },
    });

    stompRef.current = client;
    client.activate();

    const connectTimeout = window.setTimeout(() => {
      if (disposed) {
        return;
      }
      if (client.connected) {
        return;
      }

      if (authRetryRef.current < 2) {
        authRetryRef.current += 1;
        void refreshAuthSession().then((payload) => {
          if (payload?.accessToken) {
            setReconnectNonce((value) => value + 1);
            return;
          }

          setConnectionState('disconnected');
          setError('Chat connection timed out. Please try again.');
        });
      } else {
        setConnectionState('disconnected');
        setError('Chat connection failed. Please try again.');
      }

      void client.deactivate();
    }, 50000);

    return () => {
      disposed = true;
      window.clearTimeout(connectTimeout);
      void client.deactivate();
      stompRef.current = null;
      setConnectionState('disconnected');
    };
  }, [chatKey, reconnectNonce, selfNode?.active, selfNode?.permissionGranted, sessionId, token, user]);

  const participants = useMemo(() => {
    return recipientIds
      .map((participantId) => ({
        ...(profiles[participantId] ?? { id: participantId, name: participantId, email: '' }),
        online: connectedUserIds.includes(participantId),
      }));
  }, [connectedUserIds, profiles, recipientIds]);

  const approvePermission = async (nodeId: string, sharedSecret: string) => {
    if (!sessionId || !nodeId || !sharedSecret.trim()) {
      return;
    }

    await sessionService.approvePermission(sessionId, nodeId, { sharedSecret: sharedSecret.trim() });
    const updatedPending = await sessionService.getPendingPermissions(sessionId);
    setPendingRequests(updatedPending.data);
    await refreshWorkspace();
    // Force reconnect with new permission state
    setReconnectNonce((value) => value + 1);
  };

  const revokePermission = async (nodeId: string) => {
    if (!sessionId || !nodeId) {
      return;
    }

    await sessionService.leaveSession(sessionId, nodeId);
    const updatedPending = await sessionService.getPendingPermissions(sessionId);
    setPendingRequests(updatedPending.data);
    await refreshWorkspace();
  };

  const resolveUserName = (userId: string) => {
    if (user?.id === userId) {
      return `${user.name} (you)`;
    }

    return profiles[userId]?.name ?? `User ${userId.slice(0, 8)}`;
  };

  const sendEncryptedPayload = async (
    messageId: string,
    encryptedMessage: string,
    type: ChatMessageType,
    moderationContent?: string
  ) => {
    if (!sessionId || !selectedRecipientId) {
      throw new Error('Chat session is not ready for sending.');
    }

    const wireType = type.toUpperCase() as WireMessageType;

    await chatService.sendMessage({
      messageId,
      type: wireType,
      content: encryptedMessage,
      receiverId: selectedRecipientId,
      encryptedMessage,
      moderationContent,
      sessionId,
    });
  };

  const appendLocalMessage = (message: {
    messageId: string;
    type: ChatMessageType;
    content: string;
    media?: ChatMediaReference;
    localPreviewUrl?: string;
    status?: 'pending' | 'sent' | 'failed';
  }) => {
    if (!user) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: message.messageId,
        messageId: message.messageId,
        senderId: user.id,
        senderName: user.name,
        type: message.type,
        media: message.media,
        localPreviewUrl: message.localPreviewUrl,
        status: message.status ?? 'sent',
        content: message.content,
        timestamp: new Date().toISOString(),
        isOwn: true,
      },
    ]);
  };

  const sendMessage = async () => {
    if (!sessionId || !chatKey || !selectedRecipientId || !user) {
      setError('Chat not fully initialized. Please refresh.');
      return;
    }

    const text = draftMessage.trim();
    if (!text) {
      return;
    }

    const sanitizedText = sanitizePlainText(text);
    if (!sanitizedText) {
      setError('Message content is empty after sanitization.');
      return;
    }

    const moderationResult = await analyzeModerationText(sanitizedText, {
      sessionId,
      userId: user.id,
      recordViolation: true,
    });

    setModeration(moderationResult);

    if (moderationResult.blocked) {
      const signalState = await sendModerationSignal(moderationResult, sessionId, user.id);
      if (signalState) {
        setPersistentModerationState(signalState);
        setModeration(toPersistentModeration(signalState));
      }
      setError('Local moderation blocked this message. Remove the flagged terms and try again.');
      return;
    }

    if (moderationResult.flagged) {
      const signalState = await sendModerationSignal(moderationResult, sessionId, user.id);
      if (signalState) {
        setPersistentModerationState(signalState);
        setModeration(toPersistentModeration(signalState));
        if (signalState.blockSession) {
          setError('Chat is blocked due to repeated moderation violations.');
          return;
        }
      }
    }

    const messageId = crypto.randomUUID();
    const encryptedMessage = await encryptMediaReference(chatKey, {
      type: 'text',
      text: sanitizedText,
    });
    await sendEncryptedPayload(messageId, encryptedMessage, 'text', sanitizedText);
    seenMessageIdsRef.current.add(messageId);
    appendLocalMessage({
      messageId,
      type: 'text',
      content: sanitizedText,
      status: 'sent',
    });

    setDraftMessage('');
    setLastActivity(new Date().toISOString());
  };

  const sendMediaMessage = async (
    fileOrBlob: File | Blob,
    fileName: string,
    mimeType: string,
    mediaType: Exclude<ChatMessageType, 'text'>
  ) => {
    if (!sessionId || !chatKey || !selectedRecipientId || !user) {
      setUploadError('Chat not fully initialized. Please refresh.');
      return;
    }

    setSendingMedia(true);
    setUploadError('');
    setUploadProgress(0);

    try {
      const inputFile = fileOrBlob instanceof File
        ? fileOrBlob
        : new File([fileOrBlob], fileName, { type: mimeType });
      const compressedBlob = await compressMediaFile(inputFile, mediaType);
      const moderationImageBase64 = mediaType === 'image'
        ? await blobToDataUrl(compressedBlob)
        : undefined;

      const moderationResult = await analyzeModerationInput({
        type: 'image',
        content: [fileName, mimeType].filter(Boolean).join(' '),
        sessionId,
        userId: user.id,
        recordViolation: true,
        metadata: {
          file_name: fileName,
          mime_type: mimeType,
          size_bytes: compressedBlob.size,
        },
        imageBase64: moderationImageBase64,
        imageMimeType: mediaType === 'image' ? mimeType : undefined,
      });

      setModeration(moderationResult);

      if (moderationResult.blocked) {
        const signalState = await sendModerationSignal(moderationResult, sessionId, user.id);
        if (signalState) {
          setPersistentModerationState(signalState);
          setModeration(toPersistentModeration(signalState));
        }
        setUploadError('Local moderation blocked this file metadata. Rename or remove the suspicious upload.');
        return;
      }

      if (moderationResult.flagged) {
        const signalState = await sendModerationSignal(moderationResult, sessionId, user.id);
        if (signalState) {
          setPersistentModerationState(signalState);
          setModeration(toPersistentModeration(signalState));
          if (signalState.blockSession) {
            setUploadError('Chat is blocked due to repeated moderation violations.');
            return;
          }
        }
      }

      const messageId = crypto.randomUUID();

      const encryptedBlob = await encryptFile(compressedBlob, chatKey);
      const encryptedFile = new File([encryptedBlob], `${fileName}.aip`, {
        type: 'application/octet-stream',
      });

      const controller = new AbortController();
      uploadControllerRef.current = controller;

      const uploadResult = await fileService.uploadFile(
        sessionId,
        encryptedFile,
        JSON.stringify({
          mediaType,
          originalName: fileName,
          mimeType,
          encrypted: true,
        }),
        {
          signal: controller.signal,
          onProgress: (progress) => setUploadProgress(progress),
        }
      );

      const mediaRef: ChatMediaReference = {
        fileId: uploadResult.fileId,
        fileName,
        mimeType,
        mediaType,
        sizeBytes: inputFile.size,
        encrypted: true,
        compressed: compressedBlob.size < inputFile.size,
      };

      const encryptedMessage = await encryptMediaReference(chatKey, {
        type: mediaType,
        text: `${mediaType.toUpperCase()}: ${fileName}`,
        media: mediaRef,
      });

      const moderationContent = `${fileName} ${mimeType} ${mediaType}`.trim();
      await sendEncryptedPayload(messageId, encryptedMessage, mediaType, moderationContent);
      seenMessageIdsRef.current.add(messageId);
      appendLocalMessage({
        messageId,
        type: mediaType,
        content: `${mediaType.toUpperCase()}: ${fileName}`,
        media: mediaRef,
        status: 'sent',
      });

      setLastActivity(new Date().toISOString());
      setUploadProgress(100);
    } catch (requestError) {
      const aborted = requestError instanceof DOMException && requestError.name === 'AbortError';
      setUploadError(aborted ? 'Upload canceled.' : 'Secure media upload failed. Try again.');
    } finally {
      uploadControllerRef.current = null;
      setSendingMedia(false);
      window.setTimeout(() => setUploadProgress(0), 500);
    }
  };

  const cancelUpload = () => {
    uploadControllerRef.current?.abort();
  };

  const refreshWorkspace = async () => {
    if (!sessionId) {
      return;
    }

    setLoading(true);

    try {
      const [sessionResponse, nodeResponse, connectedResponse] = await Promise.all([
        sessionService.getSessionDetails(sessionId),
        sessionService.getUserSessionView(sessionId),
        chatService.getConnectedUsers(sessionId),
      ]);

      setSession(sessionResponse.data);
      setSelfNode(nodeResponse.data);
      setConnectedUserIds(connectedResponse.data);
      setLastActivity(new Date().toISOString());
      setError('');
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) {
        handleUnauthorized();
      } else {
        setError('Unable to refresh session presence right now.');
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    session,
    selfNode,
    pendingRequests,
    revocableNodes,
    participants,
    selectedRecipientId,
    setSelectedRecipientId,
    chatKey,
    messages,
    draftMessage,
    setDraftMessage,
    connectionState,
    loading,
    error,
    uploadError,
    uploadProgress,
    sendingMedia,
    moderation,
    violationCount: persistentModerationState?.userViolationCount ?? moderation?.userViolationCount ?? 0,
    warningCount: persistentModerationState?.sessionViolationCount ?? moderation?.sessionViolationCount ?? 0,
    lastActivity,
    approvePermission,
    revokePermission,
    resolveUserName,
    sendMessage,
    sendMediaMessage,
    cancelUpload,
    refreshWorkspace,
    stompReady: Boolean(stompRef.current?.connected),
  };
}
