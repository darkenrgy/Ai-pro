package com.darkenrgy.login.auth.services;

import java.util.List;
import java.util.UUID;

import org.springframework.web.multipart.MultipartFile;

import com.darkenrgy.login.auth.dtos.FileMetadataDto;

/**
 * File Service Interface
 * Manages secure file uploads, storage, and downloads
 */
public interface FileService {
    
    /**
     * Upload a file with encryption and optional compression
     * @param file the file to upload
     * @param sessionId the session ID
     * @param userId the uploading user ID
     * @param description optional file description
     * @return file metadata with download token
     */
    FileMetadataDto uploadFile(MultipartFile file, UUID sessionId, UUID userId, String description);
    
    /**
     * Download a file by ID
     * @param fileId the file ID
     * @return encrypted file bytes
     */
    byte[] downloadFile(UUID fileId);
    
    /**
     * Get file metadata
     * @param fileId the file ID
     * @return file metadata
     */
    FileMetadataDto getFileMetadata(UUID fileId);
    
    /**
     * List files in a session
     * @param sessionId the session ID
     * @return list of files
     */
    List<FileMetadataDto> listSessionFiles(UUID sessionId);
    
    /**
     * List files uploaded by a user
     * @param userId the user ID
     * @return list of files
     */
    List<FileMetadataDto> listUserFiles(UUID userId);
    
    /**
     * Delete a file
     * @param fileId the file ID
     * @param userId the requesting user (must be uploader)
     */
    void deleteFile(UUID fileId, UUID userId);
    
    /**
     * Delete all expired files (cleanup task)
     * @return number of deleted files
     */
    long deleteExpiredFiles();
    
    /**
     * Delete all files in a session (on session close)
     * @param sessionId the session ID
     */
    void deleteSessionFiles(UUID sessionId);
    
    /**
     * Verify file is still valid for access
     * @param fileId the file ID
     * @return true if file exists and hasn't expired
     */
    boolean isFileValid(UUID fileId);
}
