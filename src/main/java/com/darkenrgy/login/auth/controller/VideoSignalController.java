package com.darkenrgy.login.auth.controller;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.stereotype.Controller;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import com.darkenrgy.login.auth.dtos.UserNodeDto;
import com.darkenrgy.login.auth.dtos.VideoSignalMessage;
import com.darkenrgy.login.auth.dtos.VideoSignalRequest;
import com.darkenrgy.login.auth.services.SessionService;
import com.darkenrgy.login.auth.services.UserNodeService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Controller
@RequiredArgsConstructor
@Slf4j
public class VideoSignalController {

    private static final Duration REJECT_RETRY_COOLDOWN = Duration.ofSeconds(30);
    private static final Duration JOIN_REQUEST_SPAM_COOLDOWN = Duration.ofSeconds(5);
    private static final Duration PENDING_REQUEST_TIMEOUT = Duration.ofSeconds(45);
    private static final Duration CONTROLLER_DISCONNECT_GRACE = Duration.ofSeconds(20);

    private final SimpMessagingTemplate messagingTemplate;
    private final SessionService sessionService;
    private final UserNodeService userNodeService;

    private final ConcurrentMap<UUID, VideoSessionState> videoSessions = new ConcurrentHashMap<>();
    private final ConcurrentMap<UUID, ScheduledFuture<?>> pendingControllerEndBySessionId = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    @MessageMapping("/video/start-call")
    public void startCall(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        startSession(SessionMode.CALL, "call-started", request, accessor);
    }

    @MessageMapping("/video/start-stream")
    public void startStream(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        startSession(SessionMode.STREAM, "stream-started", request, accessor);
    }

    private void startSession(SessionMode mode, String eventType, VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        UUID senderId = requireSenderId(accessor);
        UUID sessionId = requireSessionId(request);
        validateSessionAndMembership(sessionId, senderId);
        cancelPendingControllerEnd(sessionId);

        VideoSessionState state = videoSessions.compute(sessionId, (ignored, existing) -> {
            VideoSessionState next = existing != null ? existing : new VideoSessionState();
            next.controllerId = senderId;
            next.mode = mode;
            next.pendingRequestUserIds.clear();
            next.approvedUserIds.clear();
            next.rejectedUntilByUserId.clear();
            next.participantRoles.clear();
            next.allowedScreenShareUserIds.clear();
            next.approvedUserIds.add(senderId);
            next.participantRoles.put(senderId, ParticipantRole.SPEAKER);
            next.allowedScreenShareUserIds.add(senderId);
            next.active = true;
            return next;
        });

        VideoSignalMessage broadcast = VideoSignalMessage.builder()
                .type(eventType)
                .sessionId(sessionId)
                .fromUserId(senderId)
                .controllerId(state.controllerId)
                .mode(state.mode.name().toLowerCase(Locale.ROOT))
                .approvedUserIds(new ArrayList<>(state.approvedUserIds))
                .activeParticipantUserIds(new ArrayList<>(state.approvedUserIds))
                .participantRoles(renderParticipantRoles(state))
                .state("waiting")
                .timestamp(Instant.now())
                .build();

        messagingTemplate.convertAndSend(
            Objects.requireNonNull(topicForSession(sessionId)),
            Objects.requireNonNull(broadcast)
        );
        sendControllerState(sessionId, state);
        sendStateUpdate(sessionId, state);
    }

    @MessageMapping("/video/join-request")
    public void joinRequest(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        joinSessionRequest(null, request, accessor);
    }

    @MessageMapping("/video/join-stream")
    public void joinStream(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        joinSessionRequest(SessionMode.STREAM, request, accessor);
    }

