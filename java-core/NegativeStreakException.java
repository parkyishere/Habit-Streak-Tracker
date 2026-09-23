/**
 * Custom exception thrown when a streak count is negative.
 */
public class NegativeStreakException extends RuntimeException {
    private final int attemptedStreak;

    public NegativeStreakException(String message) {
        super(message);
        this.attemptedStreak = -1;
    }

    public NegativeStreakException(int attemptedStreak, String message) {
        super(message);
        this.attemptedStreak = attemptedStreak;
    }

    public int getAttemptedStreak() {
        return attemptedStreak;
    }

    public String getErrorCode() {
        return "NEGATIVE_STREAK";
    }
}
