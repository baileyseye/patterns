package baileyes.eyes.ratelimiter.service;

import baileyes.eyes.ratelimiter.annotation.RateLimit;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import org.springframework.stereotype.Component;

@Component
public class InMemoryRateLimiter implements RateLimiter {

    private final ConcurrentMap<String, TokenBucket> buckets = new ConcurrentHashMap<>();

    @Override
    public boolean tryAcquire(String key, RateLimit limit) {
        TokenBucket bucket = buckets.computeIfAbsent(key, ignored ->
            new TokenBucket(limit.capacity(), limit.refillTokens(), limit.refillPeriodSeconds()));
        return bucket.tryConsume();
    }

    public int available(String key) {
        TokenBucket bucket = buckets.get(key);
        return bucket == null ? 0 : bucket.availableTokens();
    }
}
