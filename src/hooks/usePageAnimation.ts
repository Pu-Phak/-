import { useState, useEffect, useCallback } from 'react';
import { AppPage } from '../types';

export function usePageAnimation(_currentPage?: string) {
  // Always keep staggered entrance animation active every time as requested by user
  return {
    isFirstVisit: true,
    resetAllAnimations: () => {},
  };
}
