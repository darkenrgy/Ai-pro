package com.darkenrgy.login.auth.security;

import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.util.MultiValueMap;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;
import org.springframework.web.util.UriComponentsBuilder;

import lombok.extern.slf4j.Slf4j;

@Component
@Slf4j
public class WebSocketHandshakeInterceptor implements HandshakeInterceptor {

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes) {

        HttpHeaders headers = request.getHeaders();
        String authorization = headers.getFirst(HttpHeaders.AUTHORIZATION);
        if (authorization == null || authorization.isBlank()) {
            authorization = headers.getFirst("authorization");
        }

        if (authorization != null && !authorization.isBlank()) {
            attributes.put("authorization", authorization);
            return true;
        }

        MultiValueMap<String, String> queryParams = UriComponentsBuilder
                .fromUri(request.getURI())
                .build()
                .getQueryParams();

        String accessToken = queryParams.getFirst("access_token");
        if (accessToken != null && !accessToken.isBlank()) {
            attributes.put("authorization", "Bearer " + accessToken.trim());
        } else {
            log.debug("WebSocket handshake started without auth token in headers or query params");
        }

        return true;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Exception exception) {
        // no-op
    }
}