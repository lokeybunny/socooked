import { useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { EmojiStyle, Theme } from "emoji-picker-react";

interface EmojiButtonProps {
  onSelect: (emoji: string) => void;
  size?: "sm" | "icon";
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
}

export default function EmojiButton({
  onSelect,
  size = "icon",
  align = "end",
  side = "top",
}: EmojiButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size={size === "icon" ? "icon" : "sm"}
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          aria-label="Insert emoji"
        >
          <Smile className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align={align}
        className="p-0 border-none bg-transparent shadow-none w-auto"
      >
        <EmojiPicker
          theme={Theme.DARK}
          emojiStyle={EmojiStyle.NATIVE}
          width={320}
          height={380}
          searchPlaceholder="Search emoji…"
          previewConfig={{ showPreview: false }}
          skinTonesDisabled
          onEmojiClick={(data) => {
            onSelect(data.emoji);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
