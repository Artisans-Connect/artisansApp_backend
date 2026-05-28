import cron from "node-cron";
import { logger } from "../utils/logger";
import * as matchingService from "./matchingService";

export function startScheduler(): void {
  cron.schedule("* * * * *", () => {
    void matchingService.expireStaleJobs().catch((err) => logger("Expire cron failed:", err));
  });

  cron.schedule("0 * * * *", () => {
    void matchingService.sendScheduledReminders().catch((err) => logger("Reminder cron failed:", err));
  });

  logger("Scheduler started");
}
