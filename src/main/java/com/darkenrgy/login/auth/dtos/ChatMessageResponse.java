package com.darkenrgy.login.auth.dtos;

import java.time.Instant;
import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Response DTO for chat messages
 * Sent to recipients with message details
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class ChatMessageResponse {

    private UUID messageId;

    private UUID senderId;

    private UUID receiverId;

    private String encryptedMessage;

    private ChatMessageType type;

    private String content;

    private Instant timestamp;

    /**
     * Session context (if applicable)
     */
    private UUID sessionId;

    /**
     * Message delivery status
     */
    @Builder.Default
    private String status = "DELIVERED";
}
