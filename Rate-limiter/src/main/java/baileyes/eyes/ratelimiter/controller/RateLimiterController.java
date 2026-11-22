package baileyes.eyes.ratelimiter.controller;

import baileyes.eyes.ratelimiter.annotation.RateLimit;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/limited")
public class RateLimiterController {

    @RateLimit(key = "in-memory-ping", capacity = 5, refillTokens = 1, refillPeriodSeconds = 1)
    @GetMapping("/ping")
    public Map<String, Object> ping() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("status", "ok");
        response.put("timestamp", Instant.now().toString());
        return response;
    }

    @RateLimit(
        key = "redis-ping",
        capacity = 5,
        refillTokens = 1,
        refillPeriodSeconds = 1,
        distributed = true
    )
    @GetMapping("/redis-ping")
    public Map<String, Object> redisPing() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("status", "ok");
        response.put("limiter", "redis");
        response.put("timestamp", Instant.now().toString());
        return response;
    }
}
