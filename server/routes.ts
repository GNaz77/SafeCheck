import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const verifyEmailSchema = z.object({
  email: z.string().email("Invalid email format"),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post("/api/verify-email", async (req, res) => {
    try {
      const { email } = verifyEmailSchema.parse(req.body);
      
      const apiKey = process.env.ABSTRACTAPI_KEY;
      if (!apiKey) {
        console.error("ABSTRACTAPI_KEY not found in environment");
        return res.status(500).json({ error: "Email verification service not configured" });
      }

      const apiUrl = `https://emailvalidation.abstractapi.com/v1/?api_key=${apiKey}&email=${encodeURIComponent(email)}`;
      console.log("Calling AbstractAPI for email:", email);
      
      const response = await fetch(apiUrl);
      const responseText = await response.text();
      
      console.log("AbstractAPI response status:", response.status);
      console.log("AbstractAPI response:", responseText);

      if (!response.ok) {
        console.error("AbstractAPI error response:", responseText);
        return res.status(500).json({ error: "Email verification service error" });
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse API response:", responseText);
        return res.status(500).json({ error: "Invalid response from verification service" });
      }
      
      const score = calculateScore(data);
      const status = determineStatus(score, data);
      const riskLevel = determineRiskLevel(score);

      const verificationData = {
        email,
        score,
        status,
        syntaxValid: data.is_valid_format?.value ?? true,
        mxRecords: data.is_mx_found?.value ?? false,
        disposable: data.is_disposable_email?.value ?? false,
        smtpValid: data.is_smtp_valid?.value ?? false,
        spamTrap: data.is_catchall_email?.value ?? false,
        domainAge: estimateDomainAge(data),
        riskLevel,
      };

      try {
        await storage.createVerification(verificationData);
      } catch (dbError) {
        console.error("Database error (non-blocking):", dbError);
      }

      const result = {
        score: verificationData.score,
        status: verificationData.status,
        details: {
          syntax: verificationData.syntaxValid,
          mxRecords: verificationData.mxRecords,
          disposable: verificationData.disposable,
          smtp: verificationData.smtpValid,
          spamTrap: verificationData.spamTrap,
          domainAge: verificationData.domainAge,
        },
        riskLevel: verificationData.riskLevel,
      };

      return res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fromError(error).toString() });
      }
      console.error("Email verification error:", error);
      return res.status(500).json({ error: "Failed to verify email" });
    }
  });

  app.get("/api/verification-history", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const history = await storage.getRecentVerifications(limit);
      return res.json(history);
    } catch (error) {
      console.error("Failed to fetch verification history:", error);
      return res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  return httpServer;
}

function calculateScore(data: any): number {
  let score = 0;
  
  if (data.is_valid_format?.value) score += 20;
  if (data.is_mx_found?.value) score += 25;
  if (data.is_smtp_valid?.value) score += 30;
  if (!data.is_disposable_email?.value) score += 15;
  if (!data.is_catchall_email?.value) score += 10;
  
  if (data.quality_score) {
    score = Math.round(data.quality_score * 100);
  }
  
  return Math.min(100, Math.max(0, score));
}

function determineStatus(score: number, data: any): "safe" | "risky" | "invalid" {
  if (data.deliverability === "UNDELIVERABLE") return "invalid";
  if (score >= 70) return "safe";
  return "risky";
}

function determineRiskLevel(score: number): "Low" | "Medium" | "High" {
  if (score >= 70) return "Low";
  if (score >= 40) return "Medium";
  return "High";
}

function estimateDomainAge(data: any): string {
  if (data.is_free_email?.value) return "> 5 years";
  if (data.is_disposable_email?.value) return "< 1 month";
  return "1-5 years";
}
