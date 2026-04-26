package com.darkenrgy.login.auth.dtos;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * DTO for Session entity
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class SessionDto {
    private UUID sessionId;
    private UUID hostId;
    private String sessionName;
    private String description;
    private boolean active;
    private Instant expiryTime;
    private Instant createdAt;
    private long participantCount;
    private List<UserNodeDto> participants;
}