    private void joinSessionRequest(SessionMode requiredMode, VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        UUID requesterId = requireSenderId(accessor);
        UUID sessionId = requireSessionId(request);
        validateSessionAndMembership(sessionId, requesterId);

        VideoSessionState state = requireActiveSessionState(sessionId);
        if (requesterId.equals(state.controllerId)) {
            cancelPendingControllerEnd(sessionId);
        }
        if (requiredMode != null && state.mode != requiredMode) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,
                    "Requested session mode is not active");
        }
        if (requesterId.equals(state.controllerId)) {
            return;
        }

        Instant retryAt = state.rejectedUntilByUserId.get(requesterId);
        if (retryAt != null && retryAt.isAfter(Instant.now())) {
            int retryAfter = (int) Math.max(1, Duration.between(Instant.now(), retryAt).getSeconds());
            sendToUser(requesterId, VideoSignalMessage.builder()
                    .type("rejected")
                    .sessionId(sessionId)
                    .controllerId(state.controllerId)
                    .state("rejected")
                    .retryAfterSeconds(retryAfter)
                    .message("Join request rate-limited. Try again shortly.")
                    .timestamp(Instant.now())
                    .build());
            return;
        }

            Instant recentRequestAt = state.lastJoinRequestAtByUserId.get(requesterId);
            if (recentRequestAt != null
                && recentRequestAt.plus(JOIN_REQUEST_SPAM_COOLDOWN).isAfter(Instant.now())
                && !state.pendingRequestUserIds.contains(requesterId)) {
                int retryAfter = (int) Math.max(1,
                    Duration.between(Instant.now(), recentRequestAt.plus(JOIN_REQUEST_SPAM_COOLDOWN)).getSeconds());
                sendToUser(requesterId, VideoSignalMessage.builder()
                    .type("rejected")
                    .sessionId(sessionId)
                    .controllerId(state.controllerId)
                    .mode(state.mode.name().toLowerCase(Locale.ROOT))
                    .state("rejected")
                    .retryAfterSeconds(retryAfter)
                    .message("Please wait before sending another join request.")
                    .timestamp(Instant.now())
                    .build());
                return;
            }

        expirePendingRequestIfTimedOut(sessionId, state, requesterId);
        state.pendingRequestUserIds.add(requesterId);
        state.pendingRequestedAtByUserId.put(requesterId, Instant.now());
        state.lastJoinRequestAtByUserId.put(requesterId, Instant.now());

        sendToUser(requesterId, VideoSignalMessage.builder()
                .type("waiting")
                .sessionId(sessionId)
                .controllerId(state.controllerId)
            .mode(state.mode.name().toLowerCase(Locale.ROOT))
                .state("waiting")
                .message("Waiting for controller approval")
                .timestamp(Instant.now())
                .build());

        sendToUser(state.controllerId, VideoSignalMessage.builder()
                .type("join-request")
                .sessionId(sessionId)
                .fromUserId(requesterId)
                .controllerId(state.controllerId)
                .mode(state.mode.name().toLowerCase(Locale.ROOT))
                .pendingRequestUserIds(new ArrayList<>(state.pendingRequestUserIds))
                .timestamp(Instant.now())
                .build());

        sendControllerState(sessionId, state);
            sendStateUpdate(sessionId, state);
    }

    @MessageMapping("/video/approve-user")
    public void approveUser(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        UUID approverId = requireSenderId(accessor);
        UUID sessionId = requireSessionId(request);
        UUID targetUserId = Objects.requireNonNull(request.getTargetUserId(), "targetUserId is required");
        validateSessionAndMembership(sessionId, approverId);
        validateSessionAndMembership(sessionId, targetUserId);

        VideoSessionState state = requireActiveSessionState(sessionId);
        requireController(state, approverId);
        cancelPendingControllerEnd(sessionId);

        if (!state.pendingRequestUserIds.remove(targetUserId)) {
            return;
        }
        state.pendingRequestedAtByUserId.remove(targetUserId);

        state.approvedUserIds.add(targetUserId);
        ParticipantRole assignedRole = state.mode == SessionMode.STREAM ? ParticipantRole.VIEWER : ParticipantRole.SPEAKER;
        if (request.getRole() != null && "speaker".equalsIgnoreCase(request.getRole())) {
            assignedRole = ParticipantRole.SPEAKER;
        }
        state.participantRoles.put(targetUserId, assignedRole);

        sendToUser(targetUserId, VideoSignalMessage.builder()
                .type("approved")
                .sessionId(sessionId)
                .controllerId(state.controllerId)
                .mode(state.mode.name().toLowerCase(Locale.ROOT))
                .role(assignedRole.name().toLowerCase(Locale.ROOT))
                .approvedUserIds(new ArrayList<>(state.approvedUserIds))
                .participantRoles(renderParticipantRoles(state))
                .state("approved")
                .timestamp(Instant.now())
                .build());

        messagingTemplate.convertAndSend(
            Objects.requireNonNull(topicForSession(sessionId)),
            Objects.requireNonNull(VideoSignalMessage.builder()
                .type("user-joined")
                .sessionId(sessionId)
                .fromUserId(targetUserId)
                .controllerId(state.controllerId)
                .mode(state.mode.name().toLowerCase(Locale.ROOT))
                .role(assignedRole.name().toLowerCase(Locale.ROOT))
                .approvedUserIds(new ArrayList<>(state.approvedUserIds))
                .activeParticipantUserIds(new ArrayList<>(state.approvedUserIds))
                .participantRoles(renderParticipantRoles(state))
                .timestamp(Instant.now())
                .build())
        );

        sendControllerState(sessionId, state);
        sendStateUpdate(sessionId, state);
    }

    @MessageMapping("/video/reject-user")
    public void rejectUser(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        UUID approverId = requireSenderId(accessor);
        UUID sessionId = requireSessionId(request);
        UUID targetUserId = Objects.requireNonNull(request.getTargetUserId(), "targetUserId is required");
        validateSessionAndMembership(sessionId, approverId);
        validateSessionAndMembership(sessionId, targetUserId);

        VideoSessionState state = requireActiveSessionState(sessionId);
        requireController(state, approverId);
        cancelPendingControllerEnd(sessionId);

        state.pendingRequestUserIds.remove(targetUserId);
        state.pendingRequestedAtByUserId.remove(targetUserId);
        state.rejectedUntilByUserId.put(targetUserId, Instant.now().plus(REJECT_RETRY_COOLDOWN));

        sendToUser(targetUserId, VideoSignalMessage.builder()
                .type("rejected")
                .sessionId(sessionId)
                .controllerId(state.controllerId)
                .mode(state.mode.name().toLowerCase(Locale.ROOT))
                .state("rejected")
                .retryAfterSeconds((int) REJECT_RETRY_COOLDOWN.getSeconds())
                .message("Join request rejected by controller")
                .timestamp(Instant.now())
                .build());

        sendControllerState(sessionId, state);
    }

    @MessageMapping("/video/toggle-media")
    public void toggleMedia(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        UUID senderId = requireSenderId(accessor);
        UUID sessionId = requireSessionId(request);
        validateSessionAndMembership(sessionId, senderId);

        VideoSessionState state = requireActiveSessionState(sessionId);
        if (senderId.equals(state.controllerId)) {
            cancelPendingControllerEnd(sessionId);
        }
        UUID affectedUserId = request.getTargetUserId() != null ? request.getTargetUserId() : senderId;
        String mediaType = Objects.requireNonNullElse(request.getMediaType(), "").trim().toLowerCase(Locale.ROOT);
        boolean enabled = request.getEnabled() == null || request.getEnabled();
        if (!senderId.equals(affectedUserId)) {
            validateSessionAndMembership(sessionId, affectedUserId);
        }

        if ("role".equals(mediaType)) {
            requireController(state, senderId);
            ParticipantRole role = "speaker".equalsIgnoreCase(request.getRole()) ? ParticipantRole.SPEAKER : ParticipantRole.VIEWER;
            state.participantRoles.put(affectedUserId, role);
            sendStateUpdate(sessionId, state);
            return;
        }

        if ("screen-permission".equals(mediaType)) {
            requireController(state, senderId);
            if (enabled) {
                state.allowedScreenShareUserIds.add(affectedUserId);
            } else {
                state.allowedScreenShareUserIds.remove(affectedUserId);
            }
            sendStateUpdate(sessionId, state);
            return;
        }

        boolean controllingOtherUser = !senderId.equals(affectedUserId);
        if (controllingOtherUser) {
            requireController(state, senderId);
        }

        if (state.mode == SessionMode.STREAM && "screen".equals(mediaType)
                && !senderId.equals(state.controllerId)
                && !state.allowedScreenShareUserIds.contains(senderId)) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,
                    "Screen share permission is required in stream mode");
        }

        messagingTemplate.convertAndSend(
                Objects.requireNonNull(topicForSession(sessionId)),
                Objects.requireNonNull(VideoSignalMessage.builder()
                        .type("media-updated")
                        .sessionId(sessionId)
                        .controllerId(state.controllerId)
                        .fromUserId(senderId)
                        .affectedUserId(affectedUserId)
                        .mode(state.mode.name().toLowerCase(Locale.ROOT))
                        .mediaType(mediaType)
                        .enabled(enabled)
                        .timestamp(Instant.now())
                        .build())
        );
    }

    @MessageMapping("/video/remove-user")
    public void removeUser(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        UUID senderId = requireSenderId(accessor);
        UUID sessionId = requireSessionId(request);
        UUID targetUserId = Objects.requireNonNull(request.getTargetUserId(), "targetUserId is required");
        validateSessionAndMembership(sessionId, senderId);
        validateSessionAndMembership(sessionId, targetUserId);

        VideoSessionState state = requireActiveSessionState(sessionId);
        requireController(state, senderId);
        cancelPendingControllerEnd(sessionId);
        if (targetUserId.equals(state.controllerId)) {
            return;
        }

        state.pendingRequestUserIds.remove(targetUserId);
        state.pendingRequestedAtByUserId.remove(targetUserId);
        state.approvedUserIds.remove(targetUserId);
        state.participantRoles.remove(targetUserId);
        state.allowedScreenShareUserIds.remove(targetUserId);
        state.rejectedUntilByUserId.put(targetUserId, Instant.now().plus(REJECT_RETRY_COOLDOWN));

        sendToUser(targetUserId, VideoSignalMessage.builder()
                .type("removed-user")
                .sessionId(sessionId)
                .controllerId(state.controllerId)
                .mode(state.mode.name().toLowerCase(Locale.ROOT))
                .message("You were removed by the stream controller")
                .state("ended")
                .timestamp(Instant.now())
                .build());

        sendStateUpdate(sessionId, state);
    }

    @MessageMapping("/video/offer")
    public void relayOffer(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        relayPeerSignal("offer", request, accessor);
    }

    @MessageMapping("/video/answer")
    public void relayAnswer(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        relayPeerSignal("answer", request, accessor);
    }

    @MessageMapping("/video/ice-candidate")
    public void relayIceCandidate(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        relayPeerSignal("ice-candidate", request, accessor);
    }

    @MessageMapping("/video/end-call")
    public void endCall(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        endSession(SessionMode.CALL, "end-call", request, accessor);
    }

    @MessageMapping("/video/end-stream")
    public void endStream(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        endSession(SessionMode.STREAM, "end-stream", request, accessor);
    }

    private void endSession(SessionMode expectedMode, String eventType, VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        UUID senderId = requireSenderId(accessor);
        UUID sessionId = requireSessionId(request);
        validateSessionAndMembership(sessionId, senderId);

        VideoSessionState state = requireActiveSessionState(sessionId);
        if (state.mode != expectedMode) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Requested mode is not active");
        }
        requireController(state, senderId);
        cancelPendingControllerEnd(sessionId);

        videoSessions.remove(sessionId);

        messagingTemplate.convertAndSend(
            Objects.requireNonNull(topicForSession(sessionId)),
            Objects.requireNonNull(VideoSignalMessage.builder()
                .type(eventType)
                .sessionId(sessionId)
                .fromUserId(senderId)
                .controllerId(senderId)
                .mode(expectedMode.name().toLowerCase(Locale.ROOT))
                .state("ended")
                .timestamp(Instant.now())
                .build())
        );
    }

    @MessageMapping("/video/sync-state")
    public void syncState(@Payload VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        UUID requesterId = requireSenderId(accessor);
        UUID sessionId = requireSessionId(request);
        validateSessionAndMembership(sessionId, requesterId);

        VideoSessionState state = videoSessions.get(sessionId);
        if (state == null || !state.active || state.controllerId == null) {
            sendToUser(requesterId, VideoSignalMessage.builder()
                    .type("state-updated")
                    .sessionId(sessionId)
                    .state("ended")
                    .timestamp(Instant.now())
                    .build());
            return;
        }

        if (requesterId.equals(state.controllerId)) {
            cancelPendingControllerEnd(sessionId);
        }

        sendToUser(requesterId, VideoSignalMessage.builder()
                .type("state-updated")
                .sessionId(sessionId)
                .controllerId(state.controllerId)
                .mode(state.mode.name().toLowerCase(Locale.ROOT))
                .pendingRequestUserIds(new ArrayList<>(state.pendingRequestUserIds))
                .approvedUserIds(new ArrayList<>(state.approvedUserIds))
                .activeParticipantUserIds(new ArrayList<>(state.approvedUserIds))
                .allowedScreenShareUserIds(new ArrayList<>(state.allowedScreenShareUserIds))
                .participantRoles(renderParticipantRoles(state))
                .timestamp(Instant.now())
                .build());

        if (state.approvedUserIds.contains(requesterId)) {
            messagingTemplate.convertAndSend(
                    Objects.requireNonNull(topicForSession(sessionId)),
                    Objects.requireNonNull(VideoSignalMessage.builder()
                            .type("user-joined")
                            .sessionId(sessionId)
                            .fromUserId(requesterId)
                            .controllerId(state.controllerId)
                            .mode(state.mode.name().toLowerCase(Locale.ROOT))
                            .role(state.participantRoles.getOrDefault(requesterId, ParticipantRole.VIEWER)
                                    .name().toLowerCase(Locale.ROOT))
                            .approvedUserIds(new ArrayList<>(state.approvedUserIds))
                            .activeParticipantUserIds(new ArrayList<>(state.approvedUserIds))
                            .participantRoles(renderParticipantRoles(state))
                            .timestamp(Instant.now())
                            .build())
            );
        }
    }

    private void relayPeerSignal(String signalType, VideoSignalRequest request, SimpMessageHeaderAccessor accessor) {
        UUID senderId = requireSenderId(accessor);
        UUID sessionId = requireSessionId(request);
        UUID targetUserId = Objects.requireNonNull(request.getTargetUserId(), "targetUserId is required");
        validateSessionAndMembership(sessionId, senderId);
        validateSessionAndMembership(sessionId, targetUserId);

        VideoSessionState state = requireActiveSessionState(sessionId);
        if (!state.approvedUserIds.contains(senderId) || !state.approvedUserIds.contains(targetUserId)) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,
                    "Only approved users may exchange WebRTC signaling");
        }

        if (state.mode == SessionMode.STREAM && "offer".equals(signalType)
            && state.participantRoles.getOrDefault(senderId, ParticipantRole.VIEWER) != ParticipantRole.SPEAKER) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,
                "Only speakers may publish offers in stream mode");
        }

        sendToUser(targetUserId, VideoSignalMessage.builder()
                .type(signalType)
                .sessionId(sessionId)
                .fromUserId(senderId)
                .targetUserId(targetUserId)
                .controllerId(state.controllerId)
            .mode(state.mode.name().toLowerCase(Locale.ROOT))
                .sdp(request.getSdp())
                .candidate(request.getCandidate())
                .sdpMid(request.getSdpMid())
                .sdpMLineIndex(request.getSdpMLineIndex())
                .timestamp(Instant.now())
                .build());
    }

    private void sendControllerState(UUID sessionId, VideoSessionState state) {
        sendToUser(state.controllerId, VideoSignalMessage.builder()
                .type("controller-state")
                .sessionId(sessionId)
                .controllerId(state.controllerId)
                .mode(state.mode.name().toLowerCase(Locale.ROOT))
                .pendingRequestUserIds(new ArrayList<>(state.pendingRequestUserIds))
                .approvedUserIds(new ArrayList<>(state.approvedUserIds))
                .activeParticipantUserIds(new ArrayList<>(state.approvedUserIds))
                .allowedScreenShareUserIds(new ArrayList<>(state.allowedScreenShareUserIds))
                .participantRoles(renderParticipantRoles(state))
                .timestamp(Instant.now())
                .build());
    }

    private void sendStateUpdate(UUID sessionId, VideoSessionState state) {
        messagingTemplate.convertAndSend(
                Objects.requireNonNull(topicForSession(sessionId)),
                Objects.requireNonNull(VideoSignalMessage.builder()
                        .type("state-updated")
                        .sessionId(sessionId)
                        .controllerId(state.controllerId)
                        .mode(state.mode.name().toLowerCase(Locale.ROOT))
                        .pendingRequestUserIds(new ArrayList<>(state.pendingRequestUserIds))
                        .approvedUserIds(new ArrayList<>(state.approvedUserIds))
                        .activeParticipantUserIds(new ArrayList<>(state.approvedUserIds))
                        .allowedScreenShareUserIds(new ArrayList<>(state.allowedScreenShareUserIds))
                        .participantRoles(renderParticipantRoles(state))
                        .timestamp(Instant.now())
                        .build())
        );
    }

    private String topicForSession(UUID sessionId) {
        return "/topic/video/sessions/" + sessionId;
    }

    private void sendToUser(UUID userId, VideoSignalMessage message) {
        messagingTemplate.convertAndSendToUser(
                Objects.requireNonNull(userId.toString()),
                "/queue/video",
                Objects.requireNonNull(message)
        );
    }

    private UUID requireSessionId(VideoSignalRequest request) {
        if (request == null || request.getSessionId() == null) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "sessionId is required");
        }
        return request.getSessionId();
    }

    private UUID requireSenderId(SimpMessageHeaderAccessor headerAccessor) {
        Map<String, Object> sessionAttributes = headerAccessor.getSessionAttributes();
        if (sessionAttributes != null) {
            Object senderId = sessionAttributes.get("senderId");
            if (senderId != null) {
                return UUID.fromString(senderId.toString());
            }
        }

        var principal = headerAccessor.getUser();
        if (principal != null && principal.getName() != null) {
            return UUID.fromString(principal.getName());
        }

        throw new ResponseStatusException(org.springframework.http.HttpStatus.UNAUTHORIZED, "Missing sender identity");
    }

    private void validateSessionAndMembership(UUID sessionId, UUID userId) {
        if (!sessionService.isSessionActive(sessionId)) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Session is not active");
        }
        if (!userNodeService.hasChatPermission(sessionId, userId)) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN, "Chat permission required");
        }
    }

    private VideoSessionState requireActiveSessionState(UUID sessionId) {
        VideoSessionState state = videoSessions.get(sessionId);
        if (state == null || !state.active || state.controllerId == null) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "No active video call in this session");
        }
        return state;
    }

    private void requireController(VideoSessionState state, UUID senderId) {
        if (!senderId.equals(state.controllerId)) {
            throw new ResponseStatusException(org.springframework.http.HttpStatus.FORBIDDEN,
                    "Only session controller can approve or reject users");
        }
    }

    private void expirePendingRequestIfTimedOut(UUID sessionId, VideoSessionState state, UUID requesterId) {
        Instant requestedAt = state.pendingRequestedAtByUserId.get(requesterId);
        if (requestedAt == null) {
            return;
        }
        if (requestedAt.plus(PENDING_REQUEST_TIMEOUT).isAfter(Instant.now())) {
            return;
        }

        state.pendingRequestUserIds.remove(requesterId);
        state.pendingRequestedAtByUserId.remove(requesterId);
        sendToUser(requesterId, VideoSignalMessage.builder()
                .type("rejected")
                .sessionId(sessionId)
                .controllerId(state.controllerId)
                .mode(state.mode.name().toLowerCase(Locale.ROOT))
                .state("rejected")
                .retryAfterSeconds((int) JOIN_REQUEST_SPAM_COOLDOWN.getSeconds())
                .message("Join request timed out. Please request again.")
                .timestamp(Instant.now())
                .build());
    }

    @EventListener
    public void onSessionDisconnect(SessionDisconnectEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());

        UUID disconnectedUserId = null;
        Map<String, Object> sessionAttributes = accessor.getSessionAttributes();
        if (sessionAttributes != null && sessionAttributes.get("senderId") != null) {
            disconnectedUserId = UUID.fromString(sessionAttributes.get("senderId").toString());
        } else {
            var principal = accessor.getUser();
            if (principal != null && principal.getName() != null) {
                disconnectedUserId = UUID.fromString(principal.getName());
            }
        }

        if (disconnectedUserId == null) {
            return;
        }

        List<Map.Entry<UUID, VideoSessionState>> entries = new ArrayList<>(videoSessions.entrySet());
        for (Map.Entry<UUID, VideoSessionState> entry : entries) {
            UUID sessionId = entry.getKey();
            VideoSessionState state = entry.getValue();
            if (state == null || state.controllerId == null || !state.active) {
                continue;
            }

            if (disconnectedUserId.equals(state.controllerId)) {
                scheduleControllerEnd(sessionId, state);
            }
        }
    }

    @EventListener
    public void onSessionConnected(SessionConnectedEvent event) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(event.getMessage());
        UUID connectedUserId = null;

        Map<String, Object> sessionAttributes = accessor.getSessionAttributes();
        if (sessionAttributes != null && sessionAttributes.get("senderId") != null) {
            connectedUserId = UUID.fromString(sessionAttributes.get("senderId").toString());
        } else if (accessor.getUser() != null && accessor.getUser().getName() != null) {
            connectedUserId = UUID.fromString(accessor.getUser().getName());
        }

        if (connectedUserId == null) {
            return;
        }

        for (Map.Entry<UUID, VideoSessionState> entry : videoSessions.entrySet()) {
            VideoSessionState state = entry.getValue();
            if (state != null && connectedUserId.equals(state.controllerId)) {
                cancelPendingControllerEnd(entry.getKey());
            }
        }
    }

    private boolean isDirectConnection(UUID sessionId, UUID controllerUserId, UUID requesterUserId) {
        try {
            UserNodeDto controllerNode = userNodeService.getUserNode(sessionId, controllerUserId);
            UserNodeDto requesterNode = userNodeService.getUserNode(sessionId, requesterUserId);
            return requesterNode.getParentId() != null && requesterNode.getParentId().equals(controllerNode.getNodeId());
        } catch (RuntimeException exception) {
            log.warn("Unable to validate direct connection for session {} controller {} requester {}",
                    sessionId, controllerUserId, requesterUserId, exception);
            return false;
        }
    }

    private void scheduleControllerEnd(UUID sessionId, VideoSessionState state) {
        cancelPendingControllerEnd(sessionId);

        ScheduledFuture<?> future = scheduler.schedule(() -> {
            VideoSessionState latest = videoSessions.get(sessionId);
            if (latest == null || !latest.active || latest.controllerId == null) {
                return;
            }

            videoSessions.remove(sessionId);
            messagingTemplate.convertAndSend(
                    Objects.requireNonNull(topicForSession(sessionId)),
                    Objects.requireNonNull(VideoSignalMessage.builder()
                            .type(latest.mode == SessionMode.STREAM ? "end-stream" : "end-call")
                            .sessionId(sessionId)
                            .controllerId(latest.controllerId)
                            .mode(latest.mode.name().toLowerCase(Locale.ROOT))
                            .state("ended")
                            .message("Controller disconnected. Session ended.")
                            .timestamp(Instant.now())
                            .build())
            );
            pendingControllerEndBySessionId.remove(sessionId);
        }, CONTROLLER_DISCONNECT_GRACE.toMillis(), TimeUnit.MILLISECONDS);

        pendingControllerEndBySessionId.put(sessionId, future);
    }

    private void cancelPendingControllerEnd(UUID sessionId) {
        ScheduledFuture<?> pending = pendingControllerEndBySessionId.remove(sessionId);
        if (pending != null) {
            pending.cancel(false);
        }
    }

    private Map<String, String> renderParticipantRoles(VideoSessionState state) {
        Map<String, String> roles = new HashMap<>();
        state.participantRoles.forEach((userId, role) -> roles.put(userId.toString(), role.name().toLowerCase(Locale.ROOT)));
        return roles;
    }

    private enum SessionMode {
        CALL,
        STREAM
    }

    private enum ParticipantRole {
        VIEWER,
        SPEAKER
    }

    private static final class VideoSessionState {
        private UUID controllerId;
        private SessionMode mode = SessionMode.CALL;
        private final java.util.Set<UUID> pendingRequestUserIds = ConcurrentHashMap.newKeySet();
        private final java.util.Set<UUID> approvedUserIds = ConcurrentHashMap.newKeySet();
        private final java.util.Set<UUID> allowedScreenShareUserIds = ConcurrentHashMap.newKeySet();
        private final ConcurrentMap<UUID, Instant> rejectedUntilByUserId = new ConcurrentHashMap<>();
        private final ConcurrentMap<UUID, Instant> pendingRequestedAtByUserId = new ConcurrentHashMap<>();
        private final ConcurrentMap<UUID, Instant> lastJoinRequestAtByUserId = new ConcurrentHashMap<>();
        private final ConcurrentMap<UUID, ParticipantRole> participantRoles = new ConcurrentHashMap<>();
        private boolean active;
    }
}
