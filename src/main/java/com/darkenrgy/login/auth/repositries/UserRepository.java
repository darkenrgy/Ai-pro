package com.darkenrgy.login.auth.repositries;

import com.darkenrgy.login.auth.entities.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
//auto wired by spring boot, no need to implement it, just call the method and it will work
Optional<User> findByEmail(String email);
Optional<User> findByName(String username);
boolean existsByEmail(String email);
List<User> findByDeletionScheduledAtBefore(Instant timestamp);
}
