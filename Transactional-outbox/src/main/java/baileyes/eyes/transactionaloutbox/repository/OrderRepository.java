package baileyes.eyes.transactionaloutbox.repository;

import baileyes.eyes.transactionaloutbox.entity.Order;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderRepository extends JpaRepository<Order, UUID> {
}
