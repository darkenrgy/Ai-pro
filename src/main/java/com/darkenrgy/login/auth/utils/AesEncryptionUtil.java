package com.darkenrgy.login.auth.utils;

import java.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * AES Encryption/Decryption Utility
 * Encrypts and decrypts payload data for secure image embedding
 */
@Component
@Slf4j
public class AesEncryptionUtil {

    @Value("${security.encryption.aes-key:${random.value}}")
    private String aesKeyString;

    private static final String ALGORITHM = "AES";
    private static final int KEY_SIZE = 256;

    /**
     * Encrypt plaintext using AES
     * @param plaintext the data to encrypt
     * @return Base64 encoded encrypted data
     */
    public String encrypt(String plaintext) {
        try {
            SecretKey secretKey = getSecretKey();
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);
            byte[] encryptedBytes = cipher.doFinal(plaintext.getBytes());
            return Base64.getEncoder().encodeToString(encryptedBytes);
        } catch (Exception e) {
            log.error("Error encrypting data", e);
            throw new RuntimeException("Encryption failed", e);
        }
    }

    /**
     * Decrypt ciphertext using AES
     * @param ciphertext Base64 encoded encrypted data
     * @return decrypted plaintext
     */
    public String decrypt(String ciphertext) {
        try {
            SecretKey secretKey = getSecretKey();
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, secretKey);
            byte[] decodedBytes = Base64.getDecoder().decode(ciphertext);
            byte[] decryptedBytes = cipher.doFinal(decodedBytes);
            return new String(decryptedBytes);
        } catch (Exception e) {
            log.error("Error decrypting data", e);
            throw new RuntimeException("Decryption failed", e);
        }
    }

    /**
     * Get or generate AES secret key
     * Uses configured key if available, generates new one if needed
     */
    private SecretKey getSecretKey() {
        try {
            // Use configured key if available and valid
            if (aesKeyString != null && !aesKeyString.isEmpty() && aesKeyString.length() >= 32) {
                try {
                    byte[] decodedKey = Base64.getDecoder().decode(aesKeyString);
                    if (decodedKey.length == 16 || decodedKey.length == 24 || decodedKey.length == 32) {
                        return new SecretKeySpec(decodedKey, ALGORITHM);
                    }
                } catch (IllegalArgumentException ignored) {
                    // Not Base64 encoded; fall back to deterministic key derivation.
                }

                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                byte[] derivedKey = digest.digest(aesKeyString.getBytes(StandardCharsets.UTF_8));
                return new SecretKeySpec(derivedKey, ALGORITHM);
            }

            // Generate new key if not configured
            KeyGenerator keyGenerator = KeyGenerator.getInstance(ALGORITHM);
            keyGenerator.init(KEY_SIZE);
            SecretKey secretKey = keyGenerator.generateKey();
            
            // Log for setup purposes (not recommended for production)
            String encodedKey = Base64.getEncoder().encodeToString(secretKey.getEncoded());
            log.warn("Generated new AES key. Add this to application.yaml: security.encryption.aes-key={}", encodedKey);
            
            return secretKey;
        } catch (Exception e) {
            log.error("Error generating AES key", e);
            throw new RuntimeException("Failed to get AES key", e);
        }
    }
}
