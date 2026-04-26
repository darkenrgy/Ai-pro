package com.darkenrgy.login.auth.services;

import java.util.List;
import java.util.UUID;

import com.darkenrgy.login.auth.dtos.UserNodeDto;

/**
 * Service interface for UserNode (hierarchical session participants)
 * Handles parent-child relationships and tree operations
 */
public interface UserNodeService {
    
    /**
     * Join a session and add user to the tree
     * @param sessionId the session ID
     * @param userId the user joining
     * @param parentNodeId the parent node (null for root/first participant)
     * @return the created user node
     */
    UserNodeDto joinSession(UUID sessionId, UUID userId, UUID parentNodeId, String sharedSecret);

    UserNodeDto approveJoinRequest(UUID sessionId, UUID nodeId, UUID approverUserId, String sharedSecret);

    List<UserNodeDto> getPendingRequests(UUID sessionId, UUID approverUserId);

    boolean hasChatPermission(UUID sessionId, UUID userId);
    
    /**
     * Remove a user from session (removes subtree if has children)
     * @param sessionId the session ID
     * @param nodeId the node to remove
     * @param requestingUserId the user making request (for authorization)
     */
    void removeUserFromSession(UUID sessionId, UUID nodeId, UUID requestingUserId);
    
    /**
     * Get user's node in a session
     * @param sessionId the session ID
     * @param userId the user ID
     * @return user node details
     */
    UserNodeDto getUserNode(UUID sessionId, UUID userId);
    
    /**
     * Get root node (host) of session
     * @param sessionId the session ID
     * @return root node details
     */
    UserNodeDto getRootNode(UUID sessionId);
    
    /**
     * Get all users in a session
     * @param sessionId the session ID
     * @return list of all user nodes
     */
    List<UserNodeDto> getAllUsersInSession(UUID sessionId);
    
    /**
     * Get parent-child relationship (what a user can see)
     * @param sessionId the session ID
     * @param userId the user ID
     * @return user's parent and all children
     */
    UserNodeDto getUsersView(UUID sessionId, UUID userId);
    
    /**
     * Count active participants in session
     * @param sessionId the session ID
     * @return participant count
     */
    long countActiveParticipants(UUID sessionId);
}
