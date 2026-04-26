package com.darkenrgy.login.auth.security;

import java.util.UUID;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import com.darkenrgy.login.auth.services.ChatService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * WebSocket Event Handler
 * Manages user connection lifecycle
 * - Registers users on connect
 * - Unregisters users on disconnect
 * - Broadcasts presence updates
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class WebSocketEventListener {

    private final ChatService chatService;
    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Handle WebSocket connection events
     * Registers user and broadcasts online status
     */
    @EventListener
    public void handleSessionConnect(SessionConnectedEvent event) {
        try {
            SimpMessageHeaderAccessor messageHeaders = SimpMessageHeaderAccessor.wrap(event.getMessage());
            String sessionId = messageHeaders.getSessionId();
            
            // Extract user ID from principal (set during authentication)
            var principal = event.getUser();
            if (principal != null) {
                String userId = principal.getName(); // JWT subject (UUID string)
                UUID userUUID = UUID.fromString(userId);
                
                // Register user connection in Redis
                chatService.registerUserConnection(userUUID, sessionId);
                
                // Store user ID in session for later use
                var sessionAttributes = messageHeaders.getSessionAttributes();
                if (sessionAttributes != null) {
                    sessionAttributes.put("senderId", userId);
                }
                
                // Broadcast online status
                messagingTemplate.convertAndSend(
                    "/topic/online-users",
                        userId + " is now online"
                );
                
                log.info("User {} connected (session: {})", userUUID, sessionId);
            }
            
        } catch (IllegalArgumentException | IllegalStateException e) {
            log.error("Error handling WebSocket connect event", e);
        }
    }

    /**
     * Handle WebSocket disconnection events
     * Unregisters user and broadcasts offline status
     */
    @EventListener
    public void handleSessionDisconnect(SessionDisconnectEvent event) {
        try {
            var principal = event.getUser();
            if (principal != null) {
                String userId = principal.getName(); // JWT subject (UUID string)
                UUID userUUID = UUID.fromString(userId);
                
                // Unregister user connection
                chatService.unregisterUserConnection(userUUID);
                
                // Broadcast offline status
                messagingTemplate.convertAndSend(
                    "/topic/online-users",
                        userId + " is now offline"
                );
                
                log.info("User {} disconnected", userUUID);
            }
            
        } catch (IllegalArgumentException | IllegalStateException e) {
            log.error("Error handling WebSocket disconnect event", e);
        }
    }
}
