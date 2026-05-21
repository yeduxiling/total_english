import './StarRating.css';

interface StarRatingProps {
  rating: number;
  maxStars?: number;
  size?: 'sm' | 'md' | 'lg';
}

export default function StarRating({ rating, maxStars = 5, size = 'md' }: StarRatingProps) {
  return (
    <div className={`star-rating star-rating--${size}`} title={`${rating}/${maxStars} 星`}>
      {Array.from({ length: maxStars }, (_, i) => (
        <span key={i} className={i < rating ? 'star-filled' : 'star-empty'}>
          ★
        </span>
      ))}
    </div>
  );
}
