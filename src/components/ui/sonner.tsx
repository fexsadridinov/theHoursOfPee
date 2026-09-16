import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'group toast group-[.toaster]:bg-primary group-[.toaster]:text-primary-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
