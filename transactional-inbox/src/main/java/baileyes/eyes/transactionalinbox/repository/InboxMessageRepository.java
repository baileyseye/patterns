package baileyes.eyes.transactionalinbox.repository;

import baileyes.eyes.transactionalinbox.entity.InboxMessage;
import org.springframework.data.jpa.repository.JpaRepository;

public interface InboxMessageRepository extends JpaRepository<InboxMessage, String> {
}
