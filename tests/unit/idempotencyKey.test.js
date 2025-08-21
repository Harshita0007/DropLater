const crypto = require('crypto');

const generateIdempotencyKey = (noteId, releaseAt) => {
  const data = `${noteId}:${releaseAt}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

function runTests() {
  let passed = 0;
  let failed = 0;
  
  function test(name, testFn) {
    try {
      testFn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      failed++;
    }
  }
  
  function expect(actual) {
    return {
      toBe: (expected) => {
        if (actual !== expected) {
          throw new Error(`Expected "${expected}" but got "${actual}"`);
        }
      },
      toMatch: (regex) => {
        if (!regex.test(actual)) {
          throw new Error(`Expected "${actual}" to match ${regex}`);
        }
      },
      toHaveLength: (length) => {
        if (actual.length !== length) {
          throw new Error(`Expected length ${length} but got ${actual.length}`);
        }
      }
    };
  }
  
  console.log(' Running Unit Tests - Idempotency Key Generator\n');
  
  test('generates consistent keys for same input', () => {
    const noteId = '507f1f77bcf86cd799439011';
    const releaseAt = '2024-01-01T00:00:00.000Z';
    
    const key1 = generateIdempotencyKey(noteId, releaseAt);
    const key2 = generateIdempotencyKey(noteId, releaseAt);
    
    expect(key1).toBe(key2);
  });
  
  test('generates different keys for different inputs', () => {
    const noteId1 = '507f1f77bcf86cd799439011';
    const noteId2 = '507f1f77bcf86cd799439012';
    const releaseAt = '2024-01-01T00:00:00.000Z';
    
    const key1 = generateIdempotencyKey(noteId1, releaseAt);
    const key2 = generateIdempotencyKey(noteId2, releaseAt);
    
    expect(key1 === key2).toBe(false);
  });
  
  test('generates different keys for different release times', () => {
    const noteId = '507f1f77bcf86cd799439011';
    const releaseAt1 = '2024-01-01T00:00:00.000Z';
    const releaseAt2 = '2024-01-01T00:01:00.000Z';
    
    const key1 = generateIdempotencyKey(noteId, releaseAt1);
    const key2 = generateIdempotencyKey(noteId, releaseAt2);
    
    expect(key1 === key2).toBe(false);
  });
  
  test('generates valid SHA256 hash format', () => {
    const noteId = '507f1f77bcf86cd799439011';
    const releaseAt = '2024-01-01T00:00:00.000Z';
    
    const key = generateIdempotencyKey(noteId, releaseAt);
    
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
  
  test('generates expected hash for known input', () => {
    const noteId = '507f1f77bcf86cd799439011';
    const releaseAt = '2024-01-01T00:00:00.000Z';
    
    const key = generateIdempotencyKey(noteId, releaseAt);
    
    const expected = '2c8db87089605b683eb168d151219640177a0d49018c7649d48ccd589d5a4040';
    expect(key).toBe(expected);
  });
  
  test('handles empty strings', () => {
    const key1 = generateIdempotencyKey('', '');
    const key2 = generateIdempotencyKey('', '');
    
    expect(key1).toBe(key2);
    expect(key1).toHaveLength(64);
  });
  
  test('handles special characters', () => {
    const noteId = 'note-with-special-chars!@#$%';
    const releaseAt = '2024-01-01T00:00:00.000Z';
    
    const key = generateIdempotencyKey(noteId, releaseAt);
    
    expect(key).toHaveLength(64);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
  
  console.log(`\n Test Results:`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total:  ${passed + failed}`);
  
  if (failed === 0) {
    console.log('All unit tests passed!');
    process.exit(0);
  } else {
    console.log('Some tests failed!');
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}

module.exports = {
  generateIdempotencyKey,
  runTests
};