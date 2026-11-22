package baileyes.eyes.deadletter.config;

import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.TopicPartition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
public class KafkaConsumerConfig {

    public static final String ORDERS_TOPIC = "orders";
    public static final String DLT_TOPIC = "orders.DLT";

    /**
     * Ошибка обрабатывается в consumer-потоке: 2 повтора с паузой 1 с,
     * затем DeadLetterPublishingRecoverer отправляет запись в orders.DLT.
     */
    @Bean
    public DefaultErrorHandler errorHandler(KafkaTemplate<String, String> kafkaTemplate) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
            kafkaTemplate,
            (ConsumerRecord<?, ?> record, Exception ex) ->
                new TopicPartition(DLT_TOPIC, record.partition())
        );

        return new DefaultErrorHandler(recoverer, new FixedBackOff(1000L, 2L));
    }
}
