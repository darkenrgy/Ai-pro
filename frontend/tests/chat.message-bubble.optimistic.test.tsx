import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '@/components/chat/MessageBubble';

describe('MessageBubble optimistic media preview', () => {
  it('renders local image preview while upload is pending', () => {
    render(
      <MessageBubble
        chatKey={{} as CryptoKey}
        message={{
          id: 'msg-1',
          messageId: 'msg-1',
          senderId: 'user-a',
          senderName: 'Alice',
          content: 'IMAGE: demo.png',
          type: 'image',
          localPreviewUrl: 'blob:preview-image',
          status: 'pending',
          timestamp: new Date().toISOString(),
          isOwn: true,
        }}
      />
    );

    expect(screen.getByText(/Uploading/i)).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:preview-image');
  });
});
