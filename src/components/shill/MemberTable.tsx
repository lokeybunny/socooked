import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BadgeCheck } from "lucide-react";

interface Member {
  handle: string;
  name: string;
  verified: boolean;
  followers: number;
  role: string;
}

export default function MemberTable({ members }: { members: Member[] }) {
  return (
    <ScrollArea className="h-[500px]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs w-[180px]">Handle</TableHead>
            <TableHead className="text-xs w-[140px]">Name</TableHead>
            <TableHead className="text-xs w-[90px]">Role</TableHead>
            <TableHead className="text-xs w-[80px] text-right">Followers</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((m) => (
            <TableRow key={m.handle}>
              <TableCell className="text-xs font-mono">
                <a
                  href={`https://x.com/${m.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  @{m.handle}
                  {m.verified && <BadgeCheck className="h-3 w-3 text-[#1d9bf0]" />}
                </a>
              </TableCell>
              <TableCell className="text-xs">{m.name}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{m.role}</TableCell>
              <TableCell className="text-xs text-right font-mono">
                {m.followers >= 1000 ? `${(m.followers / 1000).toFixed(1)}K` : m.followers}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}
