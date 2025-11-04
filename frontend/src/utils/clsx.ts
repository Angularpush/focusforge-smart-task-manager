import { type ClassValue, clsx as clsxType } from 'clsx';

export { clsx } from 'clsx';

type CxOptions = ClassValue[] | { [key in string]?: boolean | ClassValue | undefined };

export function clsx(...inputs: CxOptions): string {
  return clsxType(...inputs);
}