import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

const sections = [
  {
    title: '1. Service Description',
    body: `Warren Guru ("the Service") provides a subscription-based software platform for real estate wholesale operations. The Service includes, but is not limited to: AI-powered voice agents, seller landing pages, CRM pipeline management, distressed property data feeds, automated email communications, lead scoring, skip tracing integrations, and deal management tools. The Service is provided on an "as-is" basis and is subject to updates, modifications, and improvements at the sole discretion of Warren Guru.`,
  },
  {
    title: '2. Subscription & Billing',
    body: `By subscribing, you authorize Warren Guru to charge your designated payment method on a recurring monthly basis. The introductory rate is $599 per month for the first 90 days ("Introductory Period"). After the Introductory Period, the rate automatically adjusts to $799 per month ("Standard Rate"). You will be notified at least 14 days before the rate adjustment takes effect. All fees are non-refundable except as expressly provided herein.`,
  },
  {
    title: '3. Free Trial',
    body: `New subscribers receive a 24-hour free trial ("Trial Period"). During the Trial Period, your payment method will be authorized but not charged. If you do not cancel before the Trial Period expires, your subscription will automatically begin and your payment method will be charged the Introductory Rate. You may cancel during the Trial Period at no cost through your account dashboard.`,
  },
  {
    title: '4. Cancellation Policy',
    body: `You may cancel your subscription at any time through your account dashboard or by contacting support. Cancellation takes effect at the end of the current billing period. No partial refunds will be issued for unused portions of a billing period. Upon cancellation, you will retain access to the Service until the end of your paid period, after which your access will be suspended.`,
  },
  {
    title: '5. Data & Privacy',
    body: `Warren Guru collects and processes data necessary to provide the Service, including but not limited to: account information, property data, seller contact information, call recordings and transcripts, and usage analytics. We do not sell your personal data to third parties. Data collected through the Service (including seller leads and property information) remains your property. We may use aggregated, anonymized data to improve the Service. For detailed information about data handling practices, refer to our Privacy Policy.`,
  },
  {
    title: '6. AI Voice Agent Disclaimer',
    body: `The AI voice agent is an automated system that places and receives calls on your behalf. You are solely responsible for ensuring compliance with all applicable federal, state, and local laws regarding automated calling, including but not limited to the Telephone Consumer Protection Act (TCPA), Do Not Call regulations, and state-specific telemarketing laws. Warren Guru provides the technology but does not assume liability for your use of the calling system. You agree to use the AI voice agent only for lawful purposes and to maintain compliance with all applicable regulations.`,
  },
  {
    title: '7. Lead Data',
    body: `Property data and distressed lead information provided through the Service is sourced from public records and third-party data providers. Warren Guru does not guarantee the accuracy, completeness, or timeliness of this data. You acknowledge that property data may contain errors, outdated information, or inaccuracies. Warren Guru shall not be liable for any decisions made or actions taken based on the data provided through the Service.`,
  },
  {
    title: '8. Limitation of Liability',
    body: `To the maximum extent permitted by law, Warren Guru and its affiliates, officers, directors, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from or related to your use of the Service. Our total liability for any claim arising from or related to the Service shall not exceed the amount you paid for the Service in the 12 months preceding the claim. The Service does not guarantee any specific results, deal closings, or revenue outcomes.`,
  },
  {
    title: '9. Modifications',
    body: `Warren Guru reserves the right to modify these Terms & Conditions at any time. Material changes will be communicated via email or through the Service dashboard at least 14 days before taking effect. Continued use of the Service after modifications constitutes acceptance of the updated terms. If you do not agree with modified terms, your sole remedy is to cancel your subscription before the changes take effect.`,
  },
  {
    title: '10. Governing Law',
    body: `These Terms & Conditions shall be governed by and construed in accordance with the laws of the State of Florida, without regard to conflict of law principles. Any disputes arising from or related to these terms or the Service shall be resolved through binding arbitration in accordance with the rules of the American Arbitration Association, conducted in the State of Florida.`,
  },
];

export default function Terms() {
  return (
    <div className="bg-black text-white min-h-screen selection:bg-white/20">
      {/* Header */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-black/80 border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/pricing" className="flex items-center gap-2 text-white/40 hover:text-white transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="text-[10px] tracking-[0.2em] uppercase">Back to Pricing</span>
          </Link>
          <div className="flex flex-col leading-none items-center">
            <span className="text-white/30 font-light text-[8px] tracking-[0.3em] uppercase">Warren</span>
            <span className="text-white/80 font-medium text-sm tracking-[0.15em] uppercase -mt-0.5">GURU</span>
          </div>
          <div className="w-20" />
        </div>
      </header>

      <main className="pt-28 pb-24 px-6">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-12"
          >
            <p className="text-[10px] tracking-[0.4em] uppercase text-white/30 mb-3">Legal</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Terms & Conditions</h1>
            <p className="mt-3 text-xs text-white/30">
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </motion.div>

          <div className="space-y-10">
            {sections.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.4 }}
              >
                <h2 className="text-sm font-semibold text-white/70 mb-3">{s.title}</h2>
                <p className="text-xs text-white/30 leading-[1.8]">{s.body}</p>
              </motion.div>
            ))}
          </div>

          <div className="mt-16 pt-8 border-t border-white/[0.06] text-center">
            <p className="text-[10px] text-white/20 mb-4">
              By subscribing to Warren Guru, you acknowledge that you have read, understood, and agree to these Terms & Conditions.
            </p>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-black rounded-lg text-[10px] tracking-[0.2em] uppercase font-medium hover:bg-white/90 transition-colors"
            >
              Return to Pricing
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-8 px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex flex-col leading-none">
            <span className="text-white/20 font-light text-[8px] tracking-[0.3em] uppercase">Warren</span>
            <span className="text-white/40 font-medium text-xs tracking-[0.15em] uppercase -mt-0.5">GURU</span>
          </div>
          <p className="text-[9px] text-white/15">&copy; {new Date().getFullYear()} Warren Guru</p>
        </div>
      </footer>
    </div>
  );
}
