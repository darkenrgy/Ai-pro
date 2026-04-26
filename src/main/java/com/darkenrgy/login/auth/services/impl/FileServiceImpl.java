package com.darkenrgy.login.auth.services.impl;

import com.darkenrgy.login.auth.dtos.FileMetadataDto;
import com.darkenrgy.login.auth.entities.SharedFile;
import com.darkenrgy.login.auth.exceptions.ResourceNotFoundException;
import com.darkenrgy.login.auth.repositries.SharedFileRepository;
import com.darkenrgy.login.auth.services.FileService;
import com.darkenrgy.login.auth.utils.AesEncryptionUtil;
import com.darkenrgy.login.auth.utils.CompressionUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * File Service Implementation
 * Manages secure file uploads with encryption, compression, and auto-expiry
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FileServiceImpl implements FileService {
    
    private final SharedFileRepository fileRepository;
    private final RedisTemplate<String, String> redisTemplate;
    private final AesEncryptionUtil encryptionUtil;
    private final CompressionUtil compressionUtil;
    
    private static final long MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
    private static final String FILE_PREFIX = "file:";
    private static final long DEFAULT_TTL_MINUTES = 24 * 60; // 24 hours
    private final Map<String, String> localFileCache = new ConcurrentHashMap<>();
    private final Map<UUID, SharedFile> localMetadataStore = new ConcurrentHashMap<>();
    
    @Override
    public FileMetadataDto uploadFile(MultipartFile file, UUID sessionId, UUID userId, String description) {
        try {
            // Validate file
            if (file.isEmpty()) {
                throw new RuntimeException("File is empty");
            }
            if (file.getSize() > MAX_FILE_SIZE) {
                throw new RuntimeException("File size exceeds maximum limit of 20MB");
            }
            
            byte[] fileBytes = file.getBytes();
            byte[] processedBytes = fileBytes;
            boolean compressed = false;
            
            // Compress if beneficial
            if (compressionUtil.shouldCompress(fileBytes.length)) {
                processedBytes = compressionUtil.compress(fileBytes, file.getOriginalFilename());
                compressed = true;
                log.info("Compressed file {}: {} -> {} bytes", file.getOriginalFilename(), 
                        fileBytes.length, processedBytes.length);
            }
            
            // Encrypt file
            String encryptedData = encryptionUtil.encrypt(
                    java.util.Base64.getEncoder().encodeToString(processedBytes)
            );
            
            // Create metadata
            UUID fileId = UUID.randomUUID();
            Instant expiresAt = Instant.now().plusSeconds(DEFAULT_TTL_MINUTES * 60);
            String redisKey = FILE_PREFIX + fileId;
            
            SharedFile sharedFile = SharedFile.builder()
                    .fileId(fileId)
                    .sessionId(sessionId)
                    .uploadedBy(userId)
                    .fileName(file.getOriginalFilename())
                    .originalSizeBytes(fileBytes.length)
                    .storedSizeBytes(encryptedData.getBytes().length)
                    .compressed(compressed)
                    .encrypted(true)
                    .contentType(file.getContentType())
                    .description(description)
                    .expiresAt(expiresAt)
                    .redisKey(redisKey)
                    .build();
            
            // Save metadata to database, fallback to local store if persistence fails
            try {
                sharedFile = fileRepository.save(sharedFile);
            } catch (Exception ex) {
                localMetadataStore.put(fileId, sharedFile);
                log.warn("Database unavailable for file metadata {}, using local metadata fallback", fileId);
            }
            
            // Store encrypted file in Redis with TTL
            try {
                redisTemplate.opsForValue().set(
                        redisKey,
                        encryptedData,
                        DEFAULT_TTL_MINUTES,
                        TimeUnit.MINUTES
                );
            } catch (Exception ex) {
                localFileCache.put(redisKey, encryptedData);
                log.warn("Redis unavailable, storing file {} in local fallback cache", fileId);
            }
            
            log.info("Uploaded file {} ({} bytes) to session {} with TTL {} minutes", 
                    fileId, fileBytes.length, sessionId, DEFAULT_TTL_MINUTES);
            
            return convertToDto(sharedFile);
            
        } catch (IOException e) {
            log.error("Error reading file", e);
            throw new RuntimeException("Failed to read file", e);
        }
    }
    
    @Override
    public byte[] downloadFile(UUID fileId) {
        SharedFile file = findFileById(fileId);
        
        // Check expiry
        if (Instant.now().isAfter(file.getExpiresAt())) {
            throw new RuntimeException("File has expired");
        }
        
        // Retrieve from Redis
        String encryptedData;
        try {
            encryptedData = redisTemplate.opsForValue().get(file.getRedisKey());
        } catch (Exception ex) {
            encryptedData = null;
            log.warn("Redis unavailable, attempting local fallback cache for file {}", fileId);
        }
        if (encryptedData == null) {
            encryptedData = localFileCache.get(file.getRedisKey());
        }
        if (encryptedData == null) {
            throw new RuntimeException("File data not found in cache");
        }
        
        try {
            // Decrypt
            String decryptedBase64 = encryptionUtil.decrypt(encryptedData);
            byte[] processedBytes = java.util.Base64.getDecoder().decode(decryptedBase64);
            
            // Decompress if needed
            byte[] fileBytes = processedBytes;
            if (file.isCompressed()) {
                fileBytes = compressionUtil.decompress(processedBytes);
            }
            
            // Update download count
            file.setDownloadCount(file.getDownloadCount() + 1);
            file.setLastDownloadedAt(Instant.now());
            try {
                fileRepository.save(file);
            } catch (Exception ex) {
                localMetadataStore.put(fileId, file);
            }
            
            log.info("Downloaded file {} (download count: {})", fileId, file.getDownloadCount());
            return fileBytes;
            
        } catch (Exception e) {
            log.error("Error downloading file", e);
            throw new RuntimeException("Failed to download file", e);
        }
    }
    
    @Override
    public FileMetadataDto getFileMetadata(UUID fileId) {
        SharedFile file = findFileById(fileId);
        return convertToDto(file);
    }
    
    @Override
    public List<FileMetadataDto> listSessionFiles(UUID sessionId) {
        List<SharedFile> files = fileRepository.findActiveFilesBySession(sessionId);
        localMetadataStore.values().stream()
                .filter(file -> sessionId.equals(file.getSessionId()))
                .filter(file -> Instant.now().isBefore(file.getExpiresAt()))
                .forEach(file -> {
                    boolean exists = files.stream().anyMatch(dbFile -> dbFile.getFileId().equals(file.getFileId()));
                    if (!exists) {
                        files.add(file);
                    }
                });

        return files.stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }
    
    @Override
    public List<FileMetadataDto> listUserFiles(UUID userId) {
        List<SharedFile> files = fileRepository.findByUploadedBy(userId);
        return files.stream()
                .filter(f -> Instant.now().isBefore(f.getExpiresAt()))
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }
    
    @Override
    public void deleteFile(UUID fileId, UUID userId) {
        SharedFile file = findFileById(fileId);
        
        // Only uploader can delete
        if (!file.getUploadedBy().equals(userId)) {
            throw new RuntimeException("Only file uploader can delete");
        }
        
        // Delete from Redis
        try {
            redisTemplate.delete(file.getRedisKey());
        } catch (Exception ex) {
            log.warn("Redis unavailable while deleting file {}, removing from local fallback cache", fileId);
        }
        localFileCache.remove(file.getRedisKey());
        
        // Delete from database
        try {
            fileRepository.deleteById(fileId);
        } catch (Exception ex) {
            log.warn("Database unavailable while deleting metadata for file {}", fileId);
        }
        localMetadataStore.remove(fileId);
        
        log.info("Deleted file {} uploaded by {}", fileId, userId);
    }
    
    @Override
    public long deleteExpiredFiles() {
        List<SharedFile> expiredFiles = fileRepository.findExpiredFiles();
        
        for (SharedFile file : expiredFiles) {
            try {
                // Delete from Redis
                try {
                    redisTemplate.delete(file.getRedisKey());
                } catch (Exception ex) {
                    log.warn("Redis unavailable while cleaning expired file {}", file.getFileId());
                }
                localFileCache.remove(file.getRedisKey());
                // Delete from database
                fileRepository.deleteById(file.getFileId());
                log.debug("Deleted expired file {}", file.getFileId());
            } catch (Exception e) {
                log.warn("Error deleting expired file {}", file.getFileId(), e);
            }
        }
        
        log.info("Cleaned up {} expired files", expiredFiles.size());
        return expiredFiles.size();
    }
    
    @Override
    public void deleteSessionFiles(UUID sessionId) {
        List<SharedFile> files = fileRepository.findBySessionId(sessionId);
        
        for (SharedFile file : files) {
            try {
                // Delete from Redis
                try {
                    redisTemplate.delete(file.getRedisKey());
                } catch (Exception ex) {
                    log.warn("Redis unavailable while deleting session file {}", file.getFileId());
                }
                localFileCache.remove(file.getRedisKey());
                // Delete metadata
                fileRepository.deleteById(file.getFileId());
            } catch (Exception e) {
                log.warn("Error deleting file {} from session {}", file.getFileId(), sessionId, e);
            }
        }
        
        log.info("Deleted {} files from session {}", files.size(), sessionId);
    }
    
    @Override
    public boolean isFileValid(UUID fileId) {
        return fileRepository.findById(fileId)
                .map(f -> Instant.now().isBefore(f.getExpiresAt()))
                .orElse(false);
    }
    
    private FileMetadataDto convertToDto(SharedFile file) {
        return FileMetadataDto.builder()
                .fileId(file.getFileId())
                .fileName(file.getFileName())
                .sessionId(file.getSessionId())
                .uploadedBy(file.getUploadedBy())
                .originalSizeBytes(file.getOriginalSizeBytes())
                .storedSizeBytes(file.getStoredSizeBytes())
                .compressed(file.isCompressed())
                .encrypted(file.isEncrypted())
                .contentType(file.getContentType())
                .uploadedAt(file.getUploadedAt())
                .expiresAt(file.getExpiresAt())
                .build();
    }

    private SharedFile findFileById(UUID fileId) {
        return fileRepository.findById(fileId)
                .orElseGet(() -> {
                    SharedFile local = localMetadataStore.get(fileId);
                    if (local != null) {
                        return local;
                    }
                    throw new ResourceNotFoundException("File not found: " + fileId);
                });
    }
}
