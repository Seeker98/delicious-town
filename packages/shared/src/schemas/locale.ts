import { z } from 'zod';
import { LOCALES } from '../locale';

export const localeSchema = z.enum(LOCALES);
