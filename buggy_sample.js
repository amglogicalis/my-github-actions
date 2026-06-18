// This is a test file for Zenon AI Assistant
// Use it to test Zenon's ability to detect bugs and security issues.
// Run: node zenon.js --mode assist    (to get a review report)
// Run: node zenon.js --mode correct   (to auto-fix the issues below)

const API_KEY = "sk-proj-1234567890abcdef1234567890abcdef"; // ❌ Security: hardcoded secret

function calculateAverage(numbers) {
  let total = 0;
  // ❌ Bug: off-by-one error (i <= length accesses undefined)
  for (let i = 0; i <= numbers.length; i++) {
    total += numbers[i];
  }
  // ❌ Bug: no guard for empty array (division by zero)
  return total / numbers.length;
}

function processUserData(data) {
  // ❌ Security: eval() is dangerous and should never be used
  eval("console.log('User data: ' + data)");
}

console.log("Calculated average: " + calculateAverage([1, 2, 3]));
