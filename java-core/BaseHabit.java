/**
 * CS348 - BaseHabit Abstract Superclass
 * Encapsulates core habit attributes: identity, name, streak counts, and momentum score.
 */
public abstract class BaseHabit implements Trackable {
    protected String id;
    protected String name;
    protected int currentStreak;
    protected int longestStreak;
    protected double score;

    public BaseHabit(String name) {
        this(null, name, 0, 0, 0.0);
    }

    public BaseHabit(String id, String name, int currentStreak, int longestStreak, double score) {
        validateName(name);
        validateStreak(currentStreak);
        validateStreak(longestStreak);
        validateScore(score);

        this.id = id;
        this.name = name.trim();
        this.currentStreak = currentStreak;
        this.longestStreak = Math.max(longestStreak, currentStreak);
        this.score = score;
    }

    // --- Validation ---

    protected void validateName(String name) {
        if (name == null || name.trim().isEmpty()) {
            throw new HabitValidationException("name", "Habit name cannot be null or empty");
        }
    }

    protected void validateStreak(int streak) {
        if (streak < 0) {
            throw new NegativeStreakException(streak, "Streak count cannot be negative: " + streak);
        }
    }

    protected void validateScore(double score) {
        if (score < 0.0 || score > 100.0) {
            throw new IllegalArgumentException("Habit score must be between 0.0 and 100.0, received: " + score);
        }
    }

    // --- Streak Operations ---

    public void incrementStreak() {
        this.currentStreak++;
        if (this.currentStreak > this.longestStreak) {
            this.longestStreak = this.currentStreak;
        }
    }

    public void resetStreak() {
        this.currentStreak = 0;
    }

    public void updateStreak(boolean completedToday) {
        if (completedToday) {
            incrementStreak();
        } else {
            resetStreak();
        }
    }

    // --- Getters & Setters ---

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        validateName(name);
        this.name = name.trim();
    }

    public int getCurrentStreak() {
        return currentStreak;
    }

    public void setCurrentStreak(int currentStreak) {
        validateStreak(currentStreak);
        this.currentStreak = currentStreak;
        if (this.currentStreak > this.longestStreak) {
            this.longestStreak = this.currentStreak;
        }
    }

    public int getLongestStreak() {
        return longestStreak;
    }

    public void setLongestStreak(int longestStreak) {
        validateStreak(longestStreak);
        this.longestStreak = longestStreak;
    }

    public double getScore() {
        return score;
    }

    public void setScore(double score) {
        validateScore(score);
        this.score = Math.round(score * 10.0) / 10.0;
    }

    @Override
    public String toString() {
        return getClass().getSimpleName() + "{" +
                "name='" + name + '\'' +
                ", currentStreak=" + currentStreak +
                ", longestStreak=" + longestStreak +
                ", score=" + score +
                '}';
    }
}
