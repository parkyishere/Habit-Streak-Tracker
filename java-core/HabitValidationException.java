/**
 * Custom exception thrown when general habit validation rules fail (e.g. empty title).
 */
public class HabitValidationException extends RuntimeException {
    private final String fieldName;

    public HabitValidationException(String fieldName, String message) {
        super(message);
        this.fieldName = fieldName;
    }

    public String getFieldName() {
        return fieldName;
    }

    public String getErrorCode() {
        return "VALIDATION_ERROR";
    }
}
