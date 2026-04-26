package com.darkenrgy.login.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class HttpsEnforcementFilter extends OncePerRequestFilter {

    private final ObjectMapper objectMapper;

    @Value("${security.enforce-https:false}")
    private boolean enforceHttps;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        if (!enforceHttps) {
            filterChain.doFilter(request, response);
            return;
        }

        boolean secureRequest = request.isSecure();
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        boolean forwardedSecure = forwardedProto != null && forwardedProto.equalsIgnoreCase("https");

        if (!secureRequest && !forwardedSecure) {
            log.warn("Blocked non-HTTPS request to {} {}", request.getMethod(), request.getRequestURI());
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write(objectMapper.writeValueAsString(Map.of(
                    "message", "HTTPS is required",
                    "statusCode", HttpServletResponse.SC_FORBIDDEN
            )));
            return;
        }

        filterChain.doFilter(request, response);
    }
}