import ApifyApiManager from '@/components/wholesale/ApifyApiManager';

export default function ApiManagement() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">API Management</h1>
        <p className="text-sm text-muted-foreground">Manage Apify API keys and blocked workers</p>
      </div>
      <ApifyApiManager />
    </div>
  );
}
