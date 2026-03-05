import { useParams } from 'react-router-dom';
import DocsLayout from '@/components/docs/DocsLayout';
import DocsStepper from '@/components/docs/DocsStepper';
import {
  Cpu, Wifi, Wallet, Info, Apple, Monitor, Terminal as TerminalIcon,
  Search, Tag, Flame, Download, Upload, ArrowLeftRight, ToggleLeft,
  Layers, Coins, Rocket, Copy, Import, Play, BarChart3, TrendingUp,
  Zap, RotateCcw, Settings2, FileText, Key, Grid3X3
} from 'lucide-react';

/* ─── Shared section header ─── */
function H1({ children }: { children: React.ReactNode }) {
  return <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{children}</h1>;
}
function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return <h2 id={id} className="text-xl font-bold border-b border-border/50 pb-2">{children}</h2>;
}
function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border/50 bg-card p-5 space-y-3">{children}</div>;
}
function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-muted-foreground">
      <strong className="text-destructive">⚠️ Warning:</strong> {children}
    </div>
  );
}
function Bullet({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <span className="text-sm leading-relaxed">{children}</span>
    </li>
  );
}
function SettingsTable({ rows }: { rows: { setting: string; desc: string }[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="text-left py-2 pr-4 font-semibold text-foreground min-w-[200px]">Setting</th>
            <th className="text-left py-2 font-semibold text-foreground">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.setting} className="border-b border-border/20">
              <td className="py-2 pr-4 text-foreground font-medium">{r.setting}</td>
              <td className="py-2 text-muted-foreground">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════
   PAGE CONTENT MAP
   ═══════════════════════════════════════════ */

function InstallationPage() {
  return (
    <div className="space-y-8">
      <H1>Installation</H1>
      <section className="space-y-4">
        <ul className="space-y-3">
          <Bullet icon={TerminalIcon}>
            Builds are located in the <strong className="text-foreground">Warren Guru Discord</strong> (discord.gg/warrenguru)
          </Bullet>
          <Bullet icon={Info}>There are no automatic updates (purposely done for security)</Bullet>
          <Bullet icon={Monitor}>We support <strong>Windows</strong>, <strong>macOS</strong>, and <strong>Linux</strong></Bullet>
          <Bullet icon={Cpu}>We recommend a machine with a minimum of <strong>8 CPUs</strong></Bullet>
          <Bullet icon={Apple}>
            <div>
              For macOS Apple Silicon installs you will need to run the following command to let Apple know that you wish to install the app:
              <code className="block mt-2 px-3 py-2 rounded-md bg-muted text-xs font-mono text-foreground">
                sudo xattr -rd com.apple.quarantine "/Applications/Warren Guru Bundler.app"
              </code>
            </div>
          </Bullet>
        </ul>
      </section>

      <section className="space-y-4">
        <H2 id="rpc">RPC</H2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          An RPC (also referred to as a node) is how you connect to the blockchain. Here is an analogy:
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
        <Card>
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">RPC Requirements</h3>
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
            <li>A node is <strong className="text-foreground">required</strong> to use the application</li>
            <li>We work with any node but we <strong className="text-destructive">don't</strong> recommend using free nodes or ones that have low rate limits</li>
            <li>Our partner <strong className="text-foreground">Helius</strong> is offering all Warren Guru users a free 48-hour trial — click the "Free Trial" button in the settings tab</li>
          </ul>
        </Card>
      </section>

      <section className="space-y-4">
        <H2 id="fee-wallet">Fee Wallet</H2>
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold mb-2">What is the Fee Wallet?</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The fee wallet is a dedicated Solana wallet used to pay transaction fees for various operations within Warren Guru Bundler. It automatically handles fee payments for mixing, warming, tagging, buying, selling, and launching tokens. Fees are displayed in-app by clicking on the info icon.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold mb-2">Recommended Balance</h3>
            <Card>
              <p className="text-sm text-muted-foreground leading-relaxed">
                <strong className="text-foreground">If you are an unlicensed user</strong>, we recommend maintaining at least <strong className="text-primary">0.25 – 0.5 SOL</strong> in your fee wallet to ensure smooth operation.
              </p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Fee Wallet Balance</span>
                  <span className="text-primary">0.35 SOL</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary w-[70%] transition-all" />
                </div>
              </div>
            </Card>
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
    </div>
  );
}

function WalletsPage() {
  return (
    <div className="space-y-8">
      <H1>Wallets</H1>
      <section className="space-y-4">
        <H2>Key Features</H2>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li><strong className="text-foreground">Search & Filter:</strong> Search by wallet name with active/inactive toggle</li>
          <li><strong className="text-foreground">Total Balance Display:</strong> Shows aggregate SOL balance across all displayed wallets</li>
          <li><strong className="text-foreground">Wallet Details:</strong> Displays name (rename-able), tags, address (hide-able), private key (hidden, copyable), token holdings, unclaimed rent, and SOL balance</li>
          <li><strong className="text-foreground">Bulk Selection:</strong> Checkbox selection with "Select All" functionality</li>
          <li><strong className="text-foreground">Sorting:</strong> Clickable column headers to sort by name, token holdings, unclaimed rent, or SOL balance</li>
          <li><strong className="text-foreground">Virtual Scrolling:</strong> Uses TanStack Virtual for optimized rendering of large wallet lists</li>
        </ul>
      </section>
      <section className="space-y-4">
        <H2>Wallet Operations (selection-based)</H2>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li><strong className="text-foreground">Generate/Import:</strong> Add new wallets to the system</li>
          <li><strong className="text-foreground">Fund:</strong> Send SOL to selected wallets (max 20)</li>
          <li><strong className="text-foreground">Tag:</strong> Apply platform tags (Photon, BullX, Trojan, Axiom, GMGN, PepeBoost)</li>
          <li><strong className="text-foreground">Warm:</strong> Execute warming transactions on wallets</li>
          <li><strong className="text-foreground">Redistribute:</strong> Balance SOL across selected wallets (max 20)</li>
          <li><strong className="text-foreground">Reclaim Rent:</strong> Recover rent from closed token accounts</li>
          <li><strong className="text-foreground">Withdraw:</strong> Extract SOL/tokens from selected wallets</li>
          <li><strong className="text-foreground">Export:</strong> Download wallet data as CSV</li>
          <li><strong className="text-foreground">Activate/Deactivate:</strong> Toggle wallet active status</li>
        </ul>
      </section>
      <section className="space-y-4">
        <H2>Additional Features</H2>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li>Re-sync balances button to refresh all wallet balances from blockchain</li>
          <li>Inline wallet renaming via popover</li>
          <li>Token holdings tooltip showing detailed balances per token</li>
        </ul>
      </section>
    </div>
  );
}

function GenerateWalletsPage() {
  return (
    <div className="space-y-8">
      <H1>Generate Wallets</H1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Generate new Solana wallets directly within Warren Guru Bundler. New wallets are created locally and added to your wallet list immediately.
      </p>
      <DocsStepper steps={[
        { title: 'Click Generate', content: <p>From the Wallets page, click on "Generate" to open the generation dialog.</p> },
        { title: 'Enter Number of Wallets', content: <p>Enter the number of wallets you want to generate.</p> },
        { title: 'Click Generate', content: <p>The wallets will be created and added to your wallet list. Make sure to fund them before use.</p> },
      ]} />
    </div>
  );
}

function FundWalletsPage() {
  return (
    <div className="space-y-8">
      <H1>Fund Wallets</H1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Send SOL to your selected wallets to prepare them for operations like tagging, warming, and launching tokens.
      </p>
      <DocsStepper steps={[
        { title: 'Select Wallets to Fund', content: <p>Select up to 20 wallets via checkboxes from the wallet list.</p> },
        { title: 'Click Fund', content: <p>Click on "Fund" to open the funding dialog.</p> },
        { title: 'Enter Source Wallet & Amount', content: <p>Enter the source wallet address and the amount of SOL to distribute. You can choose uniform or specific amounts per wallet.</p> },
        { title: 'Click Fund', content: <p>SOL will be sent to each selected wallet. Check the console to observe the status of the funding transactions.</p> },
      ]} />
    </div>
  );
}

function WithdrawFundsPage() {
  return (
    <div className="space-y-8">
      <H1>Withdraw Funds</H1>
      <H2>Withdraw Funds to Wallet</H2>
      <DocsStepper steps={[
        { title: 'Select Wallets to Withdraw From', content: <p>Select wallets via checkboxes.</p> },
        { title: 'Click on Withdraw', content: <p>Click on "Withdraw" to take you to the withdrawal page.</p> },
        { title: 'Enter the Destination Wallet Address', content: <p>Enter the wallet address where you want to send the funds.</p> },
        {
          title: 'Select Withdrawal Method',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Uniform Percentage:</strong> Whatever percentage you enter will be deducted from each selected wallet and sent to the destination wallet</li>
              <li><strong className="text-foreground">Uniform Amount:</strong> Whatever amount you enter will be deducted exactly from each selected wallet and sent to the destination wallet</li>
              <li><strong className="text-foreground">Specific Percentage:</strong> Enter percentage per wallet, the percentage specified for each wallet will be sent to the destination wallet</li>
              <li><strong className="text-foreground">Specific Amount:</strong> Enter exact amount per wallet, the amount specified for each wallet will be sent to the destination wallet</li>
            </ul>
          ),
        },
        {
          title: 'Click Withdraw',
          content: <p>This will start the withdrawal process. Check the console to observe the status of the withdrawal transactions.</p>,
        },
      ]} />
    </div>
  );
}

function TagWalletsPage() {
  return (
    <div className="space-y-8">
      <H1>Tag Wallets</H1>
      <DocsStepper steps={[
        { title: 'Select Wallets to Tag', content: <p>Select wallets via checkboxes.</p> },
        {
          title: 'Select Executor',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Jito:</strong> Highly recommended if you don't have a staked node</li>
              <li><strong className="text-foreground">RPC:</strong> If your node is staked you can also reliably use RPC mode</li>
            </ul>
          ),
        },
        {
          title: 'Select Tagging Mode',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Uniform:</strong> Will tag all the selected wallets with the same platform</li>
              <li><strong className="text-foreground">Specific:</strong> You can specify different tags per wallet</li>
            </ul>
          ),
        },
        {
          title: 'Select Trading Bot Tag',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li>Select from Trojan, Photon, Axiom, GMGN, PepeBoost, and BullX</li>
              <li>You can select and tag multiple platforms at once</li>
              <li>There is an auto assign button to randomize tag selection</li>
            </ul>
          ),
        },
        {
          title: 'Buy Amount',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Min Buy Amount:</strong> Lower bound in the random buy amount</li>
              <li><strong className="text-foreground">Max Buy Amount:</strong> Upper bound in the random buy amount</li>
            </ul>
          ),
        },
        {
          title: 'Select Mint',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Auto (random):</strong> Select a mint at random from a list provided by Warren Guru</li>
              <li><strong className="text-foreground">Custom:</strong> Provide a mint or list of mints that will be chosen from</li>
            </ul>
          ),
        },
        {
          title: 'Click Tag',
          content: <p>Will initiate a buy and sell for the specified amount. Check wallet address on gmgn.ai to see tag appear (sometimes it may take a few minutes).</p>,
        },
      ]} />
    </div>
  );
}

