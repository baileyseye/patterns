package baileyes.eyes.transactionaloutbox.event;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class OrderCreatedEvent {

    private final UUID eventId;
    private final UUID orderId;
    private final String customerId;
    private final BigDecimal amount;
    private final Instant occurredAt;
}
