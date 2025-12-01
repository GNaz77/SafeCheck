import { type User, type InsertUser, type VerificationHistory, type InsertVerificationHistory, users, verificationHistory } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { desc, eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createVerification(verification: InsertVerificationHistory): Promise<VerificationHistory>;
  getRecentVerifications(limit?: number): Promise<VerificationHistory[]>;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async createVerification(verification: InsertVerificationHistory): Promise<VerificationHistory> {
    const result = await db.insert(verificationHistory).values(verification).returning();
    return result[0];
  }

  async getRecentVerifications(limit: number = 10): Promise<VerificationHistory[]> {
    return await db.select().from(verificationHistory).orderBy(desc(verificationHistory.createdAt)).limit(limit);
  }
}

export const storage = new DbStorage();
