package baileyes.eyes.kafkastarter.listener;

import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Новая версия consumer-а. Читает тот же топик, но обрабатывает контракт v2.
 *
 * <p>Во время миграции держим отдельную группу orders-v2: обе версии видят все сообщения
 * и можно сравнить результат, не теряя старую обработку.</p>
 */
@Slf4j
@Component
public class OrderEventConsumerNew {

    @KafkaListener(topics = "order-events", groupId = "orders-v2")
    public void consume(String payload) {
        log.info("ConsumerNew v2: {}", payload);
    }
}
