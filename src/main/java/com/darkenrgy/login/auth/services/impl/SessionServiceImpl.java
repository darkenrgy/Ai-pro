package com.darkenrgy.login.auth.services.impl;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.darkenrgy.login.auth.dtos.CreateSessionRequest;
import com.darkenrgy.login.auth.dtos.RedisSessionData;
import com.darkenrgy.login.auth.dtos.SessionDto;
import com.darkenrgy.login.auth.entities.Session;
import com.darkenrgy.login.auth.exceptions.ResourceNotFoundException;
import com.darkenrgy.login.auth.repositries.SessionRepository;
import com.darkenrgy.login.auth.repositries.UserNodeRepository;
import com.darkenrgy.login.auth.services.FileService;
import com.darkenrgy.login.auth.services.RedisSessionService;
import com.darkenrgy.login.auth.services.SessionService;
import com.darkenrgy.login.auth.services.UserNodeService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Implementation of SessionService
 * Handles session lifecycle management with Redis caching and file auto-cleanup
 * - Stores sessions temporarily in Redis with TTL
 * - Auto-deletes inactive sessions via Redis expiry
 * - Auto-deletes session files when session closes
 */
@Service
@RequiredArgsConstructor
@Transactional
@Slf4j
public class SessionServiceImpl implements SessionService {
    
    private final SessionRepository sessionRepository;
    private final UserNodeRepository userNodeRepository;
    private final UserNodeService userNodeService;
    private final RedisSessionService redisSessionService;
    private final FileService fileService;
    
    @Override
    public SessionDto createSession(CreateSessionRequest request, UUID hostId) {
        // Calculate expiry time
        Instant expiryTime = Instant.now().plusSeconds(request.getExpirationMinutes() * 60);
        
        // Create session
        Session session = Session.builder()
                .sessionName(request.getSessionName())
                .description(request.getDescription())
                .hostId(hostId)
                .expiryTime(expiryTime)
                .active(true)
                .build();
        
        Session savedSession = sessionRepository.save(session);
        
        // Host automatically joins as root node
        userNodeService.joinSession(savedSession.getSessionId(), hostId, null, null);
        
        // Cache session in Redis with TTL
        cacheSessionInRedis(savedSession, request.getExpirationMinutes());
        
        log.info("Created session {} with TTL {} minutes", savedSession.getSessionId(), request.getExpirationMinutes());
        return convertToDto(savedSession);
    }
    
    @Override
    public SessionDto getSessionDetails(UUID sessionId) {
        // Try to get from Redis cache first
        var cachedSession = redisSessionService.getSession(sessionId);
        
        Session session;
        if (cachedSession.isPresent()) {
            log.debug("Retrieved session {} from Redis cache", sessionId);
            // Cache hit, but we still need the entity for detailed info
            session = sessionRepository.findById(sessionId)
                    .orElseThrow(() -> new ResourceNotFoundException("Session not found: " + sessionId));
        } else {
            // Cache miss, fetch from database
            session = sessionRepository.findById(sessionId)
                    .orElseThrow(() -> new ResourceNotFoundException("Session not found: " + sessionId));
            // Cache it for future access
            long ttlMinutes = java.time.Duration.between(Instant.now(), session.getExpiryTime()).toMinutes();
            if (ttlMinutes > 0) {
                cacheSessionInRedis(session, ttlMinutes);
            }
        }
        
        SessionDto dto = convertToDto(session);
        
        // Add participant information
        dto.setParticipantCount(userNodeService.countActiveParticipants(sessionId));
        dto.setParticipants(userNodeService.getAllUsersInSession(sessionId));
        
        return dto;
    }
    
