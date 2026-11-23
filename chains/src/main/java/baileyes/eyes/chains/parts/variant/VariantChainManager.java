package baileyes.eyes.chains.parts.variant;

import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Менеджер, который не знает, какие именно звенья попали в список.
 * Их выбирает Spring через {@code @ConditionalOnProperty}: address- или delivery-набор.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VariantChainManager {

    private final List<VariantChainPart> chain;

    public ProcessDataDto<?> process(ProcessDataDto<?> input) {
        ProcessDataDto<?> current = input;

        for (VariantChainPart chainPart : chain) {
            log.info("{}: input {}", chainPart.getClass().getSimpleName(), current.getData());
            current = chainPart.process(current);
            log.info("{}: output {}", chainPart.getClass().getSimpleName(), current.getData());
        }

        return current;
    }
}
