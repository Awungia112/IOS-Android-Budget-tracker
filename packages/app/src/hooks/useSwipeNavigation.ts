import { useState, useCallback } from 'react';
import { useSwipeable, type SwipeEventData } from 'react-swipeable';

interface UseSwipeNavigationOptions {
  slideCount: number;
  slideIndex: number;
  onSlideChange: (index: number) => void;
  onComplete?: () => void;
}

const SWIPE_DELTA_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;
const EDGE_ZONE_PX = 20;
const RUBBER_BAND_DAMPING = 0.3;

export function useSwipeNavigation({
  slideCount,
  slideIndex,
  onSlideChange,
  onComplete,
}: UseSwipeNavigationOptions) {
  const [dragOffset, setDragOffset] = useState(0);

  const isEdgeSwipe = (initial: [number, number]): boolean => {
    const startX = initial[0];
    const screenWidth = window.innerWidth;
    return startX < EDGE_ZONE_PX || startX > screenWidth - EDGE_ZONE_PX;
  };

  const handleSwiping = useCallback(
    (eventData: SwipeEventData) => {
      if (isEdgeSwipe(eventData.initial)) return;
      if (eventData.dir === 'Up' || eventData.dir === 'Down') return;

      const { deltaX } = eventData;
      const atStart = slideIndex === 0 && deltaX > 0;
      const atEnd = slideIndex === slideCount - 1 && deltaX < 0;

      if (atStart || atEnd) {
        setDragOffset(deltaX * RUBBER_BAND_DAMPING);
      } else {
        setDragOffset(deltaX);
      }
    },
    [slideIndex, slideCount],
  );

  const handleSwiped = useCallback(
    (eventData: SwipeEventData) => {
      setDragOffset(0);

      if (isEdgeSwipe(eventData.initial)) return;

      const { dir, absX, velocity } = eventData;
      const isSwipe = absX > SWIPE_DELTA_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD;
      if (!isSwipe) return;

      if (dir === 'Left') {
        if (slideIndex < slideCount - 1) {
          onSlideChange(slideIndex + 1);
        } else if (onComplete) {
          onComplete();
        }
      } else if (dir === 'Right') {
        if (slideIndex > 0) {
          onSlideChange(slideIndex - 1);
        }
      }
    },
    [slideIndex, slideCount, onSlideChange, onComplete],
  );

  const swipeHandlers = useSwipeable({
    onSwiping: handleSwiping,
    onSwiped: handleSwiped,
    trackMouse: false,
    trackTouch: true,
    delta: 10,
    preventScrollOnSwipe: false,
  });

  return { swipeHandlers, dragOffset };
}
