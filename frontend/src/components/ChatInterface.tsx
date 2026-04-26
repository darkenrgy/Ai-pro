import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useAuth } from '@/context/AuthContext';
import { chatApi, WEBSOCKET_URL } from '@/api/chat';
import { sessionApi, SessionDto } from '@/api/session';
import { userApi, UserDto } from '@/api/users';
import { decryptChatMessage, deriveChatKey, encryptChatMessage } from '@/utils/chatEncryption';
import { checkMessage } from '@/utils/moderation';
import '../styles/Chat.css';

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  isOwn: boolean;
}

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

export const ChatInterface: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const [sessionInfo, setSessionInfo] = useState<SessionDto | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [chatKey, setChatKey] = useState<CryptoKey | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [connectionState, setConnectionState] = useState<'locked' | 'connecting' | 'connected' | 'disconnected'>('locked');
  const [connectedUserIds, setConnectedUserIds] = useState<string[]>([]);
  const [userProfiles, setUserProfiles] = useState<Record<string, UserDto>>({});
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [error, setError] = useState('');
  const [warningMessage, setWarningMessage] = useState('');
  const stompRef = useRef<Client | null>(null);
  const userProfilesRef = useRef<Record<string, UserDto>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const connectedParticipants = useMemo(() => {
    return connectedUserIds
      .filter((id) => id !== user?.id)
      .map((id) => userProfiles[id] ?? { id, name: id, email: '' });
  }, [connectedUserIds, user?.id, userProfiles]);

  const loadSessionAndPresence = async () => {
    if (!sessionId) {
      return;
    }

    try {
      const [sessionResponse, connectedResponse] = await Promise.all([
        sessionApi.getSessionDetails(sessionId),
        chatApi.getConnectedUsers(sessionId),
      ]);

      setSessionInfo(sessionResponse.data);
      setConnectedUserIds(connectedResponse.data);
    } catch (loadError) {
      console.error('Failed to load chat data:', loadError);
      setError('Unable to load chat session.');
    }
  };

  useEffect(() => {
    void loadSessionAndPresence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, user?.id]);

  useEffect(() => {
    userProfilesRef.current = userProfiles;
  }, [userProfiles]);

  useEffect(() => {
    if (selectedRecipientId || connectedParticipants.length === 0) {
      return;
    }

    setSelectedRecipientId(connectedParticipants[0].id);
  }, [connectedParticipants, selectedRecipientId]);

  useEffect(() => {
    const missingProfiles = connectedUserIds.filter(
      (id) => id !== user?.id && !userProfilesRef.current[id]
    );

    if (missingProfiles.length === 0) {
      return;
    }

    let cancelled = false;

    const loadProfiles = async () => {
      const profileEntries = await Promise.all(
        missingProfiles.map(async (id) => {
          const response = await userApi.getUserById(id);
          return [id, response.data] as const;
        })
      );

      if (!cancelled) {
        setUserProfiles((previous) => {
          const nextProfiles = { ...previous };
          for (const [id, profile] of profileEntries) {
            nextProfiles[id] = profile;
          }
          return nextProfiles;
        });
      }
    };

    void loadProfiles();

    return () => {
      cancelled = true;
    };
  }, [connectedUserIds, user?.id]);

  useEffect(() => {
    if (!sessionId || !user || !chatKey) {
      return undefined;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError('Authentication token is missing.');
      return undefined;
    }

    setConnectionState('connecting');

    const client = new Client({
      webSocketFactory: () => new SockJS(`${WEBSOCKET_URL}${WEBSOCKET_URL.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`),
      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },
      reconnectDelay: 5000,
      debug: () => undefined,
      onConnect: () => {
        setConnectionState('connected');
        setError('');

        client.subscribe('/user/queue/messages', (message: IMessage) => {
          void (async () => {
            try {
              if (!chatKey) {
                return;
              }

              const payload = JSON.parse(message.body) as {
                senderId: string;
                receiverId: string;
                encryptedMessage: string;
                timestamp: string;
                sessionId?: string;
              };

              const senderProfile = userProfilesRef.current[payload.senderId] ?? (await userApi.getUserById(payload.senderId)).data;
              if (!userProfilesRef.current[payload.senderId]) {
                setUserProfiles((previous) => ({ ...previous, [payload.senderId]: senderProfile }));
              }

              const decryptedContent = await decryptChatMessage(chatKey, payload.encryptedMessage);

              setMessages((previous) => [
                ...previous,
                {
                  id: `${payload.timestamp}-${payload.senderId}-${previous.length}`,
                  senderId: payload.senderId,
                  senderName: senderProfile.name,
                  content: decryptedContent,
                  timestamp: new Date(payload.timestamp),
                  isOwn: payload.senderId === user.id,
                },
              ]);
            } catch (receiveError) {
              console.error('Failed to decrypt incoming message:', receiveError);
              setError('A message could not be decrypted. Verify the session key with the other user.');
            }
          })();
        });

        client.subscribe('/topic/online-status', (message: IMessage) => {
          const update = parsePresenceUpdate(message.body);
          if (!update) {
            return;
          }

          setConnectedUserIds((previous) => {
            const isAlreadyTracked = previous.includes(update.userId);
            if (update.online && !isAlreadyTracked) {
              return [...previous, update.userId];
            }
            if (!update.online && isAlreadyTracked) {
              return previous.filter((id) => id !== update.userId);
            }
            return previous;
          });
        });
      },
      onStompError: (frame: { body: string }) => {
        console.error('STOMP error:', frame.body);
        setConnectionState('disconnected');
        setError(frame.body || 'Unable to establish chat connection.');
      },
      onWebSocketClose: () => {
        setConnectionState('disconnected');
      },
    });

    stompRef.current = client;
    client.activate();

    return () => {
      void client.deactivate();
      stompRef.current = null;
      setConnectionState('disconnected');
    };
  }, [sessionId, user, chatKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleUnlockChat = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!sessionId || !secretValue.trim()) {
      return;
    }

    try {
      setLoadingKey(true);
      const derivedKey = await deriveChatKey(sessionId, secretValue.trim());
      setChatKey(derivedKey);
      setConnectionState('connecting');
      setError('');
    } catch (unlockError) {
      console.error('Failed to unlock chat:', unlockError);
      setError('Could not unlock chat. Check the shared session key.');
    } finally {
      setLoadingKey(false);
    }
  };

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!sessionId || !chatKey || !selectedRecipientId) {
      return;
    }

    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage) {
      return;
    }

    const quickCheck = checkMessage(trimmedMessage);

    try {
      const encryptedMessage = await encryptChatMessage(chatKey, trimmedMessage);
      const messageId = crypto.randomUUID();

      if (!quickCheck.suspicious && stompRef.current?.connected) {
        stompRef.current.publish({
          destination: '/app/chat/send',
          body: JSON.stringify({
            messageId,
            receiverId: selectedRecipientId,
            encryptedMessage,
            sessionId,
          }),
        });
      } else {
        const response = await chatApi.sendMessage({
          messageId,
          receiverId: selectedRecipientId,
          encryptedMessage,
          sessionId,
          content: encryptedMessage,
          moderationContent: quickCheck.suspicious ? trimmedMessage : undefined,
        });

        const moderation = response.data;
        if (moderation.action === 'block') {
          setError('Message blocked by moderation.');
          return;
        }

        if (moderation.action !== 'allow') {
          setWarningMessage(
            moderation.action === 'strong_warn'
              ? 'Repeated moderation warnings detected. Please review this message carefully.'
              : 'This message triggered a moderation warning.'
          );
        }

        if (!stompRef.current?.connected) {
          setError('Realtime chat is reconnecting. Message sent via secure fallback.');
        }
      }

      setMessages((previous) => [
        ...previous,
        {
          id: messageId,
          senderId: user?.id ?? 'me',
          senderName: user?.name ?? 'You',
          content: trimmedMessage,
          timestamp: new Date(),
          isOwn: true,
        },
      ]);
      setInputValue('');
    } catch (sendError) {
      console.error('Failed to encrypt or send message:', sendError);
      setError('Message could not be sent.');
    }
  };

  const selectedRecipient = connectedParticipants.find((participant) => participant.id === selectedRecipientId);

  if (!sessionId || !user) {
    return null;
  }

  return (
    <div className="chat-shell">
      <aside className="chat-sidebar">
        <div className="chat-sidebar__card">
          <p className="eyebrow">Encrypted session</p>
          <h2>{sessionInfo?.sessionName || 'Chat'}</h2>
          <p className="chat-status">
            {connectionState === 'connected'
              ? 'Connected'
              : connectionState === 'connecting'
                ? 'Connecting'
                : connectionState === 'locked'
                  ? 'Locked'
                  : 'Disconnected'}
          </p>
          <p className="chat-subtitle">
            Messages are encrypted in the browser before they leave your device.
          </p>
        </div>

        <div className="chat-sidebar__card">
          <div className="chat-sidebar__header">
            <h3>Connected users</h3>
            <span className="chat-count">{connectedUserIds.length}</span>
          </div>

          <div className="user-list">
            {connectedParticipants.length === 0 ? (
              <div className="empty-state">No other users are connected yet.</div>
            ) : (
              connectedParticipants.map((participant) => (
                <button
                  key={participant.id}
                  type="button"
                  className={`user-chip ${selectedRecipientId === participant.id ? 'active' : ''}`}
                  onClick={() => setSelectedRecipientId(participant.id)}
                >
                  <span>
                    {participant.name}
                    {participant.id === user.id ? ' (you)' : ''}
                  </span>
                  <small>{participant.email}</small>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      <main className="chat-main">
        {error && <div className="error-message chat-error">{error}</div>}

        {warningMessage ? (
          <div className="moderation-banner warning">
            <div>
              <strong>Moderation warning</strong>
              <p>{warningMessage}</p>
            </div>
          </div>
        ) : null}

        {!chatKey ? (
          <section className="lock-panel">
            <div className="chat-sidebar__card lock-card">
              <p className="eyebrow">End-to-end encryption</p>
              <h3>Unlock this chat</h3>
              <p className="chat-subtitle">
                Enter the shared session key used by everyone in this room. The server never receives it.
              </p>

              <form className="unlock-form" onSubmit={handleUnlockChat}>
                <div className="form-group">
                  <label htmlFor="session-secret">Session key</label>
                  <input
                    id="session-secret"
                    type="password"
                    value={secretValue}
                    onChange={(event) => setSecretValue(event.target.value)}
                    placeholder="Enter the shared session key"
                    autoComplete="off"
                  />
                </div>

                <button type="submit" className="btn-primary" disabled={loadingKey}>
                  {loadingKey ? 'Unlocking...' : 'Unlock chat'}
                </button>
              </form>
            </div>
          </section>
        ) : (
          <>
            <section className="chat-header">
              <div>
                <p className="eyebrow">Direct encrypted message</p>
                <h2>
                  {selectedRecipient
                    ? `Chat with ${selectedRecipient.name}`
                    : 'Choose a connected user'}
                </h2>
                <p className="chat-subtitle">
                  No message storage. Content stays in memory only.
                </p>
              </div>
              <div className="chat-header__meta">
                <span className={`connection-pill ${connectionState}`}>{connectionState}</span>
              </div>
            </section>

            <section className="messages-container">
              {messages.length === 0 ? (
                <div className="no-messages">No messages yet. Select a connected user and start the conversation.</div>
              ) : (
                messages.map((message) => (
                  <article key={message.id} className={`message ${message.isOwn ? 'own' : 'other'}`}>
                    <div className="message-header">
                      <span className="sender-name">{message.senderName}</span>
                      <span className="timestamp">{message.timestamp.toLocaleTimeString()}</span>
                    </div>
                    <div className="message-content">{message.content}</div>
                  </article>
                ))
              )}
              <div ref={messagesEndRef} />
            </section>

            <form className="chat-input-form" onSubmit={handleSendMessage}>
              <select
                className="recipient-select"
                value={selectedRecipientId}
                onChange={(event) => setSelectedRecipientId(event.target.value)}
                disabled={connectedParticipants.length === 0}
              >
                <option value="">Select connected user</option>
                {connectedParticipants.map((participant) => (
                  <option key={participant.id} value={participant.id}>
                    {participant.name}
                    {participant.id === user.id ? ' (you)' : ''}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={inputValue}
                onChange={(event) => {
                  setInputValue(event.target.value);
                  setWarningMessage('');
                }}
                placeholder="Type an encrypted message..."
                disabled={!selectedRecipientId}
                className={warningMessage ? 'chat-input chat-input-warning' : 'chat-input'}
              />

              <button
                type="submit"
                disabled={
                  !selectedRecipientId ||
                  !inputValue.trim()
                }
                className="btn-send"
              >
                Send
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
};
