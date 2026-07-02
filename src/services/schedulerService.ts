import cron from "node-cron";
import { logger } from "../utils/logger";
import * as matchingService from "./matchingService";

export function startScheduler(): void {
  cron.schedule("* * * * *", () => {
    void matchingService.activateDueScheduledJobs().catch((err) => logger("Scheduled activation cron failed:", err));
    void matchingService.expireStaleJobs().catch((err) => logger("Expire cron failed:", err));
    void matchingService.recoverTimedOutMatchingJobs().catch((err) => logger("Matching recovery cron failed:", err));
  });

  cron.schedule("0 * * * *", () => {
    void matchingService.sendScheduledReminders().catch((err) => logger("Reminder cron failed:", err));
  });

  logger("Scheduler started");
}
