import axios from 'axios';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const BASE = 'http://localhost:8080/api/v1';
const WS = 'http://localhost:8080/ws/chat';

function nowTs() {
  return Date.now();
}

async function createUser(nameSuffix) {
  const ts = nowTs();
  const email = `stomp-${nameSuffix}-${ts}@example.com`;
  const password = 'TestPass!123';

  await axios.post(`${BASE}/auth/register`, {
    name: `Stomp ${nameSuffix}`,
    email,
    password,
    image: 'https://example.com/avatar.png',
  });

  const login = await axios.post(`${BASE}/auth/login`, { email, password });
  return {
    email,
    userId: login.data.userId,
    token: login.data.accessToken,
  };
}

function connectClient(token, sessionId, incoming) {
  return new Promise((resolve, reject) => {
    const client = new Client({
      webSocketFactory: () => new SockJS(WS),
      connectHeaders: {
        Authorization: `Bearer ${token}`,
      },
      reconnectDelay: 0,
      debug: () => undefined,
      onConnect: () => {
        client.subscribe('/user/queue/messages', (message) => {
          try {
            incoming(JSON.parse(message.body));
          } catch {
            // ignore parse errors
          }
        });

        client.subscribe(`/topic/sessions/${sessionId}/messages`, (message) => {
          try {
            incoming(JSON.parse(message.body));
          } catch {
            // ignore parse errors
          }
        });

        resolve(client);
      },
      onStompError: (frame) => reject(new Error(frame.body || 'stomp error')),
      onWebSocketError: () => reject(new Error('websocket error')),
    });

    client.activate();
  });
}

async function waitForMessage(checkFn, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = checkFn();
    if (result) {
      return result;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Timeout waiting for expected message');
}

async function main() {
  console.log('[TEST] create users');
  const alice = await createUser('alice');
  const bob = await createUser('bob');

  console.log('[TEST] create session by alice');
  const s = await axios.post(
    `${BASE}/session/create`,
    {
      sessionName: `SockJS Roundtrip ${nowTs()}`,
      description: 'roundtrip',
      expirationMinutes: 60,
    },
    { headers: { Authorization: `Bearer ${alice.token}` } }
  );
  const sessionId = s.data.sessionId;

  console.log('[TEST] fetch host node and join bob');
  const me = await axios.get(`${BASE}/session/${sessionId}/me`, {
    headers: { Authorization: `Bearer ${alice.token}` },
  });

  await axios.post(
    `${BASE}/session/join`,
    {
      sessionId,
      parentNodeId: me.data.nodeId,
    },
    { headers: { Authorization: `Bearer ${bob.token}` } }
  );

  const inboxA = [];
  const inboxB = [];

  console.log('[TEST] connect sockjs/stomp clients');
  const clientA = await connectClient(alice.token, sessionId, (msg) => inboxA.push(msg));
  const clientB = await connectClient(bob.token, sessionId, (msg) => inboxB.push(msg));

  try {
    console.log('[TEST] alice -> bob');
    const m1 = {
      messageId: crypto.randomUUID(),
      receiverId: bob.userId,
      sessionId,
      encryptedMessage: Buffer.from('same-secret:hello-bob').toString('base64'),
    };
    clientA.publish({ destination: '/app/chat/send', body: JSON.stringify(m1) });

    await waitForMessage(
      () => inboxB.find((m) => m.senderId === alice.userId && m.receiverId === bob.userId),
      10000
    );

    console.log('[TEST] bob -> alice');
    const m2 = {
      messageId: crypto.randomUUID(),
      receiverId: alice.userId,
      sessionId,
      encryptedMessage: Buffer.from('same-secret:hello-alice').toString('base64'),
    };
    clientB.publish({ destination: '/app/chat/send', body: JSON.stringify(m2) });

    await waitForMessage(
      () => inboxA.find((m) => m.senderId === bob.userId && m.receiverId === alice.userId),
      10000
    );

    console.log('PASS: realtime send/receive works');
    console.log(`sessionId=${sessionId}`);
    console.log(`alice=${alice.userId}`);
    console.log(`bob=${bob.userId}`);
  } finally {
    await clientA.deactivate();
    await clientB.deactivate();
  }
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
