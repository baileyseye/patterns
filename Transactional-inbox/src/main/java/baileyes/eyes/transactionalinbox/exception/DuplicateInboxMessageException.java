package baileyes.eyes.transactionalinbox.exception;

import lombok.Getter;

@Getter
public class DuplicateInboxMessageException extends RuntimeException {

    private final String messageId;

    public DuplicateInboxMessageException(String messageId, Throwable cause) {
        super("Message " + messageId + " already exists in inbox_message", cause);
        this.messageId = messageId;
    }
}
