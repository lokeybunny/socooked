import { useEffect, useState } from 'react';
import type { IGMedia, IGComment, IGConversation } from '@/lib/smm/types';
import { useSMMContext } from '@/lib/smm/context';
import { smmApi } from '@/lib/smm/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Send, Heart, MessageSquare, Image as ImageIcon, Reply, BarChart3, PenLine, History } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function SMMInstagram() {
  const { navigateToTab, profileId } = useSMMContext();
  const [tab, setTab] = useState('inbox');
  const [conversations, setConversations] = useState<IGConversation[]>([]);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [newMsg, setNewMsg] = useState('');
  const [media, setMedia] = useState<IGMedia[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [comments, setComments] = useState<IGComment[]>([]);

  const username = profileId || '';

  useEffect(() => {
    if (!username) return;
    smmApi.getIGConversations(username).then(setConversations);
    smmApi.getIGMedia(username).then(setMedia);
  }, [username]);

  useEffect(() => {
    if (selectedMedia && username) smmApi.getIGComments(username, selectedMedia).then(setComments);
  }, [selectedMedia, username]);

  const handleSend = async () => {
    if (!newMsg.trim() || !activeConv || !username) return;
    try {
      await smmApi.sendIGDM(username, activeConv, newMsg.trim());
      toast.success('Message sent');
      setNewMsg('');
    } catch {
      toast.error('Failed to send message');
    }
  };

  const handlePrivateReply = async (commentId: string) => {
    if (!username) return;
    try {
      await smmApi.replyToIGComment(username, commentId, 'Thanks for your comment! 🙏');
      toast.success('Private reply sent');
    } catch {
      toast.error('Failed to send reply');
    }
  };

  return (
    <div className="space-y-4">
      {/* Context Jump Buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => navigateToTab('analytics', { platform: 'instagram' })}>
          <BarChart3 className="h-3 w-3" /> Profile Analytics
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => navigateToTab('history', { platform: 'instagram' })}>
          <History className="h-3 w-3" /> Last 10 Posts
        </Button>
        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => navigateToTab('composer', { platform: 'instagram' })}>
          <PenLine className="h-3 w-3" /> Create IG Post
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="inbox" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" /> Inbox</TabsTrigger>
          <TabsTrigger value="media" className="gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Media</TabsTrigger>
        </TabsList>

        <TabsContent value="inbox">
          <div className="grid md:grid-cols-[280px_1fr] gap-4 min-h-[400px]">
            <div className="glass-card overflow-hidden">
              <div className="p-3 border-b border-border"><p className="text-xs font-semibold text-muted-foreground uppercase">Conversations</p></div>
              <div className="divide-y divide-border">
                {conversations.map(c => (
                  <button key={c.id} onClick={() => setActiveConv(c.id)}
                    className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${activeConv === c.id ? 'bg-muted' : ''}`}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-foreground">{c.participant}</p>
                      {c.unread && <span className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{c.last_message}</p>
                  </button>
                ))}
                {conversations.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No conversations</p>}
              </div>
            </div>

            <div className="glass-card flex flex-col">
              {activeConv ? (
                <>
                  <div className="flex-1 flex items-center justify-center p-4">
                    <p className="text-sm text-muted-foreground">DM thread view – messages load from IG API</p>
                  </div>
                  <div className="p-3 border-t border-border flex gap-2">
                    <Input placeholder="Type a message..." value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} />
                    <Button onClick={handleSend} size="icon"><Send className="h-4 w-4" /></Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center"><p className="text-sm text-muted-foreground">Select a conversation</p></div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="media">
          <div className="grid md:grid-cols-[1fr_320px] gap-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {media.map(m => (
                <button key={m.id} onClick={() => setSelectedMedia(m.id)}
                  className={`group relative aspect-square rounded-xl overflow-hidden border transition-all ${selectedMedia === m.id ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'}`}>
                  <img src={m.media_url} alt={m.caption} className="w-full h-full object-cover" loading="lazy" />
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <div className="flex items-center gap-3 text-white text-xs">
                      <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{m.like_count}</span>
                      <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{m.comments_count}</span>
                    </div>
                  </div>
                </button>
              ))}
              {media.length === 0 && <p className="text-xs text-muted-foreground text-center py-8 col-span-3">No media found</p>}
            </div>
            <div className="glass-card p-4 space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase">Comments</h4>
              {selectedMedia ? (
                comments.length > 0 ? (
                  <div className="space-y-3">
                    {comments.map(c => (
                      <div key={c.id} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-foreground">{c.username}</p>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" onClick={() => handlePrivateReply(c.id)}>
                            <Reply className="h-3 w-3" /> DM
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">{c.text}</p>
                        <p className="text-[10px] text-muted-foreground">{format(new Date(c.timestamp), 'MMM d, h:mm a')}</p>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-xs text-muted-foreground text-center py-4">No comments on this post</p>
              ) : <p className="text-xs text-muted-foreground text-center py-4">Select a post to view comments</p>}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
