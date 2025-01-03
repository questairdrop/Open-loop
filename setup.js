import { banner } from "./utils/banner.js";
import { logger } from "./utils/logger.js";
import fetch from "node-fetch";
import readline from "readline";
import fs from "fs";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query) => {
  return new Promise((resolve) => rl.question(query, resolve));
};

const loginUser = async (email, password) => {
  const maxRetries = 5;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const loginPayload = { username: email, password };
      const loginResponse = await fetch("https://api.openloop.so/users/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(loginPayload),
      });

      if (!loginResponse.ok) {
        throw new Error(`Login failed! Status: ${loginResponse.status}`);
      }

      const loginData = await loginResponse.json();
      const accessToken = loginData.data.accessToken;
      logger("Login successful get Token:", "success", accessToken);

      fs.appendFileSync("token.txt", accessToken + "\n", "utf8");
      logger("Access token saved to token.txt");
      return;
    } catch (error) {
      attempt++;
      logger(`Login attempt ${attempt} failed for email: ${email}. Error: ${error.message}`, "error");

      if (attempt >= maxRetries) {
        logger(`Max retries reached for login. Aborting...`, "error");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};

const registerUser = async (email, password) => {
  const maxRetries = 5;
  let attempt = 0;

  if (!email || !password) {
    logger("Both email and password are required.", "error");
    return;
  }

  while (attempt < maxRetries) {
    try {
      const inviteCode = "olb623a000";
      const registrationPayload = { name: email, username: email, password, inviteCode };

      const registerResponse = await fetch("https://api.openloop.so/users/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registrationPayload),
      });

      if (registerResponse.status === 401) {
        logger("Email already exists. Attempting to login...");
        await loginUser(email, password);
        return;
      }

      if (!registerResponse.ok) {
        throw new Error(`Registration failed! Status: ${registerResponse.status}`);
      }

      const registerData = await registerResponse.json();
      logger("Registration successful:", "success", registerData.message);

      await loginUser(email, password);
      return;
    } catch (error) {
      attempt++;
      logger(`Attempt ${attempt} failed. Error: ${error.message}`, "error");

      if (attempt >= maxRetries) {
        logger("Max retries reached for registration/login. Aborting...", "error");
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};

async function processAllUsers() {
  try {
    logger(banner, "warn");
    const data = fs
      .readFileSync("accounts.txt", "utf-8")
      .split("\n")
      .filter((data) => data.trim() !== "");
    if (data.length <= 0) {
      logger("No data found in accounts.txt", "warn");
      process.exit(0);
    }

    for (const item of data) {
      const res = item.trim().split("|");
      const email = res[0];
      const password = res[1];
      logger(`Authenticating for ${email}.....`, "warn");

      await registerUser(email, password);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error("Error reading accounts.txt file:", error.message);
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  logger("Completed setup | You can start bot with comand: node openloop or node openloop-proxy", "success");
  process.exit(0);
}

processAllUsers();
