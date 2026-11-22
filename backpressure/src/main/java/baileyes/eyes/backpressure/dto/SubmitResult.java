package baileyes.eyes.backpressure.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class SubmitResult {

    private final String jobId;
    private final boolean accepted;
    private final int queueSize;
    private final String message;

    public static SubmitResult accepted(String jobId, int queueSize) {
        return new SubmitResult(jobId, true, queueSize, "queued");
    }

    public static SubmitResult rejected(String jobId, int queueSize) {
        return new SubmitResult(jobId, false, queueSize, "queue is full");
    }
}
