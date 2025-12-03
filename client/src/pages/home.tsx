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
  Lock
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
  <div 
    className={`flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors ${
      hasExplanation ? "cursor-pointer ring-1 ring-orange-300 dark:ring-orange-700" : ""
    }`}
    onClick={onClick}
  >
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-full ${
        status === "success" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
        status === "error" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
        status === "neutral" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
      }`}>
        <Icon className="w-4 h-4" />
      </div>
      <span className="font-medium text-sm">{label}</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{value}</span>
      {status === "success" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
      {status === "error" && <XCircle className="w-4 h-4 text-red-500" />}
      {status === "warning" && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
      {status === "neutral" && <AlertTriangle className="w-4 h-4 text-blue-500" />}
      {hasExplanation && <ChevronRight className="w-4 h-4 text-orange-500 ml-1" />}
    </div>
  </div>
);

// --- Main Page ---

export default function Home() {
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [selectedExplanation, setSelectedExplanation] = useState<{title: string; factors: RiskFactor[]} | null>(null);

  const showExplanation = (title: string, factorLabels: string[]) => {
    if (!result?.riskFactors) return;
    const matchingFactors = result.riskFactors.filter(f => 
      factorLabels.some(label => f.label.toLowerCase().includes(label.toLowerCase()))
    );
    if (matchingFactors.length > 0) {
      setSelectedExplanation({ title, factors: matchingFactors });
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
      
      {/* Hero Section */}
      <section className="relative pt-24 pb-32 px-4 overflow-hidden">
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src={bgImage} 
            alt="Security Background" 
            className="w-full h-full object-cover opacity-30 dark:opacity-20"
          />
          <div className="absolute inset-0 bg-linear-to-b from-background/80 via-background/90 to-background"></div>
        </div>

        <div className="relative z-10 container mx-auto max-w-3xl text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge variant="outline" className="mb-4 py-1.5 px-4 backdrop-blur-xs bg-background/50 border-primary/20 text-primary">
              <ShieldCheck className="w-3 h-3 mr-2" />
              Enterprise-Grade Verification
            </Badge>
            <h1 className="text-5xl md:text-6xl font-display font-bold tracking-tight text-foreground mb-6">
              Verify Email <span className="text-gradient">Legitimacy</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Instantly check if an email address is valid, safe, and deliverable. 
              Protect your reputation and avoid bouncing.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-card/50 backdrop-blur-xl p-2 rounded-2xl border shadow-2xl ring-1 ring-white/20 dark:ring-white/10"
          >
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col md:flex-row gap-2">
              <div className="relative grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                <Input
                  {...form.register("email")}
                  placeholder="Enter email address to verify..."
                  className="pl-10 h-14 text-lg bg-background/80 border-transparent focus:border-primary ring-0 focus:ring-0 transition-all"
                  disabled={isScanning}
                />
              </div>
              <Button 
                type="submit" 
                size="lg" 
                className="h-14 px-8 text-lg font-semibold shadow-lg hover:shadow-primary/25 transition-all"
                disabled={isScanning}
              >
                {isScanning ? "Scanning..." : "Verify Email"}
              </Button>
            </form>
            {form.formState.errors.email && (
              <p className="text-red-500 text-sm text-left mt-2 px-2">
                {form.formState.errors.email.message}
              </p>
            )}
          </motion.div>
        </div>
      </section>

      {/* Results Section */}
      <AnimatePresence mode="wait">
        {isScanning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="container mx-auto max-w-3xl px-4 pb-20"
          >
            <Card className="border-primary/20 shadow-lg">
              <CardContent className="pt-6 space-y-4">
                <div className="flex justify-between text-sm font-medium text-muted-foreground">
                  <span>Analyzing reputation...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <div className="grid grid-cols-3 gap-4 mt-8">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 rounded-lg bg-muted/50 animate-pulse" />
                  ))}
                </div>
              </CardContent>
            </Card>
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
              <Card className="lg:col-span-1 border-border shadow-lg overflow-hidden relative">
                 <div className={`absolute top-0 left-0 w-full h-1.5 ${
                   result.status === 'safe' ? 'bg-success' : 'bg-destructive'
                 }`} />
                <CardHeader>
                  <CardTitle>Safety Score</CardTitle>
                  <CardDescription>Overall reputation analysis</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScoreGauge score={result.score} status={result.status} />
                  
                  <div className="mt-6 space-y-4">
                    <div className="flex justify-between items-center border-b pb-4">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={result.status === 'safe' ? 'default' : 'destructive'} className="uppercase">
                        {result.status}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center border-b pb-4">
                      <span className="text-muted-foreground">Risk Level</span>
                      <span className={`font-bold ${
                        result.riskLevel === 'Low' ? 'text-green-600' : 
                        result.riskLevel === 'High' ? 'text-red-600' : 'text-yellow-600'
                      }`}>{result.riskLevel}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>


              {/* Detailed Checks */}
              <Card className="lg:col-span-2 border-border shadow-lg">
                <CardHeader>
                  <CardTitle>Detailed Analysis</CardTitle>
                  <CardDescription>Technical verification results</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <CheckItem 
                    icon={Mail} 
                    label="Syntax Check" 
                    status={result.details.syntax ? "success" : "error"} 
                    value={result.details.syntax ? "Valid Format" : "Invalid"} 
                  />
                  <CheckItem 
                    icon={Globe} 
                    label="Domain Name" 
                    status={result.riskFactors?.some(f => f.label === "Suspicious Domain") ? "error" : "success"} 
                    value={result.riskFactors?.some(f => f.label === "Suspicious Domain") ? "Suspicious" : "Clean"} 
                    hasExplanation={result.riskFactors?.some(f => f.label === "Suspicious Domain")}
                    onClick={() => showExplanation("Domain Name Issue", ["Suspicious Domain"])}
                  />
                  <CheckItem 
                    icon={Server} 
                    label="MX Records" 
                    status={result.details.mxRecords ? "success" : "error"} 
                    value={result.details.mxRecords ? "Found" : "Missing"} 
                  />
                  <CheckItem 
                    icon={Trash2} 
                    label="Disposable" 
                    status={!result.details.disposable ? "success" : "error"} 
                    value={result.details.disposable ? "Yes" : "No"} 
                    hasExplanation={result.riskFactors?.some(f => f.label === "Disposable Email")}
                    onClick={() => showExplanation("Disposable Email", ["Disposable"])}
                  />
                  <CheckItem 
                    icon={Lock} 
                    label="SMTP Check" 
                    status={result.details.smtp ? "success" : (result.details.smtpUnverifiable ? "neutral" : "warning")} 
                    value={result.details.smtp ? "Connected" : (result.details.smtpUnverifiable ? `${result.providerName || "Provider"} blocks verification` : "Unverified")} 
                  />
                  <CheckItem 
                    icon={ShieldAlert} 
                    label="Username" 
                    status={result.riskFactors?.some(f => f.label.includes("Username")) ? "error" : "success"} 
                    value={result.riskFactors?.some(f => f.label.includes("Username")) ? "Suspicious" : "Clean"} 
                    hasExplanation={result.riskFactors?.some(f => f.label.includes("Username"))}
                    onClick={() => showExplanation("Username Issue", ["Username"])}
                  />
                  <CheckItem 
                    icon={History} 
                    label="Domain Age" 
                    status={result.details.domainAge.includes(">") ? "success" : "warning"} 
                    value={result.details.domainAge} 
                  />
                  <CheckItem 
                    icon={AlertTriangle} 
                    label="Data Breaches" 
                    status={result.breaches && result.breaches.length > 0 ? "error" : "success"} 
                    value={result.breaches && result.breaches.length > 0 
                      ? `${result.breaches.length} found` 
                      : "None"} 
                    hasExplanation={result.riskFactors?.some(f => f.label === "Data Breaches")}
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
                </CardContent>
              </Card>

              {/* Data Breaches List */}
              {result.breaches && result.breaches.length > 0 && (
                <Card className="lg:col-span-3 border-destructive/50 shadow-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="w-5 h-5" />
                      Data Breaches ({result.breaches.length})
                    </CardTitle>
                    <CardDescription>This email was found in the following data breaches</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4 max-h-64 overflow-y-auto">
                      {result.breaches.map((breach, index) => (
                        <div 
                          key={index}
                          className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900"
                        >
                          <span className="font-medium text-sm text-red-700 dark:text-red-400 truncate">
                            {breach.domain}
                          </span>
                          <span className="text-xs text-muted-foreground ml-2">
                            {new Date(breach.date).getFullYear()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Features Grid (Shown when no result) */}
      {!isScanning && !result && (
        <motion.section 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="container mx-auto max-w-5xl px-4 pb-24"
        >
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 rounded-xl bg-card border shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Real-time Validation</h3>
              <p className="text-muted-foreground">
                Connects directly to SMTP servers to verify existence without sending actual emails.
              </p>
            </div>
            <div className="p-6 rounded-xl bg-card border shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">Disposable Detection</h3>
              <p className="text-muted-foreground">
                Identifies temporary and burner email addresses to prevent fraud and fake signups.
              </p>
            </div>
            <div className="p-6 rounded-xl bg-card border shadow-xs hover:shadow-md transition-shadow">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4">
                <Server className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold mb-2">MX Record Lookup</h3>
              <p className="text-muted-foreground">
                Validates the domain's mail exchange records to ensure it can receive messages.
              </p>
            </div>
          </div>
        </motion.section>
      )}

      {/* Explanation Dialog */}
      <Dialog open={explanationOpen} onOpenChange={setExplanationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="w-5 h-5" />
              {selectedExplanation?.title || "Issue Details"}
            </DialogTitle>
            <DialogDescription>
              Here's why this was flagged
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {selectedExplanation?.factors.map((factor, index) => (
              <div 
                key={index}
                className={`flex items-start gap-3 p-4 rounded-lg border ${
                  factor.type === "danger" 
                    ? "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900" 
                    : "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-900"
                }`}
              >
                <div className={`p-1.5 rounded-full mt-0.5 ${
                  factor.type === "danger" 
                    ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400" 
                    : "bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400"
                }`}>
                  {factor.type === "danger" ? <XCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                </div>
                <div>
                  <p className={`font-semibold ${
                    factor.type === "danger" ? "text-red-700 dark:text-red-400" : "text-yellow-700 dark:text-yellow-400"
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