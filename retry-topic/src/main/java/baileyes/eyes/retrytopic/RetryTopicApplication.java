package baileyes.eyes.retrytopic;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;

@EnableKafka
@SpringBootApplication
public class RetryTopicApplication {

    public static void main(String[] args) {
        SpringApplication.run(RetryTopicApplication.class, args);
    }

}
