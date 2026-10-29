import { requestLogout } from './api';

function Settings({ reset }: { reset: () => void }) {
  const { refetch } = useQuery();
  const [open, setOpen] = useState(false);
  const mutation = useMutation();
  return (
    <Panel
      onRetry={refetch}
      onReset={reset}
      onLogout={requestLogout}
      onOpenChange={setOpen}
      onConfirm={mutation.mutateAsync}
    />
  );
}
