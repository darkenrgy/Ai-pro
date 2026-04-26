package com.darkenrgy.login.auth.services.impl;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import com.darkenrgy.login.auth.dtos.GenerateImageRequest;
import com.darkenrgy.login.auth.dtos.SecureImagePayload;
import com.darkenrgy.login.auth.services.SecureImageService;
import com.darkenrgy.login.auth.utils.AesEncryptionUtil;
import com.darkenrgy.login.auth.utils.DigitalSignatureUtil;
import com.darkenrgy.login.auth.utils.SecureImageValidator;
import com.darkenrgy.login.auth.utils.SecurePngGenerator;
import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Secure Image Service Implementation
 * Manages secure PNG image generation and validation with embedded encrypted data
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class SecureImageServiceImpl implements SecureImageService {

    private final SecurePngGenerator pngGenerator;
    private final SecureImageValidator imageValidator;
    private final AesEncryptionUtil encryptionUtil;
    private final DigitalSignatureUtil signatureUtil;
    private final RedisTemplate<String, String> redisTemplate;
    private final ObjectMapper objectMapper;

    private static final String USED_TOKENS_KEY = "secure-image:used-tokens:";
    private final Map<String, Instant> localTokenStore = new ConcurrentHashMap<>();

    /**
     * Generate secure PNG image with embedded encrypted payload
     */
    @Override
    public byte[] generateSecureImage(GenerateImageRequest request, UUID userId) {
        try {
            String oneTimeToken = generateOneTimeToken();

            SecureImagePayload payload = SecureImagePayload.builder()
                    .sessionId(request.getSessionId())
                    .parentId(request.getParentId())
                    .oneTimeToken(oneTimeToken)
                    .expiryTime(request.getExpiryTime())
                    .generatedAt(Instant.now())
                    .version("1.0")
                    .build();

            byte[] pngBytes = pngGenerator.generateSecurePng(
                    request.getWidth(),
                    request.getHeight(),
                    payload
            );

            long expirySeconds = java.time.Duration
                    .between(Instant.now(), request.getExpiryTime())
                    .getSeconds();
            
            String tokenKey = USED_TOKENS_KEY + oneTimeToken;
            try {
                redisTemplate.opsForValue().set(
                        tokenKey,
                        request.getSessionId().toString(),
                        Math.max(expirySeconds, 1),
                        TimeUnit.SECONDS
                );
            } catch (Exception ex) {
                localTokenStore.put(oneTimeToken, request.getExpiryTime());
                log.warn("Redis unavailable, using local token store for secure image token {}", oneTimeToken);
            }

            log.info("Generated secure image for session {}", request.getSessionId());
            return pngBytes;

        } catch (Exception e) {
            log.error("Error generating secure image", e);
            throw new RuntimeException("Image generation failed", e);
        }
    }

    /**
     * Validate and extract image payload
     */
    @Override
    public SecureImagePayload validateImage(String encryptedPayload, String signature) {
        return imageValidator.validateAndExtract(encryptedPayload, signature);
    }

    /**
     * Verify image validity for session access
     */
    @Override
    public boolean isImageValid(String encryptedPayload, String signature, UUID sessionId) {
        try {
            SecureImagePayload payload = imageValidator.validateAndExtract(
                    encryptedPayload,
                    signature
            );

            if (!payload.getSessionId().equals(sessionId)) {
                log.warn("Session ID mismatch");
                return false;
            }

            if (!isTokenAvailable(payload.getOneTimeToken())) {
                log.warn("Token already used, missing, or expired");
                return false;
            }

            log.info("Image valid for session {}", sessionId);
            return true;

        } catch (Exception e) {
            log.error("Error validating image", e);
            return false;
        }
    }

    /**
     * Consume token to prevent replay attacks
     */
    @Override
    public void consumeToken(String token) {
        try {
            boolean consumed = consumeTokenIfPresent(token);
            if (consumed) {
                log.info("Token consumed");
            } else {
                log.warn("Token already consumed or missing");
            }
        } catch (Exception e) {
            log.error("Error consuming token", e);
        }
    }

    private String generateOneTimeToken() {
        return UUID.randomUUID().toString() + "-" + System.nanoTime();
    }

    private boolean consumeTokenIfPresent(String token) {
        Instant now = Instant.now();
        try {
            String tokenKey = USED_TOKENS_KEY + token;
            Boolean deleted = redisTemplate.delete(tokenKey);
            if (Boolean.TRUE.equals(deleted)) {
                return true;
            }
        } catch (Exception e) {
            log.warn("Redis unavailable while consuming secure image token {}", token);
        }

        Instant expiry = localTokenStore.remove(token);
        return expiry != null && expiry.isAfter(now);
    }

    private boolean isTokenAvailable(String token) {
        Instant now = Instant.now();
        try {
            String tokenKey = USED_TOKENS_KEY + token;
            Boolean exists = redisTemplate.hasKey(tokenKey);
            if (Boolean.TRUE.equals(exists)) {
                return true;
            }
        } catch (Exception e) {
            log.warn("Redis unavailable while checking secure image token {}", token);
        }

        Instant expiry = localTokenStore.get(token);
        return expiry != null && expiry.isAfter(now);
    }

    public static class EncryptedImageData {
        public String encrypted;
        public String signature;

        public EncryptedImageData(String encrypted, String signature) {
            this.encrypted = encrypted;
            this.signature = signature;
        }
    }
}
