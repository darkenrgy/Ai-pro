import asyncio
import base64
import json
import uuid
from datetime import datetime, UTC

import aiohttp
import websockets

BASE_URL = "http://localhost:8080"
WS_URL = "ws://localhost:8080/ws/chat"


def stomp_connect_frame(token: str) -> str:
    return (
        "CONNECT\n"
        "accept-version:1.2\n"
        f"Authorization:Bearer {token}\n"
        "heart-beat:0,0\n\n"
        "\x00"
    )


def stomp_subscribe_frame(sub_id: str, destination: str) -> str:
    return f"SUBSCRIBE\nid:{sub_id}\ndestination:{destination}\n\n\x00"


def stomp_send_frame(destination: str, payload: dict) -> str:
    body = json.dumps(payload)
    return (
        "SEND\n"
        f"destination:{destination}\n"
        "content-type:application/json\n\n"
        f"{body}\n\x00"
    )


def parse_stomp_message(frame: str):
    if not frame.startswith("MESSAGE"):
        return None
    sep = frame.find("\n\n")
    if sep < 0:
        return None
    body = frame[sep + 2 :]
    if body.endswith("\x00"):
        body = body[:-1]
    try:
        return json.loads(body)
    except Exception:
        return None


async def create_user_and_login(session: aiohttp.ClientSession, tag: str):
    ts = int(datetime.now(UTC).timestamp() * 1000)
    email = f"ws-rt-{tag}-{ts}@example.com"
    password = "WebSocketTest!123"

    reg = {
        "name": f"WS {tag}",
        "email": email,
        "password": password,
        "image": "https://example.com/avatar.png",
    }
    async with session.post(f"{BASE_URL}/api/v1/auth/register", json=reg) as r:
        if r.status != 201:
            raise RuntimeError(f"register failed {tag}: {r.status} {await r.text()}")

    async with session.post(
        f"{BASE_URL}/api/v1/auth/login", json={"email": email, "password": password}
    ) as r:
        if r.status != 200:
            raise RuntimeError(f"login failed {tag}: {r.status} {await r.text()}")
        data = await r.json()

    return {"email": email, "userId": data["userId"], "token": data["accessToken"]}


async def ws_connect_and_subscribe(token: str, session_id: str):
    ws = await websockets.connect(WS_URL)
    await ws.send(stomp_connect_frame(token))
    connected = await ws.recv()
    if "CONNECTED" not in connected:
        raise RuntimeError(f"stomp connect failed: {connected}")

    await ws.send(stomp_subscribe_frame(str(uuid.uuid4()), "/user/queue/messages"))
    await ws.send(
        stomp_subscribe_frame(
            str(uuid.uuid4()), f"/topic/sessions/{session_id}/messages"
        )
    )
    return ws


async def recv_until_match(ws, expected_sender: str, expected_receiver: str, timeout: float = 8.0):
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    while loop.time() < deadline:
        remaining = deadline - loop.time()
        frame = await asyncio.wait_for(ws.recv(), timeout=remaining)
        payload = parse_stomp_message(frame)
        if not payload:
            continue
        if payload.get("senderId") == expected_sender and payload.get("receiverId") == expected_receiver:
            return payload
    raise TimeoutError("did not receive expected message payload")


async def main():
    print("[TEST] create users")
    async with aiohttp.ClientSession() as http:
        alice = await create_user_and_login(http, "alice")
        bob = await create_user_and_login(http, "bob")

        print("[TEST] create session by alice")
        headers_a = {"Authorization": f"Bearer {alice['token']}"}
        async with http.post(
            f"{BASE_URL}/api/v1/session/create",
            json={
                "sessionName": f"WS Roundtrip {uuid.uuid4()}",
                "description": "roundtrip",
                "expirationMinutes": 60,
            },
            headers=headers_a,
        ) as r:
            if r.status != 201:
                raise RuntimeError(f"session create failed: {r.status} {await r.text()}")
            session_data = await r.json()

        session_id = session_data["sessionId"]

        print("[TEST] fetch host node")
        async with http.get(
            f"{BASE_URL}/api/v1/session/{session_id}/me", headers=headers_a
        ) as r:
            if r.status != 200:
                raise RuntimeError(f"host node read failed: {r.status} {await r.text()}")
            host_node = await r.json()

        print("[TEST] bob joins")
        headers_b = {"Authorization": f"Bearer {bob['token']}"}
        async with http.post(
            f"{BASE_URL}/api/v1/session/join",
            json={"sessionId": session_id, "parentNodeId": host_node["nodeId"]},
            headers=headers_b,
        ) as r:
            if r.status != 201:
                raise RuntimeError(f"join failed: {r.status} {await r.text()}")

        print("[TEST] websocket connect + subscribe")
        ws_a = await ws_connect_and_subscribe(alice["token"], session_id)
        ws_b = await ws_connect_and_subscribe(bob["token"], session_id)

        try:
            print("[TEST] alice -> bob")
            msg1 = {
                "messageId": str(uuid.uuid4()),
                "receiverId": bob["userId"],
                "sessionId": session_id,
                "encryptedMessage": base64.b64encode(b"same-shared-secret: hello bob").decode(),
            }
            await ws_a.send(stomp_send_frame("/app/chat/send", msg1))
            p1 = await recv_until_match(ws_b, alice["userId"], bob["userId"]) 

            print("[TEST] bob -> alice")
            msg2 = {
                "messageId": str(uuid.uuid4()),
                "receiverId": alice["userId"],
                "sessionId": session_id,
                "encryptedMessage": base64.b64encode(b"same-shared-secret: hello alice").decode(),
            }
            await ws_b.send(stomp_send_frame("/app/chat/send", msg2))
            p2 = await recv_until_match(ws_a, bob["userId"], alice["userId"]) 

            print("PASS: realtime roundtrip works")
            print(f"sessionId={session_id}")
            print(f"alice={alice['userId']}")
            print(f"bob={bob['userId']}")
            print(f"msg1Id={p1.get('messageId')}")
            print(f"msg2Id={p2.get('messageId')}")
        finally:
            await ws_a.close()
            await ws_b.close()


if __name__ == "__main__":
    asyncio.run(main())
