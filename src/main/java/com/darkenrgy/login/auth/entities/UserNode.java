package com.darkenrgy.login.auth.entities;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * UserNode represents a participant in a session with parent-child hierarchical relationship
 * - First user to join (Host) has no parent
 * - Other users join as children of existing nodes
 * - Forms a tree structure within a session
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Entity
@Table(name = "user_nodes", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"session_id", "user_id"})
})
public class UserNode {
    
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "node_id")
    private UUID nodeId;
    
    @Column(name = "session_id", nullable = false)
    private UUID sessionId;
    
    @Column(name = "user_id", nullable = false)
    private UUID userId;
    
    @Column(name = "parent_id")
    private UUID parentId;
    
    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JoinColumn(name = "parent_id", referencedColumnName = "node_id")
    private List<UserNode> children = new ArrayList<>();
    
    @Column(name = "joined_at")
    private Instant joinedAt = Instant.now();
    
    @Column(name = "left_at")
    private Instant leftAt;
    
    @Column(name = "is_active")
    private boolean active = true;

    @Column(name = "permission_granted")
    private boolean permissionGranted = false;

    @Column(name = "pending_secret_hash", length = 128)
    private String pendingSecretHash;

    @Column(name = "granted_by_user_id")
    private UUID grantedByUserId;

    @Column(name = "permission_granted_at")
    private Instant permissionGrantedAt;
    
    @PrePersist
    protected void onCreate() {
        if (joinedAt == null) {
            joinedAt = Instant.now();
        }
    }
}
