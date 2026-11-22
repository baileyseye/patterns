package baileyes.eyes.transactionaloutbox.service;

import baileyes.eyes.transactionaloutbox.entity.Order;
import baileyes.eyes.transactionaloutbox.entity.OrderStatus;
import baileyes.eyes.transactionaloutbox.entity.OutboxEvent;
import baileyes.eyes.transactionaloutbox.entity.OutboxStatus;
import baileyes.eyes.transactionaloutbox.event.OrderCreatedEvent;
import baileyes.eyes.transactionaloutbox.repository.OrderRepository;
import baileyes.eyes.transactionaloutbox.repository.OutboxEventRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderService {

    private static final String ORDER_CREATED = "OrderCreated";

    private final OrderRepository orderRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    /**
     * Бизнес-запись и outbox-событие коммитятся одной локальной транзакцией.
     * Публикация в Kafka выполняется отдельно — после успешного COMMIT.
     */
    @Transactional
    public Order createOrder(String customerId, BigDecimal amount) {
        UUID orderId = UUID.randomUUID();
        Instant now = Instant.now();

        Order order = new Order();
        order.setId(orderId);
        order.setCustomerId(customerId);
        order.setAmount(amount);
        order.setStatus(OrderStatus.CREATED);
        order.setCreatedAt(now);
        orderRepository.save(order);

        UUID eventId = UUID.randomUUID();
        OrderCreatedEvent payload = new OrderCreatedEvent(eventId, orderId, customerId, amount, now);

        OutboxEvent event = new OutboxEvent();
        event.setId(eventId);
        event.setAggregateId(orderId);
        event.setEventType(ORDER_CREATED);
        event.setPayload(toJson(payload));
        event.setStatus(OutboxStatus.PENDING);
        event.setCreatedAt(now);
        outboxEventRepository.save(event);

        log.info("Order {} and outbox event {} saved in one transaction", orderId, eventId);
        return order;
    }

    private String toJson(OrderCreatedEvent payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialize OrderCreatedEvent", e);
        }
    }
}
