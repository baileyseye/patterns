package baileyes.eyes.transactionaloutbox.service;

import baileyes.eyes.transactionaloutbox.entity.OutboxEvent;
import baileyes.eyes.transactionaloutbox.entity.OutboxStatus;
import baileyes.eyes.transactionaloutbox.publisher.OutboxEventPublisher;
import baileyes.eyes.transactionaloutbox.repository.OutboxEventRepository;
import java.time.Instant;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Component
@RequiredArgsConstructor
public class OutboxRelay {

    private final OutboxEventRepository outboxEventRepository;
    private final OutboxEventPublisher publisher;

    /**
     * Публикует накопленные события. При ошибке событие остаётся PENDING
     * и будет повторено на следующем тике планировщика.
     */
    @Scheduled(fixedDelayString = "${outbox.relay.fixed-delay-ms:2000}")
    @Transactional
    public void publishPendingEvents() {
        List<OutboxEvent> batch = outboxEventRepository
            .findTop100ByStatusOrderByCreatedAtAsc(OutboxStatus.PENDING);

        for (OutboxEvent event : batch) {
            try {
                publisher.publish(event);
                event.setStatus(OutboxStatus.PUBLISHED);
                event.setPublishedAt(Instant.now());
                event.setLastError(null);
            } catch (Exception e) {
                event.setAttempts(event.getAttempts() + 1);
                event.setLastError(e.getMessage());
                log.warn("Outbox event {} is still PENDING, attempt {}",
                    event.getId(), event.getAttempts(), e);
            }
        }
    }
}
