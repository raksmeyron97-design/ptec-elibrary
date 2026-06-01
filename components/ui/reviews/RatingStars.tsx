// components/ui/RatingStars.tsx
import Icon from "@/components/ui/core/Icon";

type RatingStarsProps = {
  rating: number;
  compact?: boolean; // smaller stars + inline number, used on cards
};

export default function RatingStars({ rating, compact = false }: RatingStarsProps) {
  const rounded = Math.round(rating);
  const size = compact ? "text-[14px]" : "text-[18px]";

  return (
    <div className="flex items-center gap-1" aria-label={`${rating} out of 5`}>
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <Icon
            key={index}
            name="star"
            className={`${size} ${index < rounded ? "text-amber-400" : "text-text-muted"}`}
          />
        ))}
      </div>
      <span className={`ml-1 font-semibold text-text-body ${compact ? "text-[13px]" : "text-sm"}`}>
        {Number(rating).toFixed(1)}
      </span>
    </div>
  );
}
