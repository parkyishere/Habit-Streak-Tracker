/**
 * CS348 - Object-Oriented Programming
 * Trackable interface representing any habit entity that can track progress.
 */
public interface Trackable {
    boolean isCompleted();
    void resetProgress();
    int getProgress();
    double getProgressPercentage();
}
