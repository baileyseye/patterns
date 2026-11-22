package baileyes.eyes.backpressure.service;

import baileyes.eyes.backpressure.config.BackpressureProperties;
import baileyes.eyes.backpressure.dto.SubmitResult;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class BoundedQueueService {

    private final ThreadPoolExecutor executor;
    private final BackpressureProperties properties;

    public SubmitResult submit(String jobId) {
        try {
            executor.execute(() -> process(jobId));
            return SubmitResult.accepted(jobId, executor.getQueue().size());
        } catch (RejectedExecutionException e) {
            log.warn("Job {} rejected: queue full ({}), active={}",
                jobId, executor.getQueue().size(), executor.getActiveCount());
            return SubmitResult.rejected(jobId, executor.getQueue().size());
        }
    }

    public int queueSize() {
        return executor.getQueue().size();
    }

    public int activeCount() {
        return executor.getActiveCount();
    }

    private void process(String jobId) {
        try {
            Thread.sleep(properties.getProcessingDelayMs());
            log.info("Job {} processed", jobId);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Job {} interrupted", jobId);
        }
    }
}
