package com.darkenrgy.login.auth.dtos;

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
public class ModerationSignalResponse {

    private boolean accepted;
    private int userViolationCount;
    private int sessionViolationCount;
    private boolean blockSession;
    private int lastRiskScore;
    private String recordedAt;
}
