package baileyes.eyes.transactionaloutbox.repository;

import baileyes.eyes.transactionaloutbox.entity.OutboxEvent;
import baileyes.eyes.transactionaloutbox.entity.OutboxStatus;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {

    List<OutboxEvent> findTop100ByStatusOrderByCreatedAtAsc(OutboxStatus status);
}
