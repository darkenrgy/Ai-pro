package com.darkenrgy.login.auth.services;

import java.util.UUID;

/**
 * Chat Service Interface
 * Handles chat-related operations and user connection tracking
 */
public interface ChatService {

    /**
     * Check if a user is currently connected
     * @param userId the user ID to check
     * @return true if user is connected, false otherwise
     */
    boolean isUserConnected(UUID userId);

    /**
     * Register user as connected (called on WebSocket connect)
     * @param userId the user ID
     * @param sessionId the WebSocket session ID
     */
    void registerUserConnection(UUID userId, String sessionId);

    /**
     * Unregister user as disconnected (called on WebSocket disconnect)
     * @param userId the user ID
     */
    void unregisterUserConnection(UUID userId);

    /**
     * Get all connected users
     * @return count of connected users
     */
    long getConnectedUserCount();
}
