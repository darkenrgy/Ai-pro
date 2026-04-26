package com.darkenrgy.login.auth.services;

import com.darkenrgy.login.auth.dtos.UserDto;

public interface UserService {

// create user
    UserDto createUser(UserDto userDto);

//    get user by email
    UserDto getUserByEmail(String email);

//    get user by id
    UserDto getUserById(String id);

//    delete user by id
    void deleteUserById(String id);

//    update user by id
    UserDto updateUserById(String id, UserDto userDto);

//    get all users
    Iterable<UserDto> getAllUsers();

    UserDto getCurrentUser(String authenticatedUserId);

    UserDto updateCurrentUserProfile(String authenticatedUserId, String name, String image);

    void updateCurrentUserPassword(String authenticatedUserId, String currentPassword, String newPassword);

    java.time.Instant scheduleCurrentUserDeletion(String authenticatedUserId, java.time.Duration delay);
}
