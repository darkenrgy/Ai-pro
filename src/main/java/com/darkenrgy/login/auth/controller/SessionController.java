package com.darkenrgy.login.auth.controller;

import java.util.HashMap;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.darkenrgy.login.auth.dtos.ApprovePermissionRequest;
import com.darkenrgy.login.auth.dtos.CreateSessionRequest;
import com.darkenrgy.login.auth.dtos.GenerateImageRequest;
import com.darkenrgy.login.auth.dtos.JoinSessionRequest;
import com.darkenrgy.login.auth.dtos.SessionDto;
import com.darkenrgy.login.auth.dtos.UserNodeDto;
import com.darkenrgy.login.auth.services.SecureImageService;
import com.darkenrgy.login.auth.services.SessionService;
import com.darkenrgy.login.auth.services.UserNodeService;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;

/**
 * Session Controller
 * Handles session management and hierarchical user node operations
 * - Host creates sessions
 * - Participants join with parent-child relationships
 * - Removes user and children recursively
 */
@RestController
@RequestMapping("/api/v1/session")
@RequiredArgsConstructor
public class SessionController {
    
    private final SessionService sessionService;
    private final UserNodeService userNodeService;
    private final SecureImageService secureImageService;

    /**
     * Create a new session
     * Only accessible by HOST role
     * @param request session creation details
     * @param auth the authenticated user (host)
     * @return created session details
     */
    @PostMapping("/create")
    @PreAuthorize("hasAuthority('HOST')")
    public ResponseEntity<SessionDto> createSession(
            @Valid @RequestBody CreateSessionRequest request,
            Authentication auth) {
        
        // Get authenticated user ID from principal
        UUID hostId = UUID.fromString(auth.getName());
        
        SessionDto createdSession = sessionService.createSession(request, hostId);
        return ResponseEntity.status(HttpStatus.CREATED).body(createdSession);
    }

    /**
     * Generate secure PNG image with encrypted payload in metadata.
     * Exposes route requested by clients under /api/v1/session/generate-image.
     */
    @PostMapping("/generate-image")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<byte[]> generateSessionImage(
            @Valid @RequestBody GenerateImageRequest request,
            Authentication auth) {

        UUID userId = UUID.fromString(auth.getName());
        byte[] pngBytes = secureImageService.generateSecureImage(request, userId);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.IMAGE_PNG);
        headers.setContentLength(pngBytes.length);
        headers.setContentDispositionFormData("attachment", "session-access-" + request.getSessionId() + ".png");

