// This is a test file for Zenon AI Assistant
// Use it to test Zenon's ability to detect bugs and security issues.
// Run: node zenon.js --mode assist    (to get a review report)
// Run: node zenon.js --mode correct   (to auto-fix the issues below)

const API_KEY = process.env.YOUR_API_KEY; // ✅ Security: Get API key from environment variable

function calculateAverage(numbers) {
  if (!numbers || numbers.length === 0) {
    return 0; // Handle empty or null array to prevent division by zero
  }
  let total = 0;
  // ✅ Bug: Fixed off-by-one error (i < length is correct)
  for (let i = 0; i < numbers.length; i++) {
    total += numbers[i];
  }
  return total / numbers.length;
}

function processUserData(data) {
  // ✅ Security: Replaced dangerous eval() with safer string concatenation
  console.log('User data: ' + JSON.stringify(data));
}

console.log("Calculated average: " + calculateAverage([1, 2, 3]));