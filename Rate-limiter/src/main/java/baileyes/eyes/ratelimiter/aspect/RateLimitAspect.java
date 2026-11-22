package baileyes.eyes.ratelimiter.aspect;

import baileyes.eyes.ratelimiter.annotation.RateLimit;
import baileyes.eyes.ratelimiter.exception.RateLimitExceededException;
import baileyes.eyes.ratelimiter.service.InMemoryRateLimiter;
import baileyes.eyes.ratelimiter.service.RedisRateLimiter;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

@Aspect
@Component
@RequiredArgsConstructor
public class RateLimitAspect {

    private final InMemoryRateLimiter inMemoryRateLimiter;
    private final RedisRateLimiter redisRateLimiter;

    @Around("@annotation(limit)")
    public Object enforce(ProceedingJoinPoint pjp, RateLimit limit) throws Throwable {
        String key = limit.key().isEmpty()
            ? pjp.getSignature().toShortString()
            : limit.key();

        boolean allowed = limit.distributed()
            ? redisRateLimiter.tryAcquire(key, limit)
            : inMemoryRateLimiter.tryAcquire(key, limit);

        if (!allowed) {
            throw new RateLimitExceededException(key);
        }

        return pjp.proceed();
    }
}
