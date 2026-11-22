package baileyes.eyes.ratelimiter.service;

import baileyes.eyes.ratelimiter.annotation.RateLimit;
import java.util.Collections;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class RedisRateLimiter implements RateLimiter {

    private static final DefaultRedisScript<Long> TOKEN_BUCKET_SCRIPT = new DefaultRedisScript<>(
        String.join("\n",
            "local key = KEYS[1]",
            "local capacity = tonumber(ARGV[1])",
            "local refill = tonumber(ARGV[2])",
            "local period = tonumber(ARGV[3])",
            "local now = tonumber(ARGV[4])",
            "local data = redis.call('HMGET', key, 'tokens', 'ts')",
            "local tokens = tonumber(data[1]) or capacity",
            "local ts = tonumber(data[2]) or now",
            "local delta = math.max(0, now - ts)",
            "tokens = math.min(capacity, tokens + delta / period * refill)",
            "local allowed = 0",
            "if tokens >= 1 then",
            "  tokens = tokens - 1",
            "  allowed = 1",
            "end",
            "redis.call('HMSET', key, 'tokens', tokens, 'ts', now)",
            "redis.call('PEXPIRE', key, period * 2)",
            "return allowed"
        ),
        Long.class
    );

    private final StringRedisTemplate redisTemplate;

    @Override
    public boolean tryAcquire(String key, RateLimit limit) {
        Long allowed = redisTemplate.execute(
            TOKEN_BUCKET_SCRIPT,
            Collections.singletonList("rate-limit:" + key),
            String.valueOf(limit.capacity()),
            String.valueOf(limit.refillTokens()),
            String.valueOf(limit.refillPeriodSeconds() * 1000L),
            String.valueOf(System.currentTimeMillis())
        );
        return allowed != null && allowed == 1L;
    }
}
