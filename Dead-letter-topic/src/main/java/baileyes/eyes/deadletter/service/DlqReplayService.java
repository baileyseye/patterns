package baileyes.eyes.deadletter.service;

import baileyes.eyes.deadletter.config.KafkaConsumerConfig;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class DlqReplayService {

    private final KafkaTemplate<String, String> kafkaTemplate;

    /**
     * Ручной replay после исправления причины: возвращаем сообщение
     * из DLT в основной топик с тем же ключом.
     */
    public void replay(ConsumerRecord<String, String> deadLetter) {
        kafkaTemplate.send(
            KafkaConsumerConfig.ORDERS_TOPIC,
            deadLetter.key(),
            deadLetter.value()
        );
        log.info("Replayed DLT message key={} back to {}",
            deadLetter.key(), KafkaConsumerConfig.ORDERS_TOPIC);
    }
}