function WarmWalletsPage() {
  return (
    <div className="space-y-8">
      <H1>Warm Wallets</H1>
      <DocsStepper steps={[
        { title: 'Select Wallets to Warm', content: <p>Select wallets via checkboxes.</p> },
        {
          title: 'Select Executor',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Jito:</strong> Highly recommended if you don't have a staked node</li>
              <li><strong className="text-foreground">RPC:</strong> If your node is staked you can also reliably use RPC mode</li>
            </ul>
          ),
        },
        {
          title: 'Enter Swap Amounts',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Min Amount of Swaps:</strong> Minimum amounts of trades that will occur</li>
              <li><strong className="text-foreground">Max Amount of Swaps:</strong> Maximum amounts of trades that will occur</li>
            </ul>
          ),
        },
        {
          title: 'Enter Buy Amounts',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Min Buy Amount:</strong> Minimum buy amount that will be used on a trade</li>
              <li><strong className="text-foreground">Max Buy Amount:</strong> Maximum buy amount that will be used on a trade</li>
            </ul>
          ),
        },
        {
          title: 'Delay',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Min Delay:</strong> Minimum amount of time that an asset will be held before selling</li>
              <li><strong className="text-foreground">Max Delay:</strong> Maximum amount of time that an asset will be held before selling</li>
            </ul>
          ),
        },
        {
          title: 'Select Mint',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Auto (random):</strong> Select a mint at random from a list provided by Warren Guru</li>
              <li><strong className="text-foreground">Custom:</strong> Provide a mint or list of mints that will be chosen from</li>
            </ul>
          ),
        },
        {
          title: 'Click Warm',
          content: <p>Will initiate a warming process. Check wallet address on a site like gmgn.ai to see trade activity.</p>,
        },
      ]} />
    </div>
  );
}

