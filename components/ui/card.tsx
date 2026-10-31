import * as React from "react"
import { cn } from "cn"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-lg border bg-card text-sm text-card-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Card }
