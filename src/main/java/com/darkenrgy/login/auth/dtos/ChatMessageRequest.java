package com.darkenrgy.login.auth.dtos;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Request DTO for chat messages
 * Handles encrypted messages between users
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class ChatMessageRequest {

    private UUID messageId;

    @NotNull(message = "Receiver ID is required")
    private UUID receiverId;

    @Size(max = 4000, message = "Message content is too long")
    private String encryptedMessage;

    /**
     * Explicit payload type for strict socket envelope handling.
     */
    @Builder.Default
    private ChatMessageType type = ChatMessageType.TEXT;

    /**
     * Encrypted envelope content. Preferred over encryptedMessage for new clients.
     */
    @Size(max = 4000, message = "Content is too long")
    private String content;

    /**
     * Plaintext content for moderation checks. Never forwarded to recipients.
     */
    @Size(max = 4000, message = "Moderation content is too long")
    private String moderationContent;

    /**
     * Optional: session context (for group/session-based chats)
     */
    private UUID sessionId;

    public String resolveEncryptedContent() {
        if (content != null && !content.isBlank()) {
            return content;
        }
        if (encryptedMessage != null && !encryptedMessage.isBlank()) {
            return encryptedMessage;
        }
        return null;
    }
}
