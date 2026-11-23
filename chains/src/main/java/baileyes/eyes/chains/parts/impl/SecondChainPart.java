package baileyes.eyes.chains.parts.impl;

import baileyes.eyes.chains.parts.ChainPart;
import baileyes.eyes.chains.parts.dto.AddressData;
import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Slf4j
@Order(2)
@Component
@RequiredArgsConstructor
public class SecondChainPart implements ChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        String zip = data.getZip() == null ? "" : data.getZip().replaceAll("\\D", "");
        data.setZip(zip);
        data.setFormatted((data.getCity() + ", " + data.getStreet() + " " + zip).trim());

        log.info("SecondChainPart: zip -> {}, formatted -> {}", zip, data.getFormatted());
        return ProcessDataDto.builder()
            .id(previousData.getId())
            .data(data)
            .build();
    }
}
