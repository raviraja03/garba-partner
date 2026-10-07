import { useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Dialog';
import { Icon } from '../../../components/ui/Icon';
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
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBlock() {
    setConfirmingBlock(false);
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
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            fullWidth={false}
            loading={block.isPending}
            onClick={() => {
              setConfirmingBlock(true);
            }}
          >
            <Icon name="shield" className="size-4.5" />
            Block
          </Button>
          <Button
            variant="ghost"
            size="sm"
            fullWidth={false}
            className="text-danger! hover:bg-danger-soft!"
            onClick={() => {
              setReporting(true);
            }}
          >
            <Icon name="alert" className="size-4.5" />
            Report
          </Button>
        </div>
      )}
      <Modal
        open={confirmingBlock}
        onClose={() => {
          setConfirmingBlock(false);
        }}
        title={`Block ${name}?`}
        description={`You won't see each other anywhere on GarbaMates, and any match and chat between you ends. ${name} won't be told.`}
        footer={
          <>
            <Button
              variant="secondary"
              className="sm:w-auto"
              onClick={() => {
                setConfirmingBlock(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" className="sm:w-auto" onClick={() => void handleBlock()}>
              Block
            </Button>
          </>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
