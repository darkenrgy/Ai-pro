package com.darkenrgy.login.auth.services.impl;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.Objects;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import com.darkenrgy.login.auth.dtos.RedisSessionData;
import com.darkenrgy.login.auth.services.RedisSessionService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Redis Session Service Implementation
 * Manages temporary session caching with TTL and auto-expiry
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class RedisSessionServiceImpl implements RedisSessionService {
    
    private final RedisTemplate<String, Object> redisTemplate;
    
    private static final String SESSION_PREFIX = "session:";
    private static final String USER_SESSION_PREFIX = "user:session:";
    private static final String SESSION_COUNT_KEY = "session:count";
    
    @Override
    public void cacheSession(RedisSessionData sessionData, long ttlMinutes) {
        try {
            String sessionKey = SESSION_PREFIX + sessionData.getSessionId();
            
            // Store session data with TTL
            redisTemplate.opsForValue().set(
                    sessionKey,
                    sessionData,
                    ttlMinutes,
                    TimeUnit.MINUTES
            );
            
            // Track active sessions count
            redisTemplate.opsForValue().increment(SESSION_COUNT_KEY);
            
            log.info("Cached session {} with TTL {} minutes", sessionData.getSessionId(), ttlMinutes);
            
        } catch (Exception e) {
            log.warn("Redis unavailable while caching session {}. Continuing without cache.", sessionData.getSessionId(), e);
        }
    }
    
    @Override
    public Optional<RedisSessionData> getSession(UUID sessionId) {
        try {
            String sessionKey = SESSION_PREFIX + sessionId;
            Object value = redisTemplate.opsForValue().get(sessionKey);
            
            if (value instanceof RedisSessionData sessionData) {
                // Update last activity
                updateSessionActivity(sessionId);
                log.debug("Retrieved cached session {}", sessionId);
                return Optional.of(sessionData);
            }
            
            return Optional.empty();
            
        } catch (Exception e) {
            log.error("Error retrieving session from cache", e);
            return Optional.empty();
        }
    }
    
    @Override
    public void updateSessionActivity(UUID sessionId) {
        try {
            String sessionKey = SESSION_PREFIX + sessionId;
            
            // Get existing session data
            Object value = redisTemplate.opsForValue().get(sessionKey);
            if (value instanceof RedisSessionData sessionData) {
                // Update activity timestamp
                sessionData.setLastActivityTime(System.currentTimeMillis() / 1000);
                
                // Get remaining TTL
                Long ttl = redisTemplate.getExpire(sessionKey, TimeUnit.MINUTES);
                if (ttl != null && ttl > 0) {
                    // Re-store with same TTL to refresh expiry
                    redisTemplate.opsForValue().set(
                            sessionKey,
                            sessionData,
                            ttl,
                            TimeUnit.MINUTES
                    );
                    log.debug("Updated session {} activity timestamp", sessionId);
                }
            }
        } catch (Exception e) {
            log.warn("Error updating session activity", e);
        }
    }
    
    @Override
    public boolean isSessionCached(UUID sessionId) {
        try {
            String sessionKey = SESSION_PREFIX + sessionId;
            Boolean exists = redisTemplate.hasKey(sessionKey);
            return exists != null && exists;
        } catch (Exception e) {
            log.error("Error checking session cache", e);
            return false;
        }
    }
    
    @Override
    public void removeSession(UUID sessionId) {
        try {
            String sessionKey = SESSION_PREFIX + sessionId;
            Boolean deleted = redisTemplate.delete(sessionKey);
            
            if (deleted != null && deleted) {
                // Decrement session count
                Long count = redisTemplate.opsForValue().decrement(SESSION_COUNT_KEY);
                log.info("Removed session {} from cache. Active sessions: {}", sessionId, count);
            }
        } catch (Exception e) {
            log.error("Error removing session from cache", e);
        }
    }
    
    @Override
    public void cacheUserSession(UUID userId, UUID sessionId, long ttlMinutes) {
        try {
            String userSessionKey = USER_SESSION_PREFIX + userId;
                Object userSessionValue = Objects.requireNonNull(sessionId.toString());
            
            // Store user's active session ID with TTL
            redisTemplate.opsForValue().set(
                    userSessionKey,
                    userSessionValue,
                    ttlMinutes,
                    TimeUnit.MINUTES
            );
            
            log.info("Cached user {} in session {}", userId, sessionId);
            
        } catch (Exception e) {
            log.warn("Redis unavailable while caching user {} session {}. Continuing without cache.", userId, sessionId, e);
        }
    }
    
    @Override
    public Optional<UUID> getUserSession(UUID userId) {
        try {
            String userSessionKey = USER_SESSION_PREFIX + userId;
            Object value = redisTemplate.opsForValue().get(userSessionKey);
            
            if (value != null) {
                UUID sessionId = UUID.fromString(value.toString());
                log.debug("Retrieved user {} session: {}", userId, sessionId);
                return Optional.of(sessionId);
            }
            
            return Optional.empty();
            
        } catch (Exception e) {
            log.error("Error retrieving user session", e);
            return Optional.empty();
        }
    }
    
    @Override
    public void removeUserSession(UUID userId) {
        try {
            String userSessionKey = USER_SESSION_PREFIX + userId;
            Boolean deleted = redisTemplate.delete(userSessionKey);
            
            if (deleted != null && deleted) {
                log.info("Removed user {} from active sessions", userId);
            }
        } catch (Exception e) {
            log.error("Error removing user session", e);
        }
    }
    
    @Override
    public long getActiveCacheCount() {
        try {
            Object count = redisTemplate.opsForValue().get(SESSION_COUNT_KEY);
            if (count != null) {
                return Long.parseLong(count.toString());
            }
            return 0;
        } catch (RuntimeException e) {
            log.warn("Error getting cache count", e);
            return 0;
        }
    }
}
