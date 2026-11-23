package baileyes.eyes.chains.parts.impl;

import baileyes.eyes.chains.parts.ChainPart;
import baileyes.eyes.chains.parts.dto.AddressData;
import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Slf4j
@Order(1)
@Component
@RequiredArgsConstructor
public class FirstChainPart implements ChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        String city = data.getCity() == null ? "" : data.getCity().trim();
        if (!city.isEmpty()) {
            city = city.substring(0, 1).toUpperCase() + city.substring(1).toLowerCase();
        }
        data.setCity(city);

        log.info("FirstChainPart: city -> {}", city);
        return ProcessDataDto.builder()
            .id(previousData.getId())
            .data(data)
            .build();
    }
}
