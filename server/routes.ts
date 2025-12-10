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
      
      const email_domain = email.split('@')[1]?.toLowerCase() || '';
      const isMajorProvider = MAJOR_EMAIL_PROVIDERS.includes(email_domain);
      const smtpUnverifiable = data.email_deliverability?.is_smtp_valid === null && isMajorProvider;
      
      const riskFactors = detectRiskFactors(data);
      const score = calculateScore(data, riskFactors, smtpUnverifiable);
      const status = determineStatus(score, data, riskFactors);
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

      const breaches = data.email_breaches?.breached_domains?.map((b: any) => ({
        domain: b.domain,
        date: b.breach_date
      })) || [];

      const result = {
        score: verificationData.score,
        status: verificationData.status,
        details: {
          syntax: verificationData.syntaxValid,
          mxRecords: verificationData.mxRecords,
          disposable: verificationData.disposable,
          smtp: verificationData.smtpValid,
          smtpUnverifiable,
          spamTrap: verificationData.spamTrap,
          domainAge: verificationData.domainAge,
        },
        riskLevel: verificationData.riskLevel,
        riskFactors,
        breaches,
        providerName: data.email_sender?.email_provider_name || null,
      };

      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      console.log("Returning score:", result.score);
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

const MAJOR_EMAIL_PROVIDERS = [
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it',
  'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com',
  'protonmail.com', 'proton.me',
  'zoho.com',
  'mail.com',
  'gmx.com', 'gmx.net',
  'yandex.com', 'yandex.ru',
];

const SUSPICIOUS_DOMAIN_WORDS = [
  'fake', 'temp', 'trash', 'spam', 'disposable', 'throwaway', 
  'mailinator', 'guerrilla', 'sharklasers', 'trashmail', 'tempmail',
  'yopmail', 'getairmail', 'fakeinbox', 'burner', 'anonymous'
];

const SUSPICIOUS_USERNAME_PATTERNS = [
  { pattern: /^test/i, description: "Username starts with 'test'" },
  { pattern: /^user\d+/i, description: "Generic username pattern (user + numbers)" },
  { pattern: /^admin/i, description: "Username starts with 'admin'" },
  { pattern: /^demo/i, description: "Username starts with 'demo'" },
  { pattern: /^sample/i, description: "Username starts with 'sample'" },
  { pattern: /^fake/i, description: "Username starts with 'fake'" },
  { pattern: /^temp/i, description: "Username starts with 'temp'" },
  { pattern: /^null/i, description: "Username starts with 'null'" },
  { pattern: /^example/i, description: "Username starts with 'example'" },
  { pattern: /^noreply/i, description: "Username is 'noreply'" },
  { pattern: /^asdf/i, description: "Keyboard pattern username" },
  { pattern: /^qwerty/i, description: "Keyboard pattern username" },
  { pattern: /^12345/, description: "Numeric sequence username" },
  { pattern: /^abc123/i, description: "Common test pattern username" },
];

interface RiskFactor {
  type: "info" | "warning" | "danger";
  label: string;
  description: string;
}

