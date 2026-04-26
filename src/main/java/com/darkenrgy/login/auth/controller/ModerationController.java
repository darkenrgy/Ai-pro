package com.darkenrgy.login.auth.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.darkenrgy.login.auth.dtos.ModerationSignalRequest;
import com.darkenrgy.login.auth.dtos.ModerationSignalResponse;
import com.darkenrgy.login.auth.services.ModerationSignalService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@RestController
@RequestMapping("/api/v1/moderation")
@RequiredArgsConstructor
@Slf4j
public class ModerationController {

    private final ModerationSignalService moderationSignalService;

    @PostMapping("/signal")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ModerationSignalResponse> signalModerationEvent(
            @Valid @RequestBody ModerationSignalRequest request) {
        ModerationSignalResponse response = moderationSignalService.recordSignal(request);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/signal-state")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ModerationSignalResponse> getSignalState(
            @RequestParam String hashedUserId,
            @RequestParam String hashedSessionId) {
        try {
            ModerationSignalResponse response = moderationSignalService.getSignalState(hashedUserId, hashedSessionId);
            return ResponseEntity.ok(response);
        } catch (RuntimeException exception) {
            log.warn("Failed to load moderation state for user {} and session {}", hashedUserId, hashedSessionId, exception);
            return ResponseEntity.ok(ModerationSignalResponse.builder()
                    .accepted(false)
                    .userViolationCount(0)
                    .sessionViolationCount(0)
                    .blockSession(false)
                    .lastRiskScore(0)
                    .recordedAt(java.time.Instant.now().toString())
                    .build());
        }
    }
}
