import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Search, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Mail,
  Globe,
  Server,
  Trash2,
  History,
  ChevronRight,
  Lock,
  Database
} from "lucide-react";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import bgImage from "@assets/generated_images/abstract_digital_security_background_with_glowing_mesh_network.png";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

// --- Types & Mock Data ---

type RiskFactor = {
  type: "warning" | "danger";
  label: string;
  description: string;
};

type Breach = {
  domain: string;
  date: string;
};

type ScanResult = {
  score: number;
  status: "safe" | "risky" | "invalid";
  details: {
    syntax: boolean;
    mxRecords: boolean;
    disposable: boolean;
    smtp: boolean;
    smtpUnverifiable?: boolean;
    spamTrap: boolean;
    domainAge: string;
  };
  riskLevel: "Low" | "Medium" | "High";
  riskFactors?: RiskFactor[];
  breaches?: Breach[];
  providerName?: string | null;
};

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

// --- Components ---

const ScoreGauge = ({ score, status }: { score: number; status: string }) => {
  const data = [
    { name: "Score", value: score },
    { name: "Remaining", value: 100 - score },
  ];
  
  let color = "hsl(var(--success))";
  if (status === "risky") color = "hsl(var(--destructive))";
  if (status === "invalid") color = "hsl(var(--muted-foreground))";

  return (
    <div className="relative h-48 w-48 mx-auto">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={color} />
            <Cell fill="hsl(var(--muted))" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-4xl font-display font-bold text-foreground">
          {score}
        </span>
        <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
          Trust Score
        </span>
      </div>
    </div>
  );
};

const CheckItem = ({ 
  icon: Icon, 
  label, 
  status, 
  value,
  onClick,
  hasExplanation
}: { 
  icon: any; 
  label: string; 
  status: "success" | "error" | "warning" | "neutral"; 
  value: string;
  onClick?: () => void;
  hasExplanation?: boolean;
}) => (
  <motion.div 
    whileHover={{ scale: 1.02 }}
    whileTap={hasExplanation ? { scale: 0.98 } : {}}
    className={`sc-check-item flex items-center justify-between ${
      hasExplanation ? "sc-check-item-clickable" : ""
    }`}
    onClick={onClick}
  >
    <div className="flex items-center gap-3">
      <div className={`sc-icon-badge ${
        status === "success" ? "sc-icon-badge-success" :
        status === "error" ? "sc-icon-badge-error" :
        status === "neutral" ? "sc-icon-badge-neutral" :
        "sc-icon-badge-warning"
      }`}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="font-medium text-sm">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{value}</span>
      {status === "success" && <CheckCircle2 className="w-4 h-4 text-success" />}
      {status === "error" && <XCircle className="w-4 h-4 text-destructive" />}
      {status === "warning" && <AlertTriangle className="w-4 h-4 text-blue-500" />}
      {status === "neutral" && <AlertTriangle className="w-4 h-4 text-primary" />}
      {hasExplanation && <ChevronRight className="w-4 h-4 text-primary ml-1" />}
    </div>
  </motion.div>
);

// --- Main Page ---

