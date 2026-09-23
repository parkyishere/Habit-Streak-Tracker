/**
 * CS348 - QuantifiableHabit Subclass
 * Represents habits with numeric targets (e.g., page counts, water glasses).
 */
public class QuantifiableHabit extends BaseHabit {
    private int targetPerDay;
    private int currentCount;
    private String unit;

    public QuantifiableHabit(String name, int targetPerDay, String unit) {
        this(null, name, 0, 0, 0.0, targetPerDay, 0, unit);
    }

    public QuantifiableHabit(String id, String name, int currentStreak, int longestStreak, double score,
                             int targetPerDay, int currentCount, String unit) {
        super(id, name, currentStreak, longestStreak, score);
        validateTarget(targetPerDay);
        validateCount(currentCount);

        this.targetPerDay = targetPerDay;
        this.currentCount = currentCount;
        this.unit = unit != null ? unit.trim() : "";
    }

    // --- Validation ---

    protected void validateTarget(int target) {
        if (target <= 0) {
            throw new InvalidTargetException(target, "Habit target must be greater than 0, received: " + target);
        }
    }

    protected void validateCount(int count) {
        if (count < 0) {
            throw new IllegalArgumentException("Current count cannot be negative: " + count);
        }
    }

    // --- Trackable ---

    @Override
    public boolean isCompleted() {
        return this.currentCount >= this.targetPerDay;
    }

    @Override
    public void resetProgress() {
        boolean wasCompleted = isCompleted();
        this.currentCount = 0;
        if (wasCompleted && getCurrentStreak() > 0) {
            setCurrentStreak(getCurrentStreak() - 1);
        }
    }

    @Override
    public int getProgress() {
        return this.currentCount;
    }

    @Override
    public double getProgressPercentage() {
        if (this.targetPerDay <= 0) return 0.0;
        double pct = (double) this.currentCount / (double) this.targetPerDay * 100.0;
        return Math.min(100.0, Math.round(pct * 10.0) / 10.0);
    }

    // --- Operations ---

    public boolean incrementProgress() {
        return addProgress(1);
    }

    public void decrementProgress() {
        if (this.currentCount > 0) {
            boolean wasCompleted = isCompleted();
            this.currentCount--;
            if (wasCompleted && !isCompleted() && getCurrentStreak() > 0) {
                setCurrentStreak(getCurrentStreak() - 1);
            }
        }
    }

    public boolean addProgress(int amount) {
        if (amount < 0) {
            throw new IllegalArgumentException("Increment amount must be non-negative");
        }
        boolean previouslyCompleted = isCompleted();
        this.currentCount += amount;
        boolean nowCompleted = isCompleted();

        if (!previouslyCompleted && nowCompleted) {
            incrementStreak();
        }
        return nowCompleted;
    }

    public void setProgress(int count) {
        validateCount(count);
        boolean previouslyCompleted = isCompleted();
        this.currentCount = count;
        boolean nowCompleted = isCompleted();

        if (!previouslyCompleted && nowCompleted) {
            incrementStreak();
        } else if (previouslyCompleted && !nowCompleted && getCurrentStreak() > 0) {
            setCurrentStreak(getCurrentStreak() - 1);
        }
    }

    public int getTargetPerDay() {
        return targetPerDay;
    }

    public void setTargetPerDay(int targetPerDay) {
        validateTarget(targetPerDay);
        this.targetPerDay = targetPerDay;
    }

    public int getCurrentCount() {
        return currentCount;
    }

    public String getUnit() {
        return unit;
    }

    public void setUnit(String unit) {
        this.unit = unit != null ? unit.trim() : "";
    }
}
