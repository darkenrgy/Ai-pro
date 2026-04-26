package com.darkenrgy.login.auth.dtos;

import java.time.Instant;
import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * File response DTO
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class FileMetadataDto {
    
    private UUID fileId;
    private String fileName;
    private UUID sessionId;
    private UUID uploadedBy;
    private long originalSizeBytes;
    private long storedSizeBytes;
    private boolean compressed;
    private String contentType;
    private Instant uploadedAt;
    private Instant expiresAt;
    private String downloadToken;
    private boolean encrypted;
}
