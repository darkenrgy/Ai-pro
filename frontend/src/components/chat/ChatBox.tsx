import { useEffect, useRef } from 'react';
import { MessageBubble } from '@/components/chat/MessageBubble';
import type { ChatMessage } from '@/types/chat';

interface ChatBoxProps {
  messages: ChatMessage[];
  chatKey: CryptoKey;
}

export function ChatBox({ messages, chatKey }: ChatBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const uniqueMessages = Array.from(new Map(messages.map((message) => [message.id, message])).values());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [messages]);

  return (
    <div ref={containerRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
      {messages.length === 0 ? <p className="text-sm text-slate-400">No messages yet. Start a private exchange.</p> : null}
      {uniqueMessages.map((message) => (
        <MessageBubble key={message.id} message={message} chatKey={chatKey} />
      ))}
    </div>
  );
}
