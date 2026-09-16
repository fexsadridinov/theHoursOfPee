import * as React from 'react'
import { cn } from '../../lib/utils'

function Table({ className, containerClassName, ...props }: React.ComponentProps<'table'> & { containerClassName?: string }) {
  return (
    <div className={cn('relative w-full overflow-x-auto', containerClassName)}>
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead className={cn('[&_tr]:border-b', className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return <tfoot className={cn('border-t bg-muted/50 font-medium', className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return <th className={cn('h-10 px-3 text-left align-middle text-[10px] font-bold uppercase tracking-wider text-muted-foreground', className)} {...props} />
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return <td className={cn('p-3 align-middle text-[13px]', className)} {...props} />
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell }
