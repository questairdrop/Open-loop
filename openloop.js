import fetch from "node-fetch";
import fs from "fs";
import chalk from "chalk";
import { banner } from "./utils/banner.js";
import { logger } from "./utils/logger.js";
import { headers } from "./utils/header.js";
import settings from "./config/config.js";
import getToken from "./getToken.js";

class OpenLoop {
  constructor(queryId, accountIndex) {
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.intervalId = null;
  }

  getRandomQuality = () => {
    return Math.floor(Math.random() * (99 - 80 + 1)) + 80;
  };

  getTokens = () => {
    return fs
      .readFileSync("token.txt", "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  };

  shareBandwidth = async (token) => {
    const quality = this.getRandomQuality();
    const maxRetries = 5;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await fetch("https://api.openloop.so/bandwidth/share", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ quality }),
        });

        if (!response.ok) {
          throw new Error(`[Acount ${this.accountIndex + 1}] Failed to share bandwidth! Status: ${response.statusText}`);
        }

        const data = await response.json();
        const logBandwidthShareResponse = (response) => {
          if (response && response.data && response.data.balances) {
            const balance = response.data.balances.POINT;
            logger(`[Acount ${this.accountIndex + 1}] Bandwidth shared Message: ${chalk.yellow(response.message)} | Score: ${chalk.yellow(quality)} | Total Earnings: ${chalk.yellow(balance)}`);
          }
        };

        logBandwidthShareResponse(data);
        return;
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          logger(`[Acount ${this.accountIndex + 1}] Max retries reached shareBandwidth. Skipping.`, "error");
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  };

  checkMissions = async (token) => {
    try {
      const response = await fetch("https://api.openloop.so/missions", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 401) {
        logger("Token is expired. Trying to get a new token...", "warn");
        clearInterval(this.intervalId);

        await getToken();
        this.restartInterval();
        return null;
      } else if (!response.ok) {
        throw new Error(`Failed to fetch missions! Status: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data;
    } catch (error) {
      logger("Error Fetching Missions!", "error", error);
    }
  };

  restartInterval = () => {
    this.intervalId = setInterval(this.shareBandwidthForAllTokens, settings.TIME_SLEEP * 60 * 1000);
  };

  shareBandwidthForAllTokens = async () => {
    const tokens = this.getTokens();

    for (let i = 0; i < tokens.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      this.accountIndex = i;
      const token = tokens[i];
      try {
        const response = await this.checkMissions(token);
        if (response && Array.isArray(response.missions)) {
          const availableMissionIds = response.missions.filter((mission) => mission.status === "available").map((mission) => mission.missionId);

          logger(`[Acount ${i + 1}] Available Missions:`, "info", availableMissionIds.length);
          for (const missionId of availableMissionIds) {
            await new Promise((resolve) => setTimeout(resolve, 1000));

            logger(`[Acount ${i + 1}] Do and complete mission Id: ${missionId}`, "info");
            const completeMission = await this.doMissions(missionId, token);
            logger(`[Acount ${i + 1}] Mission Id: ${missionId} Complete: ${completeMission.message}`);
          }
        }
      } catch (error) {
        logger(`[Acount ${i + 1}] Error checking missions:`, "error", error);
      }

      try {
        await this.shareBandwidth(token);
      } catch (error) {
        logger(`[Acount ${i + 1}] Error processing token: ${token}, Error: ${error.message}`, "error");
      }
    }
  };

  doMissions = async (missionId, token) => {
    try {
      const response = await fetch(`https://api.openloop.so/missions/${missionId}/complete`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to Complete Missions! Status: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger("Error Complete Missions!", "error", error);
    }
  };

  main = async () => {
    logger(banner, "warn");

    await this.shareBandwidthForAllTokens();
    logger(`Completed all account wait ${settings.TIME_SLEEP} minutes to new loop | Don't stop process | Node running...`, "debug");
    this.intervalId = setInterval(this.shareBandwidthForAllTokens, settings.TIME_SLEEP * 60 * 1000);
  };
}

const client = new OpenLoop();
client.main().catch((err) => {
  logger(err.message, "error");
  process.exit(1);
});
