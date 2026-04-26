package com.darkenrgy.login.auth.dtos;

import java.time.Instant;
import java.util.UUID;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Request DTO for generating secure access image
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class GenerateImageRequest {

    @NotNull(message = "Session ID is required")
    private UUID sessionId;

    @NotNull(message = "Parent ID is required")
    private UUID parentId;

    @NotNull(message = "Expiry time is required")
    @Future(message = "Expiry time must be in the future")
    private Instant expiryTime;

    /**
     * Optional: Custom image width (default: 400)
     */
    @Builder.Default
    @Min(value = 100, message = "Width must be at least 100 pixels")
    @Max(value = 2000, message = "Width must be at most 2000 pixels")
    private int width = 400;

    /**
     * Optional: Custom image height (default: 300)
     */
    @Builder.Default
    @Min(value = 100, message = "Height must be at least 100 pixels")
    @Max(value = 2000, message = "Height must be at most 2000 pixels")
    private int height = 300;
}
