package com.darkenrgy.login.auth.dtos;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Redis-stored session data
 * Temporary cached version of Session entity with auto-expiry
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class RedisSessionData implements Serializable {
    
    private static final long serialVersionUID = 1L;
    
    private UUID sessionId;
    private UUID hostId;
    private String sessionName;
    private String description;
    private boolean active;
    private Instant expiryTime;
    private Instant createdAt;
    private Long participantCount;
    private long lastActivityTime; // Unix timestamp for tracking inactive sessions
}
