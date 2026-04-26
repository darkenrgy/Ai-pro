package com.darkenrgy.login.auth.config;

import java.util.Map;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

import com.darkenrgy.login.auth.security.HttpsEnforcementFilter;
import com.darkenrgy.login.auth.security.JwtAuthenticationFilter;
import com.darkenrgy.login.auth.security.RateLimitingFilter;
import com.darkenrgy.login.auth.security.RequestLoggingFilter;
import com.fasterxml.jackson.databind.ObjectMapper;

import jakarta.servlet.http.HttpServletResponse;

@EnableWebSecurity
@EnableMethodSecurity
@Configuration
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final CorsConfigurationSource corsConfigurationSource;
    private final HttpsEnforcementFilter httpsEnforcementFilter;
    private final ObjectProvider<RateLimitingFilter> rateLimitingFilterProvider;
    private final RequestLoggingFilter requestLoggingFilter;
    private final ObjectMapper objectMapper;

    public SecurityConfig(
            JwtAuthenticationFilter jwtAuthenticationFilter,
            CorsConfigurationSource corsConfigurationSource,
            HttpsEnforcementFilter httpsEnforcementFilter,
            ObjectProvider<RateLimitingFilter> rateLimitingFilterProvider,
            RequestLoggingFilter requestLoggingFilter,
            ObjectMapper objectMapper) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.corsConfigurationSource = corsConfigurationSource;
        this.httpsEnforcementFilter = httpsEnforcementFilter;
        this.rateLimitingFilterProvider = rateLimitingFilterProvider;
        this.requestLoggingFilter = requestLoggingFilter;
        this.objectMapper = objectMapper;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(headers -> headers.httpStrictTransportSecurity(hsts -> hsts
                        .includeSubDomains(true)
                        .preload(true)
                        .maxAgeInSeconds(31536000)));

        http.authorizeHttpRequests(authorize -> authorize
            .requestMatchers("/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/refresh").permitAll()
                .requestMatchers("/api/v1/health/**").permitAll()
                .requestMatchers("/error").permitAll()
                .requestMatchers("/ws/**").permitAll()
                .requestMatchers("/admin/**").hasAuthority("ADMIN")
                .requestMatchers("/api/v1/session/create").hasAuthority("HOST")
                .requestMatchers("/api/v1/session/join").authenticated()
                .anyRequest().authenticated());

        http.exceptionHandling(ex -> ex
                .authenticationEntryPoint(authenticationEntryPoint())
                .accessDeniedHandler(accessDeniedHandler()));

        http.addFilterBefore(requestLoggingFilter, UsernamePasswordAuthenticationFilter.class);
        http.addFilterAfter(httpsEnforcementFilter, RequestLoggingFilter.class);
        http.addFilterAfter(jwtAuthenticationFilter, HttpsEnforcementFilter.class);
        RateLimitingFilter rateLimitingFilter = rateLimitingFilterProvider.getIfAvailable();
        if (rateLimitingFilter != null) {
            http.addFilterAfter(rateLimitingFilter, JwtAuthenticationFilter.class);
        }

        return http.build();
    }

    private AuthenticationEntryPoint authenticationEntryPoint() {
        return (request, response, exception) -> {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write(objectMapper.writeValueAsString(Map.of(
                    "message", "Unauthorized access",
                    "statusCode", HttpServletResponse.SC_UNAUTHORIZED
            )));
        };
    }

    private AccessDeniedHandler accessDeniedHandler() {
        return (request, response, accessDeniedException) -> {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json");
            response.getWriter().write(objectMapper.writeValueAsString(Map.of(
                    "message", "Access denied",
                    "statusCode", HttpServletResponse.SC_FORBIDDEN
            )));
        };
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
