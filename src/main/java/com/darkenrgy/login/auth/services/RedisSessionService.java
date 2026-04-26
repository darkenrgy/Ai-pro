package com.darkenrgy.login.auth.services;

import java.util.Optional;
import java.util.UUID;

import com.darkenrgy.login.auth.dtos.RedisSessionData;

/**
 * Redis Session Service Interface
 * Manages temporary session storage with TTL and auto-expiry
 */
public interface RedisSessionService {
    
    /**
     * Store session in Redis with TTL
     * @param sessionData the session data to cache
     * @param ttlMinutes time-to-live in minutes
     */
    void cacheSession(RedisSessionData sessionData, long ttlMinutes);
    
    /**
     * Retrieve cached session
     * @param sessionId the session ID
     * @return session data if exists
     */
    Optional<RedisSessionData> getSession(UUID sessionId);
    
    /**
     * Update last activity timestamp
     * @param sessionId the session ID
     */
    void updateSessionActivity(UUID sessionId);
    
    /**
     * Check if session exists in cache
     * @param sessionId the session ID
     * @return true if cached
     */
    boolean isSessionCached(UUID sessionId);
    
    /**
     * Remove session from cache (manual eviction)
     * @param sessionId the session ID
     */
    void removeSession(UUID sessionId);
    
    /**
     * Store user's active session membership
     * @param userId the user ID
     * @param sessionId the session ID
     * @param ttlMinutes time-to-live in minutes
     */
    void cacheUserSession(UUID userId, UUID sessionId, long ttlMinutes);
    
    /**
     * Retrieve user's active session
     * @param userId the user ID
     * @return session ID if user has active session
     */
    Optional<UUID> getUserSession(UUID userId);
    
    /**
     * Remove user's session membership
     * @param userId the user ID
     */
    void removeUserSession(UUID userId);
    
    /**
     * Get count of active sessions in Redis
     * @return number of cached sessions
     */
    long getActiveCacheCount();
}
