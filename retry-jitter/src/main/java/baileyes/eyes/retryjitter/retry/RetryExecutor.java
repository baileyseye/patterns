package baileyes.eyes.retryjitter.retry;

import baileyes.eyes.retryjitter.exception.RetryExhaustedException;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class RetryExecutor {

    private final ExponentialBackoff backoff;

    public <T> T execute(Supplier<T> action, RetryPolicy policy) {
        RuntimeException lastError = null;

        for (int attempt = 1; attempt <= policy.getMaxAttempts(); attempt++) {
            try {
                return action.get();
            } catch (RuntimeException e) {
                lastError = e;
                if (attempt == policy.getMaxAttempts()) {
                    break;
                }

                long delay = backoff.delayMillis(attempt, policy);
                log.warn("Attempt {}/{} failed: {}. Retry in {} ms (jitter={})",
                    attempt, policy.getMaxAttempts(), e.getMessage(), delay, policy.isJitter());
                sleep(delay);
            }
        }

        throw new RetryExhaustedException(policy.getMaxAttempts(), lastError);
    }

    private void sleep(long delayMs) {
        try {
            Thread.sleep(delayMs);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Retry interrupted", e);
        }
    }
}
