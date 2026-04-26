package com.darkenrgy.login.auth.utils;

import java.time.Instant;
import java.util.Base64;

import org.springframework.stereotype.Component;

import com.darkenrgy.login.auth.dtos.SecureImagePayload;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Secure Image Validator
 * Extracts and validates encrypted data from secure PNG images
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SecureImageValidator {

    private final AesEncryptionUtil encryptionUtil;
    private final DigitalSignatureUtil signatureUtil;
    private final ObjectMapper objectMapper;

    /**
     * Validate encrypted payload from image
     * Checks: signature validity, token expiry
     * @param encryptedPayload Base64 encoded encrypted data
     * @param signature the digital signature
     * @return validated SecureImagePayload if valid
     * @throws RuntimeException if validation fails
     */
    public SecureImagePayload validateAndExtract(String encryptedPayload, String signature) {
        try {
            // Step 1: Verify signature
            if (!signatureUtil.verifySignature(encryptedPayload, signature)) {
                log.warn("Invalid signature for encrypted payload");
                throw new RuntimeException("Signature verification failed");
            }
            log.info("Signature verified successfully");

            // Step 2: Decrypt payload
            String decryptedJson = encryptionUtil.decrypt(encryptedPayload);
            log.debug("Payload decrypted successfully");

            // Step 3: Parse JSON
            SecureImagePayload payload = objectMapper.readValue(
                    decryptedJson, 
                    SecureImagePayload.class
            );

            // Step 4: Validate expiry time
            if (Instant.now().isAfter(payload.getExpiryTime())) {
                log.warn("Token expired at {}", payload.getExpiryTime());
                throw new RuntimeException("Token has expired");
            }
            log.info("Token is still valid, expires at {}", payload.getExpiryTime());

            return payload;

        } catch (Exception e) {
            log.error("Error validating image payload", e);
            if (e instanceof RuntimeException) {
                throw (RuntimeException) e;
            }
            throw new RuntimeException("Validation failed: " + e.getMessage(), e);
        }
    }

    /**
     * Check if one-time token is valid (can be extended with database check)
     * @param token the one-time token
     * @return true if token is valid and not used
     */
    public boolean isTokenValid(String token) {
        // In production, check against database for used tokens
        if (token == null || token.isEmpty()) {
            return false;
        }
        
        // For now, simple validation
        return token.length() >= 32;
    }

    /**
     * Validate all aspects of the image payload
     * @param payload the extracted payload
     * @return true if all validations pass
     */
    public boolean validatePayload(SecureImagePayload payload) {
        try {
            // Check required fields
            if (payload.getSessionId() == null || payload.getParentId() == null) {
                log.warn("Missing required fields in payload");
                return false;
            }

            // Check token validity
            if (!isTokenValid(payload.getOneTimeToken())) {
                log.warn("Invalid or expired one-time token");
                return false;
            }

            // Check expiry
            if (Instant.now().isAfter(payload.getExpiryTime())) {
                log.warn("Payload has expired");
                return false;
            }

            log.info("Payload validation successful - SessionId: {}, ParentId: {}", 
                    payload.getSessionId(), payload.getParentId());
            return true;

        } catch (Exception e) {
            log.error("Error validating payload", e);
            return false;
        }
    }

    /**
     * Extract base64 data from PNG metadata string
     * Format: "encrypted=<base64>|signature=<base64>"
     */
    public String[] extractMetadataValues(String metadataString) {
        try {
            String[] parts = metadataString.split("\\|");
            String encrypted = null;
            String signature = null;

            for (String part : parts) {
                if (part.startsWith("encrypted=")) {
                    encrypted = part.substring("encrypted=".length());
                } else if (part.startsWith("signature=")) {
                    signature = part.substring("signature=".length());
                }
            }

            if (encrypted == null || signature == null) {
                throw new RuntimeException("Invalid metadata format");
            }

            // Validate they are valid Base64
            Base64.getDecoder().decode(encrypted);
            Base64.getDecoder().decode(signature);

            return new String[]{encrypted, signature};

        } catch (Exception e) {
            log.error("Error extracting metadata values", e);
            throw new RuntimeException("Failed to extract metadata", e);
        }
    }
}
