package baileyes.eyes.decorator.service;

import baileyes.eyes.decorator.dto.RandomDataDTO;
import baileyes.eyes.decorator.service.decorator.impl.FirstDecorator;
import baileyes.eyes.decorator.service.decorator.impl.SecondDecorator;
import baileyes.eyes.decorator.service.decorator.impl.ThirdDecorator;
import org.springframework.stereotype.Service;

@Service
public class BaseService {

    public RandomDataDTO performAction() {
        return new RandomDataDTO("Base Service Data");
    }

    public RandomDataDTO performDecoratedAction() {
        return performDecoratedAction(true, true, true);
    }

    /**
     * Собирает башню декораторов в runtime: каждая обёртка добавляет свою часть.
     */
    public RandomDataDTO performDecoratedAction(boolean withFirst, boolean withSecond, boolean withThird) {
        BaseService service = this;

        if (withFirst) {
            service = new FirstDecorator(service);
        }
        if (withSecond) {
            service = new SecondDecorator(service);
        }
        if (withThird) {
            service = new ThirdDecorator(service);
        }

        return service.performAction();
    }
}
