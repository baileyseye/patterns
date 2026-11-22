package baileyes.eyes.deadletter.listener;

import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class DlqListener {

    @KafkaListener(topics = "orders.DLT", groupId = "order-dlq-monitor")
    public void onDeadLetter(ConsumerRecord<String, String> record) {
        log.error("DLT message: key={}, partition={}, offset={}, value={}",
            record.key(), record.partition(), record.offset(), record.value());
    }
}
