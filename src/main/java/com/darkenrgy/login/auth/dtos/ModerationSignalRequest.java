package com.darkenrgy.login.auth.dtos;

import java.time.Instant;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
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
public class ModerationSignalRequest {

    @NotBlank(message = "hashedUserId is required")
    private String hashedUserId;

    @NotBlank(message = "hashedSessionId is required")
    private String hashedSessionId;

    @NotNull(message = "riskScore is required")
    @Min(value = 0, message = "riskScore must be between 0 and 100")
    @Max(value = 100, message = "riskScore must be between 0 and 100")
    private Integer riskScore;

    @NotBlank(message = "category is required")
    private String category;

    @NotBlank(message = "action is required")
    private String action;

    @NotNull(message = "timestamp is required")
    private Instant timestamp;
}
