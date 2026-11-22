package baileyes.eyes.ratelimiter.service;

/**
 * Потокобезопасный token bucket.
 * Ёмкость ограничивает burst, refillTokens за refillPeriod — устойчивую скорость.
 */
public class TokenBucket {

    private final int capacity;
    private final int refillTokens;
    private final long refillPeriodNanos;

    private double tokens;
    private long lastRefillNanos;

    public TokenBucket(int capacity, int refillTokens, int refillPeriodSeconds) {
        this.capacity = capacity;
        this.refillTokens = refillTokens;
        this.refillPeriodNanos = refillPeriodSeconds * 1_000_000_000L;
        this.tokens = capacity;
        this.lastRefillNanos = System.nanoTime();
    }

    public synchronized boolean tryConsume() {
        refill();
        if (tokens < 1.0d) {
            return false;
        }
        tokens -= 1.0d;
        return true;
    }

    public synchronized int availableTokens() {
        refill();
        return (int) Math.floor(tokens);
    }

    private void refill() {
        long now = System.nanoTime();
        long elapsed = now - lastRefillNanos;
        if (elapsed < refillPeriodNanos) {
            return;
        }

        double periods = (double) elapsed / refillPeriodNanos;
        double replenished = periods * refillTokens;
        if (replenished >= 1.0d) {
            tokens = Math.min(capacity, tokens + replenished);
            lastRefillNanos = now;
        }
    }
}
