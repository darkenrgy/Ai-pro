package com.darkenrgy.login.auth.services.impl;

import java.util.Objects;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.darkenrgy.login.auth.dtos.AiModerationRequest;
import com.darkenrgy.login.auth.dtos.AiModerationResponse;
import com.darkenrgy.login.auth.services.AIService;

@Service
public class AIServiceImpl implements AIService {

    private final RestClient restClient;

    public AIServiceImpl(@Value("${ai.moderation.base-url:http://localhost:8000}") String baseUrl,
                         @Value("${ai.moderation.timeout-ms:1500}") long timeoutMs) {
        String resolvedBaseUrl = Objects.requireNonNull(baseUrl, "AI moderation base URL is required");
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        int timeout = (int) Math.min(Integer.MAX_VALUE, Math.max(0, timeoutMs));
        requestFactory.setConnectTimeout(timeout);
        requestFactory.setReadTimeout(timeout);

        this.restClient = RestClient.builder()
                .baseUrl(resolvedBaseUrl)
                .requestFactory(requestFactory)
                .build();
    }

    @Override
    public AiModerationResponse analyzeText(String text, UUID sessionId, UUID userId) {
        AiModerationRequest request = new AiModerationRequest(
                "text",
                text,
                sessionId != null ? sessionId.toString() : null,
                userId != null ? userId.toString() : null
        );

                try {
                        AiModerationResponse response = restClient.post()
                                        .uri("/analyze")
                                        .contentType(Objects.requireNonNull(MediaType.APPLICATION_JSON, "JSON content type is required"))
                                        .body(request)
                                        .retrieve()
                                        .body(AiModerationResponse.class);

                        if (response != null) {
                                return response;
                        }
                } catch (RestClientException exception) {
                        // Fail open so chat delivery still works if the moderation service is unavailable.
                }

                return new AiModerationResponse(
                                0,
                                false,
                                "safe",
                                "allow",
                                false,
                                0,
                                0
                );
    }
}
