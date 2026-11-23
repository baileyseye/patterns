package baileyes.eyes.kafkastarter.listener;

import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Broadcast/fan-out consumer.
 *
 * <p>У каждого инстанса приложения свой group.id, поэтому Kafka считает каждый инстанс
 * отдельной группой и отдаёт ему все партиции. Такой режим нужен для кэшей, инвалидации,
 * аудита и других сценариев, где событие должно получить каждый инстанс.</p>
 *
 * <p>Вариант с {@code group.id = null} возможен только при manual assign:
 * {@code consumer.assign(allPartitions)}; auto-commit и rebalance в этом режиме недоступны.</p>
 */
@Slf4j
@Component
public class BroadcastOrderConsumer {

    @KafkaListener(
        topics = "order-events",
        groupId = "${spring.application.name}-${random.uuid}"
    )
    public void consume(String payload) {
        log.info("Broadcast instance received: {}", payload);
    }
}
