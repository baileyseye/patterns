package baileyes.eyes.chains.parts.variant.delivery;

import baileyes.eyes.chains.parts.dto.AddressData;
import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import baileyes.eyes.chains.parts.variant.VariantChainPart;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Slf4j
@Order(2)
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "chain", name = "mode", havingValue = "delivery")
public class GeoPart implements VariantChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        data.setGeo("RU");

        log.info("GeoPart: geo -> {}", data.getGeo());
        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}
