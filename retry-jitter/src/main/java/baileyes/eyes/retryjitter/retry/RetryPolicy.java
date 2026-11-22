package baileyes.eyes.retryjitter.retry;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class RetryPolicy {

    private final int maxAttempts;
    private final long baseDelayMs;
    private final long maxDelayMs;
    private final boolean jitter;
}
