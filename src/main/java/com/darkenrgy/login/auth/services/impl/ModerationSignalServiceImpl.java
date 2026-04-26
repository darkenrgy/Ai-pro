package com.darkenrgy.login.auth.services.impl;

import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.darkenrgy.login.auth.dtos.ModerationSignalRequest;
import com.darkenrgy.login.auth.dtos.ModerationSignalResponse;
import com.darkenrgy.login.auth.services.ModerationSignalService;

import lombok.RequiredArgsConstructor;

@Service
@RequiredArgsConstructor
public class ModerationSignalServiceImpl implements ModerationSignalService {

    private static final int WARN_THRESHOLD = 30;
    private static final int SESSION_BLOCK_THRESHOLD = 4;

    private final Map<String, Integer> userViolationCounts = new ConcurrentHashMap<>();
    private final Map<String, Integer> sessionViolationCounts = new ConcurrentHashMap<>();
    private final Map<String, Integer> userLastRiskScores = new ConcurrentHashMap<>();

    @Override
    public ModerationSignalResponse recordSignal(ModerationSignalRequest request) {
        validateCategory(request.getCategory());
        validateAction(request.getAction());

        Integer riskScoreValue = request.getRiskScore();
        int riskScore = riskScoreValue != null ? riskScoreValue : 0;
        boolean violation = riskScore >= WARN_THRESHOLD;

        int userCount = userViolationCounts.getOrDefault(request.getHashedUserId(), 0);
        int sessionCount = sessionViolationCounts.getOrDefault(request.getHashedSessionId(), 0);

        if (violation) {
            userCount += 1;
            sessionCount += 1;
            userViolationCounts.put(request.getHashedUserId(), userCount);
            sessionViolationCounts.put(request.getHashedSessionId(), sessionCount);
        }

            userLastRiskScores.put(request.getHashedUserId(), riskScore);

        // Lock only at the session level to avoid global cross-session lockout.
        boolean blockSession = sessionCount >= SESSION_BLOCK_THRESHOLD;

        return ModerationSignalResponse.builder()
                .accepted(true)
                .userViolationCount(userCount)
                .sessionViolationCount(sessionCount)
                .blockSession(blockSession)
                .lastRiskScore(riskScore)
                .recordedAt(Instant.now().toString())
                .build();
    }

            @Override
            public ModerationSignalResponse getSignalState(String hashedUserId, String hashedSessionId) {
            int userCount = userViolationCounts.getOrDefault(hashedUserId, 0);
            int sessionCount = sessionViolationCounts.getOrDefault(hashedSessionId, 0);
            int lastRiskScore = userLastRiskScores.getOrDefault(hashedUserId, 0);
            boolean blockSession = sessionCount >= SESSION_BLOCK_THRESHOLD;

            return ModerationSignalResponse.builder()
                .accepted(true)
                .userViolationCount(userCount)
                .sessionViolationCount(sessionCount)
                .blockSession(blockSession)
                .lastRiskScore(lastRiskScore)
                .recordedAt(Instant.now().toString())
                .build();
            }

    private void validateCategory(String category) {
        String normalized = category == null ? "" : category.trim().toLowerCase(Locale.ROOT);
        if (!("safe".equals(normalized)
                || "human_trafficking".equals(normalized)
                || "child_exploitation".equals(normalized)
                || "illegal_weapons".equals(normalized))) {
            throw new IllegalArgumentException("Unsupported moderation category");
        }
    }

    private void validateAction(String action) {
        String normalized = action == null ? "" : action.trim().toLowerCase(Locale.ROOT);
        if (!("allow".equals(normalized)
                || "warn".equals(normalized)
                || "strong_warn".equals(normalized)
                || "block".equals(normalized))) {
            throw new IllegalArgumentException("Unsupported moderation action");
        }
    }
}
