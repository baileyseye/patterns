package baileyes.eyes.bridge.bridge.impl;

import baileyes.eyes.bridge.bridge.AnimalBehavior;
import org.springframework.stereotype.Component;

@Component
public class CatBehavior implements AnimalBehavior {

    @Override
    public String performAction() {
        return "мурчит и трётся о ноги 🐱";
    }
}
