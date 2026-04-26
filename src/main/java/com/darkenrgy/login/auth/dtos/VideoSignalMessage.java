package com.darkenrgy.login.auth.dtos;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class VideoSignalMessage {

    private String type;
    private UUID sessionId;
    private UUID fromUserId;
    private UUID targetUserId;
    private UUID affectedUserId;
    private UUID controllerId;
    private String mode;
    private String role;

    private String sdp;
    private String candidate;
    private String sdpMid;
    private Integer sdpMLineIndex;

    private List<UUID> pendingRequestUserIds;
    private List<UUID> approvedUserIds;
    private List<UUID> activeParticipantUserIds;
    private List<UUID> allowedScreenShareUserIds;
    private Map<String, String> participantRoles;

    private String mediaType;
    private Boolean enabled;

    private String state;
    private Integer retryAfterSeconds;
    private String message;
    private Instant timestamp;
}
