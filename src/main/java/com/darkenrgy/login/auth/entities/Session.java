package com.darkenrgy.login.auth.entities;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Session entity representing a communication session
 * Hosted by a user and can be joined by participants
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Entity
@Table(name = "sessions")
public class Session {
    
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "session_id")
    private UUID sessionId;
    
    @Column(name = "host_id", nullable = false)
    private UUID hostId;
    
    @Column(name = "session_name")
    private String sessionName;
    
    @Column(name = "description")
    private String description;
    
    @Column(name = "is_active")
    private boolean active = true;
    
    @Column(name = "expiry_time", nullable = false)
    private Instant expiryTime;
    
    @Column(name = "created_at")
    private Instant createdAt = Instant.now();
    
    @Column(name = "updated_at")
    private Instant updatedAt = Instant.now();
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
