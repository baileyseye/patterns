package baileyes.eyes.retryjitter.exception;

/**
 * Техническая обёртка, чтобы протащить checked Throwable через Supplier.
 */
public class RetryInvocationException extends RuntimeException {

    public RetryInvocationException(Throwable cause) {
        super(cause);
    }
}
