package com.darkenrgy.login.auth.dtos;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum ChatMessageType {
    TEXT,
    IMAGE,
    VIDEO,
    AUDIO,
    FILE;

    @JsonCreator
    public static ChatMessageType fromValue(String value) {
        if (value == null || value.isBlank()) {
            return TEXT;
        }

        for (ChatMessageType candidate : values()) {
            if (candidate.name().equalsIgnoreCase(value.trim())) {
                return candidate;
            }
        }

        return TEXT;
    }

    @JsonValue
    public String toValue() {
        return name().toLowerCase();
    }
}
