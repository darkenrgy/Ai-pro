package com.darkenrgy.login.auth.dtos;

import jakarta.validation.constraints.NotBlank;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class RoleDto {
    private UUID id;

    @NotBlank(message = "Role name is required")
    private String name;
}
