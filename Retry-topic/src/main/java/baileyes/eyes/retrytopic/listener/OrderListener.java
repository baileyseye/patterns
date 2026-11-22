package baileyes.eyes.retrytopic.listener;

import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.DltHandler;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.annotation.RetryableTopic;
import org.springframework.kafka.retrytopic.TopicSuffixingStrategy;
import org.springframework.retry.annotation.Backoff;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class OrderListener {

    /**
     * Spring Kafka создаёт цепочку неблокирующих retry-топиков:
     * orders -> orders-retry-0 -> orders-retry-1 -> orders-retry-2 -> orders.DLT.
     * Основной consumer-поток не спит между попытками.
     */
    @RetryableTopic(
        attempts = "4",
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 8000),
        topicSuffixingStrategy = TopicSuffixingStrategy.SUFFIX_WITH_INDEX_VALUE,
        dltTopicSuffix = ".DLT",
        autoCreateTopics = "true"
    )
    @KafkaListener(topics = "orders", groupId = "order-retry-topic")
    public void onOrder(ConsumerRecord<String, String> record) {
        log.info("Processing order key={}, attempt topic={}",
            record.key(), record.topic());

        if (record.value().contains("\"poison\":true")) {
            throw new IllegalStateException("Poison message: " + record.key());
        }

        log.info("Order {} processed", record.key());
    }

    @DltHandler
    public void onDlt(ConsumerRecord<String, String> record) {
        log.error("DLT after all retries: key={}, value={}",
            record.key(), record.value());
    }
}
