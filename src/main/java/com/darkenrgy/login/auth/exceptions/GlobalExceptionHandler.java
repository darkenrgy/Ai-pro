package com.darkenrgy.login.auth.exceptions;

import com.darkenrgy.login.auth.dtos.ErrorResponse;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.stream.Collectors;


@RestControllerAdvice
//through RestControllerAdvice we acn handil exception globally for all controller in our application
public class GlobalExceptionHandler {
private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

@ExceptionHandler(AuthenticationFailedException.class)
public ResponseEntity<ErrorResponse> handleAuthenticationFailedException(AuthenticationFailedException exception){
    log.warn("Authentication failed: {}", exception.getMessage());
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(new ErrorResponse(exception.getMessage(), HttpStatus.UNAUTHORIZED));
}
//resource not found exception handler
@ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleResourceNotFoundException(ResourceNotFoundException exception){
        log.warn("Resource not found: {}", exception.getMessage());
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse(exception.getMessage(), HttpStatus.NOT_FOUND));
    }
//handle illegal argument exception
@ExceptionHandler(IllegalArgumentException.class)
public ResponseEntity<ErrorResponse> handleIllegalArgumentException(IllegalArgumentException exception){
    log.warn("Bad request: {}", exception.getMessage());
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(new ErrorResponse(exception.getMessage(), HttpStatus.BAD_REQUEST));
}

@ExceptionHandler(MethodArgumentNotValidException.class)
public ResponseEntity<ErrorResponse> handleMethodArgumentNotValidException(MethodArgumentNotValidException exception){
    String message = exception.getBindingResult().getFieldErrors().stream()
            .map(fieldError -> fieldError.getField() + ": " + fieldError.getDefaultMessage())
            .distinct()
            .collect(Collectors.joining(", "));
    log.warn("Validation failed: {}", message);
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(new ErrorResponse(message.isBlank() ? "Validation failed" : message, HttpStatus.BAD_REQUEST));
}

@ExceptionHandler(ConstraintViolationException.class)
public ResponseEntity<ErrorResponse> handleConstraintViolationException(ConstraintViolationException exception){
    String message = exception.getConstraintViolations().stream()
            .map(violation -> violation.getPropertyPath() + ": " + violation.getMessage())
            .distinct()
            .collect(Collectors.joining(", "));
    log.warn("Constraint validation failed: {}", message);
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(new ErrorResponse(message.isBlank() ? "Validation failed" : message, HttpStatus.BAD_REQUEST));
}

@ExceptionHandler(HttpMessageNotReadableException.class)
public ResponseEntity<ErrorResponse> handleHttpMessageNotReadableException(HttpMessageNotReadableException exception){
    log.warn("Malformed request body");
    return ResponseEntity.status(HttpStatus.BAD_REQUEST)
            .body(new ErrorResponse("Malformed or missing request body", HttpStatus.BAD_REQUEST));
}

@ExceptionHandler({ExpiredJwtException.class, JwtException.class})
public ResponseEntity<ErrorResponse> handleJwtException(RuntimeException exception, HttpServletRequest request){
    log.warn("JWT error on {} {}: {}", request.getMethod(), request.getRequestURI(), exception.getClass().getSimpleName());
    HttpStatus status = HttpStatus.UNAUTHORIZED;
    String message = exception instanceof ExpiredJwtException ? "JWT token has expired" : "Invalid JWT token";
    return ResponseEntity.status(status).body(new ErrorResponse(message, status));
}

@ExceptionHandler(AccessDeniedException.class)
public ResponseEntity<ErrorResponse> handleAccessDeniedException(AccessDeniedException exception, HttpServletRequest request){
    log.warn("Access denied on {} {}", request.getMethod(), request.getRequestURI());
    return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(new ErrorResponse("Access denied", HttpStatus.FORBIDDEN));
}

@ExceptionHandler(Exception.class)
public ResponseEntity<ErrorResponse> handleGenericException(Exception exception, HttpServletRequest request){
    log.error("Unhandled error on {} {}", request.getMethod(), request.getRequestURI(), exception);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse("An unexpected error occurred", HttpStatus.INTERNAL_SERVER_ERROR));
}

}
