import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './index';

// Pre-typed so no component ever re-imports the store's types.
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
