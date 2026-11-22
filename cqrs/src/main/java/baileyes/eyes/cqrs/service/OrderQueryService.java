package baileyes.eyes.cqrs.service;

import baileyes.eyes.cqrs.entity.Order;
import baileyes.eyes.cqrs.repository.OrderRepository;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class OrderQueryService {

    private final OrderRepository orderRepository;

    /**
     * readOnly=true -> ReadWriteRoutingDataSource выбирает replica.
     * Помните: реплика может отставать, поэтому сразу после записи
     * возможен stale read.
     */
    @Transactional(readOnly = true)
    public List<Order> findAll() {
        return orderRepository.findAll();
    }

    @Transactional(readOnly = true)
    public Order findById(UUID id) {
        return orderRepository.findById(id)
            .orElseThrow(() -> new IllegalArgumentException("Order not found: " + id));
    }
}
