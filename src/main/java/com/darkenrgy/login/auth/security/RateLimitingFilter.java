package com.darkenrgy.login.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Component
@RequiredArgsConstructor
@Slf4j
@ConditionalOnProperty(name = "security.rate-limit.enabled", havingValue = "true", matchIfMissing = true)
public class RateLimitingFilter extends OncePerRequestFilter {

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    @Value("${security.rate-limit.window-seconds:60}")
    private long windowSeconds;

    @Value("${security.rate-limit.ip-max-requests:30}")
    private long ipMaxRequests;

    @Value("${security.rate-limit.user-max-requests:120}")
    private long userMaxRequests;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String keyPrefix;
            long limit;

            if (authentication != null && authentication.isAuthenticated() && authentication.getName() != null) {
                keyPrefix = "user:" + authentication.getName();
                limit = userMaxRequests;
            } else {
                keyPrefix = "ip:" + resolveClientIp(request);
                limit = ipMaxRequests;
            }

            long bucket = Instant.now().getEpochSecond() / Math.max(windowSeconds, 1);
            String key = "security:rate-limit:" + keyPrefix + ":" + bucket;

            Long count = redisTemplate.opsForValue().increment(key);
            if (count != null && count == 1L) {
                redisTemplate.expire(key, Math.max(windowSeconds, 1), TimeUnit.SECONDS);
            }

            if (count != null && count > limit) {
                log.warn("Rate limit exceeded for {} on {} {}", keyPrefix, request.getMethod(), request.getRequestURI());
                response.setStatus(429);
                response.setContentType("application/json");
                response.getWriter().write(objectMapper.writeValueAsString(Map.of(
                        "message", "Rate limit exceeded",
                        "statusCode", 429
                )));
                return;
            }
        } catch (Exception exception) {
            log.warn("Rate limiter unavailable, allowing request to continue", exception);
        }

        filterChain.doFilter(request, response);
    }

    private String resolveClientIp(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}