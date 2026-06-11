interface SkeletonBlockProps {
  className?: string
  style?: React.CSSProperties
}

export function SkeletonBlock({ className = '', style }: SkeletonBlockProps) {
  return <div className={`skeleton rounded ${className}`} style={style} />
}

export function SkeletonText({ className = '' }: { className?: string }) {
  return <div className={`skeleton h-4 rounded ${className}`} />
}

export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return (
    <div
      className="skeleton rounded-full shrink-0"
      style={{ width: size, height: size }}
    />
  )
}
