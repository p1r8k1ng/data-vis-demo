// jest.config.cjs
module.exports = {
    preset: "jest-puppeteer",
    testEnvironment: "jest-environment-puppeteer",
    testMatch: ["**/__tests__/**/*.test.js"],
    transform: {
      "^.+\\.(js|mjs|jsx|ts|tsx)$": "babel-jest"
    }
  };
  