package baileyes.eyes.chains.parts.variant;

import baileyes.eyes.chains.parts.dto.ProcessDataDto;

/**
 * Звено вариативной цепочки, состав которой выбирается свойством {@code chain.mode}.
 */
public interface VariantChainPart {

    ProcessDataDto<?> process(ProcessDataDto<?> previousData);
}
