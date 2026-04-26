package com.darkenrgy.login.auth.security;

import com.darkenrgy.login.auth.entities.Role;
import com.darkenrgy.login.auth.entities.User;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.time.Instant;

@Service
public class JwtService {

    private final SecretKey key;
    private final long accessTtlSeconds;
    private final long rememberMeAccessTtlSeconds;
    private final long refreshTtlSeconds;
    private final String issuer;

    public JwtService(
                       @Value("${security.jwt.secret}") String secret,
                       @Value("${security.jwt.access-ttl-seconds}") long accessTtlSeconds,
                       @Value("${security.jwt.remember-me-access-ttl-seconds:604800}") long rememberMeAccessTtlSeconds,
                       @Value("${security.jwt.refresh-ttl-seconds}") long refreshTtlSeconds,
                       @Value("${security.jwt.issuer}") String issuer) {
        if (secret ==null ||secret.length()<64){
            throw new IllegalArgumentException("Invalid secret");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessTtlSeconds = accessTtlSeconds;
        this.rememberMeAccessTtlSeconds = rememberMeAccessTtlSeconds;
        this.refreshTtlSeconds = refreshTtlSeconds;
        this.issuer = issuer;
    }
//    generate token
    public String generateAccessToken(User user){
        return generateAccessToken(user, accessTtlSeconds);
    }

    public String generateAccessToken(User user, long ttlSeconds){
        Instant now = Instant.now();
        List<String> roles = user.getRoles()==null ? List.of() :
                user.getRoles().stream().map(Role::getName).toList();
        if (roles.isEmpty()) {
            roles = List.of("HOST");
        }
        return Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(user.getId().toString())
                .issuer(issuer)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlSeconds)))
                .claims(Map.of(
                        "email", user.getEmail(),
                        "roles", roles,
                        "typ", "access"
                ))
                .signWith(key, SignatureAlgorithm.HS512)
                .compact();
    }
//    generate refresh token
    public String generateRefreshToken(User user ,String jti){
        Instant now = Instant.now();
        return Jwts.builder()
                .id(jti)
                .subject(user.getId().toString())
                .issuer(issuer)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(refreshTtlSeconds)))
                .claims(Map.of(
                        "typ", "refresh"
                ))
                .signWith(key, SignatureAlgorithm.HS512)
                .compact();
    }
//    parse token
    public Jws<Claims> parse(String token){
        try{
            return Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token);
        }catch (JwtException e){
            throw e;
        }
    }
    public boolean isAccessToken(String token){
        Claims c = parse(token).getPayload();
        return "access".equals(c.get("typ"));
    }
        public boolean isRefreshToken(String token){
            Claims c = parse(token).getPayload();
            return "refresh".equals(c.get("typ"));
        }
        public UUID getUserId(String token){
            Claims c = parse(token).getPayload();
            return UUID.fromString(c.getSubject());
        }
        public String getJti(String token){
            return parse(token).getPayload().getId();
        }
        public List<String> getRoles(String token){
        Claims c = parse(token).getPayload();
        return (List<String>) c.get("roles");
        }
        public String getType(String token){
            Claims c = parse(token).getPayload();
            return (String) c.get("email");
        }

        public long getAccessTtlSeconds() {
            return accessTtlSeconds;
        }

        public long getRememberMeAccessTtlSeconds(){
            return rememberMeAccessTtlSeconds;
        }

        public long getRefreshTtlSeconds(){
            return refreshTtlSeconds;
        }

}
