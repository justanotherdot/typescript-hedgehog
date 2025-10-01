/**
 * Function serialization utilities for safe worker execution.
 *
 * Provides safe serialization and validation of test functions for execution
 * in isolated worker contexts, with proper handling of closures and dependencies.
 */

/**
 * Serialized function representation for worker execution.
 */
export interface SerializedFunction {
  /** Function source code */
  readonly code: string;
  /** Function name (if available) */
  readonly name?: string | undefined;
  /** Detected dependencies that may not be available in worker */
  readonly dependencies: readonly string[];
  /** Whether the function appears to use closures */
  readonly hasPotentialClosures: boolean;
  /** Validation warnings */
  readonly warnings: readonly string[];
  /** Whether this function is safe to execute in a worker */
  readonly isSafeForWorker: boolean;
}

/**
 * Serialize a function for worker execution with safety analysis.
 */
export function serializeFunction(fn: Function): SerializedFunction {
  const code = fn.toString();
  const name = fn.name || undefined;
  const analysis = analyzeFunctionCode(code);

  return {
    code,
    name: name || undefined,
    dependencies: analysis.dependencies,
    hasPotentialClosures: analysis.hasPotentialClosures,
    warnings: analysis.warnings,
    isSafeForWorker: analysis.isSafeForWorker,
  };
}

/**
 * Security validation for function code before deserialization.
 */
function validateFunctionCode(code: string): void {
  // Size limits to prevent memory exhaustion
  if (code.length > 100000) { // 100KB limit
    throw new Error('Function code exceeds maximum size limit (100KB)');
  }

  // Block patterns that interfere with function serialization
  const problematicPatterns = [
    /\/\*[\s\S]*?\*\//,               // Block comments (could interfere with parsing)
    /<!--[\s\S]*?-->/,                // HTML comments (could interfere with parsing)
  ];

  for (const pattern of problematicPatterns) {
    if (pattern.test(code)) {
      throw new Error(`Function contains pattern that may interfere with serialization: ${pattern.source}`);
    }
  }

  // Validate basic function syntax
  if (!code.trim().startsWith('function') &&
      !code.trim().startsWith('(') &&
      !code.trim().startsWith('async')) {
    throw new Error('Function code must be a valid function expression or declaration');
  }

  // Check for balanced braces to catch basic syntax errors
  let braceDepth = 0;
  let parenDepth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const prevChar = i > 0 ? code[i - 1] : '';

    // Handle string literals
    if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }

    if (inString) continue;

    // Count braces and parentheses
    if (char === '{') braceDepth++;
    else if (char === '}') braceDepth--;
    else if (char === '(') parenDepth++;
    else if (char === ')') parenDepth--;

    // Check for negative depth (unbalanced)
    if (braceDepth < 0 || parenDepth < 0) {
      throw new Error('Function has unbalanced braces or parentheses');
    }
  }

  if (braceDepth !== 0) {
    throw new Error('Function has unbalanced braces');
  }

  if (parenDepth !== 0) {
    throw new Error('Function has unbalanced parentheses');
  }
}

/**
 * Deserialize and reconstruct a function in worker context with security validation.
 */
