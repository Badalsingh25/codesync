package com.cbc.service;

import com.cbc.entity.Role;
import com.cbc.entity.User;
import com.cbc.repository.UserRepo;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class AuthDetailServiceImplementation implements UserDetailsService {

    @Autowired
    private UserRepo userRepo;


    @Override
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        Optional<User> u = userRepo.findByEmail(email);
        if (u.isEmpty()) {
            throw new UsernameNotFoundException("email not found");
        }
        User ur = u.get();
        // Previously every user was granted the same hardcoded "User"
        // authority regardless of their actual Role (USER/ADMIN), so the
        // Role field in the data model had no effect on anything — there
        // was no way to build a real admin-only endpoint. Grant the
        // Spring-Security-conventional "ROLE_x" authority so
        // hasRole("ADMIN")/@PreAuthorize("hasRole('ADMIN')") work correctly
        // wherever an admin-only endpoint is added.
        Role role = ur.getRole() != null ? ur.getRole() : Role.USER;
        return org.springframework.security.core.userdetails.User.builder()
                .username(ur.getEmail())
                .password(ur.getPassword())
                .authorities("ROLE_" + role.name())
                .build();
    }
}