function ReclaimRentPage() {
  return (
    <div className="space-y-8">
      <H1>Reclaim Rent</H1>
      <DocsStepper steps={[
        { title: 'Click Resync Balances', content: <p>Re-sync balances to get the amount of rent that is reclaimable per wallet.</p> },
        { title: 'Select the Wallets', content: <p>Select the wallets you want to close accounts on and reclaim their rent.</p> },
        {
          title: 'Choose Destination',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Fee Wallet:</strong> Deposit the fees into the fee wallet</li>
              <li><strong className="text-foreground">Custom Address:</strong> Specify an address where you want the fees sent to</li>
            </ul>
          ),
        },
      ]} />
    </div>
  );
}

function ImportPage() {
  return (
    <div className="space-y-8">
      <H1>Import</H1>
      <DocsStepper steps={[
        { title: 'Click Import', content: <p>From the wallets page, click on "Import".</p> },
        { title: 'Enter the Private Key of the Wallet', content: <p>Enter the private key of the wallet you want to import into the app.</p> },
      ]} />
    </div>
  );
}

function ExportPage() {
  return (
    <div className="space-y-8">
      <H1>Export</H1>
      <DocsStepper steps={[
        { title: 'Select the Wallets you Want to Export', content: <p>Select wallets via checkboxes.</p> },
        {
          title: 'Click Export',
          content: (
            <div className="space-y-2">
              <p>This will export the wallet data to a CSV.</p>
              <p>If you are using a VPS we highly recommend exporting wallets and/or withdrawing funds after each session.</p>
            </div>
          ),
        },
      ]} />
    </div>
  );
}

