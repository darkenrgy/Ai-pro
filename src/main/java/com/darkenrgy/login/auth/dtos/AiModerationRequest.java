package com.darkenrgy.login.auth.dtos;

import com.fasterxml.jackson.annotation.JsonProperty;

public record AiModerationRequest(
        @JsonProperty("type") String type,
        @JsonProperty("content") String content,
        @JsonProperty("session_id") String sessionId,
        @JsonProperty("user_id") String userId) {
}
