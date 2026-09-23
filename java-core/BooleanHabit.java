/**
 * CS348 - BooleanHabit Subclass
 * Represents daily check-in habits (binary: completed or not completed).
 */
public class BooleanHabit extends BaseHabit {
    private boolean completed;

    public BooleanHabit(String name) {
        super(name);
        this.completed = false;
    }

    public BooleanHabit(String id, String name, int currentStreak, int longestStreak, double score, boolean completed) {
        super(id, name, currentStreak, longestStreak, score);
        this.completed = completed;
    }

    @Override
    public boolean isCompleted() {
        return this.completed;
    }

    @Override
    public void resetProgress() {
        this.completed = false;
    }

    @Override
    public int getProgress() {
        return this.completed ? 1 : 0;
    }

    @Override
    public double getProgressPercentage() {
        return this.completed ? 100.0 : 0.0;
    }

    public void checkIn() {
        if (!this.completed) {
            this.completed = true;
            incrementStreak();
        }
    }

    public void uncheck() {
        if (this.completed) {
            this.completed = false;
            if (getCurrentStreak() > 0) {
                setCurrentStreak(getCurrentStreak() - 1);
            }
        }
    }

    public boolean toggle() {
        if (this.completed) {
            uncheck();
        } else {
            checkIn();
        }
        return this.completed;
    }

    public void setCompleted(boolean completed) {
        this.completed = completed;
    }
}
