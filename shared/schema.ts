import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const verificationHistory = pgTable("verification_history", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  score: integer("score").notNull(),
  status: text("status").notNull(),
  syntaxValid: boolean("syntax_valid").notNull(),
  mxRecords: boolean("mx_records").notNull(),
  disposable: boolean("disposable").notNull(),
  smtpValid: boolean("smtp_valid").notNull(),
  spamTrap: boolean("spam_trap").notNull(),
  domainAge: text("domain_age").notNull(),
  riskLevel: text("risk_level").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertVerificationHistorySchema = createInsertSchema(verificationHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertVerificationHistory = z.infer<typeof insertVerificationHistorySchema>;
export type VerificationHistory = typeof verificationHistory.$inferSelect;