function detectRiskFactors(data: any): RiskFactor[] {
  const factors: RiskFactor[] = [];
  const email = data.email_address || '';
  const [username, domain] = email.split('@');
  const domainName = domain?.split('.')[0]?.toLowerCase() || '';
  
  // Suspicious domain detection
  const suspiciousDomainWord = SUSPICIOUS_DOMAIN_WORDS.find(word => domainName.includes(word));
  if (suspiciousDomainWord) {
    factors.push({
      type: "danger",
      label: "Suspicious Domain",
      description: `The domain "${domain}" contains "${suspiciousDomainWord}" which is commonly associated with temporary or fake email services. These domains are often used to create throwaway accounts.`
    });
  }
  
  // Suspicious username patterns - info only, no penalty (users can create custom usernames)
  if (username) {
    const matchedPattern = SUSPICIOUS_USERNAME_PATTERNS.find(p => p.pattern.test(username));
    if (matchedPattern) {
      factors.push({
        type: "info",
        label: "Uncommon Username",
        description: `The username "${username}" matches a pattern sometimes used for test accounts. This is noted for awareness but doesn't affect the trust score since many real users create custom usernames.`
      });
    }
  }
  
  // API flagged username - info only, no penalty
  if (data.email_quality?.is_username_suspicious === true) {
    factors.push({
      type: "info",
      label: "Unusual Username",
      description: `The username "${username}" has an unusual pattern. This is noted for awareness but doesn't affect the trust score since users can create any username they want.`
    });
  }
  
  // High risk address - provide detailed reasoning
  if (data.email_risk?.address_risk_status === "high") {
    const reasons: string[] = [];
    
    // Check what might be causing high risk
    if (data.email_quality?.score !== undefined && data.email_quality.score < 0.3) {
      reasons.push("very low quality score from reputation analysis");
    }
    if (data.email_deliverability?.status === "unknown") {
      reasons.push("email deliverability could not be confirmed");
    }
    if (data.email_quality?.is_catchall === true) {
      reasons.push("domain accepts all emails (catch-all), making it impossible to verify if this specific address exists");
    }
    if (data.email_quality?.is_free_email === true && data.email_risk?.domain_risk_status === "low") {
      reasons.push("combination of unverifiable address on a free email provider");
    }
    
    const reasonText = reasons.length > 0 
      ? `Reasons: ${reasons.join("; ")}.`
      : "The email reputation service detected patterns associated with spam, fraud, or abuse based on historical data and behavioral analysis.";
    
    factors.push({
      type: "danger",
      label: "High Risk Address",
      description: `This email has been classified as high risk by reputation analysis. ${reasonText}`
    });
  }
  
  // Data breaches
  const breachCount = data.email_breaches?.total_breaches ?? 0;
  if (breachCount > 0) {
    const severity = breachCount > 10 ? "significant exposure" : breachCount > 5 ? "moderate exposure" : "some exposure";
    factors.push({
      type: breachCount > 10 ? "danger" : "warning",
      label: "Data Breaches",
      description: `This email was found in ${breachCount} known data breach${breachCount > 1 ? 'es' : ''}, indicating ${severity}. Breached emails are often targeted for spam, phishing, and credential stuffing attacks.`
    });
  }
  
  // Disposable email
  if (data.email_quality?.is_disposable === true) {
    factors.push({
      type: "danger",
      label: "Disposable Email",
      description: `This email uses a temporary/disposable email service (${domain}). These addresses self-destruct after a short time and are commonly used to bypass verification, hide identity, or commit fraud.`
    });
  }
  
  // Role-based email (info@, support@, sales@)
  if (data.email_quality?.is_role === true) {
    factors.push({
      type: "warning",
      label: "Role-Based Email",
      description: `This appears to be a role-based email (like info@, support@, sales@) rather than a personal address. Role emails are shared by multiple people and may have higher bounce rates.`
    });
  }
  
  // Catch-all domain
  if (data.email_quality?.is_catchall === true && data.email_risk?.address_risk_status !== "high") {
    factors.push({
      type: "warning", 
      label: "Catch-All Domain",
      description: `The domain ${domain} is configured to accept all emails, even to non-existent addresses. This means we cannot verify if "${username}" is a real mailbox.`
    });
  }
  
  // INFO-LEVEL FACTORS (explain score reductions without being warnings)
  
  // Free email provider
  if (data.email_quality?.is_free_email === true) {
    const providerName = data.email_sender?.email_provider_name || domain;
    factors.push({
      type: "info",
      label: "Free Email Provider",
      description: `This email uses ${providerName}, a free email service. Free providers are less verifiable than business domains, which may slightly reduce the trust score.`
    });
  }
  
  // SPF not strict
  if (data.email_quality?.is_spf_strict === false && data.email_quality?.is_dmarc_enforced === true) {
    factors.push({
      type: "info",
      label: "SPF Not Strict",
      description: `The domain's SPF (Sender Policy Framework) is configured but not in strict mode. This is common for large email providers and has minimal impact on trust.`
    });
  }
  
  // Medium risk address
  if (data.email_risk?.address_risk_status === "medium") {
    factors.push({
      type: "info",
      label: "Medium Risk Classification",
      description: `This email has been classified as medium risk by reputation analysis. This could be due to limited email history, uncommon patterns, or other neutral factors.`
    });
  }
  
  return factors;
}

function calculateScore(data: any, riskFactors: RiskFactor[], smtpUnverifiable: boolean = false): number {
  let score = 50;
  const qualityScore = data.email_quality?.score;
  if (qualityScore !== undefined && qualityScore !== null) {
    score = Math.round(parseFloat(qualityScore) * 100);
  } else {
    if (data.email_deliverability?.is_format_valid === true) score += 15;
    if (data.email_deliverability?.is_mx_valid === true) score += 15;
    if (data.email_deliverability?.is_smtp_valid === true) score += 15;
    // Don't penalize major providers for unverifiable SMTP - give neutral score
    if (smtpUnverifiable) score += 10;
  }
  
  // Critical penalties for undeliverable emails
  if (data.email_deliverability?.is_smtp_valid === false) score -= 25;
  if (data.email_deliverability?.is_mx_valid === false) score -= 30;
  if (data.email_deliverability?.status === "undeliverable") score -= 20;
  if (data.email_deliverability?.status === "unknown") score -= 15;
  
  if (data.email_quality?.is_catchall === true) score -= 10;
  if (data.email_quality?.is_role === true) score -= 5;
  
  if (data.email_risk?.address_risk_status === "medium") score -= 10;
  if (data.email_risk?.address_risk_status === "high") score -= 20;
  
  for (const factor of riskFactors) {
    if (factor.type === "danger") {
      // Suspicious domain with "fake", "temp", etc. should be heavily penalized
      if (factor.label === "Suspicious Domain") score -= 50;
      else score -= 30;
    }
    else if (factor.type === "warning") score -= 15;
  }
  
  return Math.min(100, Math.max(0, score));
}

function determineStatus(score: number, data: any, riskFactors: RiskFactor[]): "safe" | "risky" | "invalid" {
  if (data.email_deliverability?.status === "undeliverable") return "invalid";
  
  const warningsAndDangers = riskFactors.filter(f => f.type === "warning" || f.type === "danger");
  if (riskFactors.some(f => f.type === "danger")) return "risky";
  if (warningsAndDangers.length > 1) return "risky";
  
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
