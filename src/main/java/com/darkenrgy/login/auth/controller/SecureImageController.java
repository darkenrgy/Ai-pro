package com.darkenrgy.login.auth.controller;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.validation.annotation.Validated;

import com.darkenrgy.login.auth.dtos.GenerateImageRequest;
import com.darkenrgy.login.auth.dtos.SecureImagePayload;
import com.darkenrgy.login.auth.services.SecureImageService;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Secure Image Controller
 * API for generating and validating secure PNG images with embedded encrypted data
 */
@RestController
@Validated
@RequestMapping("/api/v1/secure-image")
@RequiredArgsConstructor
@Slf4j
public class SecureImageController {

    private final SecureImageService secureImageService;

    /**
     * Generate a secure PNG image with embedded encrypted session data
     * POST /api/v1/secure-image/generate
     * 
     * @param request the image generation request (sessionId, parentId, expiryTime)
     * @param auth the authenticated user
     * @return PNG image bytes
     */
    @PostMapping("/generate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<byte[]> generateSecureImage(
            @Valid @RequestBody GenerateImageRequest request,
            Authentication auth) {
        
        try {
            UUID userId = UUID.fromString(auth.getName());
            
            // Generate secure PNG
            byte[] pngBytes = secureImageService.generateSecureImage(request, userId);
            
            // Set response headers for PNG download
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.IMAGE_PNG);
            headers.setContentLength(pngBytes.length);
            headers.setContentDispositionFormData("attachment", 
                    "secure-access-" + UUID.randomUUID() + ".png");
            
            log.info("Generated secure image for user {}", userId);
            return new ResponseEntity<>(pngBytes, headers, HttpStatus.OK);
            
        } catch (Exception e) {
            log.error("Error generating secure image", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Validate secure image and extract encrypted payload
     * POST /api/v1/secure-image/validate
     * 
     * @param encryptedPayload the Base64 encoded encrypted data from image
     * @param signature the digital signature for verification
     * @param auth the authenticated user
     * @return validated payload information
     */
    @PostMapping("/validate")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> validateSecureImage(
            @RequestParam @NotBlank String encryptedPayload,
            @RequestParam @NotBlank String signature,
            Authentication auth) {
        
        try {
            // Validate and extract payload
            SecureImagePayload payload = secureImageService.validateImage(
                    encryptedPayload, 
                    signature
            );

                secureImageService.consumeToken(payload.getOneTimeToken());
            
            Map<String, Object> response = new HashMap<>();
            response.put("valid", true);
            response.put("sessionId", payload.getSessionId());
            response.put("parentId", payload.getParentId());
            response.put("oneTimeToken", payload.getOneTimeToken());
            response.put("expiryTime", payload.getExpiryTime());
            response.put("generatedAt", payload.getGeneratedAt());
            response.put("message", "Image validation successful");
            
            log.info("Successfully validated image for user {}", auth.getName());
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            log.warn("Image validation failed: {}", e.getMessage());
            
            Map<String, Object> error = new HashMap<>();
            error.put("valid", false);
            error.put("error", e.getMessage());
            error.put("message", "Image validation failed");
            
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error);
        }
    }

    /**
     * Check if image is valid for accessing a specific session
     * GET /api/v1/secure-image/check
     * 
     * @param encryptedPayload the Base64 encoded encrypted data
     * @param signature the digital signature
     * @param sessionId the session to access
     * @return validation result
     */
    @GetMapping("/check")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> checkImageValidity(
            @RequestParam @NotBlank String encryptedPayload,
            @RequestParam @NotBlank String signature,
            @RequestParam @NotNull UUID sessionId) {
        
        try {
            boolean isValid = secureImageService.isImageValid(
                    encryptedPayload, 
                    signature, 
                    sessionId
            );
            
            Map<String, Object> response = new HashMap<>();
            response.put("valid", isValid);
            response.put("sessionId", sessionId);
            response.put("message", isValid ? "Image is valid for session access" : "Image is not valid for this session");
            
            HttpStatus status = isValid ? HttpStatus.OK : HttpStatus.UNAUTHORIZED;
            return ResponseEntity.status(status).body(response);
            
        } catch (Exception e) {
            log.warn("Error checking image validity: {}", e.getMessage());
            
            Map<String, Object> error = new HashMap<>();
            error.put("valid", false);
            error.put("error", e.getMessage());
            
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }

    /**
     * Consume one-time token to prevent replay attacks
     * POST /api/v1/secure-image/consume-token
     * 
     * @param token the one-time token to consume
     * @param auth the authenticated user
     * @return success message
     */
    @PostMapping("/consume-token")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, String>> consumeToken(
            @RequestParam @NotBlank String token,
            Authentication auth) {
        
        try {
            secureImageService.consumeToken(token);
            
            Map<String, String> response = new HashMap<>();
            response.put("message", "Token consumed successfully");
            
            log.info("Token consumed by user {}", auth.getName());
            return ResponseEntity.ok(response);
            
        } catch (Exception e) {
            log.error("Error consuming token", e);
            
            Map<String, String> error = new HashMap<>();
            error.put("error", "Failed to consume token");
            error.put("message", e.getMessage());
            
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error);
        }
    }
}
