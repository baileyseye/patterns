package baileyes.eyes.retryjitter.controller;

import baileyes.eyes.retryjitter.annotation.Retryable;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/retry-demo")
public class RetryDemoController {

    private final AtomicInteger calls = new AtomicInteger();

    @Retryable(maxAttempts = 4, baseDelayMs = 200, maxDelayMs = 2000, jitter = true)
    @GetMapping("/flaky")
    public String flaky() {
        int call = calls.incrementAndGet();
        if (ThreadLocalRandom.current().nextInt(3) != 0) {
            throw new IllegalStateException("Temporary downstream failure on call " + call);
        }
        return "ok after " + call + " call(s)";
    }
}