function RedistributePage() {
  return (
    <div className="space-y-8">
      <H1>Redistribute</H1>
      <DocsStepper steps={[
        { title: 'Select Wallets', content: <p>Select wallets via checkboxes.</p> },
        { title: 'Click on Redistribute', content: <p>Click the redistribute button.</p> },
        {
          title: 'Select Mode',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Standard Mode:</strong> Immediate transfer but will show on bubble maps as linked wallets</li>
              <li><strong className="text-foreground">Mixer Mode:</strong> Hopped transfers will not show on bubble maps as linked wallets</li>
            </ul>
          ),
        },
        { title: 'Click Redistribute Funds', content: <p>The redistribution will begin processing.</p> },
      ]} />
    </div>
  );
}

function ActivateDeactivatePage() {
  return (
    <div className="space-y-8">
      <H1>Activate + Deactivate</H1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        In Warren Guru Bundler, wallets can't be permanently deleted—you can only <strong className="text-foreground">deactivate</strong> them. This prevents accidental loss and ensures you always have full control. At any time, you can <strong className="text-foreground">reactivate a wallet</strong> and bring it back into use. Over time, this lets you build a personal <strong className="text-foreground">wallet repository</strong> that you can easily reuse across launches, strategies, and automations.
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Deactivating a wallet doesn't affect it in any way—it's simply a way to hide it until you're ready to use or view. Your balance and any blockchain operations on it remain completely unchanged.
      </p>
      <Card>
        <p className="text-sm text-primary font-semibold">💡 Pro Tip</p>
        <p className="text-sm text-muted-foreground">Activate only the wallets you intend to use for a launch and rename them so you can quickly identify them.</p>
      </Card>
    </div>
  );
}

function GroupingPage() {
  return (
    <div className="space-y-8">
      <H1>Grouping</H1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Organize your wallets into logical groups for easier management. Groups allow you to quickly select sets of wallets for operations like funding, tagging, warming, and launching.
      </p>
    </div>
  );
}

function TokensPage() {
  return (
    <div className="space-y-8">
      <H1>Tokens</H1>
      <section className="space-y-4">
        <H2>Key Features</H2>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li><strong className="text-foreground">Search & Filter:</strong> Search by token name with active/archived toggle</li>
          <li><strong className="text-foreground">Token Display:</strong> Shows token avatar, symbol, name, address (hideable), balance, realized profit, launchpad, and status</li>
          <li><strong className="text-foreground">Sorting:</strong> Clickable column headers to sort by name, balance, profit, launchpad, or status</li>
          <li><strong className="text-foreground">Actions:</strong> Create new tokens, copy existing tokens, or import external tokens via action buttons</li>
          <li><strong className="text-foreground">Profit Tracking:</strong> Displays profit percentage with share dialog for profitable tokens</li>
          <li><strong className="text-foreground">Virtual Scrolling:</strong> Uses TanStack Virtual for optimized rendering of large token lists</li>
          <li><strong className="text-foreground">Balance Aggregation:</strong> Calculates total token balances across all active wallets</li>
        </ul>
      </section>
    </div>
  );
}

function NewLaunchPage() {
  return (
    <div className="space-y-8">
      <H1>New Launch</H1>
      <DocsStepper steps={[
        { title: 'Click Create New', content: <p>This will take you to the new launch page.</p> },
        { title: 'Upload an Image for Your Memecoin', content: <p>Image must be less than 5 MB in size.</p> },
        {
          title: 'Enter Token Metadata and Socials',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li>Enter Name of the token</li>
              <li>Enter Symbol of the token</li>
              <li>Enter Description of the token (optional)</li>
              <li>Enter Website of the token (optional)</li>
              <li>Enter Tweet or X of the token (optional)</li>
              <li>Enter Telegram of the token (optional)</li>
            </ul>
          ),
        },
        {
          title: 'Use Vanity',
          content: (
            <div className="space-y-2">
              <p>It is recommended to always use vanity.</p>
              <p>If you run out of vanities open a ticket in our discord and we will provide you more for free.</p>
            </div>
          ),
        },
      ]} />
    </div>
  );
}

