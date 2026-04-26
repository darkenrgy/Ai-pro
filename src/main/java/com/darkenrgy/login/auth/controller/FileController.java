package com.darkenrgy.login.auth.controller;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.darkenrgy.login.auth.dtos.FileMetadataDto;
import com.darkenrgy.login.auth.services.FileService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * File Controller
 * Handles secure file upload and download with encryption
 */
@RestController
@RequestMapping("/api/v1/file")
@RequiredArgsConstructor
@Slf4j
public class FileController {
    
    private final FileService fileService;
    
    /**
     * Upload a file to a session
     * POST /api/v1/file/upload
     * 
     * @param file the file to upload
     * @param sessionId the session ID
     * @param description optional description
     * @param auth the authenticated user
     * @return file metadata
     */
    @PostMapping("/upload")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> uploadFile(
            @RequestParam("file") MultipartFile file,
            @RequestParam("sessionId") UUID sessionId,
            @RequestParam(value = "description", required = false) String description,
            Authentication auth) {
        
        try {
            UUID userId = UUID.fromString(auth.getName());
            
            FileMetadataDto metadata = fileService.uploadFile(file, sessionId, userId, description);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "File uploaded successfully");
            response.put("fileId", metadata.getFileId());
            response.put("fileName", metadata.getFileName());
            response.put("originalSize", metadata.getOriginalSizeBytes());
            response.put("storedSize", metadata.getStoredSizeBytes());
            response.put("compressed", metadata.isCompressed());
            response.put("encrypted", metadata.isEncrypted());
            response.put("expiresAt", metadata.getExpiresAt());
            
            log.info("File {} uploaded by user {} to session {}", metadata.getFileId(), userId, sessionId);
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
            
        } catch (Exception e) {
            log.error("Error uploading file", e);
            
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error);
        }
    }
    
    /**
     * Download a file
     * GET /api/v1/file/{id}
     * 
     * @param fileId the file ID
     * @param auth the authenticated user
     * @return file bytes
     */
    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<byte[]> downloadFile(
            @PathVariable("id") UUID fileId,
            Authentication auth) {
        
        try {
            UUID userId = UUID.fromString(auth.getName());
            
            // Verify access
            FileMetadataDto metadata = fileService.getFileMetadata(fileId);
            
            // Get file bytes
            byte[] fileBytes = fileService.downloadFile(fileId);
            
            // Build response headers
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
            headers.setContentLength(fileBytes.length);
            headers.setContentDispositionFormData("attachment", metadata.getFileName());
            
            log.info("File {} downloaded by user {}", fileId, userId);
            return new ResponseEntity<>(fileBytes, headers, HttpStatus.OK);
            
        } catch (Exception e) {
            log.error("Error downloading file", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    /**
     * Get file metadata
     * GET /api/v1/file/{id}/metadata
     * 
     * @param fileId the file ID
     * @return file metadata
     */
    @GetMapping("/{id}/metadata")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getFileMetadata(
            @PathVariable("id") UUID fileId) {
        
        try {
            FileMetadataDto metadata = fileService.getFileMetadata(fileId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("fileId", metadata.getFileId());
            response.put("fileName", metadata.getFileName());
            response.put("sessionId", metadata.getSessionId());
            response.put("uploadedBy", metadata.getUploadedBy());
            response.put("originalSize", metadata.getOriginalSizeBytes());
            response.put("storedSize", metadata.getStoredSizeBytes());
            response.put("compressed", metadata.isCompressed());
            response.put("encrypted", metadata.isEncrypted());
            response.put("contentType", metadata.getContentType());
            response.put("uploadedAt", metadata.getUploadedAt());
            response.put("expiresAt", metadata.getExpiresAt());
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            log.error("Error retrieving file metadata", e);
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }
    
    /**
     * List files in a session
     * GET /api/v1/file/session/{sessionId}
     * 
     * @param sessionId the session ID
     * @return list of files
     */
    @GetMapping("/session/{sessionId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> listSessionFiles(
            @PathVariable UUID sessionId) {
        
        try {
            List<FileMetadataDto> files = fileService.listSessionFiles(sessionId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("sessionId", sessionId);
            response.put("fileCount", files.size());
            response.put("files", files);
            
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            log.error("Error listing session files", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
    
    /**
     * Delete a file
     * DELETE /api/v1/file/{id}
     * 
     * @param fileId the file ID
     * @param auth the authenticated user
     * @return success message
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> deleteFile(
            @PathVariable("id") UUID fileId,
            Authentication auth) {
        
        try {
            UUID userId = UUID.fromString(auth.getName());
            
            fileService.deleteFile(fileId, userId);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "File deleted successfully");
            response.put("fileId", fileId);
            
            log.info("File {} deleted by user {}", fileId, userId);
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            log.error("Error deleting file", e);
            
            Map<String, Object> error = new HashMap<>();
            error.put("success", false);
            error.put("error", e.getMessage());
            
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
        }
    }
}