    @Override
    public Iterable<SessionDto> getHostedSessions(UUID hostId) {
        List<Session> sessions = sessionRepository.findByHostId(hostId);
        return sessions.stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

        @Override
        public Iterable<SessionDto> getRecentAccessibleSessions(UUID userId) {
        Instant now = Instant.now();

        List<UUID> sessionIds = userNodeRepository
            .findByUserIdAndActiveAndPermissionGranted(userId, true, true)
            .stream()
            .map(com.darkenrgy.login.auth.entities.UserNode::getSessionId)
            .distinct()
            .toList();

        return sessionIds.stream()
            .map(sessionRepository::findById)
            .flatMap(Optional::stream)
            .filter(session -> session.isActive() && session.getExpiryTime().isAfter(now))
            .sorted((left, right) -> right.getCreatedAt().compareTo(left.getCreatedAt()))
            .map(this::convertToDto)
            .collect(Collectors.toList());
        }
    
    @Override
    public void closeSession(UUID sessionId, UUID hostId) {
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Session not found: " + sessionId));
        
        // Verify requester is the host
        if (!session.getHostId().equals(hostId)) {
            throw new RuntimeException("Only session host can close the session");
        }
        
        session.setActive(false);
        sessionRepository.save(session);
        
        // Remove from Redis cache
        redisSessionService.removeSession(sessionId);
        
        // Auto-delete all session files
        try {
            fileService.deleteSessionFiles(sessionId);
        } catch (Exception e) {
            log.warn("Error auto-deleting session files during session closure", e);
            // Continue even if file deletion fails
        }
        
        log.info("Closed session {} and removed from cache with file cleanup", sessionId);
    }

    @Override
    public void deleteSession(UUID sessionId, UUID hostId) {
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Session not found: " + sessionId));

        if (!session.getHostId().equals(hostId)) {
            throw new RuntimeException("Only session host can delete the session");
        }

        try {
            fileService.deleteSessionFiles(sessionId);
        } catch (Exception e) {
            log.warn("Error deleting session files during session removal", e);
        }

        try {
            List<com.darkenrgy.login.auth.entities.UserNode> sessionNodes = userNodeRepository.findBySessionId(sessionId);
            sessionNodes.forEach(node -> redisSessionService.removeUserSession(node.getUserId()));
        } catch (Exception e) {
            log.warn("Error deleting user session cache entries during session removal", e);
        }

        try {
            userNodeRepository.findBySessionIdAndParentIdIsNull(sessionId)
                    .ifPresent(rootNode -> userNodeService.removeUserFromSession(sessionId, rootNode.getNodeId(), hostId));
        } catch (Exception e) {
            log.warn("Error deleting session user tree during session removal", e);
        }

        redisSessionService.removeSession(sessionId);
        sessionRepository.delete(session);

        log.info("Deleted session {} and removed related data", sessionId);
    }
    
    @Override
    public boolean isSessionActive(UUID sessionId) {
        return sessionRepository.findBySessionIdAndActive(sessionId, true)
                .isPresent() && 
               sessionRepository.findById(sessionId)
                       .map(s -> s.getExpiryTime().isAfter(Instant.now()))
                       .orElse(false);
    }
    
    private SessionDto convertToDto(Session session) {
        return SessionDto.builder()
                .sessionId(session.getSessionId())
                .hostId(session.getHostId())
                .sessionName(session.getSessionName())
                .description(session.getDescription())
                .active(session.isActive())
                .expiryTime(session.getExpiryTime())
                .createdAt(session.getCreatedAt())
                .build();
    }
    
    /**
     * Cache session in Redis with TTL
     * Auto-deletes when TTL expires (no permanent storage)
     */
    private void cacheSessionInRedis(Session session, long ttlMinutes) {
        try {
            RedisSessionData redisData = RedisSessionData.builder()
                    .sessionId(session.getSessionId())
                    .hostId(session.getHostId())
                    .sessionName(session.getSessionName())
                    .description(session.getDescription())
                    .active(session.isActive())
                    .expiryTime(session.getExpiryTime())
                    .createdAt(session.getCreatedAt())
                    .lastActivityTime(System.currentTimeMillis() / 1000)
                    .build();
            
            redisSessionService.cacheSession(redisData, ttlMinutes);
            log.debug("Cached session {} in Redis with {} minutes TTL", session.getSessionId(), ttlMinutes);
        } catch (Exception e) {
            log.warn("Failed to cache session in Redis", e);
            // Don't fail the operation if caching fails
        }
    }
}
