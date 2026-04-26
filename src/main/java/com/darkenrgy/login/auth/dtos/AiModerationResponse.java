package com.darkenrgy.login.auth.dtos;

import com.fasterxml.jackson.annotation.JsonProperty;

public record AiModerationResponse(
        @JsonProperty("risk_score") int riskScore,
        @JsonProperty("flagged") boolean flagged,
        @JsonProperty("category") String category,
        @JsonProperty("action") String action,
        @JsonProperty("block_session") boolean blockSession,
        @JsonProperty("user_violation_count") int userViolationCount,
        @JsonProperty("session_violation_count") int sessionViolationCount) {
}
