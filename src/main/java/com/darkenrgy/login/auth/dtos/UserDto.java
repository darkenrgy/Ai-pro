package com.darkenrgy.login.auth.dtos;


import com.darkenrgy.login.auth.entities.Provider;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@JsonIgnoreProperties(ignoreUnknown = true)
@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class UserDto {
private UUID id;

@NotBlank(message = "Name is required")
@Size(min = 2, max = 100, message = "Name must be between 2 and 100 characters")
private String name;

@NotBlank(message = "Email is required")
@Email(message = "Email should be valid")
private String email;

@JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
@NotBlank(message = "Password is required")
@Size(min = 8, max = 250, message = "Password must be between 8 and 250 characters")
private String password;

@Size(max = 2048, message = "Image URL is too long")
private String image;

private boolean enabled;

private Instant deletionScheduledAt;

@Builder.Default
private Instant createdAt = Instant.now();

@Builder.Default
private Instant updatedAt =Instant.now();

@Builder.Default
private Provider provider = Provider.LOCAL;

@Valid
@Builder.Default
private Set<RoleDto> roles = new HashSet<>();
}
