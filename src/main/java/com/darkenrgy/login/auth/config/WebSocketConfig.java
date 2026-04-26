package com.darkenrgy.login.auth.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.lang.NonNull;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

import com.darkenrgy.login.auth.security.WebSocketAuthenticationInterceptor;
import com.darkenrgy.login.auth.security.WebSocketHandshakeInterceptor;

/**
 * WebSocket Configuration for real-time communication
 * Enables STOMP (Simple Text Oriented Message Protocol) over WebSocket
 * - Endpoint: /ws/chat
 * - Uses in-memory message broker for message routing
 * - Supports session-based chat with individual and broadcast messaging
 * - JWT authentication for WebSocket connections
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketAuthenticationInterceptor authenticationInterceptor;
    private final WebSocketHandshakeInterceptor handshakeInterceptor;

    public WebSocketConfig(
            WebSocketAuthenticationInterceptor authenticationInterceptor,
            WebSocketHandshakeInterceptor handshakeInterceptor) {
        this.authenticationInterceptor = authenticationInterceptor;
        this.handshakeInterceptor = handshakeInterceptor;
    }

    @Override
    public void configureMessageBroker(@NonNull MessageBrokerRegistry config) {
        // Enable simple in-memory message broker
        config.enableSimpleBroker("/topic", "/queue");
        
        // Configure prefix for messages sent TO the server (application routes)
        config.setApplicationDestinationPrefixes("/app");
        
        // Prefix for user-specific message delivery
        config.setUserDestinationPrefix("/user");
    }

    @Override
    public void registerStompEndpoints(@NonNull StompEndpointRegistry registry) {
        // Register the WebSocket endpoint for chat
        registry.addEndpoint("/ws/chat")
            .setAllowedOriginPatterns("http://localhost:*", "http://127.0.0.1:*", "http://*:*", "https://*:*")
            .addInterceptors(handshakeInterceptor)
                .withSockJS();

        // Dedicated signaling endpoint for WebRTC video/audio control plane.
        registry.addEndpoint("/ws/video")
            .setAllowedOriginPatterns("http://localhost:*", "http://127.0.0.1:*", "http://*:*", "https://*:*")
            .addInterceptors(handshakeInterceptor)
                .withSockJS();
    }

    @Override
    public void configureClientInboundChannel(@NonNull ChannelRegistration registration) {
        registration.interceptors(authenticationInterceptor);
    }
}
