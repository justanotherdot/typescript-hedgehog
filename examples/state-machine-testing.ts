/**
 * State Machine Testing Examples
 *
 * This file demonstrates how to use Hedgehog's state machine testing
 * to test stateful systems like databases, caches, file systems, etc.
 */

import {
  Gen,
  sequential,
  executeSequential,
  forAllSequential,
  command,
  require,
  update,
  ensure,
  commandRange,
  newVar,
  Command,
  Variable,
  Symbolic,
  Environment
} from '../src/index.js';

// Example 1: Testing a simple in-memory cache
interface CacheState {
  cache: Map<string, Variable<string>>;
  size: number;
  maxSize: number;
}

function initialCacheState(maxSize = 10): CacheState {
  return {
    cache: new Map(),
    size: 0,
    maxSize
  };
}

// Cache implementation (what we're testing)
class SimpleCache {
  private data = new Map<string, string>();
  private maxSize: number;

  constructor(maxSize = 10) {
    this.maxSize = maxSize;
  }

  async put(key: string, value: string): Promise<string> {
    if (this.data.size >= this.maxSize && !this.data.has(key)) {
      throw new Error('Cache full');
    }
    this.data.set(key, value);
    return value;
  }

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  size(): number {
    return this.data.size;
  }
}

// Global cache instance for testing
let testCache = new SimpleCache(5);

// Command: Put value in cache
const cachePut: Command<CacheState, { key: string; value: string }, string> = command(
  (state) => Gen.object({
    key: Gen.string(),
    value: Gen.string()
  }),
  async (input) => {
    return await testCache.put(input.key, input.value);
  },
  require((state, input) =>
    input.key.length > 0 &&
    input.value.length > 0 &&
    (state.cache.has(input.key) || state.size < state.maxSize)
  ),
  update((state, input, output) => ({
    ...state,
    cache: new Map(state.cache).set(input.key, output),
    size: state.cache.has(input.key) ? state.size : state.size + 1
  })),
  ensure((stateBefore, stateAfter, input, output) =>
    output === input.value
  )
);

// Command: Get value from cache
const cacheGet: Command<CacheState, { key: string }, string | null> = command(
  (state) => {
    const availableKeys = Array.from(state.cache.keys());
    if (availableKeys.length === 0) return null;

    return Gen.object({
      key: Gen.item(availableKeys)
    });
  },
  async (input) => {
    return await testCache.get(input.key);
  },
  require((state, input) => state.cache.has(input.key)),
  update((state, input, output) => state), // Get doesn't change state
  ensure((stateBefore, stateAfter, input, output) => {
    // The returned value should match what we expect from our model
    return output !== null; // Simplified check
  })
);

// Command: Delete from cache
const cacheDelete: Command<CacheState, { key: string }, boolean> = command(
  (state) => {
    const availableKeys = Array.from(state.cache.keys());
    if (availableKeys.length === 0) return null;

    return Gen.object({
      key: Gen.item(availableKeys)
    });
  },
  async (input) => {
    return await testCache.delete(input.key);
  },
  require((state, input) => state.cache.has(input.key)),
  update((state, input, output) => {
    const newCache = new Map(state.cache);
    newCache.delete(input.key);
    return {
      ...state,
      cache: newCache,
      size: state.size - 1
    };
  }),
  ensure((stateBefore, stateAfter, input, output) => output === true)
);

// Command: Clear cache
const cacheClear: Command<CacheState, {}, void> = command(
  (state) => Gen.object({}),
  async (input) => {
    await testCache.clear();
  },
  require((state, input) => true), // Can always clear
  update((state, input, output) => ({
    cache: new Map(),
    size: 0,
    maxSize: state.maxSize
  })),
  ensure((stateBefore, stateAfter, input, output) =>
    stateAfter.size === 0
  )
);

// Property: Cache operations should maintain consistency
export function testCacheProperty() {
  return forAllSequential(
    sequential(
      commandRange(5, 20),
      initialCacheState(5),
      [cachePut, cacheGet, cacheDelete, cacheClear]
    )
  );
}

// Example 2: Testing a simple user session system
interface SessionState {
  sessions: Map<string, Variable<{ userId: string; token: string }>>;
  userSessions: Map<string, Set<string>>; // userId -> set of sessionIds
}

function initialSessionState(): SessionState {
  return {
    sessions: new Map(),
    userSessions: new Map()
  };
}

// Session system implementation
class SessionManager {
  private sessions = new Map<string, { userId: string; token: string }>();
  private userSessions = new Map<string, Set<string>>();

