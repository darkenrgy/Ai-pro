import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatBox } from '@/components/chat/ChatBox';

vi.mock('@/components/chat/MessageBubble', () => ({
  MessageBubble: ({ message }: { message: { id: string; content: string } }) => (
    <div data-testid="message-bubble" data-message-id={message.id}>
      {message.content}
    </div>
  ),
}));

describe('ChatBox', () => {
  it('renders each message id only once', () => {
    render(
      <ChatBox
        chatKey={{} as CryptoKey}
        messages={[
          {
            id: 'c8b5816d-bff3-4c0b-9609-23a67bc7b5d7',
            messageId: 'c8b5816d-bff3-4c0b-9609-23a67bc7b5d7',
            senderId: 'user-a',
            senderName: 'Alice',
            content: 'First copy',
            type: 'text',
            timestamp: new Date().toISOString(),
            isOwn: false,
          },
          {
            id: 'c8b5816d-bff3-4c0b-9609-23a67bc7b5d7',
            messageId: 'c8b5816d-bff3-4c0b-9609-23a67bc7b5d7',
            senderId: 'user-a',
            senderName: 'Alice',
            content: 'Second copy',
            type: 'text',
            timestamp: new Date().toISOString(),
            isOwn: false,
          },
        ]}
      />
    );

    expect(screen.getAllByTestId('message-bubble')).toHaveLength(1);
    expect(screen.getByTestId('message-bubble')).toHaveTextContent('Second copy');
  });
});