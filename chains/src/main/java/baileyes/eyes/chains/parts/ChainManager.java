package baileyes.eyes.chains.parts;

import baileyes.eyes.chains.parts.dto.ProcessDataDto;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChainManager {

    private final List<ChainPart> chain;

    public ProcessDataDto<?> addSomething(UUID id, ProcessDataDto<?> processDataDto) {
        ProcessDataDto<?> process = ProcessDataDto.builder()
            .id(id)
            .data(processDataDto.getData())
            .build();

        return run(process);
    }

    public ProcessDataDto<?> getSomething(UUID id, ProcessDataDto<?> processDataDto) {
        return run(processDataDto);
    }

    private ProcessDataDto<?> run(ProcessDataDto<?> process) {
        ProcessDataDto<?> current = process;

        for (var chainPart : chain) {
            log.info("{}: input {}", chainPart.getClass().getSimpleName(), current.getData());
            current = chainPart.process(current);
            log.info("{}: output {}", chainPart.getClass().getSimpleName(), current.getData());
        }

        return current;
    }
}
