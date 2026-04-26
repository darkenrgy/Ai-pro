package com.darkenrgy.login.auth.dtos;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Encrypted payload embedded in PNG metadata
 * Contains session and access control information
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class SecureImagePayload {

    private UUID sessionId;

    private UUID parentId;

    private String oneTimeToken;

    private Instant expiryTime;

    private String signature;

    private Instant generatedAt;

    private String version = "1.0";

    /**
     * Convert to string format for encryption
     */
    @Override
    public String toString() {
        return "SecureImagePayload{" +
                "sessionId=" + sessionId +
                ", parentId=" + parentId +
                ", oneTimeToken='" + oneTimeToken + '\'' +
                ", expiryTime=" + expiryTime +
                ", signature='" + signature + '\'' +
                ", generatedAt=" + generatedAt +
                ", version='" + version + '\'' +
                '}';
    }
}
