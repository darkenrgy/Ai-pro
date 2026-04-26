package com.darkenrgy.login.auth.utils;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Compression Utility
 * Handles ZIP compression and decompression for file storage
 */
@Component
@Slf4j
public class CompressionUtil {
    
    private static final int BUFFER_SIZE = 1024 * 8; // 8KB buffer
    
    /**
     * Compress data using ZIP
     * @param data the data to compress
     * @param fileName name for the ZIP entry
     * @return compressed bytes
     */
    public byte[] compress(byte[] data, String fileName) {
        try {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            try (ZipOutputStream zos = new ZipOutputStream(baos)) {
                ZipEntry entry = new ZipEntry(fileName);
                entry.setSize(data.length);
                zos.putNextEntry(entry);
                zos.write(data);
                zos.closeEntry();
            }
            
            byte[] compressed = baos.toByteArray();
            log.debug("Compressed {} bytes to {} bytes", data.length, compressed.length);
            return compressed;
            
        } catch (Exception e) {
            log.error("Error compressing data", e);
            throw new RuntimeException("Compression failed", e);
        }
    }
    
    /**
     * Decompress ZIP data
     * @param compressedData the compressed bytes
     * @return decompressed bytes
     */
    public byte[] decompress(byte[] compressedData) {
        try {
            ByteArrayInputStream bais = new ByteArrayInputStream(compressedData);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            
            try (ZipInputStream zis = new ZipInputStream(bais)) {
                ZipEntry entry = zis.getNextEntry();
                if (entry == null) {
                    throw new RuntimeException("No ZIP entries found");
                }
                
                byte[] buffer = new byte[BUFFER_SIZE];
                int length;
                while ((length = zis.read(buffer)) >= 0) {
                    baos.write(buffer, 0, length);
                }
                zis.closeEntry();
            }
            
            byte[] decompressed = baos.toByteArray();
            log.debug("Decompressed {} bytes to {} bytes", compressedData.length, decompressed.length);
            return decompressed;
            
        } catch (Exception e) {
            log.error("Error decompressing data", e);
            throw new RuntimeException("Decompression failed", e);
        }
    }
    
    /**
     * Check if compression is beneficial
     * @param originalSize original data size
     * @return true if compression is recommended
     */
    public boolean shouldCompress(long originalSize) {
        // Compress files larger than 1MB
        return originalSize > 1024 * 1024;
    }
}
