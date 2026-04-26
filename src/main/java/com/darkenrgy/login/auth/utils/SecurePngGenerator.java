package com.darkenrgy.login.auth.utils;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.Iterator;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriter;
import javax.imageio.metadata.IIOMetadata;
import javax.imageio.metadata.IIOMetadataNode;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;

import org.springframework.stereotype.Component;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import com.fasterxml.jackson.databind.ObjectMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Secure PNG Image Generator
 * Generates PNG images with embedded encrypted data in metadata
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SecurePngGenerator {

    private final AesEncryptionUtil encryptionUtil;
    private final DigitalSignatureUtil signatureUtil;
    private final ObjectMapper objectMapper;

    private static final String PNG_FORMAT = "PNG";
    private static final String METADATA_KEY = "SECURE_DATA";
    private static final String PNG_METADATA_FORMAT = "javax_imageio_png_1.0";

    /**
     * Generate a PNG image with embedded encrypted payload
     * @param width image width in pixels
     * @param height image height in pixels
     * @param payload the data to embed
     * @return PNG image bytes
     */
    public byte[] generateSecurePng(int width, int height, Object payload) {
        try {
            // Create base image with gradient background
            BufferedImage image = createBaseImage(width, height);
            
            // Add visual elements (QR-like pattern or security markers)
            addSecurityMarkers(image);
            
            // Convert payload to JSON
            String payloadJson = objectMapper.writeValueAsString(payload);
            
            // Encrypt payload
            String encryptedPayload = encryptionUtil.encrypt(payloadJson);
            
            // Sign encrypted data
            String signature = signatureUtil.signData(encryptedPayload);
            
            // Embed encrypted data in metadata
            byte[] pngBytes = embedMetadata(image, encryptedPayload, signature);
            
            log.info("Generated secure PNG image: {}x{}", width, height);
            return pngBytes;
            
        } catch (Exception e) {
            log.error("Error generating secure PNG", e);
            throw new RuntimeException("PNG generation failed", e);
        }
    }

    /**
     * Create base image with gradient background
     */
    private BufferedImage createBaseImage(int width, int height) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g2d = image.createGraphics();
        
        // Create gradient background
        GradientPaint gradient = new GradientPaint(0, 0, Color.BLUE, width, height, Color.CYAN);
        g2d.setPaint(gradient);
        g2d.fillRect(0, 0, width, height);
        
        // Add title
        g2d.setColor(Color.WHITE);
        g2d.setFont(new Font("Arial", Font.BOLD, 16));
        g2d.drawString("SECURE ACCESS", 20, 30);
        
        g2d.dispose();
        return image;
    }

    /**
     * Add security markers/watermarks to image
     */
    private void addSecurityMarkers(BufferedImage image) {
        Graphics2D g2d = image.createGraphics();
        
        // Draw corner markers
        int markerSize = 40;
        g2d.setColor(Color.RED);
        g2d.setStroke(new BasicStroke(2));
        
        // Top-left
        g2d.drawRect(5, 5, markerSize, markerSize);
        // Top-right
        g2d.drawRect(image.getWidth() - markerSize - 5, 5, markerSize, markerSize);
        // Bottom-left
        g2d.drawRect(5, image.getHeight() - markerSize - 5, markerSize, markerSize);
        // Bottom-right
        g2d.drawRect(image.getWidth() - markerSize - 5, image.getHeight() - markerSize - 5, markerSize, markerSize);
        
        // Add timestamp in bottom
        g2d.setColor(Color.WHITE);
        g2d.setFont(new Font("Arial", Font.PLAIN, 10));
        g2d.drawString("Generated: " + System.currentTimeMillis(), 20, image.getHeight() - 10);
        
        g2d.dispose();
    }

    /**
     * Embed encrypted data into PNG metadata
     * Uses Text chunks in PNG format
     */
    private byte[] embedMetadata(BufferedImage image, String encryptedData, String signature) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageOutputStream ios = ImageIO.createImageOutputStream(baos);
        
        ImageWriter writer = null;
        Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName(PNG_FORMAT);
        if (writers.hasNext()) {
            writer = writers.next();
        } else {
            throw new RuntimeException("No PNG image writer found");
        }
        
        writer.setOutput(ios);
        
        // Prepare metadata
        IIOMetadata metadata = writer.getDefaultImageMetadata(
                new javax.imageio.ImageTypeSpecifier(image), 
                writer.getDefaultWriteParam()
        );
        
        // Create text node with encrypted data
        String metadataString = "encrypted=" + encryptedData + "|signature=" + signature;
        IIOMetadataNode root = (IIOMetadataNode) metadata.getAsTree(PNG_METADATA_FORMAT);
        IIOMetadataNode textNode = getOrCreateChild(root, "tEXt");

        IIOMetadataNode textEntry = new IIOMetadataNode("tEXtEntry");
        textEntry.setAttribute("keyword", METADATA_KEY);
        textEntry.setAttribute("value", metadataString);
        textNode.appendChild(textEntry);

        metadata.setFromTree(PNG_METADATA_FORMAT, root);
        
        // Write image with metadata
        IIOImage iioImage = new IIOImage(image, null, metadata);
        writer.write(iioImage);
        writer.dispose();
        ios.close();
        
        return baos.toByteArray();
    }

    /**
     * Extract encrypted data from PNG bytes
     * Note: This is a simplified approach; real implementation would parse PNG structure
     */
    public String extractEncryptedData(byte[] pngBytes) throws Exception {
        try (ImageInputStream iis = ImageIO.createImageInputStream(new ByteArrayInputStream(pngBytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
            if (!readers.hasNext()) {
                throw new RuntimeException("No PNG reader found");
            }

            ImageReader reader = readers.next();
            try {
                reader.setInput(iis, true);
                IIOMetadata metadata = reader.getImageMetadata(0);
                Node root = metadata.getAsTree(PNG_METADATA_FORMAT);

                NodeList textEntries = ((IIOMetadataNode) root).getElementsByTagName("tEXtEntry");
                for (int i = 0; i < textEntries.getLength(); i++) {
                    Node node = textEntries.item(i);
                    if (node instanceof IIOMetadataNode entryNode) {
                        String keyword = entryNode.getAttribute("keyword");
                        if (METADATA_KEY.equals(keyword)) {
                            return entryNode.getAttribute("value");
                        }
                    }
                }

                throw new RuntimeException("Secure metadata not found in PNG");
            } finally {
                reader.dispose();
            }
        }
    }

    public String[] extractEncryptedAndSignature(byte[] pngBytes) throws Exception {
        String metadataString = extractEncryptedData(pngBytes);
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
            throw new RuntimeException("Invalid secure metadata format");
        }

        return new String[]{encrypted, signature};
    }

    private IIOMetadataNode getOrCreateChild(IIOMetadataNode parent, String childName) {
        NodeList children = parent.getElementsByTagName(childName);
        if (children.getLength() > 0) {
            return (IIOMetadataNode) children.item(0);
        }

        IIOMetadataNode child = new IIOMetadataNode(childName);
        parent.appendChild(child);
        return child;
    }
}
