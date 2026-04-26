package com.darkenrgy.login.auth.services.impl;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.darkenrgy.login.auth.dtos.UserNodeDto;
import com.darkenrgy.login.auth.entities.Session;
import com.darkenrgy.login.auth.entities.UserNode;
import com.darkenrgy.login.auth.exceptions.ResourceNotFoundException;
import com.darkenrgy.login.auth.repositries.SessionRepository;
import com.darkenrgy.login.auth.repositries.UserNodeRepository;
import com.darkenrgy.login.auth.services.UserNodeService;

import lombok.RequiredArgsConstructor;

/**
 * Implementation of UserNodeService
 * Manages hierarchical user nodes in sessions with parent-child relationships
 * Handles recursive deletion when parent is removed
 */
@Service
@RequiredArgsConstructor
@Transactional
public class UserNodeServiceImpl implements UserNodeService {
    
    private final UserNodeRepository userNodeRepository;
    private final SessionRepository sessionRepository;
    
    @Override
    public UserNodeDto joinSession(UUID sessionId, UUID userId, UUID parentNodeId, String sharedSecret) {
        // Verify session exists and is active
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Session not found: " + sessionId));
        
        // Check if user already in session
        if (userNodeRepository.existsBySessionIdAndUserId(sessionId, userId)) {
            throw new IllegalArgumentException("User already joined this session");
        }
        
        // Host root node is auto-approved.
        if (parentNodeId == null) {
            UserNode rootNode = UserNode.builder()
                .sessionId(sessionId)
                .userId(userId)
                .parentId(null)
                .active(true)
                .permissionGranted(true)
                .grantedByUserId(userId)
                .permissionGrantedAt(Instant.now())
                .build();

            UserNode savedRootNode = userNodeRepository.save(rootNode);
            return convertToDto(savedRootNode);
        }

        // If parentNodeId provided, verify it exists in same session and is permission-enabled.
        if (parentNodeId != null) {
            UserNode parentNode = userNodeRepository.findById(parentNodeId)
                    .orElseThrow(() -> new ResourceNotFoundException("Parent node not found: " + parentNodeId));
            
            if (!parentNode.getSessionId().equals(sessionId)) {
                throw new IllegalArgumentException("Parent node is not in the same session");
            }

            if (!parentNode.isActive() || !parentNode.isPermissionGranted()) {
                throw new IllegalArgumentException("Parent does not currently have permission to add new users");
            }
        }
        
        // Create pending permission request node.
        UserNode newNode = UserNode.builder()
                .sessionId(sessionId)
                .userId(userId)
                .parentId(parentNodeId)
                .active(false)
                .permissionGranted(false)
                .pendingSecretHash(hashSecret(Objects.requireNonNullElse(sharedSecret, "")))
                .build();
        
        UserNode savedNode = userNodeRepository.save(newNode);
        return convertToDto(savedNode);
    }

    @Override
    public UserNodeDto approveJoinRequest(UUID sessionId, UUID nodeId, UUID approverUserId, String sharedSecret) {
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Session not found: " + sessionId));

        UserNode pendingNode = userNodeRepository.findById(nodeId)
                .orElseThrow(() -> new ResourceNotFoundException("User node not found: " + nodeId));

        if (!pendingNode.getSessionId().equals(sessionId)) {
            throw new IllegalArgumentException("Node does not belong to this session");
        }

        if (pendingNode.isPermissionGranted()) {
            return convertToDto(pendingNode);
        }

        boolean isSessionHost = session.getHostId().equals(approverUserId);
        if (!isSessionHost) {
            UserNode approverNode = userNodeRepository.findBySessionIdAndUserId(sessionId, approverUserId)
                    .orElseThrow(() -> new IllegalArgumentException("Approver is not part of this session"));

            if (!approverNode.isActive() || !approverNode.isPermissionGranted()) {
                throw new IllegalArgumentException("Approver does not have active chat permission");
            }

            if (!approverNode.getNodeId().equals(pendingNode.getParentId())) {
                throw new IllegalArgumentException("You can only approve direct child requests");
            }
        }

        String providedHash = hashSecret(Objects.requireNonNullElse(sharedSecret, ""));
        if (!providedHash.equals(pendingNode.getPendingSecretHash())) {
            throw new IllegalArgumentException("Shared secret mismatch. Permission not granted.");
        }

        pendingNode.setPermissionGranted(true);
        pendingNode.setActive(true);
        pendingNode.setGrantedByUserId(approverUserId);
        pendingNode.setPermissionGrantedAt(Instant.now());

        UserNode saved = userNodeRepository.save(pendingNode);
        return convertToDto(saved);
    }

    @Override
    public List<UserNodeDto> getPendingRequests(UUID sessionId, UUID approverUserId) {
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Session not found: " + sessionId));

        if (session.getHostId().equals(approverUserId)) {
            return userNodeRepository.findBySessionIdAndActive(sessionId, false).stream()
                    .filter(node -> !node.isPermissionGranted() && node.getLeftAt() == null)
                    .map(this::convertToFlatDto)
                    .collect(Collectors.toList());
        }

        UserNode approverNode = userNodeRepository.findBySessionIdAndUserId(sessionId, approverUserId)
                .orElseThrow(() -> new IllegalArgumentException("Approver is not part of this session"));

        return userNodeRepository
                .findBySessionIdAndParentIdAndPermissionGranted(sessionId, approverNode.getNodeId(), false)
                .stream()
                .filter(node -> node.getLeftAt() == null)
                .map(this::convertToFlatDto)
                .collect(Collectors.toList());
    }

