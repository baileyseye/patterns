package baileyes.eyes.cqrs.dto;

import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class CreateOrderRequest {

    private String customerId;
    private BigDecimal amount;
}
