package baileyes.eyes.ratelimiter.annotation;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RateLimit {

    String key() default "";

    int capacity() default 10;

    int refillTokens() default 5;

    int refillPeriodSeconds() default 1;

    boolean distributed() default false;
}
