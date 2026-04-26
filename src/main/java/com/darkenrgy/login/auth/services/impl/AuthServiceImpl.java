package com.darkenrgy.login.auth.services.impl;

import java.util.Set;
import java.util.UUID;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.darkenrgy.login.auth.dtos.LoginRequest;
import com.darkenrgy.login.auth.dtos.LoginResponse;
import com.darkenrgy.login.auth.dtos.RoleDto;
import com.darkenrgy.login.auth.dtos.RefreshRequest;
import com.darkenrgy.login.auth.dtos.UserDto;
import com.darkenrgy.login.auth.entities.User;
import com.darkenrgy.login.auth.exceptions.AuthenticationFailedException;
import com.darkenrgy.login.auth.exceptions.ResourceNotFoundException;
import com.darkenrgy.login.auth.repositries.UserRepository;
import com.darkenrgy.login.auth.security.JwtService;
import com.darkenrgy.login.auth.services.AuthService;
import com.darkenrgy.login.auth.services.UserService;

import lombok.AllArgsConstructor;

/**
 * Authentication service implementation
 * Handles user registration and login with JWT token generation
 */
@Service
@AllArgsConstructor
public class AuthServiceImpl implements AuthService {
    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final UserRepository userRepository;

    @Override
    public UserDto registerUser(UserDto userDto) {
        // Encode password before saving
        userDto.setPassword(passwordEncoder.encode(userDto.getPassword()));
        return userService.createUser(userDto);
    }

    @Override
    public LoginResponse loginUser(LoginRequest loginRequest) {
        // Find user by email
        User user = userRepository.findByEmail(loginRequest.getEmail())
                .orElseThrow(() -> new ResourceNotFoundException("User not found with email: " + loginRequest.getEmail()));

        // Verify user is enabled
        if (!user.isEnabled()) {
            throw new AuthenticationFailedException("Invalid credentials");
        }

        // Verify password matches
        if (!passwordEncoder.matches(loginRequest.getPassword(), user.getPassword())) {
            throw new AuthenticationFailedException("Invalid credentials");
        }

        // Generate JWT tokens
        String accessToken = jwtService.generateAccessToken(
            user,
            loginRequest.isRememberMe() ? jwtService.getRememberMeAccessTtlSeconds() : jwtService.getAccessTtlSeconds());

        String refreshToken = null;
        Long refreshExpiresIn = null;
        if (loginRequest.isRememberMe()) {
            refreshToken = jwtService.generateRefreshToken(user, UUID.randomUUID().toString());
            refreshExpiresIn = jwtService.getRefreshTtlSeconds();
        }

        // Convert entity roles to DTOs
        var roleDtos = user.getRoles().stream()
                .map(role -> com.darkenrgy.login.auth.dtos.RoleDto.builder()
                        .id(role.getId())
                        .name(role.getName())
                        .build())
                .collect(java.util.stream.Collectors.toSet());

        if (roleDtos.isEmpty()) {
            roleDtos = Set.of(RoleDto.builder().name("HOST").build());
        }

        // Build and return login response with token and user details
        return LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(loginRequest.isRememberMe() ? jwtService.getRememberMeAccessTtlSeconds() : jwtService.getAccessTtlSeconds())
                .refreshExpiresIn(refreshExpiresIn)
                .userId(user.getId())
                .username(user.getName())
                .email(user.getEmail())
                .roles(roleDtos)
                .build();
    }

    @Override
    public LoginResponse refreshAccessToken(RefreshRequest refreshRequest) {
        String refreshToken = refreshRequest.getRefreshToken();

        if (!jwtService.isRefreshToken(refreshToken)) {
            throw new AuthenticationFailedException("Invalid refresh token");
        }

        UUID userId = jwtService.getUserId(refreshToken);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + userId));

        if (!user.isEnabled()) {
            throw new AuthenticationFailedException("Invalid credentials");
        }

        String accessToken = jwtService.generateAccessToken(user, jwtService.getRememberMeAccessTtlSeconds());

        var roleDtos = user.getRoles().stream()
                .map(role -> com.darkenrgy.login.auth.dtos.RoleDto.builder()
                        .id(role.getId())
                        .name(role.getName())
                        .build())
                .collect(java.util.stream.Collectors.toSet());

        if (roleDtos.isEmpty()) {
            roleDtos = Set.of(RoleDto.builder().name("HOST").build());
        }

        return LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtService.getRememberMeAccessTtlSeconds())
                .refreshExpiresIn(jwtService.getRefreshTtlSeconds())
                .userId(user.getId())
                .username(user.getName())
                .email(user.getEmail())
                .roles(roleDtos)
                .build();
    }
}
