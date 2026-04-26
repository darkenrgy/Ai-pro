package com.darkenrgy.login.auth.controller;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.server.ResponseStatusException;

import com.darkenrgy.login.auth.dtos.AiModerationResponse;
import com.darkenrgy.login.auth.dtos.ChatMessageRequest;
import com.darkenrgy.login.auth.dtos.ChatMessageResponse;
import com.darkenrgy.login.auth.dtos.ChatMessageType;
import com.darkenrgy.login.auth.dtos.ModeratedChatResponse;
import com.darkenrgy.login.auth.dtos.ModerationSignalRequest;
import com.darkenrgy.login.auth.dtos.ModerationSignalResponse;
import com.darkenrgy.login.auth.dtos.SessionDto;
import com.darkenrgy.login.auth.dtos.UserNodeDto;
import com.darkenrgy.login.auth.services.AIService;
import com.darkenrgy.login.auth.services.ChatService;
import com.darkenrgy.login.auth.services.ModerationSignalService;
import com.darkenrgy.login.auth.services.SessionService;
import com.darkenrgy.login.auth.services.UserNodeService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * WebSocket Chat Controller
 * Handles real-time encrypted messaging between users
 * - Uses STOMP protocol over WebSocket
 * - Messages are pre-encrypted on client, server only routes
 * - Session-based message delivery with user authentication
 */
