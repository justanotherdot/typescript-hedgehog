/**
 * Zod Integration Examples for Hedgehog
 *
 * This file demonstrates how to use Hedgehog with Zod schemas for
 * type-safe property-based testing.
 *
 * Note: This requires `npm install zod` to be installed.
 */

import { z } from 'zod';
import { forAll, Config } from '@justanotherdot/hedgehog';
import { fromSchema } from '@justanotherdot/hedgehog/zod';

console.log('=== Zod Integration Examples ===\n');

// Example 1: Basic schema generation
console.log('=== Example 1: Basic Schema Generation ===\n');

const userSchema = z.object({
  name: z.string(),
  age: z.number(),
  email: z.string().email(),
  active: z.boolean()
});

const userGenerator = fromSchema(userSchema);

// Generate some sample users
console.log('Sample generated users:');
for (let i = 0; i < 3; i++) {
  const user = userGenerator.sample();
  console.log(`User ${i + 1}:`, user);
}

// Property: Generated data always matches schema
const userValidationProperty = forAll(userGenerator, (user) => {
  const result = userSchema.safeParse(user);
  return result.success;
});

const userResult = userValidationProperty.run(Config.default().withTests(50));
console.log('\nUser validation property:', userResult.type === 'pass' ? 'PASSED' : 'FAILED');
console.log(`Ran ${userResult.stats.testsRun} tests\n`);

// Example 2: Nested schemas
console.log('=== Example 2: Nested Schemas ===\n');

const addressSchema = z.object({
  street: z.string(),
  city: z.string(),
  zipCode: z.string(),
  country: z.string()
});

const personSchema = z.object({
  id: z.string().uuid(),
  profile: z.object({
    firstName: z.string(),
    lastName: z.string(),
    dateOfBirth: z.date()
  }),
  address: addressSchema,
  tags: z.array(z.string())
});

const personGenerator = fromSchema(personSchema);

// Property: Nested objects validate correctly
const nestedValidationProperty = forAll(personGenerator, (person) => {
  return personSchema.safeParse(person).success;
});

const nestedResult = nestedValidationProperty.run(Config.default().withTests(30));
console.log('Nested schema property:', nestedResult.type === 'pass' ? 'PASSED' : 'FAILED');
console.log(`Ran ${nestedResult.stats.testsRun} tests\n`);

// Example 3: Union types
console.log('=== Example 3: Union Types ===\n');

const eventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user_login'),
    userId: z.string(),
    timestamp: z.date()
  }),
  z.object({
    type: z.literal('user_logout'),
    userId: z.string(),
    duration: z.number()
  }),
  z.object({
    type: z.literal('page_view'),
    page: z.string(),
    referrer: z.string().optional()
  })
]);

const eventGenerator = fromSchema(eventSchema);

// Property: Union types generate valid variants
const unionProperty = forAll(eventGenerator, (event) => {
  const result = eventSchema.safeParse(event);
  if (!result.success) {
    console.log('Validation error:', result.error.issues);
  }
  return result.success;
});

const unionResult = unionProperty.run(Config.default().withTests(30));
console.log('Union type property:', unionResult.type === 'pass' ? 'PASSED' : 'FAILED');
console.log(`Ran ${unionResult.stats.testsRun} tests\n`);

// Example 4: Array constraints
console.log('=== Example 4: Array Constraints ===\n');

const todoListSchema = z.object({
  title: z.string().min(1).max(100),
  todos: z.array(z.object({
    id: z.number().positive(),
    text: z.string().min(1),
    completed: z.boolean()
  })).min(1).max(10)
});

const todoListGenerator = fromSchema(todoListSchema);

// Property: Arrays respect min/max constraints
const arrayConstraintProperty = forAll(todoListGenerator, (todoList) => {
  const isValid = todoListSchema.safeParse(todoList).success;
  const hasValidLength = todoList.todos.length >= 1 && todoList.todos.length <= 10;
  const hasValidTitle = todoList.title.length >= 1 && todoList.title.length <= 100;

  return isValid && hasValidLength && hasValidTitle;
});

const arrayResult = arrayConstraintProperty.run(Config.default().withTests(50));
console.log('Array constraint property:', arrayResult.type === 'pass' ? 'PASSED' : 'FAILED');
console.log(`Ran ${arrayResult.stats.testsRun} tests\n`);

// Example 5: Testing API endpoints with schemas
console.log('=== Example 5: API Testing with Schemas ===\n');

const apiRequestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
  path: z.string().startsWith('/api/'),
  headers: z.record(z.string()),
  body: z.unknown().optional()
});

const apiResponseSchema = z.object({
  status: z.number().min(100).max(599),
  data: z.unknown(),
  timestamp: z.date()
});

// Mock API handler
function mockApiHandler(request: z.infer<typeof apiRequestSchema>): z.infer<typeof apiResponseSchema> {
  return {
    status: request.method === 'GET' ? 200 : 201,
    data: { message: 'Success', path: request.path },
    timestamp: new Date()
  };
}

const requestGenerator = fromSchema(apiRequestSchema);

// Property: API always returns valid responses
const apiProperty = forAll(requestGenerator, (request) => {
  try {
    const response = mockApiHandler(request);
    const isValidResponse = apiResponseSchema.safeParse(response).success;
    const hasCorrectStatus = [200, 201].includes(response.status);

    return isValidResponse && hasCorrectStatus;
  } catch {
    return false;
  }
});

const apiResult = apiProperty.run(Config.default().withTests(30));
console.log('API response property:', apiResult.type === 'pass' ? 'PASSED' : 'FAILED');
console.log(`Ran ${apiResult.stats.testsRun} tests\n`);

console.log('Zod integration examples completed!');