package baileyes.eyes.loggerstarter.demo.service;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;

/**
 * Демонстрационный сервис: его вызовы аспект красит в синий.
 */
@Service
public class DemoService {

    private final Map<Long, String> orders = new ConcurrentHashMap<>();

    public List<String> findAll() {
        return List.of("user-1", "user-2");
    }

    public String create(String payload) {
        long id = orders.size() + 1L;
        orders.put(id, payload);
        return "order-" + id;
    }

    public void delete(long id) {
        orders.remove(id);
    }

    public String findById(long id) {
        String order = orders.get(id);
        if (order == null) {
            throw new OrderNotFoundException(id);
        }
        return order;
    }

    /**
     * Ошибка бизнес-операции: аспект залогирует её ярко-красным.
     */
    public static class OrderNotFoundException extends RuntimeException {

        public OrderNotFoundException(long id) {
            super("order " + id + " not found");
        }
    }
}
