package com.darkenrgy.login.auth.dtos;

import lombok.Builder;

@Builder
public record ModeratedChatResponse(
        ChatMessageResponse message,
        String action,
        int riskScore,
        boolean flagged,
        String category,
        boolean blockSession,
        int userViolationCount,
        int sessionViolationCount) {
}
