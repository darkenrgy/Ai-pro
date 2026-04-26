package com.darkenrgy.login.auth.dtos;

import java.util.Set;
import java.util.UUID;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Response DTO for login/authentication containing JWT token
 */
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class LoginResponse {
    private String accessToken;

    private String refreshToken;

    @Builder.Default
    private String tokenType = "Bearer";
    private Long expiresIn;
    private Long refreshExpiresIn;
    private UUID userId;
    private String username;
    private String email;
    private Set<RoleDto> roles;
}
