package baileyes.eyes.loggerstarter.logger;

import static baileyes.eyes.loggerstarter.color.LogColor.BLUE;
import static baileyes.eyes.loggerstarter.color.LogColor.BRIGHT_RED;
import static baileyes.eyes.loggerstarter.color.LogColor.CYAN;
import static baileyes.eyes.loggerstarter.color.LogColor.GREEN;
import static baileyes.eyes.loggerstarter.color.LogColor.MAGENTA;
import static baileyes.eyes.loggerstarter.color.LogColor.RED;
import static baileyes.eyes.loggerstarter.color.LogColor.YELLOW;
import static baileyes.eyes.loggerstarter.color.LogColor.paint;

import java.lang.reflect.Method;
import java.util.Arrays;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Pointcut;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;

/**
 * Логирует вход/выход методов controller и service пакетов.
 *
 * <p>Цвет строки controller-метода выбирается по HTTP-методу:
 * GET — зелёный, POST — жёлтый, DELETE — красный, PUT — фиолетовый, PATCH — голубой.
 * Вызовы service всегда синие, ошибки — ярко-красные.
 */
@Slf4j
@Aspect
@Component
public class AspectLogger {

    /**
     * Точка перехвата для любого пакета {@code controller}.
     */
    @Pointcut("within(*..controller..*)")
    private void catchController() {
    }

    /**
     * Точка перехвата для любого пакета {@code service}.
     */
    @Pointcut("within(*..service..*)")
    private void catchService() {
    }

    @Around("catchController()")
    public Object logController(ProceedingJoinPoint joinPoint) throws Throwable {
        HttpInfo http = httpInfo(joinPoint);
        return logExecution(joinPoint, http.label(), http.color);
    }

    @Around("catchService()")
    public Object logService(ProceedingJoinPoint joinPoint) throws Throwable {
        return logExecution(joinPoint, "service", BLUE);
    }

    private Object logExecution(ProceedingJoinPoint joinPoint, String tag, String color) throws Throwable {
        String name = joinPoint.getSignature().getDeclaringType().getSimpleName()
            + "." + joinPoint.getSignature().getName() + "()";
        long start = System.currentTimeMillis();

        log.info(paint(color, "[START] " + tag + " " + name
            + " args=" + Arrays.toString(joinPoint.getArgs())));

        try {
            Object result = joinPoint.proceed();
            long took = System.currentTimeMillis() - start;
            log.info(paint(color, "[END]   " + tag + " " + name
                + " -> " + result + " took " + took + "ms"));
            return result;
        } catch (Throwable throwable) {
            long took = System.currentTimeMillis() - start;
            log.error(paint(BRIGHT_RED, "[ERROR] " + tag + " " + name + " threw "
                + throwable.getClass().getSimpleName() + ": " + throwable.getMessage()
                + " after " + took + "ms"));
            throw throwable;
        }
    }

    /**
     * Определяет HTTP-метод controller-а по аннотации и выбирает цвет строки.
     */
    private HttpInfo httpInfo(ProceedingJoinPoint joinPoint) {
        Method method = ((MethodSignature) joinPoint.getSignature()).getMethod();

        GetMapping get = method.getAnnotation(GetMapping.class);
        if (get != null) {
            return new HttpInfo("GET", firstPath(get.value()), GREEN);
        }
        PostMapping post = method.getAnnotation(PostMapping.class);
        if (post != null) {
            return new HttpInfo("POST", firstPath(post.value()), YELLOW);
        }
        DeleteMapping delete = method.getAnnotation(DeleteMapping.class);
        if (delete != null) {
            return new HttpInfo("DELETE", firstPath(delete.value()), RED);
        }
        PutMapping put = method.getAnnotation(PutMapping.class);
        if (put != null) {
            return new HttpInfo("PUT", firstPath(put.value()), MAGENTA);
        }
        PatchMapping patch = method.getAnnotation(PatchMapping.class);
        if (patch != null) {
            return new HttpInfo("PATCH", firstPath(patch.value()), CYAN);
        }
        return new HttpInfo("HTTP", "", BLUE);
    }

    private String firstPath(String[] values) {
        return values.length == 0 ? "" : values[0];
    }

    private static final class HttpInfo {

        private final String verb;
        private final String path;
        private final String color;

        private HttpInfo(String verb, String path, String color) {
            this.verb = verb;
            this.path = path;
            this.color = color;
        }

        private String label() {
            return path.isEmpty() ? verb : verb + " " + path;
        }
    }
}
