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

      const apiUrl = `https://emailreputation.abstractapi.com/v1/?api_key=${apiKey}&email=${encodeURIComponent(email)}`;
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
        syntaxValid: data.email_deliverability?.is_format_valid === true,
        mxRecords: data.email_deliverability?.is_mx_valid === true,
        disposable: data.email_quality?.is_disposable === true,
        smtpValid: data.email_deliverability?.is_smtp_valid === true,
        spamTrap: data.email_quality?.is_catchall === true,
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

const SUSPICIOUS_DOMAIN_WORDS = [
  'fake', 'temp', 'trash', 'spam', 'disposable', 'throwaway', 
  'mailinator', 'guerrilla', 'sharklasers', 'trashmail', 'tempmail',
  'yopmail', 'getairmail', 'fakeinbox', 'burner', 'anonymous'
];

const SUSPICIOUS_USERNAME_PATTERNS = [
  /^test/i, /^user\d+/i, /^admin/i, /^demo/i, /^sample/i,
  /^fake/i, /^temp/i, /^null/i, /^example/i, /^noreply/i,
  /^asdf/i, /^qwerty/i, /^12345/, /^abc123/i
];

function calculateScore(data: any): number {
  const email = data.email_address || '';
  const [username, domain] = email.split('@');
  const domainName = domain?.split('.')[0]?.toLowerCase() || '';
  
  let score = 50;
  const qualityScore = data.email_quality?.score;
  if (qualityScore !== undefined && qualityScore !== null) {
    score = Math.round(parseFloat(qualityScore) * 100);
  } else {
    if (data.email_deliverability?.is_format_valid === true) score += 15;
    if (data.email_deliverability?.is_mx_valid === true) score += 15;
    if (data.email_deliverability?.is_smtp_valid === true) score += 15;
  }
  
  if (data.email_quality?.is_disposable === true) score -= 50;
  if (data.email_quality?.is_catchall === true) score -= 10;
  if (data.email_quality?.is_role === true) score -= 5;
  
  if (data.email_risk?.address_risk_status === "high") score -= 20;
  else if (data.email_risk?.address_risk_status === "medium") score -= 10;
  
  const breachCount = data.email_breaches?.total_breaches ?? 0;
  if (breachCount > 50) score -= 15;
  else if (breachCount > 20) score -= 10;
  else if (breachCount > 5) score -= 5;
  
  if (SUSPICIOUS_DOMAIN_WORDS.some(word => domainName.includes(word))) {
    score -= 40;
  }
  
  if (username && SUSPICIOUS_USERNAME_PATTERNS.some(pattern => pattern.test(username))) {
    score -= 25;
  }
  
  if (data.email_quality?.is_username_suspicious === true) {
    score -= 15;
  }
  
  return Math.min(100, Math.max(0, score));
}

function determineStatus(score: number, data: any): "safe" | "risky" | "invalid" {
  if (data.email_deliverability?.status === "undeliverable") return "invalid";
  if (data.email_quality?.is_disposable === true) return "risky";
  if (data.email_risk?.address_risk_status === "high") return "risky";
  
  const email = data.email_address || '';
  const [username, domain] = email.split('@');
  const domainName = domain?.split('.')[0]?.toLowerCase() || '';
  
  if (SUSPICIOUS_DOMAIN_WORDS.some(word => domainName.includes(word))) return "risky";
  if (username && SUSPICIOUS_USERNAME_PATTERNS.some(pattern => pattern.test(username))) return "risky";
  
  if (score >= 70) return "safe";
  if (score >= 40) return "risky";
  return "invalid";
}

function determineRiskLevel(score: number): "Low" | "Medium" | "High" {
  if (score >= 70) return "Low";
  if (score >= 40) return "Medium";
  return "High";
}

function estimateDomainAge(data: any): string {
  const domainAgeDays = data.email_domain?.domain_age;
  if (domainAgeDays) {
    const years = Math.floor(domainAgeDays / 365);
    if (years >= 10) return "> 10 years";
    if (years >= 5) return "5-10 years";
    if (years >= 2) return "2-5 years";
    if (years >= 1) return "1-2 years";
    return "< 1 year";
  }
  
  if (data.email_quality?.is_free_email === true) return "> 10 years";
  if (data.email_quality?.is_disposable === true) return "< 1 month";
  return "Unknown";
}
