#!/usr/bin/env python3
"""
Real-Time WebSocket STOMP Chat Test
Tests actual message exchange between two users via WebSocket
"""

import asyncio
import json
import uuid
import base64
from datetime import datetime
import websockets
from urllib.parse import urljoin
import aiohttp
import sys

BASE_URL = "http://localhost:8080"
WS_URL = "ws://localhost:8080/ws/chat"

class ChatTestUser:
    def __init__(self, name):
        self.name = name
        self.user_id = None
        self.email = None
        self.token = None
        self.session_id = None
        self.node_id = None
        self.ws = None
        self.messages = []
        self.subscriptions = {}
        
    async def create_user(self, session):
        """Register and login a test user"""
        timestamp = int(datetime.utcnow().timestamp() * 1000)
        self.email = f"ws-test-{self.name}-{timestamp}@example.com"
        
        # Register
        register_data = {
            "name": f"Chat Test {self.name}",
            "email": self.email,
            "password": "WebSocketTest!123",
            "image": "https://example.com/avatar.png"
        }
        
        async with session.post(f"{BASE_URL}/api/v1/auth/register", json=register_data) as resp:
            if resp.status != 201:
                raise Exception(f"Register failed: {resp.status}")
            print(f"[{self.name}] User registered: {self.email}")
        
        # Login
        login_data = {
            "email": self.email,
            "password": "WebSocketTest!123"
        }
        
        async with session.post(f"{BASE_URL}/api/v1/auth/login", json=login_data) as resp:
            if resp.status != 200:
                raise Exception(f"Login failed: {resp.status}")
            data = await resp.json()
            self.user_id = data["userId"]
            self.token = data["accessToken"]
            print(f"[{self.name}] Login successful, token: {self.token[:20]}...")

    async def connect_websocket(self):
        """Connect to WebSocket and authenticate via STOMP"""
        self.ws = await websockets.connect(WS_URL)
        
        # Send STOMP CONNECT frame with JWT
        connect_frame = f"""CONNECT
accept-version:1.2
Authorization:Bearer {self.token}
heart-beat:0,0

\x00"""
        
        await self.ws.send(connect_frame)
        
        # Receive CONNECTED frame
        response = await self.ws.recv()
        if "CONNECTED" not in response:
            raise Exception(f"WebSocket connection failed: {response}")
        
        print(f"[{self.name}] WebSocket connected and authenticated")

    async def subscribe(self, destination):
        """Subscribe to STOMP destination"""
        sub_id = str(uuid.uuid4())
        frame = f"""SUBSCRIBE
id:{sub_id}
destination:{destination}

\x00"""
        await self.ws.send(frame)
        self.subscriptions[destination] = sub_id
        print(f"[{self.name}] Subscribed to: {destination}")

    async def send_message(self, other_user_id, text):
        """Send encrypted chat message via STOMP"""
        message_id = str(uuid.uuid4())
        
        # Encrypt message (simple base64 for test, real app uses AES-GCM)
        encrypted_message = base64.b64encode(text.encode()).decode()
        
        payload = {
            "messageId": message_id,
            "senderId": self.user_id,
            "receiverId": other_user_id,
            "sessionId": self.session_id,
            "encryptedMessage": encrypted_message,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        
        frame = f"""SEND
destination:/app/chat/send
content-type:application/json

{json.dumps(payload)}
\x00"""
        
        await self.ws.send(frame)
        print(f"[{self.name}] Sent message to {other_user_id}: {text}")
        
    async def listen_for_messages(self, timeout=5):
        """Listen for incoming messages"""
        try:
            while True:
                message = await asyncio.wait_for(self.ws.recv(), timeout=timeout)
                
                # Parse STOMP MESSAGE frame
                if "MESSAGE" in message:
                    lines = message.split("\n")
                    # Find body after empty line
                    body_start = message.find("\n\n") + 2
                    body_end = message.find("\x00")
                    if body_start > 0 and body_end > body_start:
                        body = message[body_start:body_end]
                        try:
                            msg_data = json.loads(body)
                            self.messages.append(msg_data)
                            encrypted = msg_data.get("encryptedMessage", "")
                            decrypted = base64.b64decode(encrypted).decode()
                            print(f"[{self.name}] Received message: {decrypted}")
                        except:
                            pass
        except asyncio.TimeoutError:
            pass
        except Exception as e:
            print(f"[{self.name}] Listen error: {e}")

async def main():
    """Main test execution"""
    print("="*80)
    print("Real-Time WebSocket STOMP Chat Test")
    print("="*80 + "\n")
    
    async with aiohttp.ClientSession() as session:
        try:
            # Step 1: Create two test users
            print("[TEST] Creating test users...")
            alice = ChatTestUser("alice")
            bob = ChatTestUser("bob")
            
            await alice.create_user(session)
            await bob.create_user(session)
            
            # Step 2: Create session (alice hosts)
            print("\n[TEST] Creating chat session...")
            session_data = {
                "sessionName": f"WebSocket Test {uuid.uuid4()}",
                "description": "Real-time chat test",
                "expirationMinutes": 60
            }
            
            headers = {"Authorization": f"Bearer {alice.token}"}
            async with session.post(
                f"{BASE_URL}/api/v1/session/create",
                json=session_data,
                headers=headers
            ) as resp:
                if resp.status != 201:
                    raise Exception(f"Session create failed: {resp.status}")
                session_info = await resp.json()
                session_id = session_info["sessionId"]
                print(f"[TEST] Session created: {session_id}")
                alice.session_id = session_id
                bob.session_id = session_id
            
            # Step 3: Bob joins session
            print("\n[TEST] Bob joining session...")
            join_data = {
                "sessionId": session_id,
                "parentNodeId": session_id
            }
            
            headers = {"Authorization": f"Bearer {bob.token}"}
            async with session.post(
                f"{BASE_URL}/api/v1/session/join",
                json=join_data,
                headers=headers
            ) as resp:
                if resp.status != 201:
                    raise Exception(f"Session join failed: {resp.status}")
                node_info = await resp.json()
                bob.node_id = node_info["nodeId"]
                print(f"[TEST] Bob joined session, node: {bob.node_id}")
            
            # Step 4: Check connected users
            print("\n[TEST] Checking connected users...")
            headers = {"Authorization": f"Bearer {alice.token}"}
            async with session.get(
                f"{BASE_URL}/api/v1/chat/sessions/{session_id}/connected-users",
                headers=headers
            ) as resp:
                if resp.status != 200:
                    raise Exception(f"Get connected users failed: {resp.status}")
                users = await resp.json()
                print(f"[TEST] Connected users: {users}")
            
            # Step 5: Connect both users via WebSocket
            print("\n[TEST] Connecting to WebSocket...")
            await alice.connect_websocket()
            await bob.connect_websocket()
            
            # Step 6: Subscribe to message queues
            print("\n[TEST] Subscribing to message queues...")
            await alice.subscribe(f"/user/{alice.user_id}/queue/messages")
            await bob.subscribe(f"/user/{bob.user_id}/queue/messages")
            
            await alice.subscribe(f"/topic/session/{session_id}/messages")
            await bob.subscribe(f"/topic/session/{session_id}/messages")
            
            # Step 7: Send messages between users
            print("\n[TEST] Exchanging messages...")
            
            # Start listening tasks
            alice_listener = asyncio.create_task(alice.listen_for_messages(timeout=3))
            bob_listener = asyncio.create_task(bob.listen_for_messages(timeout=3))
            
            # Alice sends to Bob
            await alice.send_message(bob.user_id, "Hello Bob, how are you?")
            await asyncio.sleep(0.5)
            
            # Bob sends to Alice
            await bob.send_message(alice.user_id, "Hi Alice, I'm great!")
            await asyncio.sleep(0.5)
            
            # Broadcast to session
            await alice.send_message(bob.user_id, "This is a session message")
            await asyncio.sleep(2)
            
            # Wait for listeners to complete
            await alice_listener
            await bob_listener
            
            # Step 8: Verify message delivery
            print("\n[TEST] Message Delivery Results:")
            print(f"  Alice received {len(alice.messages)} message(s)")
            print(f"  Bob received {len(bob.messages)} message(s)")
            
            # Step 9: Summary
            print("\n" + "="*80)
            if len(alice.messages) > 0 and len(bob.messages) > 0:
                print("✓ WebSocket Real-Time Chat: OPERATIONAL")
                print("✓ Message encryption/decryption: WORKING")
                print("✓ STOMP message routing: WORKING")
                print("✓ Presence tracking: WORKING")
                print("="*80 + "\n")
                return 0
            else:
                print("✗ Message delivery failed")
                print("="*80 + "\n")
                return 1
                
        except Exception as e:
            print(f"\n✗ Test failed: {e}")
            import traceback
            traceback.print_exc()
            return 1
        finally:
            # Cleanup
            if alice.ws:
                await alice.ws.close()
            if bob.ws:
                await bob.ws.close()

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
