package com.darkenrgy.login.auth.services.impl;

import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.Objects;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import com.darkenrgy.login.auth.services.ChatService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Chat Service Implementation
 * Tracks connected users via Redis for distributed session support
 * - Stores user connection sessions
 * - Supports real-time user presence tracking
 * - Handles connection lifecycle management
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ChatServiceImpl implements ChatService {

    private final RedisTemplate<String, String> redisTemplate;

    private static final String USER_SESSIONS_PREFIX = "chat:user:";
    private static final String CONNECTED_USERS_SET = "chat:connected-users";
    private static final long SESSION_TIMEOUT_MINUTES = 30;

    /**
     * Check if user is connected
     * @param userId the user ID
     * @return true if user has active session
     */
    @Override
    public boolean isUserConnected(UUID userId) {
        String key = USER_SESSIONS_PREFIX + userId;
        try {
            Boolean exists = redisTemplate.hasKey(key);
            return exists != null && exists;
        } catch (Exception ex) {
            log.warn("Redis unavailable while checking chat presence for {}", userId);
            return false;
        }
    }

    /**
     * Register user connection
     * Stores session ID in Redis with expiration
     * @param userId the user ID
     * @param sessionId the WebSocket session ID
     */
    @Override
    public void registerUserConnection(UUID userId, String sessionId) {
        String key = USER_SESSIONS_PREFIX + userId;

        try {
            // Store session ID with timeout
            redisTemplate.opsForValue().set(
                    key,
                    Objects.requireNonNull(sessionId),
                    SESSION_TIMEOUT_MINUTES,
                    TimeUnit.MINUTES
            );

            // Add to connected users set
            redisTemplate.opsForSet().add(CONNECTED_USERS_SET, userId.toString());

            log.info("User {} connected with session {}", userId, sessionId);
        } catch (Exception ex) {
            log.warn("Redis unavailable while registering chat connection for {}", userId);
        }
    }

    /**
     * Unregister user connection
     * Removes session from Redis
     * @param userId the user ID
     */
    @Override
    public void unregisterUserConnection(UUID userId) {
        String key = USER_SESSIONS_PREFIX + userId;

        try {
            // Remove session entry
            Boolean deleted = redisTemplate.delete(key);

            // Remove from connected users set
            redisTemplate.opsForSet().remove(CONNECTED_USERS_SET, userId.toString());

            if (deleted != null && deleted) {
                log.info("User {} disconnected", userId);
            }
        } catch (Exception ex) {
            log.warn("Redis unavailable while unregistering chat connection for {}", userId);
        }
    }

    /**
     * Get count of connected users
     * @return number of users with active sessions
     */
    @Override
    public long getConnectedUserCount() {
        try {
            Long count = redisTemplate.opsForSet().size(CONNECTED_USERS_SET);
            return count != null ? count : 0;
        } catch (Exception ex) {
            log.warn("Redis unavailable while fetching connected user count");
            return 0;
        }
    }
}
