"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

import { cn } from "@/lib/utils"

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      // flex-col + overflow-hidden: الجذر يحترم h-*/max-h-* ولا يترك المحتوى يفيض خارج الحاوية فوق باقي الصفحة
      className={cn("relative flex flex-col overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        // flex-1 + min-h-0: يأخذ ارتفاع الحاوية الفعلي لا ارتفاع المحتوى — هذا ما يجعل التمرير الداخلي يعمل مع max-h-*
        className="focus-visible:ring-ring/50 w-full flex-1 min-h-0 rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "absolute flex touch-none p-px transition-colors select-none",
        orientation === "vertical" &&
          "inset-y-0 end-0 w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "inset-x-0 bottom-0 h-2.5 flex-col border-t border-t-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="bg-border relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }
