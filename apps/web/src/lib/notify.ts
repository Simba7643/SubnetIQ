import { toast } from 'sonner';
export function notify(
  message: string,
  kind: 'success' | 'error' | 'info' | 'warning' = 'success',
) {
  if (kind === 'error') toast.error(message);
  else if (kind === 'warning') toast.warning(message);
  else if (kind === 'info') toast.info(message);
  else toast.success(message);
}
