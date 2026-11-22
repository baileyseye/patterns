package baileyes.eyes.transactionalinbox.listener;

import baileyes.eyes.transactionalinbox.exception.DuplicateInboxMessageException;
import baileyes.eyes.transactionalinbox.service.OrderEventHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class OrderEventConsumer {

    private final OrderEventHandler orderEventHandler;

    /**
     * Offset коммитится после успешного возврата из listener.
     * Дубликат — ожидаемый исход at-least-once: его ловим и подтверждаем offset.
     * Любая другая ошибка пробрасывается — Kafka повторит доставку.
     */
    @KafkaListener(topics = "order-events", groupId = "order-inbox")
    public void onOrderCreated(ConsumerRecord<String, String> record) {
        try {
            orderEventHandler.handle(record.value());
            log.info("Kafka message applied: partition={}, offset={}",
                record.partition(), record.offset());
        } catch (DuplicateInboxMessageException e) {
            log.info("Duplicate message {} skipped: partition={}, offset={}",
                e.getMessageId(), record.partition(), record.offset());
        }
    }
}
