package baileyes.eyes.transactionalinbox.event;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@NoArgsConstructor
@AllArgsConstructor
public class OrderCreatedEvent {

    private UUID eventId;
    private UUID orderId;
    private String customerId;
    private BigDecimal amount;
    private Instant occurredAt;
}
