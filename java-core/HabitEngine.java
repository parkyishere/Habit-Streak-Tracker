import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * CS348 - HabitEngine Runner
 * Streamlined execution engine called by Node.js child_process.
 * Handles scoring, streak transitions, input validation, and JSON I/O.
 */
public class HabitEngine {

    public static final double DECAY_FACTOR = 0.92;
    public static final double GAIN_FACTOR = 0.08;

    public static void main(String[] args) {
        String action = args.length > 0 ? args[0].trim().toLowerCase() : "ping";
        String payloadJson = "";

        if (args.length > 1) {
            payloadJson = args[1];
        } else if (!action.equalsIgnoreCase("ping")) {
            try {
                if (System.in.available() > 0 || System.console() == null) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    payloadJson = sb.toString().trim();
                }
            } catch (Exception e) {
                System.err.println("[ERROR] Failed to read from stdin: " + e.getMessage());
            }
        }

        Map<String, Object> response = new LinkedHashMap<>();

        try {
            switch (action) {
                case "ping":
                    response.put("success", true);
                    response.put("engine", "Java Core Habit Tracker Engine");
                    response.put("version", "2.0.0");
                    response.put("status", "ready");
                    break;

                case "validate":
                    response = handleValidate(payloadJson);
                    break;

                case "evaluate":
                case "score":
                    response = handleEvaluate(payloadJson);
                    break;

                default:
                    response.put("success", false);
                    response.put("error", "Unknown action: " + action);
                    response.put("errorCode", "UNKNOWN_ACTION");
                    break;
            }
        } catch (InvalidTargetException ite) {
            System.err.println("[ERROR] InvalidTargetException: " + ite.getMessage());
            response.put("success", false);
            response.put("error", ite.getMessage());
            response.put("errorCode", ite.getErrorCode());
            response.put("exceptionClass", ite.getClass().getSimpleName());
        } catch (NegativeStreakException nse) {
            System.err.println("[ERROR] NegativeStreakException: " + nse.getMessage());
            response.put("success", false);
            response.put("error", nse.getMessage());
            response.put("errorCode", nse.getErrorCode());
            response.put("exceptionClass", nse.getClass().getSimpleName());
        } catch (HabitValidationException hve) {
            System.err.println("[ERROR] HabitValidationException: " + hve.getMessage());
            response.put("success", false);
            response.put("error", hve.getMessage());
            response.put("errorCode", hve.getErrorCode());
            response.put("exceptionClass", hve.getClass().getSimpleName());
        } catch (IllegalArgumentException iae) {
            System.err.println("[ERROR] IllegalArgumentException: " + iae.getMessage());
            response.put("success", false);
            response.put("error", iae.getMessage());
            response.put("errorCode", "ILLEGAL_ARGUMENT");
            response.put("exceptionClass", iae.getClass().getSimpleName());
        } catch (Exception e) {
            System.err.println("[ERROR] Unexpected error: " + e.getMessage());
            response.put("success", false);
            response.put("error", e.getMessage());
            response.put("errorCode", "INTERNAL_ERROR");
        }

