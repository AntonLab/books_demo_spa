import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './index';

// Pre-typed so no component re-imports the store's types. Used only in
// organisms and pages (client/CLAUDE.md, rule 3).
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
