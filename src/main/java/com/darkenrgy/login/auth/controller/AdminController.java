package com.darkenrgy.login.auth.controller;

import com.darkenrgy.login.auth.dtos.UserDto;
import com.darkenrgy.login.auth.services.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

/**
 * Admin Controller
 * Handles administrative operations restricted to ADMIN role only
 */
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminController {

    private final UserService userService;

    /**
     * Get all users
     * Only accessible by ADMIN
     * @return list of all users
     */
    @GetMapping("/users")
    public ResponseEntity<Iterable<UserDto>> getAllUsers() {
        Iterable<UserDto> users = userService.getAllUsers();
        return ResponseEntity.ok(users);
    }

    /**
     * Get user by ID
     * Only accessible by ADMIN
     * @param userId the user ID
     * @return user details
     */
    @GetMapping("/users/{id}")
    public ResponseEntity<UserDto> getUserById(@PathVariable String id) {
        UserDto user = userService.getUserById(id);
        return ResponseEntity.ok(user);
    }

    /**
     * Update user by ID
     * Only accessible by ADMIN
     * @param id the user ID
     * @param userDto the updated user data
     * @return updated user
     */
    @PutMapping("/users/{id}")
    public ResponseEntity<UserDto> updateUser(@PathVariable String id, @RequestBody UserDto userDto) {
        UserDto updatedUser = userService.updateUserById(id, userDto);
        return ResponseEntity.ok(updatedUser);
    }

    /**
     * Delete user by ID
     * Only accessible by ADMIN
     * @param id the user ID
     * @return success response
     */
    @DeleteMapping("/users/{id}")
    public ResponseEntity<String> deleteUser(@PathVariable String id) {
        userService.deleteUserById(id);
        return ResponseEntity.ok("User deleted successfully");
    }

    /**
     * Get system statistics
     * Only accessible by ADMIN
     * @return system statistics
     */
    @GetMapping("/stats")
    public ResponseEntity<Object> getSystemStats() {
        Iterable<UserDto> allUsers = userService.getAllUsers();
        long userCount = 0;
        if (allUsers instanceof java.util.Collection<?>) {
            userCount = ((java.util.Collection<?>) allUsers).size();
        } else {
            userCount = java.util.stream.StreamSupport.stream(allUsers.spliterator(), false).count();
        }

        java.util.Map<String, Object> stats = new java.util.HashMap<>();
        stats.put("totalUsers", userCount);
        stats.put("timestamp", System.currentTimeMillis());
        stats.put("status", "active");
        return ResponseEntity.ok(stats);
    }

    /**
     * Dashboard for admin
     * Only accessible by ADMIN
     * @return admin dashboard data
     */
    @GetMapping("/dashboard")
    public ResponseEntity<Object> getDashboard() {
        java.util.Map<String, Object> dashboard = new java.util.HashMap<>();
        dashboard.put("message", "Welcome to Admin Dashboard");
        dashboard.put("permissions", java.util.List.of("user.manage", "system.manage", "analytics.view"));
        dashboard.put("lastUpdated", System.currentTimeMillis());
        return ResponseEntity.ok(dashboard);
    }
}
