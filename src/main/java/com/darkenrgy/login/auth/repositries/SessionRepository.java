package com.darkenrgy.login.auth.repositries;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.darkenrgy.login.auth.entities.Session;

/**
 * Repository for Session entity
 */
@Repository
public interface SessionRepository extends JpaRepository<Session, UUID> {
    
    /**
     * Find session by host ID
     */
    List<Session> findByHostId(UUID hostId);
    
    /**
     * Find active sessions by host ID
     */
    List<Session> findByHostIdAndActive(UUID hostId, boolean active);
    
    /**
     * Find session by ID and verify it exists and is active
     */
    Optional<Session> findBySessionIdAndActive(UUID sessionId, boolean active);
    
    /**
     * Check if session exists and is active
     */
    boolean existsBySessionIdAndActive(UUID sessionId, boolean active);
}
