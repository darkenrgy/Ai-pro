package com.darkenrgy.login.auth.security;

import com.darkenrgy.login.auth.entities.User;
import com.darkenrgy.login.auth.exceptions.ResourceNotFoundException;
import com.darkenrgy.login.auth.repositries.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class CustomUserDetailService implements UserDetailsService {
    private final UserRepository userRepository;
    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {

        return userRepository.findByEmail(username).orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }
}
