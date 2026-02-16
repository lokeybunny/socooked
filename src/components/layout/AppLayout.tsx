import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="flex justify-end p-4 pb-0">
          <ThemeToggle />
        </div>
        <div className="p-4 sm:p-6 md:p-8 pt-2 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
