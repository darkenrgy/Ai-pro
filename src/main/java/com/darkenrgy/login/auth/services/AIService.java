package com.darkenrgy.login.auth.services;

import java.util.UUID;

import com.darkenrgy.login.auth.dtos.AiModerationResponse;

public interface AIService {

    AiModerationResponse analyzeText(String text, UUID sessionId, UUID userId);
}
