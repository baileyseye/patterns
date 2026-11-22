package baileyes.eyes.retryjitter.retry;

import java.util.concurrent.ThreadLocalRandom;
import org.springframework.stereotype.Component;

@Component
public class ExponentialBackoff {

    /**
     * Exponential backoff с full jitter:
     * без jitter все клиенты повторяют запрос одновременно, создавая retry storm.
     */
    public long delayMillis(int attempt, RetryPolicy policy) {
        long exponential = policy.getBaseDelayMs()
            * (1L << Math.min(attempt - 1, 20));
        long capped = Math.min(exponential, policy.getMaxDelayMs());

        if (!policy.isJitter()) {
            return capped;
        }
        return ThreadLocalRandom.current().nextLong(0, capped + 1);
    }
}
