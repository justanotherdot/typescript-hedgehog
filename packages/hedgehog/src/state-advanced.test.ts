import { describe, it, expect } from 'vitest';
import { Gen } from './gen.js';
import { Range } from './data/size.js';
import {
  Concrete,
  Environment,
  sequential,
  forAllSequential,
  command,
  require,
  update,
  ensure,
  commandRange,
  newVar,
  Command,
  Variable,
} from './state.js';

// More comprehensive state machine tests
describe('Advanced State Machine Testing', () => {
  // Test a more complex system: Bank Account
  interface AccountState {
    accounts: Map<Variable<string>, { balance: number; isOpen: boolean }>;
    totalAccounts: number;
  }

  function initialAccountState(): AccountState {
    return { accounts: new Map(), totalAccounts: 0 };
  }

  // Create account command
  const createAccount: Command<
    AccountState,
    { initialBalance: number },
    string
  > = command(
    (_state) => Gen.object({ initialBalance: Gen.int(Range.uniform(0, 1000)) }),
    async (_input) => `account_${Math.random().toString(36).slice(2)}`,
    require((_state, input) => input.initialBalance >= 0),
    update((state, input, output) => ({
      accounts: new Map(state.accounts).set(output, {
        balance: input.initialBalance,
        isOpen: true,
      }),
      totalAccounts: state.totalAccounts + 1,
    })),
    ensure((_stateBefore, stateAfter, _input, _output) => {
      return stateAfter.totalAccounts > 0;
    })
  );

  // Deposit command
  const deposit: Command<
    AccountState,
    { account: Variable<string>; amount: number },
    number
  > = command(
    (state) => {
      const openAccounts = Array.from(state.accounts.entries())
        .filter(([, info]) => info.isOpen)
        .map(([account]) => account);

      if (openAccounts.length === 0) return null;

      return Gen.object({
        account: Gen.item(openAccounts),
        amount: Gen.int(Range.uniform(1, 500)),
      });
    },
    async (input) => input.amount,
    require((state, input) => {
      const account = state.accounts.get(input.account);
      return account !== undefined && account.isOpen && input.amount > 0;
    }),
    update((state, input, _output) => {
      const newAccounts = new Map(state.accounts);
      const account = newAccounts.get(input.account)!;
      newAccounts.set(input.account, {
        ...account,
        balance: account.balance + input.amount,
      });
      return { ...state, accounts: newAccounts };
    }),
    ensure((stateBefore, stateAfter, input, output) => {
      const oldBalance = stateBefore.accounts.get(input.account)?.balance ?? 0;
      const newBalance = stateAfter.accounts.get(input.account)?.balance ?? 0;
      return (
        newBalance === oldBalance + input.amount && output === input.amount
      );
    })
  );

  // Withdraw command - improved with better generation logic
  const withdraw: Command<
    AccountState,
    { account: Variable<string>; amount: number },
    number
  > = command(
    (state) => {
      const openAccountsWithBalance = Array.from(
        state.accounts.entries()
      ).filter(([, info]) => info.isOpen && info.balance > 0);

      if (openAccountsWithBalance.length === 0) return null;

      // Simpler approach: just pick an account and generate reasonable amount
      // The precondition will catch invalid amounts
      const accounts = openAccountsWithBalance.map(([account]) => account);

      return Gen.object({
        account: Gen.item(accounts),
        amount: Gen.int(Range.uniform(1, 50)), // Reasonable withdrawal amount
      });
    },
    async (input) => input.amount,
    require((state, input) => {
      const account = state.accounts.get(input.account);
      return (
        account !== undefined &&
        account.isOpen &&
        input.amount > 0 &&
        account.balance >= input.amount
      );
    }),
    update((state, input, _output) => {
      const newAccounts = new Map(state.accounts);
      const account = newAccounts.get(input.account)!;
      newAccounts.set(input.account, {
        ...account,
        balance: account.balance - input.amount,
      });
      return { ...state, accounts: newAccounts };
    }),
    ensure((stateBefore, stateAfter, input, output) => {
      const oldBalance = stateBefore.accounts.get(input.account)?.balance ?? 0;
      const newBalance = stateAfter.accounts.get(input.account)?.balance ?? 0;
      return (
        newBalance === oldBalance - input.amount && output === input.amount
      );
    })
  );

  // Close account command
  const closeAccount: Command<
    AccountState,
    { account: Variable<string> },
    boolean
  > = command(
    (state) => {
      const openAccounts = Array.from(state.accounts.entries())
        .filter(([, info]) => info.isOpen)
        .map(([account]) => account);

      if (openAccounts.length === 0) return null;

      return Gen.object({
        account: Gen.item(openAccounts),
      });
    },
    async (_input) => true,
    require((state, input) => {
      const account = state.accounts.get(input.account);
      return account !== undefined && account.isOpen;
    }),
    update((state, input, _output) => {
      const newAccounts = new Map(state.accounts);
      const account = newAccounts.get(input.account)!;
      newAccounts.set(input.account, {
        ...account,
        isOpen: false,
      });
      return { ...state, accounts: newAccounts };
    }),
    ensure((stateBefore, stateAfter, input, output) => {
      const accountAfter = stateAfter.accounts.get(input.account);
      return (
        accountAfter !== undefined && !accountAfter.isOpen && output === true
      );
    })
  );

  describe('Environment Variable Management', () => {
    it('should handle complex variable dependencies', () => {
      const env = new Environment();
      const account1 = newVar<string>('account1');
      const account2 = newVar<string>('account2');
      const transaction1 = newVar<number>('transaction1');

      env.bind(account1, 'acc_123');
      env.bind(account2, 'acc_456');
      env.bind(transaction1, 100);

      expect(env.reify(account1)).toBe('acc_123');
      expect(env.reify(account2)).toBe('acc_456');
      expect(env.reify(transaction1)).toBe(100);

      // Test concrete variables
      const concreteValue = new Concrete('direct_value');
      expect(env.reify(concreteValue)).toBe('direct_value');
    });

    it('should clone environments correctly', () => {
      const env1 = new Environment();
      const var1 = newVar<string>('test');

      env1.bind(var1, 'original');
      const env2 = env1.clone();

      // Modify the clone
      env2.bind(var1, 'modified');

      // Original should be unchanged
      expect(env1.lookup(var1)).toBe('original');
      expect(env2.lookup(var1)).toBe('modified');
    });
  });

  describe('Command Sequence Generation Edge Cases', () => {
    it('should handle commands that become unavailable', () => {
      // Create a sequence where commands become unavailable as state changes
      const sequenceGen = sequential(
        commandRange(10, 20),
        initialAccountState(),
        [createAccount, closeAccount, deposit] // deposit becomes unavailable after all accounts closed
      );

      // This should not crash even with conflicting command availability
      const sequence = sequenceGen.sample();
      expect(sequence).toBeDefined();
      expect(sequence.actions.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate valid command sequences under constraints', () => {
      // Start with some accounts already created
      const initialState: AccountState = {
        accounts: new Map([
          [newVar<string>('acc1'), { balance: 100, isOpen: true }],
          [newVar<string>('acc2'), { balance: 200, isOpen: true }],
        ]),
        totalAccounts: 2,
      };

      const sequenceGen = sequential(commandRange(5, 10), initialState, [
        deposit,
        withdraw,
        closeAccount,
      ]);

      const sequence = sequenceGen.sample();
      expect(sequence.actions.length).toBeGreaterThan(0);

      // Verify first action is valid (should be deposit or withdraw since accounts exist)
      const firstAction = sequence.actions[0];
      expect([deposit, withdraw, closeAccount]).toContain(firstAction.command);
    });
  });

  describe('Variable Resolution Types', () => {
    it('executor receives resolved Variable values, not Variables', async () => {
      interface State {
        values: Map<Variable<string>, number>;
      }

      // Generator creates input with Variable<string>
      const cmd = command<State, { id: Variable<string> }, number>(
        (state) => {
          const ids = Array.from(state.values.keys());
          if (ids.length === 0) return null;
          return Gen.object({ id: Gen.item(ids) });
        },
        // KEY IMPROVEMENT: TypeScript shows input.id is string, not Variable<string>
        // This prevents the `as any` cast that was needed before
        async (input) => {
          // input.id is typed as string (resolved), not Variable<string>
          const idLength: number = input.id.length; // Works!

          // Before this improvement, users would see:
          // input.id: Variable<string>
          // And would need: (input.id as any).length or (input.id as string).length

          return idLength;
        },
        require((state, input) => state.values.has(input.id)),
        update((state, _input, _output) => state),
        ensure((_before, _after, _input, output) => output > 0)
      );

      expect(cmd).toBeDefined();
    });

    it('complex nested Variables are also resolved', () => {
      interface State {
        items: Variable<string>[];
      }

      const cmd = command<
        State,
        {
          item: Variable<string>;
          metadata: {
            ref: Variable<number>;
            data: string;
          };
        },
        void
      >(
        () => Gen.object({
          item: Gen.constant(newVar('item')),
          metadata: Gen.object({
            ref: Gen.constant(newVar('ref')),
            data: Gen.constant('test')
          })
        }),
        // Executor receives fully resolved input:
        // item: string (not Variable<string>)
        // metadata.ref: number (not Variable<number>)
        // metadata.data: string (unchanged)
        async (input) => {
          const _itemLen: number = input.item.length; // string
          const _refValue: number = input.metadata.ref; // number
          const _dataLen: number = input.metadata.data.length; // string
        },
        require(() => true),
        update((state) => state),
        ensure(() => true)
      );

      expect(cmd).toBeDefined();
    });

    it('shows correct types in callbacks', () => {
      interface State {
        count: number;
        items: Map<Variable<string>, { value: number }>;
      }

      const cmd = command<State, { target: Variable<string>; amount: number }, void>(
        (state) => {
          const targets = Array.from(state.items.keys());
          return Gen.object({
            target: Gen.item(targets),
            amount: Gen.int(Range.uniform(1, 10))
          });
        },
        async (input) => {
          // input.target is string (resolved)
          // input.amount is number (unchanged)
          const _len: number = input.target.length;
          const _doubled: number = input.amount * 2;
        },
        require((state, input) => {
          // input.target is Variable<string> here (symbolic)
          return state.items.has(input.target);
        }),
        update((state, input, _output) => {
          // input.target is Variable<string> here (symbolic)
          // output is Variable<void> (symbolic)
          return {
            ...state,
            count: state.count + input.amount
          };
        }),
        ensure((before, after, input, _output) => {
          // input.target is string here (resolved)
          // output is void here (resolved)
          return after.count === before.count + input.amount;
        })
      );

      expect(cmd).toBeDefined();
    });
  });

  describe('State Machine Property Testing Variations', () => {
    it('should support different test configurations', async () => {
      const property = forAllSequential(
        sequential(commandRange(3, 8), initialAccountState(), [
          createAccount,
          deposit,
        ])
      );

      // Test with different configurations
      const result1 = await property.check({ testLimit: 10, seed: 42 });
      const result2 = await property.check({ testLimit: 20, seed: 42 });

      // Both should pass (deterministic with same seed)
      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
    });

    it('should provide meaningful error messages on failure', async () => {
      // Create a property that will definitely fail
      const badEnsure: Command<AccountState, { amount: number }, number> =
        command(
          (_state) => Gen.object({ amount: Gen.int(Range.uniform(1, 100)) }),
          async (input) => input.amount,
          require((_state, _input) => true),
          update((state, _input, _output) => state),
          ensure((_before, _after, _input, _output) => false) // Always fails
        );

      const property = forAllSequential(
        sequential(commandRange(1, 1), initialAccountState(), [badEnsure])
      );

      const result = await property.check({ testLimit: 5 });
      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Postcondition failed');
      expect(result.counterexample).toBeDefined();
    });
  });
});
