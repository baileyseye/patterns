package baileyes.eyes.backpressure.controller;

import baileyes.eyes.backpressure.dto.JobRequest;
import baileyes.eyes.backpressure.dto.SubmitResult;
import baileyes.eyes.backpressure.service.BoundedQueueService;
import java.util.LinkedHashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/jobs")
@RequiredArgsConstructor
public class BackpressureController {

    private final BoundedQueueService queueService;

    @PostMapping
    public ResponseEntity<SubmitResult> submit(@RequestBody JobRequest request) {
        SubmitResult result = queueService.submit(request.getId());

        if (!result.isAccepted()) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                .header(HttpHeaders.RETRY_AFTER, "1")
                .body(result);
        }
        return ResponseEntity.accepted().body(result);
    }

    @GetMapping("/stats")
    public Map<String, Object> stats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("queueSize", queueService.queueSize());
        stats.put("active", queueService.activeCount());
        return stats;
    }
}
