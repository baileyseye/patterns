package baileyes.eyes.state.state;

import baileyes.eyes.state.dto.Document;
import baileyes.eyes.state.state.enam.DocumentState;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentService {

    private final Document document;

    public void processDocument() {
        log.info("Запускаем обработку документа...");
        log.info("Документ до обработки: {}", document.getState());

        document.sendForConfirmation();
        log.info("После sendForConfirmation: {}", document.getState());

        document.requestChanges();
        log.info("После requestChanges: {}", document.getState());

        document.resubmit();
        log.info("После resubmit: {}", document.getState());

        document.sendForConfirmation();
        log.info("После повторного sendForConfirmation: {}", document.getState());

        document.confirm();
        log.info("После confirm: {}", document.getState());

        log.info("Пробуем reject в терминальном состоянии...");
        document.reject();
        log.info("После reject: {}", document.getState());
    }

    /**
     * Административное изменение состояния, если бизнес-сценарий требует его снаружи.
     *
     * @param newState новое состояние документа.
     */
    public void changeDocumentState(DocumentState newState) {
        document.setState(newState);
    }
}
