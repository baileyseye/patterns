package baileyes.eyes.kafkastarter.listener;

import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Старая версия consumer-а. Читает тот же топик, но обрабатывает контракт v1.
 */
@Slf4j
@Component
public class OrderEventConsumerOld {

    @KafkaListener(topics = "order-events", groupId = "orders-v1")
    public void consume(String payload) {
        log.info("ConsumerOld v1: {}", payload);
    }
}
