package baileyes.eyes.transactionaloutbox.controller;

import baileyes.eyes.transactionaloutbox.dto.CreateOrderRequest;
import baileyes.eyes.transactionaloutbox.entity.Order;
import baileyes.eyes.transactionaloutbox.service.OrderService;
import javax.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @PostMapping
    public ResponseEntity<Order> create(@RequestBody @Valid CreateOrderRequest request) {
        Order order = orderService.createOrder(request.getCustomerId(), request.getAmount());
        return ResponseEntity.status(HttpStatus.CREATED).body(order);
    }
}
