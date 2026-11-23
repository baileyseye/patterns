package baileyes.eyes.state.state.enam;

import baileyes.eyes.state.dto.Document;
import lombok.extern.slf4j.Slf4j;

@Slf4j
public enum DocumentState {

    UNDER_REVIEW {

        @Override
        public DocumentState review(Document document) {
            return message("Документ уже на рассмотрении.", this);
        }

        @Override
        public DocumentState sendForConfirmation(Document document) {
            return message("Документ отправлен на подтверждение.", AWAITING_CONFIRMATION);
        }

        @Override
        public DocumentState requestChanges(Document document) {
            return message("Документ отправлен на доработку.", REVISION_REQUIRED);
        }

        @Override
        public DocumentState resubmit(Document document) {
            return message("Документ уже на рассмотрении.", this);
        }

        @Override
        public DocumentState confirm(Document document) {
            return message("Сначала отправьте документ на подтверждение.", this);
        }

        @Override
        public DocumentState reject(Document document) {
            return message("Документ отклонен.", REJECTED);
        }
    },

    AWAITING_CONFIRMATION {

        @Override
        public DocumentState review(Document document) {
            return message("Документ возвращен на рассмотрение.", UNDER_REVIEW);
        }

        @Override
        public DocumentState sendForConfirmation(Document document) {
            return message("Документ уже ждёт подтверждения.", this);
        }

        @Override
        public DocumentState requestChanges(Document document) {
            return message("Документ отправлен на доработку.", REVISION_REQUIRED);
        }

        @Override
        public DocumentState resubmit(Document document) {
            return message("Документ уже ждёт подтверждения.", this);
        }

        @Override
        public DocumentState confirm(Document document) {
            return message("Документ подтвержден.", CONFIRMED);
        }

        @Override
        public DocumentState reject(Document document) {
            return message("Документ отклонен.", REJECTED);
        }
    },

    REVISION_REQUIRED {

        @Override
        public DocumentState review(Document document) {
            return message("Документ на доработке; используйте resubmit().", this);
        }

        @Override
        public DocumentState sendForConfirmation(Document document) {
            return message("Сначала доработайте документ и отправьте его заново.", this);
        }

        @Override
        public DocumentState requestChanges(Document document) {
            return message("Документ уже на доработке.", this);
        }

        @Override
        public DocumentState resubmit(Document document) {
            return message("Документ отправлен на повторное рассмотрение.", UNDER_REVIEW);
        }

        @Override
        public DocumentState confirm(Document document) {
            return message("Документ на доработке нельзя подтвердить.", this);
        }

        @Override
        public DocumentState reject(Document document) {
            return message("Документ отклонен.", REJECTED);
        }
    },

    CONFIRMED {

        @Override
        public DocumentState review(Document document) {
            return message("Документ уже подтвержден, изменение состояния невозможно.", this);
        }

        @Override
        public DocumentState sendForConfirmation(Document document) {
            return message("Документ уже подтвержден.", this);
        }

        @Override
        public DocumentState requestChanges(Document document) {
            return message("Документ уже подтвержден, вернуть на доработку невозможно.", this);
        }

        @Override
        public DocumentState resubmit(Document document) {
            return message("Документ уже подтвержден.", this);
        }

        @Override
        public DocumentState confirm(Document document) {
            return message("Документ уже подтвержден, повторное подтверждение невозможно.", this);
        }

        @Override
        public DocumentState reject(Document document) {
            return message("Документ уже подтвержден, отклонение невозможно.", this);
        }
    },

    REJECTED {

        @Override
        public DocumentState review(Document document) {
            return message("Документ отклонен, повторное рассмотрение невозможно.", this);
        }

        @Override
        public DocumentState sendForConfirmation(Document document) {
            return message("Документ отклонен.", this);
        }

        @Override
        public DocumentState requestChanges(Document document) {
            return message("Документ отклонен, вернуть на доработку невозможно.", this);
        }

        @Override
        public DocumentState resubmit(Document document) {
            return message("Документ отклонен, повторная отправка невозможна.", this);
        }

        @Override
        public DocumentState confirm(Document document) {
            return message("Документ отклонен, его нельзя подтвердить.", this);
        }

        @Override
        public DocumentState reject(Document document) {
            return message("Документ уже отклонен.", this);
        }
    };

    private static DocumentState message(String message, DocumentState state) {
        log.info(message);
        return state;
    }

    public abstract DocumentState review(Document document);
    public abstract DocumentState sendForConfirmation(Document document);
    public abstract DocumentState requestChanges(Document document);
    public abstract DocumentState resubmit(Document document);
    public abstract DocumentState confirm(Document document);
    public abstract DocumentState reject(Document document);
}