        System.out.println(stringifyJson(response));
    }

    private static Map<String, Object> handleValidate(String json) {
        Map<String, Object> req = parseJson(json);
        BaseHabit habit = buildHabit(req);

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("success", true);
        res.put("valid", true);
        res.put("habitType", habit.getClass().getSimpleName());
        res.put("name", habit.getName());
        res.put("isCompleted", habit.isCompleted());
        res.put("progress", habit.getProgress());
        res.put("progressPercentage", habit.getProgressPercentage());
        return res;
    }

    private static Map<String, Object> handleEvaluate(String json) {
        Map<String, Object> req = parseJson(json);
        BaseHabit habit = buildHabit(req);

        Set<LocalDate> completedDates = new HashSet<>();
        Object datesObj = req.get("checkInDates");
        if (datesObj instanceof List) {
            List<?> list = (List<?>) datesObj;
            for (Object item : list) {
                if (item != null) {
                    try {
                        completedDates.add(LocalDate.parse(item.toString().trim().substring(0, 10)));
                    } catch (Exception ignored) {}
                }
            }
        }

        String freqType = req.get("frequencyType") != null ? req.get("frequencyType").toString() : "daily";
        List<Integer> specificDays = new ArrayList<>();
        Object specObj = req.get("specificDays");
        if (specObj instanceof List) {
            for (Object item : (List<?>) specObj) {
                if (item instanceof Number) specificDays.add(((Number) item).intValue());
            }
        }

        int intervalDays = req.get("intervalDays") instanceof Number ? ((Number) req.get("intervalDays")).intValue() : 1;

        LocalDate createdAt = parseDate(req.get("createdAt"), LocalDate.now());
        LocalDate today = parseDate(req.get("targetDate"), LocalDate.now());

        LocalDate minDate = today.minusDays(365);
        if (createdAt.isAfter(minDate)) minDate = createdAt;

        // 1. Longest streak forward
        int longestStreak = 0;
        int tempStreak = 0;
        LocalDate curr = minDate;
        while (!curr.isAfter(today)) {
            if (isDue(freqType, specificDays, intervalDays, createdAt, curr)) {
                if (completedDates.contains(curr)) {
                    tempStreak++;
                    if (tempStreak > longestStreak) longestStreak = tempStreak;
                } else if (!curr.equals(today)) {
                    tempStreak = 0;
                }
            }
            curr = curr.plusDays(1);
        }

        // 2. Current streak backward
        int currentStreak = 0;
        curr = today;
        boolean counting = true;
        while (!curr.isBefore(minDate) && counting) {
            if (isDue(freqType, specificDays, intervalDays, createdAt, curr)) {
                if (completedDates.contains(curr)) {
                    currentStreak++;
                } else if (!curr.equals(today)) {
                    counting = false;
                }
            }
            curr = curr.minusDays(1);
        }

        // 3. Score
        double score = 0.0;
        curr = minDate;
        while (!curr.isAfter(today)) {
            if (isDue(freqType, specificDays, intervalDays, createdAt, curr)) {
                if (completedDates.contains(curr)) {
                    score = score * (1.0 - GAIN_FACTOR) + 100.0 * GAIN_FACTOR;
                } else if (!curr.equals(today)) {
                    score = score * DECAY_FACTOR;
                }
            }
            curr = curr.plusDays(1);
        }

        double roundedScore = Math.min(100.0, Math.max(0.0, Math.round(score * 10.0) / 10.0));
        habit.setCurrentStreak(currentStreak);
        habit.setLongestStreak(Math.max(habit.getLongestStreak(), longestStreak));
        habit.setScore(roundedScore);

        String tier = roundedScore >= 80.0 ? "mastered" : (roundedScore >= 50.0 ? "strong" : (roundedScore >= 25.0 ? "building" : "starting"));
        String tierLabel = roundedScore >= 80.0 ? "Mastered" : (roundedScore >= 50.0 ? "Strong" : (roundedScore >= 25.0 ? "Building" : "Starting"));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("habitType", habit.getClass().getSimpleName());
        data.put("name", habit.getName());
        data.put("currentStreak", currentStreak);
        data.put("longestStreak", habit.getLongestStreak());
        data.put("score", roundedScore);
        data.put("tier", tier);
        data.put("tierLabel", tierLabel);
        data.put("isCompletedToday", completedDates.contains(today) || habit.isCompleted());
        data.put("progress", habit.getProgress());
        data.put("progressPercentage", habit.getProgressPercentage());

        if (habit instanceof QuantifiableHabit) {
            QuantifiableHabit qh = (QuantifiableHabit) habit;
            data.put("targetPerDay", qh.getTargetPerDay());
            data.put("currentCount", qh.getCurrentCount());
            data.put("unit", qh.getUnit());
        }

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("success", true);
        res.put("result", data);
        return res;
    }

    private static boolean isDue(String freqType, List<Integer> specificDays, int intervalDays, LocalDate anchor, LocalDate target) {
        if (freqType == null) freqType = "daily";
        switch (freqType.toLowerCase().trim()) {
            case "daily": return true;
            case "specific_days":
                if (specificDays == null || specificDays.isEmpty()) return false;
                return specificDays.contains(target.getDayOfWeek().getValue() % 7);
            case "interval":
                int iv = Math.max(1, intervalDays);
                if (iv == 1) return true;
                long diff = ChronoUnit.DAYS.between(anchor, target);
                return diff >= 0 && diff % iv == 0;
            default: return true;
        }
    }

    private static LocalDate parseDate(Object obj, LocalDate fallback) {
        if (obj == null) return fallback;
        try {
            return LocalDate.parse(obj.toString().trim().substring(0, 10));
        } catch (Exception e) {
            return fallback;
        }
    }

    private static BaseHabit buildHabit(Map<String, Object> map) {
        String name = map.get("name") != null ? map.get("name").toString() : null;
        if (name == null && map.get("title") != null) name = map.get("title").toString();
        String id = map.get("id") != null ? map.get("id").toString() : null;

        int currentStreak = getInt(map, "currentStreak", getInt(map, "current_streak", 0));
        int longestStreak = getInt(map, "longestStreak", getInt(map, "longest_streak", currentStreak));
        double score = getDouble(map, "score", 0.0);

        boolean isQuant = map.containsKey("targetPerDay") || map.containsKey("target_per_day");
        if (isQuant) {
            Object tObj = map.containsKey("targetPerDay") ? map.get("targetPerDay") : map.get("target_per_day");
            int target = 1;
            if (tObj instanceof Number) target = ((Number) tObj).intValue();
            else if (tObj instanceof String) {
                try { target = Integer.parseInt((String) tObj); }
                catch (NumberFormatException e) { throw new InvalidTargetException("Invalid numeric target: " + tObj); }
            }
            int count = getInt(map, "currentCount", getInt(map, "today_count", getInt(map, "count", 0)));
            String unit = map.get("unit") != null ? map.get("unit").toString() : "";
            return new QuantifiableHabit(id, name, currentStreak, longestStreak, score, target, count, unit);
        } else {
            boolean completed = false;
            Object compObj = map.containsKey("completed") ? map.get("completed")
                    : (map.containsKey("is_completed_today") ? map.get("is_completed_today") : map.get("isCompleted"));
            if (compObj instanceof Boolean) completed = (Boolean) compObj;
            else if (compObj instanceof String) completed = Boolean.parseBoolean((String) compObj);
            return new BooleanHabit(id, name, currentStreak, longestStreak, score, completed);
        }
    }

    private static int getInt(Map<String, Object> map, String key, int def) {
        Object val = map.get(key);
        if (val instanceof Number) return ((Number) val).intValue();
        if (val instanceof String) {
            try { return Integer.parseInt((String) val); } catch (Exception ignored) {}
        }
        return def;
    }

    private static double getDouble(Map<String, Object> map, String key, double def) {
        Object val = map.get(key);
        if (val instanceof Number) return ((Number) val).doubleValue();
        if (val instanceof String) {
            try { return Double.parseDouble((String) val); } catch (Exception ignored) {}
        }
        return def;
    }

    // --- Lightweight Zero-Dependency JSON ---

    public static String stringifyJson(Map<String, Object> map) {
        StringBuilder sb = new StringBuilder("{");
        boolean first = true;
        for (Map.Entry<String, Object> e : map.entrySet()) {
            if (!first) sb.append(",");
            first = false;
            sb.append("\"").append(escape(e.getKey())).append("\":");
            sb.append(valToString(e.getValue()));
        }
        sb.append("}");
        return sb.toString();
    }

    private static String valToString(Object val) {
        if (val == null) return "null";
        if (val instanceof String) return "\"" + escape((String) val) + "\"";
        if (val instanceof Number || val instanceof Boolean) return val.toString();
        if (val instanceof Map) {
            @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) val;
            return stringifyJson(m);
        }
        if (val instanceof List) {
            List<?> l = (List<?>) val;
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < l.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(valToString(l.get(i)));
            }
            sb.append("]");
            return sb.toString();
        }
        return "\"" + escape(val.toString()) + "\"";
    }

    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }

    public static Map<String, Object> parseJson(String json) {
        if (json == null) return Collections.emptyMap();
        String s = json.trim();
        if (!s.startsWith("{")) return Collections.emptyMap();
        Map<String, Object> res = new LinkedHashMap<>();
        int i = 1, len = s.length();
        while (i < len) {
            while (i < len && Character.isWhitespace(s.charAt(i))) i++;
            if (i >= len || s.charAt(i) == '}') break;
            if (s.charAt(i) != '"') { i++; continue; }
            int keyEnd = findStrEnd(s, i);
            String key = unescape(s.substring(i + 1, keyEnd));
            i = keyEnd + 1;
            while (i < len && (Character.isWhitespace(s.charAt(i)) || s.charAt(i) == ':')) i++;
            int valStart = i;
            if (i < len && s.charAt(i) == '"') {
                int valEnd = findStrEnd(s, i);
                res.put(key, unescape(s.substring(i + 1, valEnd)));
                i = valEnd + 1;
            } else if (i < len && s.charAt(i) == '{') {
                int match = findMatch(s, i, '{', '}');
                res.put(key, parseJson(s.substring(i, match + 1)));
                i = match + 1;
            } else if (i < len && s.charAt(i) == '[') {
                int match = findMatch(s, i, '[', ']');
                res.put(key, parseList(s.substring(i, match + 1)));
                i = match + 1;
            } else {
                while (i < len && s.charAt(i) != ',' && s.charAt(i) != '}') i++;
                String token = s.substring(valStart, i).trim();
                if ("true".equalsIgnoreCase(token)) res.put(key, true);
                else if ("false".equalsIgnoreCase(token)) res.put(key, false);
                else if ("null".equalsIgnoreCase(token)) res.put(key, null);
                else {
                    try {
                        if (token.contains(".")) res.put(key, Double.parseDouble(token));
                        else res.put(key, Long.parseLong(token));
                    } catch (Exception ex) { res.put(key, token); }
                }
            }
            while (i < len && (Character.isWhitespace(s.charAt(i)) || s.charAt(i) == ',')) i++;
        }
        return res;
    }

    private static List<Object> parseList(String s) {
        List<Object> list = new ArrayList<>();
        String trimmed = s.trim();
        if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return list;
        int i = 1, len = trimmed.length() - 1;
        while (i < len) {
            while (i < len && Character.isWhitespace(trimmed.charAt(i))) i++;
            if (i >= len) break;
            if (trimmed.charAt(i) == '"') {
                int end = findStrEnd(trimmed, i);
                list.add(unescape(trimmed.substring(i + 1, end)));
                i = end + 1;
            } else if (trimmed.charAt(i) == '{') {
                int end = findMatch(trimmed, i, '{', '}');
                list.add(parseJson(trimmed.substring(i, end + 1)));
                i = end + 1;
            } else {
                int start = i;
                while (i < len && trimmed.charAt(i) != ',') i++;
                String token = trimmed.substring(start, i).trim();
                try {
                    if (token.contains(".")) list.add(Double.parseDouble(token));
                    else list.add(Long.parseLong(token));
                } catch (Exception ex) {
                    if ("true".equalsIgnoreCase(token)) list.add(true);
                    else if ("false".equalsIgnoreCase(token)) list.add(false);
                    else list.add(token);
                }
            }
            while (i < len && (Character.isWhitespace(trimmed.charAt(i)) || trimmed.charAt(i) == ',')) i++;
        }
        return list;
    }

    private static int findStrEnd(String s, int start) {
        boolean esc = false;
        for (int i = start + 1; i < s.length(); i++) {
            char c = s.charAt(i);
            if (esc) esc = false;
            else if (c == '\\') esc = true;
            else if (c == '"') return i;
        }
        return s.length() - 1;
    }

    private static int findMatch(String s, int start, char o, char cl) {
        int d = 0; boolean inStr = false, esc = false;
        for (int i = start; i < s.length(); i++) {
            char c = s.charAt(i);
            if (esc) esc = false;
            else if (c == '\\') esc = true;
            else if (c == '"') inStr = !inStr;
            else if (!inStr) {
                if (c == o) d++;
                else if (c == cl) { d--; if (d == 0) return i; }
            }
        }
        return s.length() - 1;
    }

    private static String unescape(String s) {
        return s.replace("\\\"", "\"").replace("\\\\", "\\").replace("\\n", "\n").replace("\\r", "\r");
    }
}
