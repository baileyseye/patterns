package baileyes.eyes.loggerstarter.demo.controller;

import baileyes.eyes.loggerstarter.demo.service.DemoService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Демонстрационные эндпоинты для проверки цветных логов.
 */
@RestController
@RequestMapping("/demo")
@RequiredArgsConstructor
public class DemoController {

    private final DemoService demoService;

    @GetMapping("/users")
    public List<String> users() {
        return demoService.findAll();
    }

    @PostMapping("/orders")
    public String create(@RequestBody String payload) {
        return demoService.create(payload);
    }

    @DeleteMapping("/orders/{id}")
    public void delete(@PathVariable long id) {
        demoService.delete(id);
    }

    @GetMapping("/orders/{id}")
    public String order(@PathVariable long id) {
        return demoService.findById(id);
    }
}
