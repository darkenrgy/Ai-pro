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
 * DTO for UserNode representing a participant in the session hierarchy
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class UserNodeDto {
    private UUID nodeId;
    private UUID userId;
    private UUID sessionId;
    private UUID parentId;
    private List<UserNodeDto> children;
    private Instant joinedAt;
    private boolean active;
    private boolean permissionGranted;
}
