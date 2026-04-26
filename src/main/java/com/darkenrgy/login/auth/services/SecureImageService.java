package com.darkenrgy.login.auth.services;

import com.darkenrgy.login.auth.dtos.GenerateImageRequest;
import com.darkenrgy.login.auth.dtos.SecureImagePayload;

/**
 * Secure Image Service Interface
 * Handles generation and validation of secure access images
 */
public interface SecureImageService {

    /**
     * Generate a secure PNG image with embedded encrypted data
     * @param request the image generation request
     * @param userId the requesting user ID
     * @return PNG image bytes
     */
    byte[] generateSecureImage(GenerateImageRequest request, java.util.UUID userId);

    /**
     * Validate and extract payload from image data
     * @param encryptedPayload the encrypted data (Base64)
     * @param signature the digital signature (Base64)
     * @return validated SecureImagePayload
     */
    SecureImagePayload validateImage(String encryptedPayload, String signature);

    /**
     * Verify if image payload is valid for session access
     * @param encryptedPayload the encrypted data
     * @param signature the digital signature
     * @param sessionId expected session ID
     * @return true if image grants access to session
     */
    boolean isImageValid(String encryptedPayload, String signature, java.util.UUID sessionId);

    /**
     * Mark one-time token as used
     * @param token the token to invalidate
     */
    void consumeToken(String token);
}
