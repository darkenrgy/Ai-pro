package com.darkenrgy.login.auth.security;

import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import com.darkenrgy.login.auth.helpers.UserHelper;
import com.fasterxml.jackson.databind.ObjectMapper;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.Jws;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.MalformedJwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Component
@RequiredArgsConstructor
@Slf4j
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    private final JwtService jwtService;
    private final ObjectMapper objectMapper;
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain) throws ServletException, IOException {
        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        String requestUri = request.getRequestURI();
        boolean isPublicEndpoint = isPublicEndpoint(requestUri);

        String header = request.getHeader("Authorization");
        if (header == null || header.isBlank()) {
            header = request.getHeader("authorization");
        }

        boolean bearerHeaderPresent = header != null && header.trim().toLowerCase().startsWith("bearer ");
        log.debug("JWT filter processing {} {} bearerHeaderPresent={} isPublic={}", 
                  request.getMethod(), requestUri, bearerHeaderPresent, isPublicEndpoint);

        if (bearerHeaderPresent) {
            String token = header.trim().substring(7).trim();
            
            if (token.isBlank()) {
                // For public endpoints, missing token is OK - continue without auth
                // For protected endpoints, SecurityConfig will enforce auth
                if (!isPublicEndpoint) {
                    writeUnauthorized(response, "Missing JWT token");
                    return;
                }
                filterChain.doFilter(request, response);
                return;
            }

            try {
                // Check if token is an access token
                if (!jwtService.isAccessToken(token)) {
                    log.debug("JWT filter: non-access token for {}", requestUri);
                    filterChain.doFilter(request, response);
                    return;
                }

                // Validate and parse JWT
                Jws<Claims> parse = jwtService.parse(token);
                Claims payload = parse.getPayload();

                String userId = payload.getSubject();
                UUID useruuid = UserHelper.parseUUID(userId);

                // Extract authorities from JWT
                Object rolesClaim = payload.get("roles");
                List<GrantedAuthority> authorities;
                if (rolesClaim instanceof List<?> roleNames) {
                    authorities = roleNames.stream()
                            .filter(java.util.Objects::nonNull)
                            .map(String::valueOf)
                            .filter(role -> !role.isBlank())
                            .map(SimpleGrantedAuthority::new)
                            .collect(Collectors.toList());
                } else {
                    authorities = List.of();
                }

                // Set authentication in security context
                UsernamePasswordAuthenticationToken authentication = 
                    new UsernamePasswordAuthenticationToken(useruuid.toString(), null, authorities);
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

                var existingAuthentication = SecurityContextHolder.getContext().getAuthentication();
                if (existingAuthentication == null
                        || !existingAuthentication.isAuthenticated()
                        || existingAuthentication instanceof AnonymousAuthenticationToken) {
                    SecurityContextHolder.getContext().setAuthentication(authentication);
                    log.debug("JWT filter authenticated subject {} with {} authorities", useruuid, authorities.size());
                }

            } catch (ExpiredJwtException e) {
                log.debug("JWT expired for {}", requestUri);
                if (!isPublicEndpoint) {
                    writeUnauthorized(response, "JWT token has expired");
                    return;
                }
                // For public endpoints, continue without authentication
                log.debug("Public endpoint with expired token, allowing request");
                
            } catch (MalformedJwtException e) {
                log.debug("JWT malformed for {}", requestUri);
                if (!isPublicEndpoint) {
                    writeUnauthorized(response, "Invalid JWT token");
                    return;
                }
                // For public endpoints, continue without authentication
                log.debug("Public endpoint with malformed token, allowing request");
                
            } catch (JwtException e) {
                log.debug("JWT validation failed for {}", requestUri);
                if (!isPublicEndpoint) {
                    writeUnauthorized(response, "Invalid JWT token");
                    return;
                }
                // For public endpoints, continue without authentication
                log.debug("Public endpoint with invalid JWT, allowing request");
                
            } catch (Exception e) {
                log.error("Unexpected JWT filter error", e);
                if (!isPublicEndpoint) {
                    writeUnauthorized(response, "Unauthorized request");
                    return;
                }
                // For public endpoints, continue without authentication
                log.debug("Public endpoint with JWT error, allowing request");
            }
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Check if the endpoint is a public endpoint that doesn't require authentication
     */
    private boolean isPublicEndpoint(String requestUri) {
        return requestUri.startsWith("/api/v1/auth/login") ||
             requestUri.startsWith("/api/v1/auth/refresh") ||
               requestUri.startsWith("/api/v1/auth/register") ||
               requestUri.startsWith("/api/v1/health") ||
               requestUri.startsWith("/ws/") ||
               requestUri.startsWith("/error") ||
               requestUri.startsWith("/actuator");
    }

    private void writeUnauthorized(HttpServletResponse response, String message) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        objectMapper.writeValue(response.getWriter(), Map.of(
                "message", message,
                "statusCode", HttpServletResponse.SC_UNAUTHORIZED
        ));
    }

}