export default function Home() {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [selectedExplanation, setSelectedExplanation] = useState<{title: string; factors: RiskFactor[]; isPositive?: boolean} | null>(null);

  // Positive explanations for valid results
  const positiveExplanations: Record<string, RiskFactor> = {
    "Syntax Check": { label: "Valid Email Format", description: "The email address follows proper formatting rules with a valid username, @ symbol, and domain structure.", type: "success" as any },
    "Domain Name": { label: "Legitimate Domain", description: "The domain appears to be from a well-established, reputable email provider or organization.", type: "success" as any },
    "MX Records": { label: "Mail Server Verified", description: "The domain has valid MX (Mail Exchange) records, confirming it can receive emails.", type: "success" as any },
    "Disposable": { label: "Permanent Email", description: "This is not a disposable or temporary email address. It's a permanent address that can receive ongoing communication.", type: "success" as any },
    "SMTP Check": { label: "Server Responsive", description: "The mail server responded to verification requests, indicating the email address exists and is active.", type: "success" as any },
    "Username": { label: "Normal Username", description: "The username portion of the email doesn't contain suspicious patterns like random characters or spam-like sequences.", type: "success" as any },
    "Domain Age": { label: "Established Domain", description: "The domain has been registered for a significant period of time, which is a positive trust indicator.", type: "success" as any },
    "Data Breaches": { label: "No Breaches Found", description: "This email address was not found in any known data breach databases.", type: "success" as any },
  };

  const showExplanation = (title: string, factorLabels: string[], forcePositive?: boolean) => {
    // Check for risk factors first
    if (result?.riskFactors && !forcePositive) {
      const matchingFactors = result.riskFactors.filter(f => 
        factorLabels.some(label => f.label.toLowerCase().includes(label.toLowerCase()))
      );
      if (matchingFactors.length > 0) {
        setSelectedExplanation({ title, factors: matchingFactors, isPositive: false });
        setExplanationOpen(true);
        return;
      }
    }
    // Show positive explanation
    const positiveExp = positiveExplanations[title];
    if (positiveExp) {
      setSelectedExplanation({ title, factors: [positiveExp], isPositive: true });
      setExplanationOpen(true);
    }
  };

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsScanning(true);
    setResult(null);
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 200);

    try {
      const response = await fetch("/api/verify-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: values.email }),
      });

      clearInterval(interval);
      setProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to verify email");
      }

      const data: ScanResult = await response.json();
      setResult(data);
      
      toast({
        title: "Scan Complete",
        description: `Email analysis finished for ${values.email}`,
      });
    } catch (error) {
      clearInterval(interval);
      setIsScanning(false);
      
      toast({
        title: "Verification Failed",
        description: error instanceof Error ? error.message : "Unable to verify email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden selection:bg-primary/20">
      
      {/* Ambient Background Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="sc-orb sc-orb-1" />
        <div className="sc-orb sc-orb-2" />
        <div className="sc-orb sc-orb-3" />
      </div>

      {/* Hero Section */}
      <section className="relative pt-20 pb-24 px-4 overflow-hidden">
        <div className="relative z-10 container mx-auto max-w-4xl text-center space-y-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full sc-glass text-sm font-medium text-primary">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              Real-time Email Intelligence
            </div>
            
            <h1 className="sc-hero-title font-display">
              <span className="sc-text-gradient">SafeCheck</span>
            </h1>
            
            <p className="sc-hero-subtitle text-muted-foreground mx-auto">
              Instantly verify any email address. Get detailed trust scores, breach history, 
              and risk assessment before you respond.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="sc-glass-strong p-3 rounded-2xl max-w-2xl mx-auto"
          >
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col md:flex-row gap-3">
              <div className="relative grow">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <input
                  {...form.register("email")}
                  placeholder="Enter email to verify..."
                  className="sc-input w-full pl-12 pr-4 h-14 text-lg rounded-xl outline-none"
                  disabled={isScanning}
                />
              </div>
              <button 
                type="submit" 
                className="sc-btn-primary h-14 px-8 text-lg font-semibold rounded-xl text-white disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isScanning}
              >
                {isScanning ? (
                  <span className="flex items-center gap-2">
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    />
                    Scanning...
                  </span>
                ) : "Verify"}
              </button>
            </form>
            {form.formState.errors.email && (
              <p className="text-destructive text-sm text-left mt-2 px-2">
                {form.formState.errors.email.message}
              </p>
            )}
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="flex items-center justify-center gap-8 text-sm text-muted-foreground"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Breach Detection
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              SMTP Validation
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success" />
              Risk Scoring
            </div>
          </motion.div>
        </div>
      </section>

      {/* Results Section */}
      <AnimatePresence mode="wait">
        {isScanning && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="container mx-auto max-w-3xl px-4 pb-20"
          >
            <div className="sc-glass-strong rounded-2xl p-8 space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary"
                  />
                  <div>
                    <p className="font-semibold">Analyzing email reputation</p>
                    <p className="text-sm text-muted-foreground">Checking multiple security factors...</p>
                  </div>
                </div>
                <span className="text-2xl font-bold sc-text-gradient">{Math.round(progress)}%</span>
              </div>
              
              <div className="sc-progress-bar">
                <motion.div 
                  className="sc-progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                {["Syntax", "Domain", "Reputation"].map((label, i) => (
                  <div key={i} className="text-center p-4 rounded-xl bg-muted/30">
                    <div className={`w-8 h-8 mx-auto mb-2 rounded-lg sc-shimmer`} />
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {!isScanning && result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="container mx-auto max-w-5xl px-4 pb-32"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Score Card */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className={`lg:col-span-1 sc-glass-strong rounded-2xl overflow-hidden relative sc-card-lift ${
                  result.status === 'safe' ? 'sc-pulse-glow-success' : ''
                }`}
              >
                <div className={`absolute top-0 left-0 w-full h-1 ${
                  result.status === 'safe' ? 'bg-gradient-to-r from-success to-emerald-400' : 'bg-gradient-to-r from-destructive to-red-400'
                }`} />
                
                <div className="p-6 space-y-6">
                  <div className="text-center">
                    <p className="text-sm font-medium text-muted-foreground mb-4">Trust Score</p>
                    <div className="relative inline-block">
                      <div className={`w-36 h-36 rounded-full flex items-center justify-center ${
                        result.status === 'safe' 
                          ? 'bg-gradient-to-br from-success/20 to-success/5 ring-4 ring-success/30' 
                          : 'bg-gradient-to-br from-destructive/20 to-destructive/5 ring-4 ring-destructive/30'
                      }`}>
                        <div className="text-center">
                          <motion.span 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-5xl font-bold sc-score-value"
                          >
                            {result.score}
                          </motion.span>
                          <span className="text-lg text-muted-foreground">/100</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-3 border-b border-border/50">
                      <span className="text-muted-foreground text-sm">Status</span>
                      <span className={`sc-pill ${result.status === 'safe' ? 'sc-pill-safe' : 'sc-pill-risky'}`}>
                        {result.status}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-3">
                      <span className="text-muted-foreground text-sm">Risk Level</span>
                      <span className={`font-semibold ${
                        result.riskLevel === 'Low' ? 'text-success' : 
                        result.riskLevel === 'High' ? 'text-destructive' : 'text-blue-500'
                      }`}>{result.riskLevel}</span>
                    </div>
                  </div>
                </div>
              </motion.div>


              {/* Detailed Checks */}
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="lg:col-span-2 sc-glass-strong rounded-2xl p-6 sc-card-lift"
              >
                <div className="mb-6">
                  <h3 className="text-lg font-semibold">Detailed Analysis</h3>
                  <p className="text-sm text-muted-foreground">Technical verification results</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <CheckItem 
                    icon={Mail} 
                    label="Syntax Check" 
                    status={result.details.syntax ? "success" : "error"} 
                    value={result.details.syntax ? "Valid Format" : "Invalid"} 
                    hasExplanation={true}
                    onClick={() => showExplanation("Syntax Check", ["Syntax"], result.details.syntax)}
                  />
                  <CheckItem 
                    icon={Globe} 
                    label="Domain Name" 
                    status={result.riskFactors?.some(f => f.label === "Suspicious Domain") ? "error" : "success"} 
                    value={result.riskFactors?.some(f => f.label === "Suspicious Domain") ? "Suspicious" : "Clean"} 
                    hasExplanation={true}
                    onClick={() => showExplanation("Domain Name", ["Suspicious Domain"])}
                  />
                  <CheckItem 
                    icon={Server} 
                    label="MX Records" 
                    status={result.details.mxRecords ? "success" : "error"} 
                    value={result.details.mxRecords ? "Found" : "Missing"} 
                    hasExplanation={true}
                    onClick={() => showExplanation("MX Records", ["MX"], result.details.mxRecords)}
                  />
                  <CheckItem 
                    icon={Trash2} 
                    label="Disposable" 
                    status={!result.details.disposable ? "success" : "error"} 
                    value={result.details.disposable ? "Yes" : "No"} 
                    hasExplanation={true}
                    onClick={() => showExplanation("Disposable", ["Disposable"])}
                  />
                  <CheckItem 
                    icon={Lock} 
                    label="SMTP Check" 
                    status={result.details.smtp ? "success" : (result.details.smtpUnverifiable ? "neutral" : "warning")} 
                    value={result.details.smtp ? "Connected" : (result.details.smtpUnverifiable ? `${result.providerName || "Provider"} blocks verification` : "Unverified")} 
                    hasExplanation={true}
                    onClick={() => showExplanation("SMTP Check", ["SMTP"], result.details.smtp)}
                  />
                  <CheckItem 
                    icon={ShieldAlert} 
                    label="Username" 
                    status={result.riskFactors?.some(f => f.label.includes("Username")) ? "error" : "success"} 
                    value={result.riskFactors?.some(f => f.label.includes("Username")) ? "Suspicious" : "Clean"} 
                    hasExplanation={true}
                    onClick={() => showExplanation("Username", ["Username"])}
                  />
                  <CheckItem 
                    icon={History} 
                    label="Domain Age" 
                    status={result.details.domainAge.includes(">") ? "success" : "warning"} 
                    value={result.details.domainAge} 
                    hasExplanation={true}
                    onClick={() => showExplanation("Domain Age", ["Domain Age"], result.details.domainAge.includes(">"))}
                  />
                  <CheckItem 
                    icon={AlertTriangle} 
                    label="Data Breaches" 
                    status={result.breaches && result.breaches.length > 0 ? "error" : "success"} 
                    value={result.breaches && result.breaches.length > 0 
                      ? `${result.breaches.length} found` 
                      : "None"} 
                    hasExplanation={true}
                    onClick={() => showExplanation("Data Breaches", ["Breach"])}
                  />
                  
                  {/* High Risk Address indicator */}
                  {result.riskFactors?.some(f => f.label === "High Risk Address") && (
                    <CheckItem 
                      icon={ShieldAlert} 
                      label="Risk Status" 
                      status="error"
                      value="High Risk" 
                      hasExplanation={true}
                      onClick={() => showExplanation("High Risk Address", ["High Risk"])}
                    />
                  )}
                </div>
              </motion.div>

              {/* Data Breaches List */}
              {result.breaches && result.breaches.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="lg:col-span-3 sc-glass-strong rounded-2xl p-6 border border-destructive/20"
                >
                  <div className="flex items-center gap-2 mb-4">
                    <div className="sc-icon-badge-error w-8 h-8 rounded-lg flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-destructive">Data Breaches ({result.breaches.length})</h3>
                      <p className="text-sm text-muted-foreground">This email was found in data breaches</p>
                    </div>
                  </div>
                  <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4 max-h-48 overflow-y-auto">
                    {result.breaches.map((breach, index) => (
                      <div key={index} className="sc-breach-item flex items-center justify-between">
                        <span className="font-medium text-sm text-destructive truncate">
                          {breach.domain}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(breach.date).getFullYear()}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Features Grid (Shown when no result) */}
      {!isScanning && !result && (
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="container mx-auto max-w-5xl px-4 pb-12"
        >
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: Shield, title: "Real-time Validation", desc: "Instantly verify if an email exists without sending messages" },
              { icon: Trash2, title: "Disposable Detection", desc: "Identify temporary and burner email addresses automatically" },
              { icon: Server, title: "Breach Monitoring", desc: "Check if the email has appeared in known data breaches" },
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
                className="sc-feature-card sc-card-lift"
              >
                <div className={`w-12 h-12 rounded-xl mb-5 flex items-center justify-center ${
                  i === 0 ? 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary' :
                  i === 1 ? 'bg-gradient-to-br from-accent/20 to-accent/5 text-accent' :
                  'bg-gradient-to-br from-blue-400/20 to-blue-400/5 text-blue-400'
                }`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Data Source Footer */}
      <footer className="border-t border-border/50 mt-8">
        <div className="container mx-auto max-w-5xl px-4 py-8">
          <div className="sc-glass rounded-xl p-6">
            <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              Data Sources
            </h4>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              SafeCheck uses real-time threat intelligence from multiple sources to verify email reputation:
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                <span className="text-muted-foreground"><strong className="text-foreground">Honeypot Networks</strong> - Real-time spam trap databases</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                <span className="text-muted-foreground"><strong className="text-foreground">Breach Databases</strong> - Known data breach records</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                <span className="text-muted-foreground"><strong className="text-foreground">WHOIS & DNS</strong> - Domain registration data</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-success mt-0.5 shrink-0" />
                <span className="text-muted-foreground"><strong className="text-foreground">Threat Blocklists</strong> - Industry blacklists</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/50">
              Powered by <a href="https://www.abstractapi.com/api/email-reputation-api" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">AbstractAPI Email Reputation</a> - Global threat intelligence updated in real-time.
            </p>
          </div>
        </div>
      </footer>

      {/* Explanation Dialog */}
      <Dialog open={explanationOpen} onOpenChange={setExplanationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={`flex items-center gap-2 ${
              selectedExplanation?.isPositive ? "text-success" : "text-blue-600"
            }`}>
              {selectedExplanation?.isPositive ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              {selectedExplanation?.title || "Details"}
            </DialogTitle>
            <DialogDescription>
              {selectedExplanation?.isPositive ? "Why this passed verification" : "Here's why this was flagged"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {selectedExplanation?.factors.map((factor, index) => (
              <div 
                key={index}
                className={`flex items-start gap-3 p-4 rounded-lg border ${
                  selectedExplanation?.isPositive
                    ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900"
                    : factor.type === "danger" 
                      ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900" 
                      : "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900"
                }`}
              >
                <div className={`p-1.5 rounded-full mt-0.5 ${
                  selectedExplanation?.isPositive
                    ? "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400"
                    : factor.type === "danger" 
                      ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400" 
                      : "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400"
                }`}>
                  {selectedExplanation?.isPositive 
                    ? <CheckCircle2 className="w-4 h-4" /> 
                    : factor.type === "danger" 
                      ? <XCircle className="w-4 h-4" /> 
                      : <AlertTriangle className="w-4 h-4" />}
                </div>
                <div>
                  <p className={`font-semibold ${
                    selectedExplanation?.isPositive
                      ? "text-green-700 dark:text-green-400"
                      : factor.type === "danger" 
                        ? "text-red-700 dark:text-red-400" 
                        : "text-blue-700 dark:text-blue-400"
                  }`}>
                    {factor.label}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {factor.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}