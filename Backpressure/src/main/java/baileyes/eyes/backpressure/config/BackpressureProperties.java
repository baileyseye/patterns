package baileyes.eyes.backpressure.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "app.backpressure")
public class BackpressureProperties {

    private int corePoolSize = 2;
    private int maxPoolSize = 2;
    private int queueCapacity = 8;
    private long processingDelayMs = 800;
}
