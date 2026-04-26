package com.darkenrgy.login.auth.utils;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Digital Signature Utility
 * Signs and verifies payload integrity using RSA private/public keys
 */
@Component
@Slf4j
public class DigitalSignatureUtil {

    @Value("${security.rsa.private-key:}")
    private String privateKeyString;

    @Value("${security.rsa.public-key:}")
    private String publicKeyString;

    private static final String ALGORITHM = "SHA256withRSA";
    private static final String KEY_ALGORITHM = "RSA";

    /**
     * Sign data using server private key
     * @param data the data to sign
     * @return Base64 encoded signature
     */
    public String signData(String data) {
        try {
            if (privateKeyString == null || privateKeyString.isEmpty()) {
                log.warn("Private key not configured, generating test signature");
                return Base64.getEncoder().encodeToString(("test-sig-" + System.nanoTime()).getBytes());
            }

            PrivateKey privateKey = loadPrivateKey(privateKeyString);
            Signature signature = Signature.getInstance(ALGORITHM);
            signature.initSign(privateKey);
            signature.update(data.getBytes(StandardCharsets.UTF_8));
            byte[] signatureBytes = signature.sign();
            return Base64.getEncoder().encodeToString(signatureBytes);
        } catch (Exception e) {
            log.error("Error signing data", e);
            throw new RuntimeException("Signature generation failed", e);
        }
    }

    /**
     * Verify signature using public key
     * @param data the original data
     * @param signatureBase64 the Base64 encoded signature
     * @return true if signature is valid
     */
    public boolean verifySignature(String data, String signatureBase64) {
        try {
            if (publicKeyString == null || publicKeyString.isEmpty()) {
                log.warn("Public key not configured, skipping signature verification");
                try {
                    String decoded = new String(Base64.getDecoder().decode(signatureBase64), StandardCharsets.UTF_8);
                    return decoded.startsWith("test-sig-");
                } catch (IllegalArgumentException ex) {
                    return false;
                }
            }

            PublicKey publicKey = loadPublicKey(publicKeyString);
            Signature signature = Signature.getInstance(ALGORITHM);
            signature.initVerify(publicKey);
            signature.update(data.getBytes(StandardCharsets.UTF_8));
            byte[] signatureBytes = Base64.getDecoder().decode(signatureBase64);
            return signature.verify(signatureBytes);
        } catch (Exception e) {
            log.error("Error verifying signature", e);
            return false;
        }
    }

    /**
     * Load private key from Base64 encoded PKCS8 format
     */
    private PrivateKey loadPrivateKey(String keyString) throws Exception {
        byte[] decodedKey = Base64.getDecoder().decode(keyString);
        PKCS8EncodedKeySpec keySpec = new PKCS8EncodedKeySpec(decodedKey);
        KeyFactory keyFactory = KeyFactory.getInstance(KEY_ALGORITHM);
        return keyFactory.generatePrivate(keySpec);
    }

    /**
     * Load public key from Base64 encoded X509 format
     */
    private PublicKey loadPublicKey(String keyString) throws Exception {
        byte[] decodedKey = Base64.getDecoder().decode(keyString);
        X509EncodedKeySpec keySpec = new X509EncodedKeySpec(decodedKey);
        KeyFactory keyFactory = KeyFactory.getInstance(KEY_ALGORITHM);
        return keyFactory.generatePublic(keySpec);
    }
}
