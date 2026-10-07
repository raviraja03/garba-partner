import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from './ui/Icon';
import { BACK_LINK } from './ui/link-styles';

/**
 * The top of a page: optional back link, the page title (the only `h1`), a one-line
 * description and the page's actions. On phones the actions drop below the title.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="space-y-2">
      {back && (
        <Link to={back.to} className={BACK_LINK}>
          <Icon name="arrow-left" className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h1">{title}</h1>
          {description && <p className="mt-1 max-w-prose text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
      </div>
    </header>
  );
}
