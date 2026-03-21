import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppLayout } from "@/components/layout/AppLayout";
import ReplyQueue from "@/components/reply-engine/ReplyQueue";
import SentReplies from "@/components/reply-engine/SentReplies";
import ReplySettings from "@/components/reply-engine/ReplySettings";
import ReplyAuditLogs from "@/components/reply-engine/ReplyAuditLogs";

export default function ReplyEngine() {
  const [activeTab, setActiveTab] = useState("queue");

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reply Engine</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate, review, and send replies to social posts
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="queue">Queue</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-4">
            <ReplyQueue />
          </TabsContent>
          <TabsContent value="sent" className="mt-4">
            <SentReplies />
          </TabsContent>
          <TabsContent value="settings" className="mt-4">
            <ReplySettings />
          </TabsContent>
          <TabsContent value="audit" className="mt-4">
            <ReplyAuditLogs />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
