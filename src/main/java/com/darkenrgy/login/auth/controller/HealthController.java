package com.darkenrgy.login.auth.controller;

import java.util.HashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.darkenrgy.login.auth.services.RedisSessionService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Health and Monitoring Controller
 * Provides insight into system health, Redis cache stats, and session information
 */
@RestController
@RequestMapping("/api/v1/health")
@RequiredArgsConstructor
@Slf4j
public class HealthController {
    
    private final RedisSessionService redisSessionService;
    
    /**
     * Get health status and Redis cache statistics
     * GET /api/v1/health/status
     * 
     * @return health info including active cached sessions
     */
    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getHealthStatus() {
        Map<String, Object> response = new HashMap<>();
        
        try {
            response.put("status", "UP");
            response.put("timestamp", System.currentTimeMillis());
            
            // Redis cache stats
            Map<String, Object> cache = new HashMap<>();
            cache.put("activeCachedSessions", redisSessionService.getActiveCacheCount());
            cache.put("cacheType", "Redis");
            cache.put("strategy", "TTL-based auto-expiry");
            
            response.put("redis", cache);
            response.put("message", "Application is running with Redis session caching enabled");
            
            log.info("Health check: {} active cached sessions", redisSessionService.getActiveCacheCount());
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            log.error("Error checking health status", e);
            
            Map<String, Object> error = new HashMap<>();
            error.put("status", "DEGRADED");
            error.put("timestamp", System.currentTimeMillis());
            error.put("error", "Redis connection issue: " + e.getMessage());
            
            return ResponseEntity.status(503).body(error);
        }
    }
    
    /**
     * Get Redis session cache statistics
     * GET /api/v1/health/redis-stats
     * 
     * @return Redis cache statistics
     */
    @GetMapping("/redis-stats")
    public ResponseEntity<Map<String, Object>> getRedisStats() {
        Map<String, Object> response = new HashMap<>();
        
        try {
            long activeSessions = redisSessionService.getActiveCacheCount();
            
            response.put("connected", true);
            response.put("activeCachedSessions", activeSessions);
            response.put("cacheStorage", "Temporary (TTL-based)");
            response.put("persistentStorage", "MySQL Database");
            response.put("features", new String[]{
                "Auto-expiry when session TTL ends",
                "No permanent cache storage",
                "Session activity tracking",
                "User-session membership tracking"
            });
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            log.error("Error getting Redis stats", e);
            
            Map<String, Object> error = new HashMap<>();
            error.put("connected", false);
            error.put("error", e.getMessage());
            
            return ResponseEntity.status(503).body(error);
        }
    }
}