    @Override
    public boolean hasChatPermission(UUID sessionId, UUID userId) {
        return userNodeRepository.findBySessionIdAndUserId(sessionId, userId)
                .map(node -> node.isActive() && node.isPermissionGranted())
                .orElse(false);
    }
    
    @Override
    public void removeUserFromSession(UUID sessionId, UUID nodeId, UUID requestingUserId) {
        Session session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Session not found: " + sessionId));
        
        UserNode nodeToRemove = userNodeRepository.findById(nodeId)
                .orElseThrow(() -> new ResourceNotFoundException("User node not found: " + nodeId));
        
        if (!nodeToRemove.getSessionId().equals(sessionId)) {
            throw new IllegalArgumentException("Node is not in the specified session");
        }

        boolean isSessionHost = session.getHostId().equals(requestingUserId);
        if (!isSessionHost) {
            UserNode requesterNode = userNodeRepository.findBySessionIdAndUserId(sessionId, requestingUserId)
                    .orElseThrow(() -> new IllegalArgumentException("Requester is not part of this session"));

            boolean isDescendant = isDescendantOf(nodeToRemove, requesterNode.getNodeId());
            if (!isDescendant) {
                throw new IllegalArgumentException("You can only remove users invited in your own branch");
            }
        }
        
        // Remove node and all children recursively
        removeNodeRecursively(nodeToRemove);
    }
    
    /**
     * Recursively remove a node and all its children
     * @param node the node to remove
     */
    private void removeNodeRecursively(UserNode node) {
        List<UserNode> children = userNodeRepository.findByParentId(node.getNodeId());
        for (UserNode child : children) {
            removeNodeRecursively(child);
        }

        userNodeRepository.softDeactivateNode(node.getNodeId(), Instant.now());
    }

    private boolean isDescendantOf(UserNode targetNode, UUID ancestorNodeId) {
        UUID currentParentId = targetNode.getParentId();
        while (currentParentId != null) {
            if (currentParentId.equals(ancestorNodeId)) {
                return true;
            }

            UserNode parentNode = userNodeRepository.findById(currentParentId).orElse(null);
            if (parentNode == null) {
                return false;
            }
            currentParentId = parentNode.getParentId();
        }
        return false;
    }

    private String hashSecret(String secret) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashBytes = digest.digest(secret.trim().getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hashBytes.length * 2);
            for (byte hashByte : hashBytes) {
                builder.append(String.format("%02x", hashByte));
            }
            return builder.toString();
        } catch (Exception exception) {
            throw new IllegalStateException("Unable to hash secret", exception);
        }
    }
    
    @Override
    public UserNodeDto getUserNode(UUID sessionId, UUID userId) {
        UserNode node = userNodeRepository.findBySessionIdAndUserId(sessionId, userId)
                .orElseThrow(() -> new ResourceNotFoundException(
                    "User not found in session: " + sessionId));
        
        return convertToDto(node);
    }
    
    @Override
    public UserNodeDto getRootNode(UUID sessionId) {
        UserNode rootNode = userNodeRepository.findBySessionIdAndParentIdIsNull(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException(
                    "Root node not found for session: " + sessionId));
        
        return convertToDto(rootNode);
    }
    
    @Override
    public List<UserNodeDto> getAllUsersInSession(UUID sessionId) {
        List<UserNode> nodes = userNodeRepository.findBySessionIdAndActive(sessionId, true);
        return nodes.stream()
                .map(this::convertToFlatDto)
                .collect(Collectors.toList());
    }
    
    @Override
    public UserNodeDto getUsersView(UUID sessionId, UUID userId) {
        // Get the user's node
        UserNode userNode = userNodeRepository.findBySessionIdAndUserId(sessionId, userId)
                .orElseThrow(() -> new ResourceNotFoundException(
                    "User not found in session: " + sessionId));
        
        UserNodeDto view = convertToDto(userNode, new HashSet<>());
        
        return view;
    }
    
    @Override
    public long countActiveParticipants(UUID sessionId) {
        return userNodeRepository.countBySessionIdAndActive(sessionId, true);
    }
    
    private UserNodeDto convertToDto(UserNode node) {
        return convertToDto(node, new HashSet<>());
    }

    private UserNodeDto convertToDto(UserNode node, Set<UUID> visitedNodeIds) {
        if (node.getNodeId() != null && !visitedNodeIds.add(node.getNodeId())) {
            return convertToFlatDto(node);
        }

        List<UserNodeDto> childrenDtos = new ArrayList<>();
        if (node.getChildren() != null && !node.getChildren().isEmpty()) {
            childrenDtos = node.getChildren().stream()
                    .map(child -> convertToDto(child, visitedNodeIds))
                    .collect(Collectors.toList());
        }

        return UserNodeDto.builder()
                .nodeId(node.getNodeId())
                .userId(node.getUserId())
                .sessionId(node.getSessionId())
                .parentId(node.getParentId())
                .children(childrenDtos)
                .joinedAt(node.getJoinedAt())
                .active(node.isActive())
                .permissionGranted(node.isPermissionGranted())
                .build();
    }

    private UserNodeDto convertToFlatDto(UserNode node) {
        return UserNodeDto.builder()
                .nodeId(node.getNodeId())
                .userId(node.getUserId())
                .sessionId(node.getSessionId())
                .parentId(node.getParentId())
                .children(List.of())
                .joinedAt(node.getJoinedAt())
                .active(node.isActive())
                .permissionGranted(node.isPermissionGranted())
                .build();
    }
}