  async createSession(userId: string): Promise<{ sessionId: string; token: string }> {
    const sessionId = `session_${Math.random().toString(36).substr(2, 9)}`;
    const token = `token_${Math.random().toString(36).substr(2, 16)}`;

    const session = { userId, token };
    this.sessions.set(sessionId, session);

    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);

    return { sessionId, token };
  }

  async getSession(sessionId: string): Promise<{ userId: string; token: string } | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.sessions.delete(sessionId);
    this.userSessions.get(session.userId)?.delete(sessionId);

    return true;
  }

  async getUserSessions(userId: string): Promise<string[]> {
    return Array.from(this.userSessions.get(userId) ?? []);
  }
}

let sessionManager = new SessionManager();

// Command: Create session
const createSession: Command<SessionState, { userId: string }, { sessionId: string; token: string }> = command(
  (state) => Gen.object({
    userId: Gen.string()
  }),
  async (input) => {
    return await sessionManager.createSession(input.userId);
  },
  require((state, input) => input.userId.length > 0),
  update((state, input, output) => {
    const newSessions = new Map(state.sessions);
    const sessionSymbolic = newVar<{ userId: string; token: string }>('session');
    newSessions.set(output.sessionId, sessionSymbolic);

    const newUserSessions = new Map(state.userSessions);
    const userSessions = new Set(newUserSessions.get(input.userId) ?? []);
    userSessions.add(output.sessionId);
    newUserSessions.set(input.userId, userSessions);

    return {
      sessions: newSessions,
      userSessions: newUserSessions
    };
  }),
  ensure((stateBefore, stateAfter, input, output) =>
    output.sessionId.length > 0 && output.token.length > 0
  )
);

// Command: Get session
const getSession: Command<SessionState, { sessionId: string }, { userId: string; token: string } | null> = command(
  (state) => {
    const availableSessions = Array.from(state.sessions.keys());
    if (availableSessions.length === 0) return null;

    return Gen.object({
      sessionId: Gen.item(availableSessions)
    });
  },
  async (input) => {
    return await sessionManager.getSession(input.sessionId);
  },
  require((state, input) => state.sessions.has(input.sessionId)),
  update((state, input, output) => state), // Get doesn't change state
  ensure((stateBefore, stateAfter, input, output) => output !== null)
);

// Command: Delete session
const deleteSession: Command<SessionState, { sessionId: string }, boolean> = command(
  (state) => {
    const availableSessions = Array.from(state.sessions.keys());
    if (availableSessions.length === 0) return null;

    return Gen.object({
      sessionId: Gen.item(availableSessions)
    });
  },
  async (input) => {
    return await sessionManager.deleteSession(input.sessionId);
  },
  require((state, input) => state.sessions.has(input.sessionId)),
  update((state, input, output) => {
    const newSessions = new Map(state.sessions);
    newSessions.delete(input.sessionId);

    const newUserSessions = new Map(state.userSessions);
    for (const [userId, sessions] of newUserSessions) {
      const newSessionSet = new Set(sessions);
      newSessionSet.delete(input.sessionId);
      newUserSessions.set(userId, newSessionSet);
    }

    return {
      sessions: newSessions,
      userSessions: newUserSessions
    };
  }),
  ensure((stateBefore, stateAfter, input, output) => output === true)
);

// Property: Session operations should maintain consistency
export function testSessionProperty() {
  return forAllSequential(
    sequential(
      commandRange(3, 15),
      initialSessionState(),
      [createSession, getSession, deleteSession]
    )
  );
}

// Example usage and test runner
export async function runExamples() {
  console.log('Running State Machine Testing Examples\n');

  console.log('Testing Cache System...');

  // Reset cache for testing
  testCache = new SimpleCache(5);

  try {
    const cacheProperty = testCacheProperty();
    const cacheResult = await cacheProperty.check();

    if (cacheResult.ok) {
      console.log('Cache property test passed!');
    } else {
      console.log('Cache property test failed:', cacheResult.counterexample);
    }
  } catch (error) {
    console.log('Cache test error:', error.message);
  }

  console.log('\nTesting Session System...');

  // Reset session manager
  sessionManager = new SessionManager();

  try {
    const sessionProperty = testSessionProperty();
    const sessionResult = await sessionProperty.check();

    if (sessionResult.ok) {
      console.log('Session property test passed!');
    } else {
      console.log('Session property test failed:', sessionResult.counterexample);
    }
  } catch (error) {
    console.log('Session test error:', error.message);
  }

  console.log('\nState machine testing examples completed!');
}

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples().catch(console.error);
}