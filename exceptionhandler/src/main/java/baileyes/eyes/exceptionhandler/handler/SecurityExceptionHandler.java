package baileyes.eyes.exceptionhandler.handler;

import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Security-специфичный advice с максимальным приоритетом.
 * Даже если другой advice тоже ловит SecurityException, этот выполнится первым.
 */
@Slf4j
@RestControllerAdvice
@Order(Integer.MIN_VALUE)
public class SecurityExceptionHandler {

    @ExceptionHandler(SecurityException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    public ResponseEntity<ErrorResponse> handleSecurity(SecurityException ex) {
        log.warn("Security violation: {}", ex.getMessage());

        return ResponseEntity.status(HttpStatus.FORBIDDEN)
            .body(new ErrorResponse("Access denied. Security event logged."));
    }
}