function CopyTokenPage() {
  return (
    <div className="space-y-8">
      <H1>Copy Token</H1>
      <DocsStepper steps={[
        { title: 'Click on Copy', content: <p>From the tokens page, click on copy.</p> },
        {
          title: 'Enter Token Mint Address',
          content: (
            <div className="space-y-2">
              <p>Enter the token CA of the token you wish to copy (the token must have been launched previously).</p>
              <p>We support cross platform copying. This means you can enter a bonk CA and select pumpfun as the target platform. If something ran on pumpfun and you want to quickly launch it on bonk, you can copy the CA and select bonk and the token will be ready to launch on bonk within seconds.</p>
            </div>
          ),
        },
        { title: 'Toggle Vanity', content: <p>Recommended to use vanities.</p> },
        { title: 'Click Copy', content: <p>Once you click copy you will see a copy of the token. You can edit any metadata you wish except the CA.</p> },
      ]} />
    </div>
  );
}

function ImportTokenPage() {
  return (
    <div className="space-y-8">
      <H1>Import Token</H1>
      <DocsStepper steps={[
        { title: 'Click Import', content: <p>From the tokens page, click on "Import".</p> },
        { title: 'Enter CA of Token', content: <p>Enter the address of the token you want to import. Token must be on pumpfun, pumpswap, bonk, or on launch lab.</p> },
        { title: 'Click Import', content: <p>The token will be imported into your token list.</p> },
      ]} />
    </div>
  );
}

