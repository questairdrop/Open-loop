import fetch from "node-fetch";
import fs from "fs";
import chalk from "chalk";
import { HttpsProxyAgent } from "https-proxy-agent";
import { banner } from "./utils/banner.js";
import { logger } from "./utils/logger.js";
import { headers } from "./utils/header.js";
import settings from "./config/config.js";

class OpenLoop {
  constructor(queryId, accountIndex, proxy) {
    this.queryId = queryId;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIp = "Unknown IP";
  }

  getRandomQuality = () => {
    return Math.floor(Math.random() * (99 - 60 + 1)) + 60;
  };

  getProxies = () => {
    return fs
      .readFileSync("proxy.txt", "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  };

  getTokens = () => {
    return fs
      .readFileSync("token.txt", "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  };

  shareBandwidth = async (token, proxy, accountIndex) => {
    const quality = this.getRandomQuality();
    const proxyAgent = new HttpsProxyAgent(proxy);
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
          agent: proxyAgent,
        });

        if (!response.ok) {
          throw new Error(`Failed to share bandwidth! Status: ${response.statusText}`);
        }

        const data = await response.json();

        const logBandwidthShareResponse = (response) => {
          if (response && response.data && response.data.balances) {
            const balance = response.data.balances.POINT;
            logger(`[Acount ${accountIndex + 1}] Bandwidth shared Message: ${chalk.yellow(response.message)} | Score: ${chalk.yellow(quality)} | Total Earnings: ${chalk.yellow(balance)}`);
          }
        };

        logBandwidthShareResponse(data);
        return;
      } catch (error) {
        attempt++;
        if (attempt >= maxRetries) {
          logger(`[Acount ${this.accountIndex + 1}] Max retries reached. Skipping.`, "error");
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }
  };

  checkMissions = async (token, proxy) => {
    try {
      const proxyAgent = new HttpsProxyAgent(proxy);

      const response = await fetch("https://api.openloop.so/missions", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        agent: proxyAgent,
      });

      if (response.status === 401) {
        logger("Token is expired. Trying to get a new token...", "warn");
        clearInterval(intervalId);

        await getToken();
        restartInterval();
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
    intervalId = setInterval(shareBandwidthForAllTokens, 60 * 1000);
  };

  doMissions = async (missionId, token, proxy) => {
    try {
      const proxyAgent = new HttpsProxyAgent(proxy);

      const response = await fetch(`https://api.openloop.so/missions/${missionId}/complete`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        agent: proxyAgent,
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

  shareBandwidthForAllTokens = async () => {
    const tokens = this.getTokens();
    const proxies = this.getProxies();

    if (tokens.length > proxies.length) {
      logger("The number of tokens and proxies do not match!", "error");
      return;
    }
    const tasks = tokens.map(async (token, i) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const proxy = proxies[i];
      let proxyIP = "No Proxy";
      if (proxy) {
        try {
          proxyIP = await this.checkProxyIP(proxy);
          this.proxyIp = proxyIP;
        } catch (proxyError) {
          logger(`[Acount ${i + 1}]Proxy error: ${proxyError.message}`, "error");
          logger(`[Acount ${i + 1}]Moving to next account...`, "warn");
          return;
        }
      }

      try {
        const response = await this.checkMissions(token, proxy);
        if (response && Array.isArray(response.missions)) {
          const availableMissionIds = response.missions.filter((mission) => mission.status === "available").map((mission) => mission.missionId);

          logger(`[Acount ${i + 1}] Available Missions:`, "info", availableMissionIds.length);
          for (const missionId of availableMissionIds) {
            await new Promise((resolve) => setTimeout(resolve, 1000));

            logger(`[Acount ${i + 1}] Do and complete mission Id: ${missionId}`, "info");
            const completeMission = await this.doMissions(missionId, token, proxy);
            logger(`[Acount ${i + 1}] Mission Id: ${missionId} Complete: ${completeMission.message}`);
          }
        }
      } catch (error) {
        logger(`[Acount ${i + 1}] Error checking missions:`, "error", error);
      }

      try {
        await this.shareBandwidth(token, proxy, i);
      } catch (error) {
        logger(`[Acount ${i + 1}] Error processing token: ${token}, Error: ${error.message}`, "error");
      }
    });

    await Promise.all(tasks);
  };

  async checkProxyIP(proxy) {
    try {
      const proxyAgent = new HttpsProxyAgent(proxy);
      const response = await fetch("https://api.ipify.org?format=json", {
        agent: proxyAgent,
      });

      if (response.ok) {
        const data = await response.json();
        return data.ip;
      } else {
        throw new Error(`Unable to check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }

  main = async () => {
    logger(banner, "warn");

    await this.shareBandwidthForAllTokens();
    logger(`Completed all account wait ${settings.TIME_SLEEP} minutes to new loop | Don't stop process | Node running...`, "debug");
    setInterval(this.shareBandwidthForAllTokens, settings.TIME_SLEEP * 60 * 1000);
  };
}

const client = new OpenLoop();
client.main().catch((err) => {
  logger(err.message, "error");
  process.exit(1);
});
