
const { spawn } = require('child_process');
const path = require('path');

async function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(' ')} in ${cwd}`);
    
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with code ${code}`));
      }
    });
    
    child.on('error', reject);
  });
}

async function runAllTests() {
  console.log('DropLater Test Suite');
  console.log('===================\n');
  
  const rootDir = path.join(__dirname, '..');
  let totalPassed = 0;
  let totalFailed = 0;
  
  try {
    // Run unit tests
    console.log('1. Unit Tests');
    console.log('-------------');
    await runCommand('node', ['tests/unit/idempotencyKey.test.js'], rootDir);
    console.log('Unit tests completed!\n');
    
    // Check if services are running for integration tests
    console.log('2. Integration Tests');
    console.log('--------------------');
    console.log('Note: Integration tests require running services');
    console.log('Make sure to run: docker-compose up -d');
    console.log('Waiting 5 seconds for services to be ready...');
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
      await runCommand('node', ['tests/integration/noteDelivery.test.js'], rootDir);
      console.log('Integration tests completed!\n');
    } catch (error) {
      console.log('Integration tests failed - services may not be running');
      console.log('Run: docker-compose up -d and try again\n');
      throw error;
    }
    
    console.log('All tests passed! 🎉');
    
  } catch (error) {
    console.error('Test suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };