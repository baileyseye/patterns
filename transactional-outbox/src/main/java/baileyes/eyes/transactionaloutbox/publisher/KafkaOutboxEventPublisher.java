package baileyes.eyes.transactionaloutbox.publisher;

import baileyes.eyes.transactionaloutbox.entity.OutboxEvent;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaOutboxEventPublisher implements OutboxEventPublisher {

    static final String TOPIC = "order-events";

    private final KafkaTemplate<String, String> kafkaTemplate;

    @Override
    public void publish(OutboxEvent event) throws Exception {
        kafkaTemplate
            .send(TOPIC, event.getAggregateId().toString(), event.getPayload())
            .get(5, TimeUnit.SECONDS);

        log.info("Published outbox event {} type={}", event.getId(), event.getEventType());
    }
}
