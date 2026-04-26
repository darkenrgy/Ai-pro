package com.darkenrgy.login.auth.controller;


import com.darkenrgy.login.auth.dtos.UserDto;
import com.darkenrgy.login.auth.dtos.UserPasswordUpdateRequest;
import com.darkenrgy.login.auth.dtos.UserProfileUpdateRequest;
import com.darkenrgy.login.auth.services.UserService;
import lombok.AllArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/users")
@AllArgsConstructor
public class UserController {
    private final UserService userService;
//create user api
    @PostMapping
    public ResponseEntity<UserDto> createUser(@RequestBody UserDto userDto) {
     return ResponseEntity.status(HttpStatus.CREATED).body(userService.createUser(userDto));
    }
//    get all users api
    @GetMapping
    public ResponseEntity<Iterable<UserDto>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }
//get user  by email
    @GetMapping("/email/{email}")
//    {email} should be matched with @PathVariable("email") String email
    public ResponseEntity<UserDto> getUserByEmail(@PathVariable("email") String email){
        return ResponseEntity.ok(userService.getUserByEmail(email));
    }
//delete user by id
//    api/v1/users/{id}
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUserById(@PathVariable("id") String id){
        userService.deleteUserById(id);
        return ResponseEntity.noContent().build();
    }
//    update users
//    userService.updateUserById(id,userDto)   calling service method to update user by id and passing id and userDto as parameter
    @PutMapping("/{id}")
    public ResponseEntity<UserDto> updateUserById(@PathVariable("id") String id, @RequestBody UserDto userDto){
        return ResponseEntity.ok(userService.updateUserById(id,userDto));
    }
//    get user by id
    @GetMapping("/{id}")
    public ResponseEntity<UserDto> getUserById(@PathVariable("id") String id){
        return ResponseEntity.ok(userService.getUserById(id));
    }

    @GetMapping("/me")
    public ResponseEntity<UserDto> getCurrentUser(Authentication authentication) {
        return ResponseEntity.ok(userService.getCurrentUser(authentication.getName()));
    }

    @PutMapping("/me")
    public ResponseEntity<UserDto> updateCurrentUser(
            Authentication authentication,
            @RequestBody UserProfileUpdateRequest request) {
        return ResponseEntity.ok(userService.updateCurrentUserProfile(
                authentication.getName(),
                request.getName(),
                request.getImage()));
    }

    @PutMapping("/me/password")
    public ResponseEntity<Void> updateCurrentUserPassword(
            Authentication authentication,
            @RequestBody UserPasswordUpdateRequest request) {
        userService.updateCurrentUserPassword(
                authentication.getName(),
                request.getCurrentPassword(),
                request.getNewPassword());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/me/delete-schedule")
    public ResponseEntity<Map<String, Object>> scheduleDeleteCurrentUser(Authentication authentication) {
        Instant deletionAt = userService.scheduleCurrentUserDeletion(authentication.getName(), Duration.ofHours(8));
        return ResponseEntity.ok(Map.of(
                "message", "Account scheduled for deletion",
                "deletionAt", deletionAt,
                "delayHours", 8
        ));
    }
}
