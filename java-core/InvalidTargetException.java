/**
 * Custom exception thrown when a habit target value is non-positive or invalid.
 */
public class InvalidTargetException extends RuntimeException {
    private final int attemptedTarget;

    public InvalidTargetException(String message) {
        super(message);
        this.attemptedTarget = -1;
    }

    public InvalidTargetException(int attemptedTarget, String message) {
        super(message);
        this.attemptedTarget = attemptedTarget;
    }

    public int getAttemptedTarget() {
        return attemptedTarget;
    }

    public String getErrorCode() {
        return "INVALID_TARGET";
    }
}
