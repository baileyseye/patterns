package baileyes.eyes.retryjitter.exception;

import lombok.Getter;

@Getter
public class RetryExhaustedException extends RuntimeException {

    private final int attempts;

    public RetryExhaustedException(int attempts, Throwable cause) {
        super("Retry exhausted after " + attempts + " attempts", cause);
        this.attempts = attempts;
    }
}
