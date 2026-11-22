package baileyes.eyes.backpressure.config;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(BackpressureProperties.class)
@RequiredArgsConstructor
public class ExecutorConfig {

    private final BackpressureProperties properties;

    /**
     * Bounded queue — главный элемент backpressure.
     * При переполнении AbortPolicy выбрасывает RejectedExecutionException,
     * и HTTP-слой отвечает 429/503 вместо бесконечного роста памяти.
     */
    @Bean(destroyMethod = "shutdown")
    public ThreadPoolExecutor orderExecutor() {
        return new ThreadPoolExecutor(
            properties.getCorePoolSize(),
            properties.getMaxPoolSize(),
            60L,
            TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(properties.getQueueCapacity()),
            new ThreadPoolExecutor.AbortPolicy()
        );
    }
}
