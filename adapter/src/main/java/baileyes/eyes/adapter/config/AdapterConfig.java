package baileyes.eyes.adapter.config;

import baileyes.eyes.adapter.adapter.NewCatToy;
import baileyes.eyes.adapter.adapter.OldCatToy;
import baileyes.eyes.adapter.adapter.RoboCatToy;
import baileyes.eyes.adapter.adapter.impl.RoboToyAdapter;
import baileyes.eyes.adapter.adapter.impl.ToyAdapter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class AdapterConfig {

    @Bean
    public OldCatToy oldCatToy() {
        return new OldCatToy();
    }

    @Bean
    public RoboCatToy roboCatToy() {
        return new RoboCatToy();
    }

    @Bean
    @Primary
    public NewCatToy newCatToy(OldCatToy oldCatToy) {
        return new ToyAdapter(oldCatToy);
    }

    /**
     * Второй адаптер можно подключить через @Qualifier("roboToyAdapter"),
     * не меняя AdapterService.
     */
    @Bean
    public NewCatToy roboToyAdapter(RoboCatToy roboCatToy) {
        return new RoboToyAdapter(roboCatToy);
    }
}
