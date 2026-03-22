import { Shield, Zap, Terminal, Wallet, DollarSign, Users, MessageSquare, ArrowLeft, ExternalLink, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const commands = [
  {
    name: '/help',
    desc: 'View all available commands and how to get started - right inside Discord.',
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    name: '/authorize',
    desc: 'Link your Discord account to an X (Twitter) account. Pick from a dropdown of available accounts.',
    icon: <Shield className="h-5 w-5" />,
  },
  {
    name: '/wallet',
    desc: 'Set your Solana wallet address so you can receive payouts for verified work.',
    icon: <Wallet className="h-5 w-5" />,
  },
  {
    name: '/payout',
    desc: 'Request a payout once you have verified earnings. Admins will review and process it.',
    icon: <DollarSign className="h-5 w-5" />,
  },
  {
    name: '/clean',
    desc: 'Delete all bot shill messages from the current channel (admin use).',
    icon: <Terminal className="h-5 w-5" />,
  },
];

const faq = [
  {
    q: 'What is a Shiller?',
    a: 'A Shiller is an authorized team member linked to an X (Twitter) account. When a shill alert drops, you use /shill to reply to the target tweet. Each verified reply earns you money.',
  },
  {
    q: 'What is a Raider?',
    a: 'Raiders participate in the raid channel. You receive a secret code from an admin, and when a raid alert is posted you copy the shill text (which includes your unique hashtag) and paste it as a reply on X. Submit proof via the ✅ Verify Raid button to get paid.',
  },
  {
    q: 'How do I get paid?',
    a: 'First, set your wallet with /wallet. Shillers earn per verified click. Raiders earn $0.02 per verified raid reply. Once your balance builds up, use /payout to request a withdrawal. Admins process payouts in SOL to your Solana wallet.',
  },
  {
    q: 'How do I get authorized?',
    a: 'Head to the designated shill channel and type /authorize. Pick the X account you want to claim from the dropdown. Only one person can hold an account at a time.',
  },
  {
    q: 'What happens after I /shill?',
    a: 'The bot generates a reply, posts it to X using your linked account, and drops a confirmation embed with the reply link. Click tracking begins automatically.',
  },
  {
    q: 'How do raiders verify their work?',
    a: 'After you post the raid reply on X, click the ✅ Verify Raid button on the alert embed in Discord. Paste your reply URL in the modal. Admins review it and approve your click.',
  },
];

export default function ShillTeam() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero */}
      <div className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="relative max-w-5xl mx-auto px-6 py-16 md:py-24 text-center space-y-6">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-4">
            <ArrowLeft className="h-3.5 w-3.5" /> Home
          </Link>
          <div className="flex items-center justify-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Join the Shill Team</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Earn SOL by shilling and raiding on X. Get authorized, run commands, and stack verified clicks.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Badge variant="secondary" className="text-xs">Shillers</Badge>
            <Badge variant="secondary" className="text-xs">Raiders</Badge>
            <Badge variant="outline" className="text-xs">Earn SOL</Badge>
            <Badge variant="outline" className="text-xs">Discord Bot</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* Getting Started */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Getting Started</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { step: '1', title: 'Join & Open a Ticket', text: 'Join the Discord and open a ticket. All raiders and shillers are hand-selected by Warren — this is how you apply.' },
              { step: '2', title: 'Pick Your Role', text: 'Want to run an X account? Become a Shiller. Prefer quick raid replies? Join as a Raider.' },
              { step: '3', title: 'Start Earning', text: 'Set your wallet, get authorized, and start stacking verified clicks for SOL payouts.' },
            ].map(s => (
              <Card key={s.step} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-sm font-bold">{s.step}</div>
                    <CardTitle className="text-base">{s.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{s.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Roles */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Roles Explained</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-primary/20 bg-primary/[0.02]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Zap className="h-5 w-5 text-primary" /> Shiller
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>Shillers are linked 1:1 to an X account via <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/authorize</code>. When a shill alert fires, use <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/shill &lt;url&gt;</code> to auto-reply from your linked account.</p>
                <p>Each reply is tracked. Clicks on your reply link earn you money. Verified clicks = verified earnings.</p>
              </CardContent>
            </Card>
            <Card className="border-accent/20 bg-accent/[0.02]">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5 text-accent-foreground" /> Raider
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>Raiders don't need an X account link. You get a <strong>secret code</strong> from an admin. When a raid alert drops, copy the shill text (with your unique hashtag) and manually reply on X.</p>
                <p>Hit the <strong>✅ Verify Raid</strong> button and paste your reply URL. Admins verify it. Earn <strong>$0.02 per verified click</strong>.</p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Commands */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Discord Commands</h2>
          <p className="text-muted-foreground text-sm">These are the slash commands available inside the Discord server. Type <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/help</code> in the onboarding channel to see them all.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {commands.map(cmd => (
              <Card key={cmd.name} className="bg-card/50 border-border/50">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="mt-0.5 text-primary">{cmd.icon}</div>
                  <div>
                    <code className="text-sm font-semibold text-foreground">{cmd.name}</code>
                    <p className="text-xs text-muted-foreground mt-1">{cmd.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold">FAQ</h2>
          <Accordion type="single" collapsible className="space-y-1">
            {faq.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-border/50">
                <AccordionTrigger className="text-sm">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        {/* CTA */}
        <section className="text-center space-y-4 py-4">
          <h2 className="text-2xl font-bold">Ready to Start Earning?</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">Open a ticket in our Discord to get onboarded and receive your role.</p>
          <div className="flex items-center justify-center gap-3 mt-2">
            <a
              href="https://discord.gg/warrenguru"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" className="gap-2">
                Join the Discord <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
            <a
              href="https://t.me/+t9hUrz3q8ZE4YjBh"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" size="lg" className="gap-2">
                <Send className="h-5 w-5" /> Join the Telegram Lounge
              </Button>
            </a>
          </div>
        </section>

        {/* Footer */}
        <div className="border-t border-border/40 pt-8 text-center text-xs text-muted-foreground">
          Questions? Ask in the Discord onboarding channel.
        </div>
      </div>
    </div>
  );
}
