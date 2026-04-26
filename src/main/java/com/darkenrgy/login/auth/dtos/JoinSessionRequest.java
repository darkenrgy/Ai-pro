package com.darkenrgy.login.auth.dtos;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Request DTO for joining a session
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class JoinSessionRequest {
    
    @NotNull(message = "Session ID is required")
    private UUID sessionId;
    
    @NotNull(message = "Parent node ID is required (use session root if first participant)")
    private UUID parentNodeId;

    @NotBlank(message = "Shared secret is required for permission request")
    private String sharedSecret;
}
