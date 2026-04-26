package com.darkenrgy.login.auth.entities;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * File metadata entity
 * Stores file metadata in database for auditing
 * Actual file bytes stored temporarily in Redis
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Entity
@Table(name = "shared_files")
public class SharedFile {
    
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "file_id")
    private UUID fileId;
    
    @Column(name = "session_id", nullable = false)
    private UUID sessionId;
    
    @Column(name = "uploaded_by", nullable = false)
    private UUID uploadedBy;
    
    @Column(name = "file_name", nullable = false)
    private String fileName;
    
    @Column(name = "original_size_bytes")
    private long originalSizeBytes;
    
    @Column(name = "stored_size_bytes")
    private long storedSizeBytes;
    
    @Column(name = "is_compressed")
    private boolean compressed;
    
    @Column(name = "is_encrypted")
    private boolean encrypted;
    
    @Column(name = "content_type")
    private String contentType;
    
    @Column(name = "description")
    private String description;
    
    @Column(name = "uploaded_at")
    private Instant uploadedAt = Instant.now();
    
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
    
    @Column(name = "redis_key")
    private String redisKey; // Key to retrieve encrypted file from Redis
    
    @Column(name = "download_count")
    private long downloadCount = 0;
    
    @Column(name = "last_downloaded_at")
    private Instant lastDownloadedAt;
    
    @PrePersist
    protected void onCreate() {
        if (uploadedAt == null) {
            uploadedAt = Instant.now();
        }
    }
}
