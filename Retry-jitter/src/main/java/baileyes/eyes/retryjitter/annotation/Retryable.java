package baileyes.eyes.retryjitter.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface Retryable {

    int maxAttempts() default 3;

    long baseDelayMs() default 200;

    long maxDelayMs() default 5000;

    boolean jitter() default true;
}
