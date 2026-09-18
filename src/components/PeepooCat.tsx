import { cn } from '../lib/utils'

const COLORS: Record<string, string> = {
  s: '#94B49F',
  p: '#ECB390',
  w: '#FCF8E8',
  i: '#2C3A32',
  d: '#2C3A32',
}

const OPEN = [
  '................',
  '..ss......ss....',
  '.spps....spps...',
  '.ssssssssssss...',
  'ssssssssssssss..',
  'sss.ww.ss.ww.ss.',
  'sss.wi.ss.wi.ss.',
  'ssssssspppsssss.',
  'ssss........sss.',
  'sssss.dddd.sss..',
  '.ssss......sss..',
  '.ssssssssssss...',
  '..sss....sss....',
  '................',
  '................',
  '................',
] as const

const SHUT = [
  '................',
  '..ss......ss....',
  '.spps....spps...',
  '.ssssssssssss...',
  'ssssssssssssss..',
  'sss....ss....ss.',
  'sss.dd.ss.dd.ss.',
  'ssssssspppsssss.',
  'ssss........sss.',
  'sssss.dddd.sss..',
  '.ssss......sss..',
  '.ssssssssssss...',
  '..sss....sss....',
  '................',
  '................',
  '................',
] as const

const pixels = (frame: readonly string[], className: string) => (
  <g className={className}>
    {frame.flatMap((row, y) => [...row].flatMap((cell, x) => {
      const fill = COLORS[cell]
      if (!fill) return []
      return <rect key={`${className}-${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill}/>
    }))}
  </g>
)

export function PeepooCat({ className }: { className?: string }) {
  return (
    <span className={cn('peepoo', className)} role="img" aria-label="Peepoo">
      <svg viewBox="0 0 16 16" width="1em" height="1em" shapeRendering="crispEdges" aria-hidden="true">
        <g className="peepoo-bob">
          {pixels(OPEN, 'peepoo-eyes-open')}
          {pixels(SHUT, 'peepoo-eyes-shut')}
        </g>
      </svg>
    </span>
  )
}
