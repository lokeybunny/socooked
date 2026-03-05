import { ArrowLeft, Cpu, Wifi, Wallet, Info, Apple, Monitor, Terminal as TerminalIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function BundlerDocs() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero banner */}
      <div className="relative w-full h-48 bg-gradient-to-r from-primary/30 via-primary/10 to-background overflow-hidden">
        <div className="absolute inset-0 bg-[url('/images/og-face.png')] bg-cover bg-center opacity-10" />
        <div className="relative z-10 flex items-end h-full max-w-4xl mx-auto px-6 pb-6">
          <div>
            <p className="text-xs font-mono text-primary tracking-widest uppercase mb-1">Warren Guru Bundler</p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Installation</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-12">
        {/* Back link */}
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
        </Link>

        {/* Intro bullets */}
        <section className="space-y-4">
          <ul className="space-y-3 text-sm leading-relaxed">
            <li className="flex items-start gap-3">
              <TerminalIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>Builds are located in the <strong className="text-foreground">Warren Guru Discord</strong> (discord.gg/warrenguru)</span>
            </li>
            <li className="flex items-start gap-3">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>There are no automatic updates (purposely done for security)</span>
            </li>
            <li className="flex items-start gap-3">
              <Monitor className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>We support <strong>Windows</strong>, <strong>macOS</strong>, and <strong>Linux</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <Cpu className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <span>We recommend a machine with a minimum of <strong>8 CPUs</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <Apple className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <span>For macOS Apple Silicon installs you will need to run the following command to let Apple know that you wish to install the app:</span>
                <code className="block mt-2 px-3 py-2 rounded-md bg-muted text-xs font-mono text-foreground">
                  sudo xattr -rd com.apple.quarantine "/Applications/Warren Guru Bundler.app"
                </code>
              </div>
            </li>
          </ul>
        </section>

        {/* RPC Section */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold border-b border-border/50 pb-2" id="rpc">RPC</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            An RPC (also referred to as a node) is how you connect to the blockchain. Here is an analogy to help you understand:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Solana blockchain', analogy: 'the Internet' },
              { label: 'Warren Guru Bundler', analogy: 'your phone or laptop' },
              { label: 'RPC node', analogy: 'the Wi-Fi router' },
            ].map(item => (
              <div key={item.label} className="rounded-lg border border-border/50 bg-card p-4 text-center space-y-1">
                <p className="text-xs font-mono text-primary">{item.label}</p>
                <p className="text-sm text-muted-foreground">= {item.analogy}</p>
              </div>
            ))}
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            You can't connect to the Internet directly without Wi-Fi — your phone needs a router to send and receive information.
            Same thing here: your Solana app can't talk directly to the blockchain — it needs an <strong className="text-foreground">RPC</strong> to send and receive data (transactions, balances, program info, etc.).
          </p>

          <div className="rounded-lg border border-border/50 bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">RPC Requirements</h3>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
              <li>A node is <strong className="text-foreground">required</strong> to use the application</li>
              <li>We work with any node but we <strong className="text-destructive">don't</strong> recommend using free nodes or ones that have low rate limits</li>
              <li>Our partner <strong className="text-foreground">Helius</strong> is offering all Warren Guru users a free 48-hour trial — click the "Free Trial" button in the settings tab</li>
            </ul>
          </div>
        </section>

        {/* Fee Wallet Section */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold border-b border-border/50 pb-2" id="fee-wallet">Fee Wallet</h2>

          <div className="space-y-6">
            <div>
              <h3 className="text-base font-semibold mb-2">What is the Fee Wallet?</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The fee wallet is a dedicated Solana wallet used to pay transaction fees for various operations within Warren Guru Bundler. It automatically handles fee payments for mixing, warming, tagging, buying, selling, and launching tokens. Fees are displayed in-app by clicking on the info icon.
              </p>
            </div>

            <div>
              <h3 className="text-base font-semibold mb-2">Recommended Balance</h3>
              <div className="rounded-lg border border-border/50 bg-card p-5 space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">If you are an unlicensed user</strong>, we recommend maintaining at least <strong className="text-primary">0.25 – 0.5 SOL</strong> in your fee wallet to ensure smooth operation. This should last you for some time. The progress bar shows your current balance relative to this target.
                </p>

                {/* Visual progress bar mock */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Fee Wallet Balance</span>
                    <span className="text-primary">0.35 SOL</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary w-[70%] transition-all" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold mb-2">How Fees Work</h3>
              <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                <li>Fees are automatically deducted from your fee wallet during operations</li>
                <li>If fee wallet has insufficient balance, the operation will fail</li>
                <li>Percentage fees (buy/sell) are calculated based on the transaction amount</li>
                <li>Fixed fees are charged per operation regardless of transaction amount</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Navigation */}
        <div className="flex items-center justify-between border-t border-border/50 pt-6 text-sm">
          <Link to="/dashboard" className="text-muted-foreground hover:text-primary transition-colors">
            ← Welcome
          </Link>
          <Link to="/dashboard" className="text-muted-foreground hover:text-primary transition-colors">
            Wallets →
          </Link>
        </div>
      </div>
    </div>
  );
}
