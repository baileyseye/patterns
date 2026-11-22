package baileyes.eyes.transactionaloutbox.publisher;

import baileyes.eyes.transactionaloutbox.entity.OutboxEvent;

public interface OutboxEventPublisher {

    void publish(OutboxEvent event) throws Exception;
}
