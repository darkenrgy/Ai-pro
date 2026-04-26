package com.darkenrgy.login.auth.dtos;

import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * File upload request DTO
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class FileUploadRequest {
    
    @NotBlank(message = "File name is required")
    private String fileName;
    
    @NotNull(message = "Session ID is required")
    private UUID sessionId;
    
    @NotNull(message = "User ID is required")
    private UUID userId;
    
    private String description;
    
    // File content will be passed separately via multipart
    private long fileSizeBytes;
}
