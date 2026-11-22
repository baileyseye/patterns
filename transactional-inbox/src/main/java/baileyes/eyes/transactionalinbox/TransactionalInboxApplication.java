package baileyes.eyes.transactionalinbox;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;

@EnableKafka
@SpringBootApplication
public class TransactionalInboxApplication {

    public static void main(String[] args) {
        SpringApplication.run(TransactionalInboxApplication.class, args);
    }

}
