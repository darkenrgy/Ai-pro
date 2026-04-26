package com.darkenrgy.login.auth.services;

import com.darkenrgy.login.auth.dtos.CreateSessionRequest;
import com.darkenrgy.login.auth.dtos.SessionDto;

import java.util.UUID;

/**
 * Service interface for Session operations
 */
public interface SessionService {
    
    /**
     * Create a new session
     * @param request session creation details
     * @param hostId the user creating the session
     * @return created session details
     */
    SessionDto createSession(CreateSessionRequest request, UUID hostId);
    
    /**
     * Get session details
     * @param sessionId the session ID
     * @return session details with all participants
     */
    SessionDto getSessionDetails(UUID sessionId);
    
    /**
     * Get all sessions hosted by a user
     * @param hostId the host user ID
     * @return list of hosted sessions
     */
    Iterable<SessionDto> getHostedSessions(UUID hostId);

    /**
     * Get recent sessions that a user can still access because permission remains active.
     * @param userId the participant user ID
     * @return list of active, non-expired sessions where user has active granted permission
     */
    Iterable<SessionDto> getRecentAccessibleSessions(UUID userId);
    
    /**
     * Close/deactivate a session
     * @param sessionId the session ID
     * @param hostId the host user ID (for authorization)
     */
    void closeSession(UUID sessionId, UUID hostId);

    /**
     * Permanently delete a session and its related data
     * @param sessionId the session ID
     * @param hostId the host user ID (for authorization)
     */
    void deleteSession(UUID sessionId, UUID hostId);
    
    /**
     * Check if session is active and not expired
     * @param sessionId the session ID
     * @return true if active and not expired
     */
    boolean isSessionActive(UUID sessionId);
}
