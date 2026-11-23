package baileyes.eyes.bridge.bridge.impl;

import baileyes.eyes.bridge.bridge.AnimalBehavior;
import org.springframework.stereotype.Component;

@Component
public class DogBehavior implements AnimalBehavior {

    @Override
    public String performAction() {
        return "гавкает и виляет хвостом 🐶";
    }
}
