package baileyes.eyes.chains.parts.variant.address;

import baileyes.eyes.chains.parts.dto.AddressData;
import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import baileyes.eyes.chains.parts.variant.VariantChainPart;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Slf4j
@Order(7)
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "chain", name = "mode", havingValue = "address", matchIfMissing = true)
public class AuditPart implements VariantChainPart {

    @Override
    public ProcessDataDto<?> process(ProcessDataDto<?> previousData) {
        AddressData data = (AddressData) previousData.getData();

        data.setAudit("checked");

        log.info("AuditPart: audit -> {}", data.getAudit());
        return ProcessDataDto.builder().id(previousData.getId()).data(data).build();
    }
}
