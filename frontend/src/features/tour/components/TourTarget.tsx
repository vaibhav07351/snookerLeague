import { useEffect, useRef, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTour } from '@/features/tour/hooks/use-tour';
import type { TourTargetId } from '@/features/tour/types/tour.types';
import { useScrollReveal } from '@/shared/hooks/use-scroll-reveal';

interface TourTargetProps {
  id: TourTargetId;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Marks real UI as a spotlight stop. Layout-neutral: a plain wrapper view. */
export function TourTarget({ id, children, style }: TourTargetProps): ReactNode {
  const tour = useTour();
  const reveal = useScrollReveal();
  const ref = useRef<View>(null);
  const sizedRef = useRef(false);

  useEffect(
    () =>
      tour.register(id, {
        getNode: () => ref.current,
        hasContent: () => sizedRef.current,
        reveal,
      }),
    [tour, id, reveal],
  );

  return (
    // collapsable={false}: Android must keep this view so it can be measured.
    <View
      ref={ref}
      collapsable={false}
      style={style}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        sizedRef.current = width > 0 && height > 0;
      }}
    >
      {children}
    </View>
  );
}
