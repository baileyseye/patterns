package baileyes.eyes.transactionalinbox.service;

import baileyes.eyes.transactionalinbox.entity.InboxMessage;
import baileyes.eyes.transactionalinbox.entity.OrderProjection;
import baileyes.eyes.transactionalinbox.event.OrderCreatedEvent;
import baileyes.eyes.transactionalinbox.exception.DuplicateInboxMessageException;
import baileyes.eyes.transactionalinbox.repository.InboxMessageRepository;
import baileyes.eyes.transactionalinbox.repository.OrderProjectionRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderEventHandler {

    private final InboxMessageRepository inboxMessageRepository;
    private final OrderProjectionRepository orderProjectionRepository;
    private final ObjectMapper objectMapper;

    /**
     * Inbox-запись вставляется первой. Первичный ключ message_id — барьер
     * идемпотентности: повторный INSERT БД отклонит, и бизнес-изменение
     * выполняться не будет. Для нового сообщения INSERT inbox и обновление
     * проекции коммитятся одной транзакцией.
     */
    @Transactional
    public void handle(String payload) {
        OrderCreatedEvent event = read(payload);
        String messageId = event.getEventId().toString();

        InboxMessage message = new InboxMessage();
        message.setMessageId(messageId);
        message.setAggregateId(event.getOrderId());
        message.setEventType("OrderCreated");
        message.setPayload(payload);
        message.setReceivedAt(Instant.now());

        try {
            // saveAndFlush заставляет БД выполнить INSERT сразу,
            // чтобы unique violation проявился до записи проекции.
            inboxMessageRepository.saveAndFlush(message);
        } catch (DataIntegrityViolationException e) {
            throw new DuplicateInboxMessageException(messageId, e);
        }

        OrderProjection projection = new OrderProjection();
        projection.setOrderId(event.getOrderId());
        projection.setCustomerId(event.getCustomerId());
        projection.setAmount(event.getAmount());
        projection.setStatus("CREATED");
        projection.setUpdatedAt(Instant.now());
        orderProjectionRepository.save(projection);

        log.info("Message {} applied atomically with order projection {}",
            messageId, event.getOrderId());
    }

    private OrderCreatedEvent read(String payload) {
        try {
            return objectMapper.readValue(payload, OrderCreatedEvent.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("Cannot deserialize OrderCreatedEvent", e);
        }
    }
}
