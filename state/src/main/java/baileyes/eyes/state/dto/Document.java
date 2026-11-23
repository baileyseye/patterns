package baileyes.eyes.state.dto;

import baileyes.eyes.state.state.enam.DocumentState;
import lombok.Getter;
import lombok.Setter;
import org.springframework.stereotype.Component;

@Setter
@Getter
@Component
public class Document {

    private DocumentState state;

    public Document() {
        this.state = DocumentState.UNDER_REVIEW;
    }

    public void review() {
        state = state.review(this);
    }

    public void sendForConfirmation() {
        state = state.sendForConfirmation(this);
    }

    public void requestChanges() {
        state = state.requestChanges(this);
    }

    public void resubmit() {
        state = state.resubmit(this);
    }

    public void confirm() {
        state = state.confirm(this);
    }

    public void reject() {
        state = state.reject(this);
    }
}
