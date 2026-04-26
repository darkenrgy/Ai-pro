package com.darkenrgy.login.auth.repositries;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import com.darkenrgy.login.auth.entities.SharedFile;

/**
 * Repository for SharedFile entity
 */
@Repository
public interface SharedFileRepository extends JpaRepository<SharedFile, UUID> {
    
    /**
     * Find all files in a session
     */
    List<SharedFile> findBySessionId(UUID sessionId);
    
    /**
     * Find all files uploaded by a user
     */
    List<SharedFile> findByUploadedBy(UUID uploadedBy);
    
    /**
     * Find files by session and user
     */
    List<SharedFile> findBySessionIdAndUploadedBy(UUID sessionId, UUID uploadedBy);
    
    /**
     * Find non-expired files
     */
    @Query("SELECT f FROM SharedFile f WHERE f.expiresAt > CURRENT_TIMESTAMP")
    List<SharedFile> findActiveFiles();
    
    /**
     * Find expired files for cleanup
     */
    @Query("SELECT f FROM SharedFile f WHERE f.expiresAt <= CURRENT_TIMESTAMP")
    List<SharedFile> findExpiredFiles();
    
    /**
     * Find files by session that are not expired
     */
    @Query("SELECT f FROM SharedFile f WHERE f.sessionId = ?1 AND f.expiresAt > CURRENT_TIMESTAMP")
    List<SharedFile> findActiveFilesBySession(UUID sessionId);
}
