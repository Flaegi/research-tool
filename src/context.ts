import { createContext } from 'react';

export const ViewModeContext = createContext<'detailed' | 'overview'>('detailed');
