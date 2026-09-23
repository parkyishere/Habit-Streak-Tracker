/**
 * Streamlined Java Core Bridge Utility
 * Directly executes flattened Java Habit Core code locally via child_process.
 * Operates 100% offline with zero cloud dependencies and no deep package dependencies.
 * Adheres strictly to the project's no-emoji coding style using [JAVA] and [ERROR] tags.
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const JAVA_CORE_DIR = path.resolve(__dirname, '../java-core');
const MAIN_CLASS = 'HabitEngine';

/**
 * Verifies if Java runtime is available locally.
 * @returns {boolean}
 */
function isJavaAvailable() {
  try {
    const res = spawnSync('java', ['-version'], { stdio: 'ignore' });
    return res.status === 0;
  } catch (err) {
    return false;
  }
}

/**
 * Retrieves all .java files directly in the flat java-core directory.
 * @returns {string[]}
 */
function getJavaFiles() {
  if (!fs.existsSync(JAVA_CORE_DIR)) return [];
  return fs.readdirSync(JAVA_CORE_DIR)
    .filter(file => file.endsWith('.java'))
    .map(file => path.join(JAVA_CORE_DIR, file));
}

/**
 * Compiles flat Java source files directly inside java-core/ if needed.
 * @param {boolean} force - Force recompilation.
 * @returns {boolean}
 */
function compileJavaCore(force = false) {
  const javaFiles = getJavaFiles();
  if (javaFiles.length === 0) {
    console.error('[ERROR] No .java files found in java-core directory');
    return false;
  }

  const mainClassFile = path.join(JAVA_CORE_DIR, `${MAIN_CLASS}.class`);
  if (!force && fs.existsSync(mainClassFile)) {
    const classMtime = fs.statSync(mainClassFile).mtimeMs;
    const newestSrcMtime = Math.max(...javaFiles.map(f => fs.statSync(f).mtimeMs));
    if (classMtime >= newestSrcMtime) {
      return true; // Up to date
    }
  }

  console.log('[JAVA] Compiling flat Java Core classes...');
  const compileRes = spawnSync('javac', javaFiles, { encoding: 'utf8' });
  if (compileRes.status !== 0) {
    console.error('[ERROR] Java Core compilation failed:');
    if (compileRes.stderr) console.error(compileRes.stderr.trim());
    return false;
  }

  console.log('[JAVA] Java Core compilation succeeded.');
  return true;
}

/**
 * Executes an action against the flattened Java HabitEngine via child_process.spawn.
 * Communicates via JSON passed through stdin and received on stdout.
 * Eliminates shell injection risks without complex classpath mapping.
 * 
 * @param {string} action - 'ping' | 'validate' | 'evaluate' | 'score'
 * @param {Object} [payload={}] - Input payload to send to Java engine
 * @param {Object} [options={}] - Execution options
 * @returns {Promise<Object>}
 */
function executeCommand(action, payload = {}, options = {}) {
  return new Promise((resolve, reject) => {
    if (!compileJavaCore()) {
      return reject(new Error('[ERROR] Java Core compilation failed'));
    }

    const timeoutMs = options.timeoutMs || 5000;
    const jsonPayload = JSON.stringify(payload);

    const child = spawn('java', ['-cp', JAVA_CORE_DIR, MAIN_CLASS, action], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdoutData = '';
    let stderrData = '';
    let isSettled = false;

    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        child.kill();
        reject(new Error(`[ERROR] Java process timed out after ${timeoutMs}ms for action: ${action}`));
      }
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      stdoutData += chunk.toString('utf8');
    });

    child.stderr.on('data', chunk => {
      stderrData += chunk.toString('utf8');
    });

    child.on('error', err => {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        console.error(`[ERROR] Failed to start Java process: ${err.message}`);
        reject(err);
      }
    });

    child.on('close', code => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);

      if (stderrData.trim()) {
        const lines = stderrData.trim().split('\n');
        for (const line of lines) {
          if (line.trim()) {
            console.error(line.trim());
          }
        }
      }

      const trimmedOut = stdoutData.trim();
      if (!trimmedOut) {
        return reject(new Error(`[ERROR] Java process closed with code ${code} and produced empty stdout`));
      }

      try {
        const parsed = JSON.parse(trimmedOut);
        resolve(parsed);
      } catch (parseErr) {
        console.error(`[ERROR] Failed to parse Java JSON output: ${trimmedOut}`);
        reject(new Error(`[ERROR] Malformed JSON from Java engine: ${parseErr.message}`));
      }
    });

    try {
      child.stdin.write(jsonPayload);
      child.stdin.end();
    } catch (writeErr) {
      if (!isSettled) {
        isSettled = true;
        clearTimeout(timer);
        reject(writeErr);
      }
    }
  });
}

/**
 * Validates a habit definition against Java Core OOP rules.
 * @param {Object} habitData 
 * @returns {Promise<Object>}
 */
async function validateHabit(habitData) {
  try {
    const res = await executeCommand('validate', habitData);
    if (res.success && res.valid) {
      return {
        valid: true,
        habitType: res.habitType,
        name: res.name,
        isCompleted: res.isCompleted,
        progress: res.progress,
        progressPercentage: res.progressPercentage
      };
    } else {
      return {
        valid: false,
        error: res.error || 'Validation failed',
        errorCode: res.errorCode || 'VALIDATION_ERROR',
        exceptionClass: res.exceptionClass || 'HabitValidationException'
      };
    }
  } catch (err) {
    return {
      valid: false,
      error: err.message,
      errorCode: 'BRIDGE_ERROR',
      exceptionClass: 'BridgeException'
    };
  }
}

/**
 * Evaluates habit metrics (streaks, scores, tiers, progress) via the Java engine.
 * @param {Object} habitData 
 * @param {string[]} [checkInDates=[]] 
 * @param {Object} [options={}]
 * @returns {Promise<Object>}
 */
async function evaluateHabit(habitData, checkInDates = [], options = {}) {
  const payload = {
    ...habitData,
    checkInDates,
    ...options
  };
  return executeCommand('evaluate', payload);
}

/**
 * Health check ping for Java core engine.
 * @returns {Promise<Object>}
 */
async function ping() {
  return executeCommand('ping');
}

module.exports = {
  isJavaAvailable,
  compileJavaCore,
  executeCommand,
  validateHabit,
  evaluateHabit,
  ping,
  JAVA_CORE_DIR
};
