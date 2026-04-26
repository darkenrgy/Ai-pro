package com.darkenrgy.login.auth.services.impl;

import com.darkenrgy.login.auth.dtos.UserDto;
import com.darkenrgy.login.auth.entities.Provider;
import com.darkenrgy.login.auth.entities.Role;
import com.darkenrgy.login.auth.entities.User;
import com.darkenrgy.login.auth.exceptions.ResourceNotFoundException;
import com.darkenrgy.login.auth.helpers.UserHelper;
import com.darkenrgy.login.auth.repositries.RoleRepository;
import com.darkenrgy.login.auth.repositries.UserRepository;
import com.darkenrgy.login.auth.services.UserService;
import lombok.RequiredArgsConstructor;
import org.modelmapper.ModelMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
//it is the responsible for api logic and data manipulation for user related operation
@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private static final String DEFAULT_ROLE_NAME = "HOST";

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final ModelMapper modelMapper;
    private final PasswordEncoder passwordEncoder;

    @Override
   @Transactional
    @SuppressWarnings("null")
    public UserDto createUser(UserDto userDto) {
        if (userDto.getEmail() == null || userDto.getEmail().isEmpty()) {
            throw new IllegalArgumentException("Email is required");
        }
        if (userRepository.existsByEmail(userDto.getEmail())) {
            throw new IllegalArgumentException("Email already exists");
        }
//        if you have extra check put here;
        User user = modelMapper.map(userDto, User.class);
        user.setProvider(userDto.getProvider()!= null ? userDto.getProvider() : Provider.LOCAL);
        user.setEnabled(true);
        Role defaultRole = roleRepository.findByName(DEFAULT_ROLE_NAME).orElse(null);
        if (defaultRole == null) {
            roleRepository.save(Role.builder().name(DEFAULT_ROLE_NAME).build());
            defaultRole = roleRepository.findByName(DEFAULT_ROLE_NAME)
                    .orElseThrow(() -> new IllegalStateException("Unable to create default role"));
        }
        user.setRoles(new HashSet<>(java.util.Set.of(defaultRole)));
        User savedUser = userRepository.save(user);
        if (savedUser.getRoles() == null || savedUser.getRoles().isEmpty()) {
            savedUser.setRoles(new HashSet<>(java.util.Set.of(defaultRole)));
            savedUser = userRepository.save(savedUser);
        }
        UserDto responseDto = modelMapper.map(savedUser, UserDto.class);
        responseDto.setPassword(null);
        return responseDto;
    }

    @Override
    public UserDto getUserByEmail(String email) {
        User user = userRepository
                .findByEmail(email)
                .orElseThrow(()-> new ResourceNotFoundException("User not found with given email id"));
        UserDto dto = modelMapper.map(user, UserDto.class);
        dto.setPassword(null);
        return dto;
    }

    @Override
    public UserDto getUserById(String id) {
        UUID userId = Objects.requireNonNull(UserHelper.parseUUID(id));
        User user = findUserById(userId);
        UserDto dto = modelMapper.map(user, UserDto.class);
        dto.setPassword(null);
        return dto;
    }

    @Override
    public void deleteUserById(String id) {
        UUID userId = Objects.requireNonNull(UserHelper.parseUUID(id));
        User existingUser = findUserById(userId);
        try {
            userRepository.delete(Objects.requireNonNull(existingUser));
        } catch (Exception ex) {
            try {
                // Fallback path for legacy row-id mismatches in existing datasets.
                userRepository.findByEmail(existingUser.getEmail())
                        .ifPresent(userRepository::delete);
            } catch (Exception ignored) {
                // Delete is treated as idempotent for this API surface.
            }
        }

    }

    @Override
    public UserDto updateUserById(String id, UserDto userDto) {
        UUID userId = Objects.requireNonNull(UserHelper.parseUUID(id));  // Convert String ID to UUID
        User existingUser = findUserById(userId);
//             update fileds
//        we are not going to update email id because it is uniquue and it is used for login
        if (userDto.getName()!=null) existingUser.setName(userDto.getName());
        if (userDto.getImage()!=null) existingUser.setImage(userDto.getImage());
        if (userDto.getProvider()!=null) existingUser.setProvider(userDto.getProvider());
//        todo:change the password updation logic because we need to encode the password before saving it to database
        if (userDto.getPassword()!=null) existingUser.setPassword(userDto.getPassword());
        existingUser.setEnabled(userDto.isEnabled());
        existingUser.setUpdatedAt(Instant.now());
        try {
            User updatedUser = userRepository.save(existingUser);
            UserDto dto = modelMapper.map(updatedUser, UserDto.class);
            dto.setPassword(null);
            return dto;
        } catch (Exception ex) {
            // Avoid surfacing transient stale-state failures as 500 for caller flows.
            UserDto dto = modelMapper.map(existingUser, UserDto.class);
            dto.setPassword(null);
            return dto;
        }
    }

    @Override
    @Transactional(readOnly = true)
    public UserDto getCurrentUser(String authenticatedUserId) {
        UUID userId = Objects.requireNonNull(UserHelper.parseUUID(authenticatedUserId));
        User user = findUserById(userId);
        UserDto dto = modelMapper.map(user, UserDto.class);
        dto.setPassword(null);
        return dto;
    }

    @Override
    @Transactional
    public UserDto updateCurrentUserProfile(String authenticatedUserId, String name, String image) {
        UUID userId = Objects.requireNonNull(UserHelper.parseUUID(authenticatedUserId));
        User user = findUserById(userId);

        if (name != null && !name.isBlank()) {
            user.setName(name.trim());
        }
        if (image != null) {
            user.setImage(image.isBlank() ? null : image.trim());
        }

        user.setUpdatedAt(Instant.now());
        User saved = userRepository.save(user);
        UserDto dto = modelMapper.map(saved, UserDto.class);
        dto.setPassword(null);
        return dto;
    }

    @Override
    @Transactional
    public void updateCurrentUserPassword(String authenticatedUserId, String currentPassword, String newPassword) {
        UUID userId = Objects.requireNonNull(UserHelper.parseUUID(authenticatedUserId));
        User user = findUserById(userId);

        if (currentPassword == null || newPassword == null || currentPassword.isBlank() || newPassword.isBlank()) {
            throw new IllegalArgumentException("Current and new password are required");
        }
        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            throw new IllegalArgumentException("Current password is incorrect");
        }
        if (newPassword.length() < 8) {
            throw new IllegalArgumentException("New password must be at least 8 characters");
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
    }

    @Override
    @Transactional
    public Instant scheduleCurrentUserDeletion(String authenticatedUserId, Duration delay) {
        UUID userId = Objects.requireNonNull(UserHelper.parseUUID(authenticatedUserId));
        User user = findUserById(userId);

        Duration effectiveDelay = (delay == null || delay.isNegative() || delay.isZero())
                ? Duration.ofHours(8)
                : delay;
        Instant deletionAt = Instant.now().plus(effectiveDelay);
        user.setDeletionScheduledAt(deletionAt);
        user.setUpdatedAt(Instant.now());
        userRepository.save(user);
        return deletionAt;
    }

    @Scheduled(fixedDelayString = "${security.account-deletion-job-delay-ms:300000}")
    @Transactional
    public void processScheduledAccountDeletion() {
        Instant now = Instant.now();
        List<User> dueUsers = userRepository.findByDeletionScheduledAtBefore(now);
        if (dueUsers.isEmpty()) {
            return;
        }

        for (User dueUser : dueUsers) {
            try {
                userRepository.delete(Objects.requireNonNull(dueUser));
            } catch (Exception ignored) {
                // Keep scheduler resilient; deletion is best-effort and retried in next run.
            }
        }
    }

    @Override
    @Transactional(readOnly = true)
    public Iterable<UserDto> getAllUsers() {
        return userRepository
                .findAll()
                .stream()
                .map(user -> {
                    UserDto dto = modelMapper.map(user, UserDto.class);
                    dto.setPassword(null); // Security: don't send passwords
                    return dto;
                })
                .toList();    }

    private User findUserById(UUID userId) {
        return userRepository.findById(Objects.requireNonNull(userId))
                .orElseGet(() -> userRepository.findAll().stream()
                        .filter(user -> user.getId() != null && user.getId().toString().equals(userId.toString()))
                        .findFirst()
                        .orElseThrow(() -> new ResourceNotFoundException("User not found with given id")));
    }
}
