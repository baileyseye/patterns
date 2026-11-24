package baileyes.eyes.loggerstarter.color;

import org.jetbrains.annotations.Contract;
import org.jetbrains.annotations.NotNull;

/**
 * ANSI-цвета для логов.
 *
 * <p>Цвет выбирается по смыслу строки: успешный GET — зелёный, POST — жёлтый,
 * DELETE — красный, service-вызовы — синий, ошибки — ярко-красный.
 */
public final class LogColor {

    public static final String RESET = "\u001B[0m";
    public static final String YELLOW = "\u001B[33m";
    public static final String RED = "\u001B[31m";
    public static final String BLUE = "\u001B[34m";
    public static final String GREEN = "\u001B[32m";
    public static final String MAGENTA = "\u001B[35m";
    public static final String CYAN = "\u001B[36m";
    public static final String BRIGHT_RED = "\u001B[91m";

    private LogColor() {
        throw new UnsupportedOperationException("Utility class");
    }

    /**
     * Окрашивает строку в произвольный ANSI-цвет.
     *
     * @param color ANSI-код цвета
     * @param log   строка для окрашивания
     * @return окрашенная строка
     */
    @Contract(pure = true)
    public static @NotNull String paint(String color, String log) {
        return color + log + RESET;
    }

    /**
     * Окрашивает строку в жёлтый цвет.
     */
    @Contract(pure = true)
    public static @NotNull String paintYellow(String log) {
        return paint(YELLOW, log);
    }

    /**
     * Окрашивает строку в красный цвет.
     */
    @Contract(pure = true)
    public static @NotNull String paintRed(String log) {
        return paint(RED, log);
    }

    /**
     * Окрашивает строку в синий цвет.
     */
    @Contract(pure = true)
    public static @NotNull String paintBlue(String log) {
        return paint(BLUE, log);
    }

    /**
     * Окрашивает строку в зелёный цвет.
     */
    @Contract(pure = true)
    public static @NotNull String paintGreen(String log) {
        return paint(GREEN, log);
    }
}
