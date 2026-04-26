package com.darkenrgy.login.auth.repositries;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.darkenrgy.login.auth.entities.UserNode;

/**
 * Repository for UserNode entity
 * Handles hierarchical user-node relationships in sessions
 */
@Repository
public interface UserNodeRepository extends JpaRepository<UserNode, UUID> {
    
    /**
     * Find a user node in a session
     */
    Optional<UserNode> findBySessionIdAndUserId(UUID sessionId, UUID userId);
    
    /**
     * Find all user nodes in a session
     */
    List<UserNode> findBySessionId(UUID sessionId);

    /**
     * Delete all user nodes in a session
     */
    void deleteBySessionId(UUID sessionId);
    
    /**
     * Find all active user nodes in a session
     */
    List<UserNode> findBySessionIdAndActive(UUID sessionId, boolean active);

    List<UserNode> findBySessionIdAndParentIdAndPermissionGranted(UUID sessionId, UUID parentId, boolean permissionGranted);

    List<UserNode> findByUserIdAndActiveAndPermissionGranted(UUID userId, boolean active, boolean permissionGranted);
    
    /**
     * Find root node (node with no parent) in a session
     */
    Optional<UserNode> findBySessionIdAndParentIdIsNull(UUID sessionId);
    
    /**
     * Find all children of a parent node
     */
    List<UserNode> findByParentId(UUID parentId);
    
    /**
     * Check if user exists in session
     */
    boolean existsBySessionIdAndUserId(UUID sessionId, UUID userId);
    
    /**
     * Count users in a session
     */
    long countBySessionIdAndActive(UUID sessionId, boolean active);

    /**
     * Soft-deactivate node without loading full entity graph.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update UserNode u set u.active = false, u.permissionGranted = false, u.leftAt = :leftAt where u.nodeId = :nodeId")
    int softDeactivateNode(@Param("nodeId") UUID nodeId, @Param("leftAt") Instant leftAt);
}
