package com.darkenrgy.login.auth.controller;

import com.darkenrgy.login.auth.dtos.LoginRequest;
import com.darkenrgy.login.auth.dtos.LoginResponse;
import com.darkenrgy.login.auth.dtos.RefreshRequest;
import com.darkenrgy.login.auth.dtos.UserDto;
import com.darkenrgy.login.auth.services.AuthService;
import jakarta.validation.Valid;
import lombok.AllArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * Authentication Controller
 * Handles user registration and login
 */
@RestController
@RequestMapping("/api/v1/auth")
@AllArgsConstructor
public class AuthController {
    private final AuthService authService;

    /**
     * Register a new user
     * @param userDto the user registration data
     * @return the created user
     */
    @PostMapping("/register")
    public ResponseEntity<UserDto> registerUser(@Valid @RequestBody UserDto userDto) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.registerUser(userDto));
    }

    /**
     * Login user and return JWT token
     * @param loginRequest the login credentials
     * @return login response with JWT token
     */
    @PostMapping("/login")
    public ResponseEntity<LoginResponse> loginUser(@Valid @RequestBody LoginRequest loginRequest) {
        LoginResponse response = authService.loginUser(loginRequest);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refreshToken(@Valid @RequestBody RefreshRequest refreshRequest) {
        return ResponseEntity.ok(authService.refreshAccessToken(refreshRequest));
    }
}