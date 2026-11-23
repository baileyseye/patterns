package baileyes.eyes.exceptionhandler.handler;

import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Демонстрационный конфликтующий advice: ловит тот же SecurityException,
 * но с плохой логикой — отдаёт 500 и раскрывает детали ошибки.
 *
 * <p>Низкий приоритет нужен, чтобы правильный {@link SecurityExceptionHandler}
 * с {@code @Order(Integer.MIN_VALUE)} всегда побеждал.</p>
 */
@RestControllerAdvice
@Order(100)
public class ConflictingSecurityExceptionHandler {

    @ExceptionHandler(SecurityException.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ResponseEntity<ErrorResponse> handleSecurity(SecurityException ex) {
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
            .body(new ErrorResponse("Security error: " + ex.getMessage()));
    }
}
