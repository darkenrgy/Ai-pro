package com.darkenrgy.login.auth.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@Slf4j
public class RequestLoggingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        long startedAt = System.currentTimeMillis();

        try {
            filterChain.doFilter(request, response);
        } finally {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String userId = authentication != null && authentication.isAuthenticated() ? authentication.getName() : "anonymous";
            String forwardedFor = request.getHeader("X-Forwarded-For");
            String clientIp = forwardedFor != null && !forwardedFor.isBlank()
                    ? forwardedFor.split(",")[0].trim()
                    : request.getRemoteAddr();

            long durationMs = System.currentTimeMillis() - startedAt;
            log.info("HTTP {} {} -> {} in {}ms ip={} user={}",
                    request.getMethod(),
                    request.getRequestURI(),
                    response.getStatus(),
                    durationMs,
                    clientIp,
                    userId);
        }
    }
}