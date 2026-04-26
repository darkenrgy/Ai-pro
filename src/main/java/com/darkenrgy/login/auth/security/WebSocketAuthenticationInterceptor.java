package com.darkenrgy.login.auth.security;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.lang.NonNull;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import com.darkenrgy.login.auth.helpers.UserHelper;
import com.darkenrgy.login.auth.services.UserNodeService;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * WebSocket Channel Interceptor
 * Authenticates WebSocket connections using JWT tokens
 * - Extracts JWT from STOMP headers
 * - Validates and parses token
 * - Sets up Spring Security context for WebSocket session
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class WebSocketAuthenticationInterceptor implements ChannelInterceptor {

    private final JwtService jwtService;
    private final UserNodeService userNodeService;

    /**
     * Intercept incoming WebSocket messages
     * Authenticate on STOMP CONNECT frame
     */
    @Override
    public Message<?> preSend(@NonNull Message<?> message, @NonNull MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);

        // Process STOMP CONNECT frames
        if (StompCommand.CONNECT.equals(accessor.getCommand())) {
            authenticateUser(accessor);
            if (accessor.getUser() == null) {
                log.warn("Rejecting unauthenticated WebSocket CONNECT frame");
                throw new IllegalArgumentException("Authentication failed for WebSocket CONNECT");
            }
        }

        if (StompCommand.SUBSCRIBE.equals(accessor.getCommand())) {
            validateSubscriptionPermission(accessor);
        }

        return message;
    }

    private void validateSubscriptionPermission(StompHeaderAccessor accessor) {
        String destination = accessor.getDestination();
        if (destination == null || !destination.startsWith("/topic/sessions/") || !destination.endsWith("/messages")) {
            return;
        }

        String[] segments = destination.split("/");
        if (segments.length < 4) {
            throw new IllegalArgumentException("Invalid session topic destination");
        }

        String sessionIdRaw = segments[3];
        UUID sessionId = UUID.fromString(sessionIdRaw);

        String userIdRaw = null;
        var principal = accessor.getUser();
        if (principal != null) {
            userIdRaw = principal.getName();
        }
        Map<String, Object> sessionAttributes = accessor.getSessionAttributes();
        if ((userIdRaw == null || userIdRaw.isBlank()) && sessionAttributes != null) {
            Object senderId = sessionAttributes.get("senderId");
            if (senderId != null) {
                userIdRaw = senderId.toString();
            }
        }

        if (userIdRaw == null || userIdRaw.isBlank()) {
            throw new IllegalArgumentException("Missing user context for subscription");
        }

        UUID userId = UUID.fromString(userIdRaw);
        if (!userNodeService.hasChatPermission(sessionId, userId)) {
            log.warn("Blocking unauthorized session topic subscription. user={} session={}", userId, sessionId);
            throw new IllegalArgumentException("Permission denied for session chat subscription");
        }
    }

    /**
     * Authenticate user from JWT token in STOMP headers
     * Expects Authorization header: "Bearer <token>"
     */
    private void authenticateUser(StompHeaderAccessor accessor) {
        String authorization = accessor.getFirstNativeHeader("Authorization");
        if (authorization == null || authorization.isBlank()) {
            authorization = accessor.getFirstNativeHeader("authorization");
        }

        if ((authorization == null || authorization.isBlank())) {
            String accessToken = accessor.getFirstNativeHeader("access_token");
            if (accessToken == null || accessToken.isBlank()) {
                accessToken = accessor.getFirstNativeHeader("token");
            }
            if (accessToken != null && !accessToken.isBlank()) {
                authorization = "Bearer " + accessToken.trim();
            }
        }

        Map<String, Object> sessionAttributes = accessor.getSessionAttributes();
        if ((authorization == null || authorization.isBlank()) && sessionAttributes != null) {
            Object fallbackAuthorization = sessionAttributes.get("authorization");
            if (fallbackAuthorization != null) {
                authorization = fallbackAuthorization.toString();
            }
        }

        if (authorization == null || authorization.isBlank()) {
            log.warn("No JWT token found in WebSocket connection");
            SecurityContextHolder.clearContext();
            return;
        }

        String trimmed = authorization.trim();
        if (!trimmed.toLowerCase().startsWith("bearer ")) {
            log.warn("No JWT token found in WebSocket connection");
            SecurityContextHolder.clearContext();
            return;
        }

        try {
            String token = trimmed.substring(7).trim(); // Remove "Bearer " prefix
            if (token.isBlank()) {
                log.warn("Empty JWT token in WebSocket header");
                SecurityContextHolder.clearContext();
                return;
            }

            // Validate token is an access token
            if (!jwtService.isAccessToken(token)) {
                log.warn("Invalid token type for WebSocket");
                return;
            }

            // Parse and validate token
            var claims = jwtService.parse(token).getPayload();
            String userId = claims.getSubject();
            UUID userUUID = Objects.requireNonNull(UserHelper.parseUUID(userId), "userUUID");

            Object rolesClaim = claims.get("roles");
            List<GrantedAuthority> authorities;
            if (rolesClaim instanceof List<?> roleNames) {
                authorities = roleNames.stream()
                        .filter(Objects::nonNull)
                        .map(String::valueOf)
                        .filter(role -> !role.isBlank())
                        .map(SimpleGrantedAuthority::new)
                        .collect(Collectors.toList());
            } else {
                authorities = List.of();
            }

            // Create authentication token
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            userId,
                            null,
                            authorities
                    );

            // Set authentication in security context
            SecurityContextHolder.getContext().setAuthentication(authentication);

            // Attach authenticated principal to the WebSocket session for user destinations.
            accessor.setUser(authentication);

            // Store user ID in session attributes for message handling
            Map<String, Object> connectSessionAttributes = accessor.getSessionAttributes();
            if (connectSessionAttributes != null) {
                connectSessionAttributes.put("senderId", userId);
            }
            accessor.addNativeHeader("userId", userId);

            log.info("WebSocket user authenticated: {}", userUUID);

        } catch (Exception e) {
            log.error("Error authenticating WebSocket user", e);
            SecurityContextHolder.clearContext();
        }
    }
}
