package baileyes.eyes.cqrs.service;

import baileyes.eyes.cqrs.dto.CreateOrderRequest;
import baileyes.eyes.cqrs.entity.Order;
import baileyes.eyes.cqrs.repository.OrderRepository;
import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OrderCommandService {

    private final OrderRepository orderRepository;

    /**
     * Обычная транзакция -> ReadWriteRoutingDataSource выбирает primary.
     */
    @Transactional
    public Order create(CreateOrderRequest request) {
        Order order = new Order();
        order.setId(UUID.randomUUID());
        order.setCustomerId(request.getCustomerId());
        order.setAmount(request.getAmount());
        order.setCreatedAt(Instant.now());
        return orderRepository.save(order);
    }
}
