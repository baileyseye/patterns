package baileyes.eyes.retryjitter.aspect;

import baileyes.eyes.retryjitter.annotation.Retryable;
import baileyes.eyes.retryjitter.exception.RetryInvocationException;
import baileyes.eyes.retryjitter.retry.RetryExecutor;
import baileyes.eyes.retryjitter.retry.RetryPolicy;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;

@Aspect
@Component
@RequiredArgsConstructor
public class RetryableAspect {

    private final RetryExecutor retryExecutor;

    @Around("@annotation(retryable)")
    public Object retry(ProceedingJoinPoint pjp, Retryable retryable) throws Throwable {
        RetryPolicy policy = RetryPolicy.builder()
            .maxAttempts(retryable.maxAttempts())
            .baseDelayMs(retryable.baseDelayMs())
            .maxDelayMs(retryable.maxDelayMs())
            .jitter(retryable.jitter())
            .build();

        try {
            return retryExecutor.execute(() -> {
                try {
                    return pjp.proceed();
                } catch (Throwable e) {
                    throw new RetryInvocationException(e);
                }
            }, policy);
        } catch (RetryInvocationException e) {
            throw e.getCause();
        }
    }
}
