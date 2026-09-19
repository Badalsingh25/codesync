package com.cbc.controller;

import com.cbc.dto.auth.JwtResponse;
import com.cbc.dto.auth.LoginReq;
import com.cbc.dto.auth.SignupReq;
import com.cbc.dto.auth.TokenRefreshRequest;
import com.cbc.entity.RefreshToken;
import com.cbc.exception.TokenRefreshException;
import com.cbc.service.AuthService;
import com.cbc.service.RefreshTokenService;
import com.cbc.utils.JwtUtils;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.security.Principal;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthenticationManager authenticationManager;
    private final AuthService authService;
    private final JwtUtils jwtUtils;
    private final UserDetailsService userDetailsService;
    private final RefreshTokenService refreshTokenService;

    @PostMapping("/signup")
    public ResponseEntity<String> signup(@Valid @RequestBody SignupReq u) {
        return authService.saveNewUser(u);
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginReq u) {
        try {
            authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(u.getEmail(), u.getPassword()));
            UserDetails us = userDetailsService.loadUserByUsername(u.getEmail());
            String accessToken = jwtUtils.generateToken(us.getUsername());
            RefreshToken refreshToken = refreshTokenService.createRefreshToken(u.getEmail());
            return ResponseEntity.ok(new JwtResponse(accessToken, refreshToken.getToken(), us.getUsername()));
        } catch (Exception e) {
            return new ResponseEntity<>("Invalid email or password", HttpStatus.UNAUTHORIZED);
        }
    }

    @PostMapping("/refreshtoken")
    public ResponseEntity<?> refreshtoken(@Valid @RequestBody TokenRefreshRequest request) {
        String requestRefreshToken = request.refreshToken();
        return refreshTokenService.findByToken(requestRefreshToken)
                .map(refreshTokenService::verifyExpiration)
                .map(RefreshToken::getUser)
                .map(user -> {
                    String token = jwtUtils.generateToken(user.getEmail());
                    return ResponseEntity.ok(new JwtResponse(token, requestRefreshToken, user.getEmail()));
                })
                .orElseThrow(() -> new TokenRefreshException("Refresh token is not in database!"));
    }

    /**
     * Revokes the caller's refresh token so it can no longer be exchanged
     * for a new access token. Requires a valid access token (this endpoint
     * is behind the normal auth filter, not permitAll), which is enough to
     * shut down the refresh-token-based "silent renewal" path immediately.
     *
     * Note: the access token itself is a stateless JWT with no blacklist, so
     * it remains technically valid until it naturally expires (see
     * jwt.expiration) even after logout — this is a deliberate scope
     * limitation, not an oversight. If you need immediate access-token
     * invalidation too, that requires a server-side revocation list checked
     * on every request, which is a larger change than this endpoint.
     */
    @PostMapping("/logout")
    public ResponseEntity<?> logout(Principal principal) {
        refreshTokenService.deleteByUserId(principal.getName());
        return ResponseEntity.ok().build();
    }
}