export function deserializeFunction<T extends Function>(serialized: SerializedFunction): T {
  // Validate the serialized function structure
  if (!serialized || typeof serialized !== 'object') {
    throw new Error('Invalid serialized function: must be an object');
  }

  if (typeof serialized.code !== 'string') {
    throw new Error('Invalid serialized function: code must be a string');
  }

  if (serialized.code.trim().length === 0) {
    throw new Error('Invalid serialized function: code cannot be empty');
  }

  // Perform security validation
  validateFunctionCode(serialized.code);

  try {
    // Use Function constructor to recreate the function with additional safety
    const reconstructed = new Function('return ' + serialized.code)() as T;

    // Validate that reconstruction worked
    if (typeof reconstructed !== 'function') {
      throw new Error('Deserialized code did not produce a function');
    }

    // Additional runtime validation
    if (reconstructed.length > 10) {
      throw new Error('Function has too many parameters (max 10 allowed)');
    }

    return reconstructed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Function contains invalid syntax: ${error.message}`);
    }
    throw new Error(`Failed to deserialize function: ${error}`);
  }
}

/**
 * Analyze function code for safety and dependencies.
 */
function analyzeFunctionCode(code: string): {
  dependencies: string[];
  hasPotentialClosures: boolean;
  warnings: string[];
  isSafeForWorker: boolean;
} {
  const dependencies: string[] = [];
  const warnings: string[] = [];
  let hasPotentialClosures = false;

  // Remove comments and strings to avoid false positives
  const cleanCode = removeCommentsAndStrings(code);

  // Extract function parameters to avoid flagging them as closures
  const functionParams = new Set<string>();

  // Parse function parameters more accurately
  const functionParamPatterns = [
    /function\s*\w*\s*\(\s*([^)]*)\s*\)/,  // function name(params) or function(params)
    /\(\s*([^)]*)\s*\)\s*=>/,              // (params) =>
    /(\w+)\s*=>/,                          // param =>
  ];

  for (const pattern of functionParamPatterns) {
    const paramMatch = cleanCode.match(pattern);
    if (paramMatch && paramMatch[1]) {
      // Split parameters and extract names
      const params = paramMatch[1].split(',').map(p => {
        // Handle destructuring and default parameters
        const paramName = p.trim().split(/[\s={}[\]]/)[0].trim();
        return paramName.replace(/^\.\.\./, ''); // Remove rest operator
      }).filter(p => p && /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p));

      params.forEach(param => functionParams.add(param));
    }
  }

  // Check for declared variables (const, let, var)
  const declaredVariablePattern = /\b(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  const declaredVariables = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = declaredVariablePattern.exec(cleanCode)) !== null) {
    declaredVariables.add(match[1]);
  }

  // Check for usage of undeclared variables (potential closures)
  const variableUsagePattern = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  const usedVariables = new Set<string>();

  while ((match = variableUsagePattern.exec(cleanCode)) !== null) {
    const variable = match[1];

    // Skip keywords, built-ins, function parameters, and declared variables
    if (!isKeywordOrBuiltIn(variable) &&
        !functionParams.has(variable) &&
        !declaredVariables.has(variable)) {
      usedVariables.add(variable);
    }
  }

  // Categorize variables by risk level
  const allowedVariables = new Set([
    'type', 'testsRun', 'counterexample', 'shrinksPerformed',
    'propertyName', 'assertionType', 'shrinkSteps',
    'length', 'message', 'name', 'stack', 'code'
  ]);

  const commonTestPatterns = new Set([
    'resolve', 'reject', // Promise patterns
    'setTimeout', 'clearTimeout', // Timing functions
    'expect', 'assert' // Test framework functions
  ]);


  const testPatternVariables = Array.from(usedVariables).filter(variable =>
    commonTestPatterns.has(variable)
  );

  const suspiciousVariables = Array.from(usedVariables).filter(variable =>
    !allowedVariables.has(variable) && !commonTestPatterns.has(variable)
  );

  // Add warnings for test patterns (informational)
  if (testPatternVariables.length > 0) {
    warnings.push(`Common test patterns detected: ${testPatternVariables.join(', ')} - these may work but reduce isolation`);
  }

  // Flag functions with closure variables that won't be available in workers
  if (suspiciousVariables.length > 0) {
    hasPotentialClosures = true;
    dependencies.push(...suspiciousVariables);
    warnings.push(`Potential closure variables detected: ${suspiciousVariables.join(', ')}`);
  }

  // Warn about arrow functions that rely on lexical 'this' binding
  if (cleanCode.includes('this.') && !cleanCode.includes('function(')) {
    warnings.push('Arrow function with "this" usage - context may be lost in worker');
  }

  // Function is safe if it has no closures that will cause runtime errors
  const isSafeForWorker = !hasPotentialClosures;

  return {
    dependencies,
    hasPotentialClosures,
    warnings,
    isSafeForWorker,
  };
}

/**
 * Remove comments and string literals to avoid false positives in analysis.
 */
function removeCommentsAndStrings(code: string): string {
  // Remove single-line comments
  let cleaned = code.replace(/\/\/.*$/gm, '');

  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove string literals (simple approach)
  cleaned = cleaned.replace(/'[^']*'/g, "''");
  cleaned = cleaned.replace(/"[^"]*"/g, '""');
  cleaned = cleaned.replace(/`[^`]*`/g, '``');

  return cleaned;
}

/**
 * Check if a variable name is a JavaScript keyword or built-in.
 */
function isKeywordOrBuiltIn(name: string): boolean {
  const keywords = new Set([
    // JavaScript keywords
    'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
    'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
    'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch',
    'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
    'let', 'static', 'enum', 'implements', 'package', 'protected', 'interface',
    'private', 'public', 'await', 'async',

    // Built-in objects and functions
    'Array', 'Object', 'String', 'Number', 'Boolean', 'Date', 'RegExp', 'Error',
    'Math', 'JSON', 'console', 'setTimeout', 'setInterval', 'clearTimeout',
    'clearInterval', 'isNaN', 'isFinite', 'parseInt', 'parseFloat', 'encodeURI',
    'encodeURIComponent', 'decodeURI', 'decodeURIComponent', 'escape', 'unescape',
    'eval', 'Promise', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Proxy',
    'Reflect', 'ArrayBuffer', 'DataView', 'Int8Array', 'Uint8Array',
    'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
    'Float32Array', 'Float64Array', 'BigInt', 'BigInt64Array', 'BigUint64Array',

    // Common parameter names and literals
    'undefined', 'null', 'true', 'false', 'NaN', 'Infinity',

    // Common parameter patterns
    'input', 'value', 'result', 'data', 'item', 'index', 'length', 'i', 'j', 'k',
    'args', 'arguments', 'callback', 'cb', 'fn', 'func', 'error', 'err', 'res',
    'req', 'response', 'request'
  ]);

  return keywords.has(name);
}

/**
 * Create a self-contained function wrapper for worker execution.
 *
 * This wraps the original function with error handling and ensures
 * it can execute safely in an isolated worker context.
 */
export function createWorkerSafeFunction<TInput, TResult>(
  originalFunction: (input: TInput) => TResult | Promise<TResult>,
  options: {
    timeout?: number;
    allowUnsafe?: boolean;
  } = {}
): SerializedFunction {
  const serialized = serializeFunction(originalFunction);

  // Warn about unsafe functions unless explicitly allowed
  if (!serialized.isSafeForWorker && !options.allowUnsafe) {
    const warningsText = serialized.warnings.join(', ');
    throw new Error(
      `Function is not safe for worker execution: ${warningsText}. ` +
      `Set allowUnsafe: true to proceed anyway.`
    );
  }

  // Create a wrapper function that includes error handling and timeout
  const wrapperCode = `
    async function workerSafeWrapper(input) {
      const originalFunction = ${serialized.code};

      try {
        const result = await originalFunction(input);
        return result;
      } catch (error) {
        throw new Error(\`Test function execution failed: \${error.message || error}\`);
      }
    }
  `;

  return {
    code: wrapperCode.trim(),
    name: serialized.name ? `${serialized.name}_workerSafe` : 'workerSafeWrapper',
    dependencies: serialized.dependencies,
    hasPotentialClosures: serialized.hasPotentialClosures,
    warnings: serialized.warnings,
    isSafeForWorker: options.allowUnsafe || serialized.isSafeForWorker,
  };
}

/**
 * Validate that a function can be safely executed in a worker.
 */
export function validateWorkerFunction(fn: Function): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const serialized = serializeFunction(fn);

    // Test serialization round-trip
    const deserialized = deserializeFunction(serialized);

    if (typeof deserialized !== 'function') {
      errors.push('Function cannot be properly serialized and deserialized');
    }

    // Add analysis warnings
    warnings.push(...serialized.warnings);

    // Check for critical issues
    if (serialized.hasPotentialClosures) {
      errors.push('Function contains potential closures that may not work in worker context');
    }

  } catch (error) {
    errors.push(`Function validation failed: ${error}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
