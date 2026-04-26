package com.darkenrgy.login.auth.services;

import com.darkenrgy.login.auth.dtos.LoginRequest;
import com.darkenrgy.login.auth.dtos.LoginResponse;
import com.darkenrgy.login.auth.dtos.RefreshRequest;
import com.darkenrgy.login.auth.dtos.UserDto;

public interface AuthService {
    /**
     * Register a new user
     * @param userDto the user registration data
     * @return the created user DTO
     */
    UserDto registerUser(UserDto userDto);

    /**
     * Authenticate user and return JWT token
     * @param loginRequest the login credentials
     * @return login response with JWT token and user details
     */
    LoginResponse loginUser(LoginRequest loginRequest);

    /**
     * Refresh an access token using a valid refresh token.
     * @param refreshRequest the refresh token payload
     * @return refreshed login response
     */
    LoginResponse refreshAccessToken(RefreshRequest refreshRequest);
}
