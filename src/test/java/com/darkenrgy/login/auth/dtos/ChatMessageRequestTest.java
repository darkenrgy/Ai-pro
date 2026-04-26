package com.darkenrgy.login.auth.dtos;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.UUID;

import org.junit.jupiter.api.Test;

class ChatMessageRequestTest {

    @Test
    void resolveEncryptedContentPrefersContentField() {
        ChatMessageRequest request = ChatMessageRequest.builder()
                .messageId(UUID.randomUUID())
                .receiverId(UUID.randomUUID())
                .encryptedMessage("legacy-value")
                .content("typed-envelope-value")
                .build();

        assertEquals("typed-envelope-value", request.resolveEncryptedContent());
    }

    @Test
    void resolveEncryptedContentFallsBackToLegacyEncryptedMessage() {
        ChatMessageRequest request = ChatMessageRequest.builder()
                .messageId(UUID.randomUUID())
                .receiverId(UUID.randomUUID())
                .encryptedMessage("legacy-value")
                .build();

        assertEquals("legacy-value", request.resolveEncryptedContent());
    }

    @Test
    void builderDefaultsMessageTypeToText() {
        ChatMessageRequest request = ChatMessageRequest.builder()
                .receiverId(UUID.randomUUID())
                .encryptedMessage("ciphertext")
                .build();

        assertEquals(ChatMessageType.TEXT, request.getType());
    }
}
