package baileyes.eyes.ratelimiter.service;

import baileyes.eyes.ratelimiter.annotation.RateLimit;

public interface RateLimiter {

    boolean tryAcquire(String key, RateLimit limit);
}
