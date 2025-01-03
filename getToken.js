import fs from "fs";
import fetch from "node-fetch";
import { logger } from "./utils/logger.js";

// Path to the accounts file and token file
const filePath = "./accounts.txt";
const tokenFilePath = "./token.txt";

// Function to read and parse accounts
function readAccounts() {
  let accounts = [];
  let data = fs
    .readFileSync("accounts.txt", "utf-8")
    .split("\n")
    .filter((data) => data.trim() !== "");

  if (!data.length) return [];

  for (let i = 0; i < data.length; i++) {
    const res = data[i].split("|");
    accounts.push({ email: res[0], password: res[1] });
  }
  return accounts;
}

async function getToken() {
  if (fs.existsSync(tokenFilePath)) {
    fs.unlinkSync(tokenFilePath);
    logger("Existing token.txt removed.");
  }

  const accounts = readAccounts();

  for (const { email, password } of accounts) {
    logger(`Email: ${email}, Password: ${password}`);
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
      logger("Login successful, Token:", "success", accessToken);

      fs.appendFileSync(tokenFilePath, accessToken + "\n", "utf8");
      logger("Access token saved to token.txt");
    } catch (error) {
      logger("Error during login:", "error", error.message);
    }
  }
}

export default getToken;