        return new ResponseEntity<>(pngBytes, headers, HttpStatus.OK);
    }

    /**
     * Join an existing session
     * Creates parent-child relationship in the session tree
     * Only accessible to authenticated users
     * @param request join session details (sessionId, parentNodeId)
     * @param auth the authenticated user (participant)
     * @return user node details in the session
     */
    @PostMapping("/join")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<UserNodeDto> joinSession(
            @Valid @RequestBody JoinSessionRequest request,
            Authentication auth) {
        
        UUID userId = UUID.fromString(auth.getName());
        
        UserNodeDto userNode = userNodeService.joinSession(
            request.getSessionId(),
            userId,
            request.getParentNodeId(),
            request.getSharedSecret()
        );

        if (userNode.isPermissionGranted()) {
            return ResponseEntity.status(HttpStatus.CREATED).body(userNode);
        }
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(userNode);
    }

    @GetMapping("/{sessionId}/permissions/pending")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Iterable<UserNodeDto>> getPendingPermissionRequests(
            @PathVariable UUID sessionId,
            Authentication auth) {
        UUID approverUserId = UUID.fromString(auth.getName());
        return ResponseEntity.ok(userNodeService.getPendingRequests(sessionId, approverUserId));
    }

    @PutMapping("/{sessionId}/permissions/{nodeId}/approve")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<UserNodeDto> approvePermissionRequest(
            @PathVariable UUID sessionId,
            @PathVariable UUID nodeId,
            @Valid @RequestBody ApprovePermissionRequest request,
            Authentication auth) {

        UUID approverUserId = UUID.fromString(auth.getName());
        UserNodeDto approvedNode = userNodeService.approveJoinRequest(sessionId, nodeId, approverUserId, request.getSharedSecret());
        return ResponseEntity.ok(approvedNode);
    }

    /**
     * Remove a user from session (removes subtree if parent removed)
     * If removing parent node, all children are recursively removed
     * @param nodeId the node ID to remove
     * @param auth the authenticated user
     * @return success message
     */
    @DeleteMapping(value = "/{nodeId}", params = "sessionId")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, String>> removeUserFromSession(
            @PathVariable UUID nodeId,
            @RequestParam UUID sessionId,
            Authentication auth) {
        
        UUID requestingUserId = UUID.fromString(auth.getName());
        
        userNodeService.removeUserFromSession(sessionId, nodeId, requestingUserId);
        
        Map<String, String> response = new HashMap<>();
        response.put("message", "User removed from session successfully");
        response.put("nodeId", nodeId.toString());
        response.put("permissionRevoked", "true");
        return ResponseEntity.ok(response);
    }

    /**
     * Get session details with all participants and their hierarchy
     * @param sessionId the session ID
     * @return session details
     */
    @GetMapping("/{sessionId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<SessionDto> getSessionDetails(@PathVariable UUID sessionId) {
        SessionDto sessionDetails = sessionService.getSessionDetails(sessionId);
        return ResponseEntity.ok(sessionDetails);
    }

    /**
     * Get user's view of the session (parent and children)
     * @param sessionId the session ID
     * @param auth the authenticated user
     * @return user's node with parent-child relationships
     */
    @GetMapping("/{sessionId}/me")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<UserNodeDto> getUserSessionView(
            @PathVariable UUID sessionId,
            Authentication auth) {
        
        UUID userId = UUID.fromString(auth.getName());
        
        UserNodeDto userView = userNodeService.getUsersView(sessionId, userId);
        return ResponseEntity.ok(userView);
    }

    /**
     * Get hosted sessions for current user
     * @param auth the authenticated user
     * @return list of hosted sessions
     */
    @GetMapping("/hosted")
    @PreAuthorize("hasAuthority('HOST')")
    public ResponseEntity<Iterable<SessionDto>> getHostedSessions(Authentication auth) {
        UUID hostId = UUID.fromString(auth.getName());
        
        Iterable<SessionDto> hostedSessions = sessionService.getHostedSessions(hostId);
        return ResponseEntity.ok(hostedSessions);
    }

    @GetMapping("/recent")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Iterable<SessionDto>> getRecentAccessibleSessions(Authentication auth) {
        UUID userId = UUID.fromString(auth.getName());
        Iterable<SessionDto> sessions = sessionService.getRecentAccessibleSessions(userId);
        return ResponseEntity.ok(sessions);
    }

    /**
     * Close a session (only host can close)
     * @param sessionId the session ID
     * @param auth the authenticated user (must be host)
     * @return success message
     */
    @PutMapping("/{sessionId}/close")
    @PreAuthorize("hasAuthority('HOST')")
    public ResponseEntity<Map<String, String>> closeSession(
            @PathVariable UUID sessionId,
            Authentication auth) {
        
        UUID hostId = UUID.fromString(auth.getName());
        
        sessionService.closeSession(sessionId, hostId);
        
        Map<String, String> response = new HashMap<>();
        response.put("message", "Session closed successfully");
        response.put("sessionId", sessionId.toString());
        return ResponseEntity.ok(response);
    }

    /**
     * Permanently delete a session
     * @param sessionId the session ID
     * @param auth the authenticated user (must be host)
     * @return success message
     */
    @DeleteMapping(value = "/{sessionId}", params = "!sessionId")
    @PreAuthorize("hasAuthority('HOST')")
    public ResponseEntity<Map<String, String>> deleteSession(
            @PathVariable UUID sessionId,
            Authentication auth) {

        UUID hostId = UUID.fromString(auth.getName());

        sessionService.deleteSession(sessionId, hostId);

        Map<String, String> response = new HashMap<>();
        response.put("message", "Session deleted successfully");
        response.put("sessionId", sessionId.toString());
        return ResponseEntity.ok(response);
    }
}