@Controller
@RequestMapping("/api/v1/chat")
@RequiredArgsConstructor
@Slf4j
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;
    private final ChatService chatService;
    private final SessionService sessionService;
    private final UserNodeService userNodeService;
    private final AIService aiService;
    private final ModerationSignalService moderationSignalService;
    private final ConcurrentMap<UUID, Deque<ChatMessageResponse>> sessionHistory = new ConcurrentHashMap<>();
    private static final int MAX_HISTORY_PER_SESSION = 500;

    @GetMapping("/sessions/{sessionId}/connected-users")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<UUID>> getConnectedUsers(@PathVariable UUID sessionId) {
        SessionDto session = sessionService.getSessionDetails(sessionId);
        List<UUID> participantIds = session.getParticipants().stream()
                .map(UserNodeDto::getUserId)
                .distinct()
                .toList();

        List<UUID> connectedUsers = participantIds.stream()
                .filter(chatService::isUserConnected)
                .toList();

        // Fallback when presence tracking is unavailable (e.g., Redis down in local dev).
        if (connectedUsers.isEmpty()) {
            return ResponseEntity.ok(participantIds);
        }

        return ResponseEntity.ok(connectedUsers);
    }

    /**
     * Handle incoming chat messages
     * Route: /app/chat/send (client sends to /app/chat/send)
     * @param chatMessage the encrypted message request
     * @param headerAccessor for extracting sender context
     */
    @MessageMapping("/chat/send")
    public void handleChatMessage(
            @Valid @Payload ChatMessageRequest chatMessage,
            SimpMessageHeaderAccessor headerAccessor) {

        try {
            UUID senderUUID = requireSenderId(headerAccessor);
            if (chatMessage.getModerationContent() != null && !chatMessage.getModerationContent().isBlank()) {
                routeModeratedMessage(senderUUID, chatMessage, true);
            } else {
                routeMessage(senderUUID, chatMessage);
            }

        } catch (ResponseStatusException exception) {
            log.error("Blocked chat message", exception);
            UUID senderId = requireSenderIdSafely(headerAccessor);
            if (senderId != null) {
                sendErrorToUser(messagingTemplate, senderId, exception.getReason() != null ? exception.getReason() : "Message blocked by moderation");
            }
        } catch (IllegalArgumentException | IllegalStateException exception) {
            log.error("Error processing chat message", exception);
        }
    }

    @PostMapping("/send")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ModeratedChatResponse> sendMessageHttp(
            @Valid @RequestBody ChatMessageRequest chatMessage,
            Authentication authentication) {
        UUID senderUUID = UUID.fromString(authentication.getName());
        ModeratedChatResponse response;
        try {
            response = routeModeratedMessage(senderUUID, chatMessage, true);
        } catch (ResponseStatusException exception) {
            throw exception;
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, exception.getMessage());
        }
        return ResponseEntity.ok(response);
    }

    @GetMapping("/sessions/{sessionId}/messages")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<ChatMessageResponse>> getSessionMessages(
            @PathVariable UUID sessionId,
            Authentication authentication) {
        UUID requesterId = UUID.fromString(authentication.getName());
        if (!userNodeService.hasChatPermission(sessionId, requesterId)) {
            return ResponseEntity.ok(List.of());
        }

        Deque<ChatMessageResponse> history = sessionHistory.getOrDefault(sessionId, new LinkedList<>());
        List<ChatMessageResponse> visibleMessages = history.stream()
                .filter(message -> requesterId.equals(message.getSenderId()) || requesterId.equals(message.getReceiverId()))
                .sorted(Comparator.comparing(ChatMessageResponse::getTimestamp))
                .toList();
        return ResponseEntity.ok(visibleMessages);
    }

    /**
     * Handle typing indicators (optional)
     * Route: /app/chat/typing
     * @param receiverId the user being typed to
     * @param headerAccessor for sender context
     */
    @MessageMapping("/chat/typing")
    public void handleTypingIndicator(
            String receiverId,
            SimpMessageHeaderAccessor headerAccessor) {

        try {
            String senderId = requireSenderId(headerAccessor).toString();
                if (receiverId == null || receiverId.isBlank()) {
                return;
                }

            messagingTemplate.convertAndSendToUser(
                    Objects.requireNonNull(receiverId),
                    "/queue/typing",
                    senderId + " is typing..."
            );

        } catch (IllegalArgumentException | IllegalStateException exception) {
            log.error("Error processing typing indicator", exception);
        }
    }

    /**
     * Broadcast user connection status
     * Route: /app/chat/online
     * @param headerAccessor for sender context
     */
    @MessageMapping("/chat/online")
    public void handleUserOnline(SimpMessageHeaderAccessor headerAccessor) {
        try {
            String userId = requireSenderId(headerAccessor).toString();

            messagingTemplate.convertAndSend(
                    "/topic/online-users",
                    userId + " is now online"
            );

            log.info("User {} is now online", userId);

        } catch (IllegalArgumentException | IllegalStateException exception) {
            log.error("Error processing online status", exception);
        }
    }

    /**
     * Send error message to user
     */
    private void sendErrorToUser(SimpMessagingTemplate template, UUID userId, String errorMessage) {
        try {
            template.convertAndSendToUser(
                    Objects.requireNonNull(userId.toString()),
                    "/queue/errors",
                    Objects.requireNonNull(Map.of("error", errorMessage, "timestamp", Instant.now()))
            );
        } catch (RuntimeException exception) {
            log.error("Failed to send error to user {}: {}", userId, exception.getMessage());
        }
    }

    private ChatMessageResponse routeMessage(UUID senderUUID, ChatMessageRequest chatMessage) {
        UUID receiverUUID = chatMessage.getReceiverId();
        UUID sessionId = chatMessage.getSessionId();
        String encryptedContent = chatMessage.resolveEncryptedContent();
        ChatMessageType messageType = chatMessage.getType() != null ? chatMessage.getType() : ChatMessageType.TEXT;

        if (sessionId == null) {
            log.warn("Ignoring chat message without sessionId from {}", senderUUID);
            sendErrorToUser(messagingTemplate, senderUUID, "Message rejected: session not specified");
            throw new IllegalArgumentException("Session ID is required");
        }

        if (!userNodeService.hasChatPermission(sessionId, senderUUID)) {
            log.warn("Sender {} does not have chat permission in session {}", senderUUID, sessionId);
            sendErrorToUser(messagingTemplate, senderUUID, "Message rejected: you do not have chat permission. Wait for host approval.");
            throw new IllegalStateException("Sender does not have chat permission");
        }

        if (!userNodeService.hasChatPermission(sessionId, receiverUUID)) {
            log.warn("Receiver {} does not have chat permission in session {}", receiverUUID, sessionId);
            sendErrorToUser(messagingTemplate, senderUUID, "Message rejected: recipient does not have chat permission in this session.");
            throw new IllegalStateException("Receiver does not have chat permission");
        }

        if (encryptedContent == null || encryptedContent.isBlank()) {
            log.warn("Ignoring empty encrypted payload from {} in session {}", senderUUID, sessionId);
            sendErrorToUser(messagingTemplate, senderUUID, "Message rejected: encrypted content is required");
            throw new IllegalArgumentException("Encrypted content is required");
        }

        UUID messageId = chatMessage.getMessageId() != null ? chatMessage.getMessageId() : UUID.randomUUID();

        ChatMessageResponse response = ChatMessageResponse.builder()
                .messageId(messageId)
                .senderId(senderUUID)
                .receiverId(receiverUUID)
                .encryptedMessage(encryptedContent)
                .content(encryptedContent)
                .type(messageType)
                .sessionId(sessionId)
                .timestamp(Instant.now())
                .status("DELIVERED")
                .build();

        // Deliver to recipient queue.
        messagingTemplate.convertAndSendToUser(
            Objects.requireNonNull(receiverUUID.toString()),
            "/queue/messages",
            Objects.requireNonNull(response)
        );
        // Deliver to sender queue as authoritative echo (sync across tabs/devices).
        messagingTemplate.convertAndSendToUser(
            Objects.requireNonNull(senderUUID.toString()),
            "/queue/messages",
            Objects.requireNonNull(response)
        );

        // Broadcast to session stream so participants get updates immediately even if
        // their client/user destination mapping is stale.
        messagingTemplate.convertAndSend(
            "/topic/sessions/" + sessionId + "/messages",
            response
        );

        persistMessage(sessionId, response);
        log.info("Message routed from {} to {} in session {}", senderUUID, receiverUUID, sessionId);
        return response;
    }

    private ModeratedChatResponse routeModeratedMessage(UUID senderUUID, ChatMessageRequest chatMessage, boolean allowDelivery) {
        String moderationContent = chatMessage.getModerationContent();
        UUID sessionId = chatMessage.getSessionId();

        if (sessionId != null) {
            ModerationSignalResponse currentState = moderationSignalService.getSignalState(
                    hashValue(senderUUID.toString()),
                    hashValue(sessionId.toString())
            );
            if (currentState.isBlockSession()) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,
                        "Chat is blocked due to repeated moderation violations");
            }
        }

        AiModerationResponse moderation = null;
        ModerationSignalResponse moderationSignal = null;

        if (moderationContent != null && !moderationContent.isBlank()) {
            moderation = aiService.analyzeText(moderationContent, sessionId, senderUUID);
            moderationSignal = moderationSignalService.recordSignal(
                    ModerationSignalRequest.builder()
                            .hashedUserId(hashValue(senderUUID.toString()))
                            .hashedSessionId(sessionId != null ? hashValue(sessionId.toString()) : hashValue("anonymous-session"))
                            .riskScore(moderation.riskScore())
                            .category(normalizeCategory(moderation.category()))
                            .action(normalizeAction(moderation))
                            .timestamp(Instant.now())
                            .build()
            );
            if (moderation.blockSession() || moderationSignal.isBlockSession() || "block".equalsIgnoreCase(moderation.action())) {
                throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,
                        "Message blocked by AI moderation");
            }
        }

        ChatMessageResponse deliveredMessage = null;
        if (allowDelivery) {
            deliveredMessage = routeMessage(senderUUID, chatMessage);
        }

        if (moderation == null) {
            return ModeratedChatResponse.builder()
                    .message(deliveredMessage)
                    .action("allow")
                    .riskScore(0)
                    .flagged(false)
                    .category("safe")
                    .blockSession(false)
                    .userViolationCount(0)
                    .sessionViolationCount(0)
                    .build();
        }

        return ModeratedChatResponse.builder()
                .message(deliveredMessage)
                .action(normalizeAction(moderation))
                .riskScore(moderation.riskScore())
                .flagged(moderation.flagged())
                .category(moderation.category())
                .blockSession(moderationSignal != null ? moderationSignal.isBlockSession() : moderation.blockSession())
                .userViolationCount(moderationSignal != null ? moderationSignal.getUserViolationCount() : moderation.userViolationCount())
                .sessionViolationCount(moderationSignal != null ? moderationSignal.getSessionViolationCount() : moderation.sessionViolationCount())
                .build();
    }

    private String normalizeCategory(String category) {
        if (category == null || category.isBlank()) {
            return "safe";
        }

        String normalized = category.trim().toLowerCase();
        return switch (normalized) {
            case "trafficking", "human_trafficking" -> "human_trafficking";
            case "child_exploitation" -> "child_exploitation";
            case "weapons", "illegal_weapons" -> "illegal_weapons";
            default -> "safe";
        };
    }

    private String hashValue(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hashed.length * 2);
            for (byte current : hashed) {
                hex.append(String.format("%02x", current));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Unable to hash moderation keys", exception);
        }
    }

    private String normalizeAction(AiModerationResponse moderation) {
        if (moderation.blockSession()) {
            return "block";
        }
        if (moderation.riskScore() >= 30 && moderation.riskScore() <= 70) {
            return moderation.userViolationCount() >= 2 ? "strong_warn" : "warn";
        }
        if (moderation.riskScore() > 70) {
            return "block";
        }
        return "allow";
    }

    private void persistMessage(UUID sessionId, ChatMessageResponse response) {
        Deque<ChatMessageResponse> history = sessionHistory.computeIfAbsent(sessionId, ignored -> new LinkedList<>());
        synchronized (history) {
            history.addLast(response);
            while (history.size() > MAX_HISTORY_PER_SESSION) {
                history.removeFirst();
            }
        }
    }

    private UUID requireSenderId(SimpMessageHeaderAccessor headerAccessor) {
        Map<String, Object> sessionAttributes = headerAccessor.getSessionAttributes();
        if (sessionAttributes != null) {
            Object senderId = sessionAttributes.get("senderId");
            if (senderId != null) {
                return UUID.fromString(senderId.toString());
            }
        }

        var principal = headerAccessor.getUser();
        if (principal != null && principal.getName() != null) {
            return UUID.fromString(principal.getName());
        }

        throw new IllegalStateException("Sender ID is missing from WebSocket session and principal");
    }

    private UUID requireSenderIdSafely(SimpMessageHeaderAccessor headerAccessor) {
        try {
            return requireSenderId(headerAccessor);
        } catch (RuntimeException exception) {
            return null;
        }
    }
}
