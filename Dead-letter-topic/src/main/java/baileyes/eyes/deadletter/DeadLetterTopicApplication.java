package baileyes.eyes.deadletter;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;

@EnableKafka
@SpringBootApplication
public class DeadLetterTopicApplication {

    public static void main(String[] args) {
        SpringApplication.run(DeadLetterTopicApplication.class, args);
    }

}
