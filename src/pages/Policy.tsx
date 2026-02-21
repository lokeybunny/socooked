export default function Policy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10">
        <header>
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">← Back to home</a>
          <h1 className="text-3xl font-bold mt-6">Privacy Policy</h1>
          <p className="text-muted-foreground mt-2">Last updated: February 21, 2026</p>
        </header>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">1. Information We Collect</h2>
          <p className="text-muted-foreground leading-relaxed">
            We collect personal information that you voluntarily provide when using our services, including but not limited to:
          </p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1.5">
            <li>Name, email address, and phone number</li>
            <li>Company name and business information</li>
            <li>Billing and payment information</li>
            <li>Communications and correspondence you send to us</li>
            <li>Usage data, device information, and cookies when you visit our website</li>
            <li>Any content, files, or media you upload to our platform</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">2. How We Use Your Information</h2>
          <p className="text-muted-foreground leading-relaxed">
            We use the personal information we collect for the following purposes:
          </p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1.5">
            <li>To provide, operate, and maintain our services</li>
            <li>To process transactions and send related information (invoices, receipts)</li>
            <li>To communicate with you, including responding to inquiries and sending service updates</li>
            <li>To send promotional communications such as SMS messages, where you have opted in</li>
            <li>To improve our website, products, and services</li>
            <li>To comply with legal obligations and enforce our terms</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">3. Who We Share Your Information With</h2>
          <p className="text-muted-foreground leading-relaxed">
            We may share your personal information with the following categories of third parties:
          </p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1.5">
            <li>Service providers who assist in operating our business (e.g., payment processors, hosting providers)</li>
            <li>Professional advisors such as lawyers, auditors, and insurers</li>
            <li>Law enforcement or government authorities when required by law</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed">
            We do <strong className="text-foreground">not</strong> sell, rent, or trade your personal information to third parties for their marketing purposes.
          </p>
        </section>

        <section className="space-y-4 border border-border rounded-lg p-6 bg-muted/30">
          <h2 className="text-xl font-semibold">4. SMS / Text Messaging Policy</h2>
          <p className="text-muted-foreground leading-relaxed">
            By opting in to receive SMS or text messages from STU25, you consent to receiving recurring automated text messages related to our services, including but not limited to appointment reminders, service updates, and promotional offers.
          </p>
          <p className="text-foreground font-medium">
            SMS consent is not shared with third parties or affiliates for marketing purposes.
          </p>
          <ul className="list-disc pl-6 text-muted-foreground space-y-1.5">
            <li>Message frequency may vary</li>
            <li>Message and data rates may apply</li>
            <li>You may opt out at any time by replying <strong className="text-foreground">STOP</strong> to any message</li>
            <li>For help, reply <strong className="text-foreground">HELP</strong> or contact us at (818) 555-0125</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">5. Cookies and Tracking</h2>
          <p className="text-muted-foreground leading-relaxed">
            We use cookies and similar tracking technologies to collect usage data and improve our services. You can control cookie preferences through your browser settings.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">6. Data Security</h2>
          <p className="text-muted-foreground leading-relaxed">
            We implement industry-standard security measures to protect your personal information. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">7. Your Rights</h2>
          <p className="text-muted-foreground leading-relaxed">
            Depending on your jurisdiction, you may have the right to access, correct, delete, or restrict the processing of your personal information. To exercise these rights, please contact us using the information below.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-xl font-semibold">8. Contact Us</h2>
          <p className="text-muted-foreground leading-relaxed">
            If you have any questions about this Privacy Policy, please contact us:
          </p>
          <ul className="list-none text-muted-foreground space-y-1">
            <li><strong className="text-foreground">STU25</strong></li>
            <li>Phone: (818) 555-0125</li>
            <li>Las Vegas, NV &amp; Los Angeles, CA</li>
          </ul>
        </section>

        <footer className="pt-8 border-t border-border text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} STU25. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
