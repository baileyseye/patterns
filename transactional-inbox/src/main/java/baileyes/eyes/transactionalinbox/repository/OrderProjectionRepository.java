package baileyes.eyes.transactionalinbox.repository;

import baileyes.eyes.transactionalinbox.entity.OrderProjection;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OrderProjectionRepository extends JpaRepository<OrderProjection, UUID> {
}
