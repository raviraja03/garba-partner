import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { useBlockMember } from '../hooks';
import { ReportForm } from './ReportForm';

/**
 * Block and Report, available on every partner profile, match and chat. Both are silent: the
 * other member is never told. Either one ends any match (and chat) between the two.
 */
export function SafetyActions({
  userId,
  name,
  onDone,
}: {
  userId: string;
  name: string;
  onDone: (message: string) => void;
}) {
  const block = useBlockMember();
  const [reporting, setReporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBlock() {
    if (!window.confirm(`Block ${name}? You won't see each other anywhere on Garba Partner.`)) {
      return;
    }
    setError(null);
    try {
      await block.mutateAsync(userId);
      onDone(`${name} is blocked. They won't be told.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not block. Please try again.');
    }
  }

  return (
    <section aria-label="Safety" className="space-y-3">
      {reporting ? (
        <ReportForm
          userId={userId}
          name={name}
          onDone={onDone}
          onCancel={() => {
            setReporting(false);
          }}
        />
      ) : (
        <div className="flex gap-4">
          <Button variant="link" loading={block.isPending} onClick={() => void handleBlock()}>
            Block
          </Button>
          <Button
            variant="link"
            className="text-danger!"
            onClick={() => {
              setReporting(true);
            }}
          >
            Report
          </Button>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
