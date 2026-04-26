package com.darkenrgy.login.auth.dtos;

import java.util.UUID;

import jakarta.validation.constraints.NotNull;
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
public class VideoSignalRequest {

    @NotNull(message = "sessionId is required")
    private UUID sessionId;

    private UUID targetUserId;

    private String sdp;

    private String candidate;

    private String sdpMid;

    private Integer sdpMLineIndex;

    private String mode;

    private String role;

    private String mediaType;

    private Boolean enabled;
}
