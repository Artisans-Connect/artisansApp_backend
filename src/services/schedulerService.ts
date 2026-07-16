import cron from "node-cron";
import { logger } from "../utils/logger";
import * as matchingService from "./matchingService";
import * as jobsService from "./jobsService";

export function startScheduler(): void {
  cron.schedule("* * * * *", () => {
    void matchingService.activateDueScheduledJobs().catch((err) => logger("Scheduled activation cron failed:", err));
    void matchingService.expireStaleJobs().catch((err) => logger("Expire cron failed:", err));
    void matchingService.recoverTimedOutMatchingJobs().catch((err) => logger("Matching recovery cron failed:", err));
    void matchingService.sendScheduledWorkerReminders().catch((err) => logger("Worker reminder cron failed:", err));
    void jobsService.sendWorkProgressCheckIns().catch((err) => logger("Work check-in cron failed:", err));
  });

  cron.schedule("0 * * * *", () => {
    void matchingService.sendScheduledReminders().catch((err) => logger("Reminder cron failed:", err));
  });

  logger("Scheduler started");
}
