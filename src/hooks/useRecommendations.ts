import { useEffect } from 'react';
import { subscribeToRecommendations } from '../services/playerRecommendations';

export function useRecommendations() {
  useEffect(subscribeToRecommendations, []);
}