function LaunchTokenPage() {
  return (
    <div className="space-y-8">
      <H1>Launch Token</H1>
      <DocsStepper steps={[
        { title: 'Click on the Token', content: <p>Token must have a status of pre-launch (meaning it wasn't launched yet).</p> },
        { title: 'Click on Prepare Launch', content: <p>Apply blueprint if you have a strategy saved.</p> },
        { title: 'Select Dev Wallet', content: <p>Choose which wallet will be used as the dev wallet for this launch.</p> },
        { title: 'Dev Buy Amount', content: <p>Dev wallet pays the initial token creation fees to pumpfun/launchlab/bonk so be sure to have at least 0.05 SOL leftover after setting your dev buy amount.</p> },
        {
          title: 'Block Zero',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li>If you wish to enable block 0 sniping toggle it on</li>
              <li>These snipes will be directly after the dev buy in a block</li>
              <li><strong className="text-foreground">Safe Mode:</strong> Up to 20 snipes but detectable (looks extremely fake)</li>
              <li><strong className="text-foreground">Quick Scope:</strong> Up to 3 snipes and undetected (much more realistic)</li>
              <li>Enter buy amounts next to each wallet you wish to use. Leave an extra 0.05 SOL for fees</li>
              <li>Don't use the dev wallet as one of the snipes</li>
            </ul>
          ),
        },
        { title: 'Sniping', content: <p>Very experimental for now — do not recommend using it until the gRPC compatibility update is released.</p> },
        { title: 'Set up Automations', content: <p>You can set up any automated tasks so you don't have to worry about things after launch.</p> },
        { title: 'Click Launch', content: <p>Once you click launch the token should be live within a few seconds.</p> },
      ]} />

      <section className="space-y-4">
        <H2>Activity</H2>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li>Shows all buys and sells</li>
          <li>Purple text with the 💰 emoji denotes external buys</li>
          <li>You can click on the SOL icon to see the txn on solscan</li>
        </ul>
      </section>

      <section className="space-y-4">
        <H2>Tasks</H2>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li>Any queued up tasks will show here</li>
          <li>Press play to execute right away</li>
          <li>Press stop to cancel</li>
          <li>Automations will fire on their own as triggers are met</li>
        </ul>
      </section>

      <section className="space-y-4">
        <H2>Token Metrics</H2>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li><strong className="text-foreground">Total Profit/Loss:</strong> How much SOL you are in profit or loss</li>
          <li><strong className="text-foreground">Value of Holdings:</strong> The current value of your token holdings</li>
          <li><strong className="text-foreground">Amount Invested:</strong> The amount of SOL you have invested</li>
          <li><strong className="text-foreground">Amount Sold:</strong> The amount of SOL you have sold</li>
          <li><strong className="text-foreground">Token Holdings:</strong> How many tokens you hold</li>
          <li>Price per Token</li>
          <li>Bonding curve percentage</li>
          <li>Market Cap</li>
        </ul>
      </section>
    </div>
  );
}

function VolumePage() {
  return (
    <div className="space-y-8">
      <H1>Volume</H1>
      <H2>Add Volume</H2>
      <DocsStepper steps={[
        { title: 'Enter Min Buy Amount', content: <p>Minimum amount that will be bought by the selected wallets.</p> },
        { title: 'Enter Max Buy Amount', content: <p>Maximum amount that will be bought by the selected wallets.</p> },
        { title: 'Enter Min Delay', content: <p>Minimum amount in seconds that will be awaited before a buy. Entering a 1 is equivalent to 1 second.</p> },
        { title: 'Enter Max Delay', content: <p>Maximum amount in seconds that will be awaited before a buy. Entering a 3 is equivalent to 3 seconds.</p> },
        {
          title: 'Select the Wallets',
          content: (
            <div className="space-y-2">
              <p>Select the wallets you want to buy with.</p>
              <p>Make sure the wallet has a balance that falls in between the min and max buy amounts (leave around 0.05 SOL for network fees + tips).</p>
              <p>So if your volume wallet has 0.3 SOL then the <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">Max Buy Amount</code> should never be set over 0.25 SOL.</p>
            </div>
          ),
        },
        {
          title: 'Click Add Volume',
          content: <p>This will begin the volume task and buy randomly between your min and max delay with an amount in between your min and max buy per wallet. If you want to pair up selling with the volume buys you can create sell token automated tasks or use the quick sell buttons.</p>,
        },
      ]} />
    </div>
  );
}

function BulkSellPage() {
  return (
    <div className="space-y-8">
      <H1>Bulk Sell</H1>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Bulk sell allows you to sell tokens from multiple wallets simultaneously. Select the wallets and percentage of holdings to sell, and the operation will execute across all selected wallets.
      </p>
      <DocsStepper steps={[
        { title: 'Select Wallets', content: <p>Select the wallets you want to sell from.</p> },
        { title: 'Enter Sell Percentage', content: <p>Enter the percentage of token holdings you want to sell from each wallet.</p> },
        { title: 'Click Bulk Sell', content: <p>All selected wallets will sell the specified percentage. Check the console for transaction status.</p> },
      ]} />
    </div>
  );
}

function BumpPage() {
  return (
    <div className="space-y-8">
      <H1>Bump</H1>
      <DocsStepper steps={[
        { title: 'Enter Buy Amount', content: <p>Enter a buy amount for the bumps. Typically bumps are around 0.02 SOL.</p> },
        { title: 'Enter Iterations', content: <p>Enter how many iterations of bumps you want to run. You won't be able to stop these once initiated unless you close the app.</p> },
        { title: 'Enter Min and Max Delay', content: <p>Enter a min and max delay in between bumps.</p> },
        {
          title: 'Select Wallets',
          content: <p>Select the wallets that you want to use for the bumps. The selected wallets will be randomly rotated to fulfill the total number of iterations. For example, if you set 15 iterations across 3 wallets, the system will still execute 15 swaps in total, distributing them among all 3 wallets.</p>,
        },
        { title: 'Click Bump', content: <p>The bumping process will begin.</p> },
      ]} />
    </div>
  );
}

function SellBuybackPage() {
  return (
    <div className="space-y-8">
      <H1>Sell Buyback</H1>
      <DocsStepper steps={[
        { title: 'Select Sell Wallet', content: <p>Select the wallet you want to sell. One good use case for this functionality is when doing the dev sell.</p> },
        { title: 'Enter Sell Percentage', content: <p>Enter the amount of the sell wallet's holdings you want to sell.</p> },
        { title: 'Select Buy Back Wallets', content: <p>Select up to 4 wallets to buy back with. Enter the amount of SOL you want to buy making sure to leave at least 0.05 leftover for fees.</p> },
        { title: 'Click Sell Buyback', content: <p>The sell buyback operation will begin.</p> },
      ]} />
    </div>
  );
}

function AutomationsPage() {
  return (
    <div className="space-y-8">
      <H1>Automations</H1>
      <DocsStepper steps={[
        {
          title: 'Add Task',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Add Volume:</strong> Automated volume generation</li>
              <li><strong className="text-foreground">Bump:</strong> Automated bump operations</li>
              <li><strong className="text-foreground">Bulk Sell:</strong> Automated bulk sell</li>
              <li><strong className="text-foreground">Sell Buyback:</strong> Automated sell buyback</li>
              <li><strong className="text-foreground">Buy Token:</strong> Individual Buy</li>
              <li><strong className="text-foreground">Sell Token:</strong> Individual Sell</li>
            </ul>
          ),
        },
        {
          title: 'Select a Trigger',
          content: (
            <ul className="list-disc list-inside space-y-1">
              <li><strong className="text-foreground">Manual:</strong> Press a button after launch to run the task. For example, run volume after verifying external snipers have left.</li>
              <li><strong className="text-foreground">Delay:</strong> Task executes a set number of seconds after launch. For example, perform a dev sell automatically after 5 seconds.</li>
              <li><strong className="text-foreground">Market Cap:</strong> Task runs after a desired market cap is reached. For example, auto-run volume after market cap hits 10K.</li>
              <li><strong className="text-foreground">Profit:</strong> Task runs when your profit reaches the inputted value. For example, sell 25% of holdings after being 1 SOL in profit.</li>
            </ul>
          ),
        },
      ]} />
    </div>
  );
}

function BlueprintPage() {
  return (
    <div className="space-y-8">
      <H1>Blueprint</H1>
      <H2>Create a Blueprint</H2>
      <DocsStepper steps={[
        { title: 'Click New Blueprint', content: <p>Click New Blueprint to create a new blueprint or click the settings gear to edit an existing one.</p> },
        { title: 'Name the Strategy', content: <p>Name the strategy with detail so you know which to pick from the prepare launch page.</p> },
        {
          title: 'Select the Number of Wallets',
          content: <p>Select the number of wallets to be used for the strategy. You will assign wallet numbers as placeholders. For example if Wallet #1 in your blueprint is the dev wallet, when you assign wallets when applying the template you will choose the dev wallet you want to use and assign it to Wallet #1.</p>,
        },
      ]} />

      <H2>Apply a Blueprint</H2>
      <DocsStepper steps={[
        {
          title: 'Apply from Launch Token',
          content: (
            <div className="space-y-2">
              <p>On the Launch Token form click on Apply Blueprint on the top right.</p>
              <p>Select the blueprint from the dropdown.</p>
              <p>You can auto assign wallets or manually do them — you will need to ensure there is enough SOL in each wallet to perform the task you have assigned it to.</p>
            </div>
          ),
        },
        { title: 'Click Apply', content: <p>The blueprint will be applied to your launch configuration.</p> },
      ]} />

      <Card>
        <p className="text-sm text-primary font-semibold">💡 Pro Tip</p>
        <p className="text-sm text-muted-foreground">Click Auto Assign and then go make manual changes so that you don't have to assign one by one.</p>
      </Card>
    </div>
  );
}

function VanitiesPage() {
  return (
    <div className="space-y-8">
      <H1>Vanities</H1>

      <H2>Add Vanities</H2>
      <DocsStepper steps={[
        { title: 'Click Add Vanities', content: <p>On the vanities menu click on "Add".</p> },
        {
          title: 'Enter the Private Keys',
          content: (
            <div className="space-y-2">
              <p>Enter the private keys (new line per key).</p>
              <p>An example of what a key looks like:</p>
              <code className="block px-3 py-2 rounded-md bg-muted text-xs font-mono text-foreground break-all">
                2Pf9FUckSohxUUDGr9Y5Q6McF9YVycQZnrWwXpeU3sDuKyADDuXDenXNeFcKT1BT4Lk6VGm8y4qiJJdy7aYW8v7f
              </code>
            </div>
          ),
        },
        { title: 'Click Save', content: <p>After clicking save you should see your vanities ending in "pump" or "bonk".</p> },
      ]} />

      <H2>Archive Used</H2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Click Archive Used to check if a vanity has already been used. The program will automatically check and mark it as used and archive it. You typically don't need to do this and is more of a safety mechanism.
      </p>

      <H2>Request More</H2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If you run out of vanities or need more, open a ticket and request more. This is done manually because our app has no backend — being serverless is a core principle so we designed this vanity page to facilitate this requirement.
      </p>

      <H2>Generate Your Own</H2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        If you would like to generate your own vanities for maximum privacy, you can use our free script available on GitHub.
      </p>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="space-y-8">
      <H1>Settings</H1>

      <H2>RPC Configuration</H2>
      <SettingsTable rows={[
        { setting: 'Solana RPC HTTP Endpoint', desc: 'The HTTP endpoint URL for your Solana RPC. Do not use the default one!' },
        { setting: 'Solana RPC WS Endpoint', desc: 'Solana RPC Websocket Endpoint. Do not use the default one!' },
        { setting: 'Skip Preflight', desc: 'Skip preflight checks before sending transactions. This can speed up transaction sending. Some RPCs do not support preflight checks so we recommend this to be on.' },
      ]} />

      <H2>Jito Configuration</H2>
      <SettingsTable rows={[
        { setting: 'Jito Location', desc: 'The Jito location for validating transactions. Select the closest location to you for optimal performance.' },
        { setting: 'Jito Bundle Max Tip', desc: 'The maximum allowed tip (SOL) for Jito bundles. If you set this too low bundles may not land.' },
        { setting: 'Jito Transaction Max Tip', desc: 'The maximum allowed tip (SOL) for single Jito transactions. If you set this too low transactions may not land.' },
      ]} />

      <H2>Astralane Configuration</H2>
      <SettingsTable rows={[
        { setting: 'Astralane Location', desc: 'Astralane location for validating transactions. Select the closest location to you for optimal performance.' },
        { setting: 'Astralane API Key', desc: "This is purely optional. If you don't have one don't worry — Astralane will still work." },
        { setting: 'Astralane Min Priority Fee', desc: 'The min priority fee in SOL for Astralane transactions.' },
        { setting: 'Astralane Max Priority Fee', desc: 'The max priority fee in SOL for Astralane transactions.' },
        { setting: 'Astralane Transaction Max Tip', desc: 'The maximum allowed tip in SOL for Astralane transactions.' },
      ]} />

      <H2>Trading Configuration</H2>
      <SettingsTable rows={[
        { setting: 'Proxies', desc: 'Optional. Proxy in the format: host:port:username:password. Separate each proxy with a new line. You do not need proxies as Astralane handles everything for you.' },
        { setting: 'Launchpad Buy Slippage', desc: 'Allowed slippage for launchpad buy orders. Too low = orders may not fill. Too high = possible MEV loss.' },
        { setting: 'Launchpad Sell Slippage', desc: 'Allowed slippage for launchpad sell orders. If set too low, orders may not fill.' },
        { setting: 'DEX Buy Slippage', desc: 'Allowed slippage for DEX buy orders. Typically set low because you need x + (x * slippage) to fill.' },
        { setting: 'DEX Sell Slippage', desc: 'Allowed slippage for DEX sell orders.' },
      ]} />

      <H2>General Settings</H2>
      <SettingsTable rows={[
        { setting: 'Default Executor', desc: 'Jito or RPC for preferred default executor. You can toggle this per task during launch.' },
        { setting: 'Quick Buy/Sell Options', desc: 'Set your default quick buy and sell buttons to the presets of your liking.' },
        { setting: 'Auto Open Links on Launch', desc: 'A tab with your preferred charting platform will open with your current launch as soon as the token is created.' },
        { setting: 'Hide Addresses', desc: 'Hide your addresses by default. Great for content creators who record their usage of the app.' },
      ]} />

      <Warn>
        You must purchase an RPC subscription and replace the Solana RPC HTTP Endpoint and Solana RPC WS Endpoint. We <strong>DO NOT</strong> recommend public RPCs. Our partner, Helius, has a 48-hour FREE trial — click the button in settings and mention you are from Warren Guru.
      </Warn>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ROUTER
   ═══════════════════════════════════════════ */

const pages: Record<string, () => JSX.Element> = {
  installation: InstallationPage,
  wallets: WalletsPage,
  'generate-wallets': GenerateWalletsPage,
  'fund-wallets': FundWalletsPage,
  'withdraw-funds': WithdrawFundsPage,
  'tag-wallets': TagWalletsPage,
  'warm-wallets': WarmWalletsPage,
  'reclaim-rent': ReclaimRentPage,
  import: ImportPage,
  export: ExportPage,
  redistribute: RedistributePage,
  'activate-deactivate': ActivateDeactivatePage,
  grouping: GroupingPage,
  tokens: TokensPage,
  'new-launch': NewLaunchPage,
  'copy-token': CopyTokenPage,
  'import-token': ImportTokenPage,
  'launch-token': LaunchTokenPage,
  volume: VolumePage,
  'bulk-sell': BulkSellPage,
  bump: BumpPage,
  'sell-buyback': SellBuybackPage,
  automations: AutomationsPage,
  blueprint: BlueprintPage,
  vanities: VanitiesPage,
  settings: SettingsPage,
};

export default function BundlerDocs() {
  const { slug } = useParams<{ slug: string }>();
  const currentSlug = slug || 'installation';
  const PageComponent = pages[currentSlug] || InstallationPage;

  return (
    <DocsLayout>
      <PageComponent />
    </DocsLayout>
  );
}
