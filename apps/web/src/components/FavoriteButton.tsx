import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { queryClient } from '@/lib/query';
import { notify } from '@/lib/notify';
import { Button } from './ui';

type Favorite = { id: string; tool_id: string; label: string };
export function FavoriteButton({
  toolId,
  label,
  signInPath,
}: {
  toolId: string;
  label: string;
  signInPath: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, [user?.id]);
  const key = ['favorites', user?.id];
  const favorites = useQuery(
    { queryKey: key, queryFn: () => api<Favorite[]>('/favorites'), enabled: Boolean(user) },
    queryClient,
  );
  const records = Array.isArray(favorites.data) ? favorites.data : [];
  const current = records.find((favorite) => favorite.tool_id === toolId);
  const mutation = useMutation(
    {
      mutationFn: async () => {
        if (!user) throw new Error('Sign in to save favorites.');
        if (current) {
          await api(`/favorites/${current.id}`, { method: 'DELETE' });
          return null;
        }
        return api<Favorite>('/favorites', {
          method: 'POST',
          body: JSON.stringify({ tool_id: toolId, label }),
        });
      },
      onSuccess: (added) => {
        if (!active.current) return;
        queryClient.setQueryData<Favorite[]>(key, (prior) => {
          const existing = (Array.isArray(prior) ? prior : []).filter(
            (item) => item.tool_id !== toolId,
          );
          return added ? [...existing, added] : existing;
        });
        notify(added ? 'Tool added to your favorites' : 'Favorite removed');
      },
      onError: (error) => {
        if (active.current) notify(error.message, 'error');
      },
    },
    queryClient,
  );
  return (
    <Button
      variant="secondary"
      aria-pressed={Boolean(current)}
      aria-label={current ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      disabled={mutation.isPending || Boolean(user && favorites.isLoading)}
      title={favorites.error?.message}
      onClick={() => {
        if (!user) navigate(signInPath);
        else mutation.mutate();
      }}
    >
      <Star size={15} fill={current ? 'currentColor' : 'none'} />
      {current ? 'Favorited' : 'Favorite'}
    </Button>
  );
}
