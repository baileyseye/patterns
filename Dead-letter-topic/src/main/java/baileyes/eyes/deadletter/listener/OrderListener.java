package baileyes.eyes.deadletter.listener;

import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class OrderListener {

    @KafkaListener(topics = "orders", groupId = "order-dlq")
    public void onOrder(ConsumerRecord<String, String> record) {
        log.info("Received order key={}, partition={}, offset={}",
            record.key(), record.partition(), record.offset());

        if (record.value().contains("\"poison\":true")) {
            throw new IllegalStateException("Poison message: " + record.key());
        }

        log.info("Order {} processed", record.key());
    }
}
