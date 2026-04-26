package com.darkenrgy.login.auth.config;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * CORS Configuration for frontend integration
 * Allows React and other frontend applications to communicate with the API
 */
@Configuration
public class CorsConfig {

    @Value("${security.cors.allowed-origins:}")
    private String extraAllowedOrigins;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        // Prefer origin patterns to support local dev ports consistently with credentials.
        List<String> allowedOriginPatterns = new ArrayList<>(Arrays.asList(
            "http://localhost:*",
            "http://127.0.0.1:*",
            "http://*:*",
            "https://*:*"
        ));
        if (extraAllowedOrigins != null && !extraAllowedOrigins.isBlank()) {
            Arrays.stream(extraAllowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isBlank())
                .forEach(allowedOriginPatterns::add);
        }
        configuration.setAllowedOriginPatterns(allowedOriginPatterns);
        // Allow common HTTP methods
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"));
        // Allow these headers in requests
        configuration.setAllowedHeaders(Arrays.asList("Authorization", "Content-Type", "X-Requested-With", "Accept", "Origin"));
        // Allow credentials (cookies, authorization headers, etc.)
        configuration.setAllowCredentials(true);
        // Allow response headers to be accessed from browser
        configuration.setExposedHeaders(Arrays.asList("Authorization", "Content-Type", "Set-Cookie", "X-Total-Count"));
        // Cache preflight responses for 1 hour
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }
}
