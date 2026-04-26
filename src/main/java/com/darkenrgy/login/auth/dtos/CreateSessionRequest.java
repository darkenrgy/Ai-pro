package com.darkenrgy.login.auth.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/**
 * Request DTO for creating a new session
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class CreateSessionRequest {
    
    @NotBlank(message = "Session name is required")
    private String sessionName;
    
    private String description;
    
    @NotNull(message = "Expiration time in minutes is required")
    private Long expirationMinutes;
}
