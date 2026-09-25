import type { Sequelize } from 'sequelize-typescript';

/**
 * Runs SQL statements in order inside ONE transaction. PostgreSQL DDL is transactional, so a
 * failing migration leaves no partial schema behind.
 */
export async function runInTransaction(
  sequelize: Sequelize,
  statements: readonly string[],
): Promise<void> {
  await sequelize.transaction(async (transaction) => {
    for (const statement of statements) {
      await sequelize.query(statement, { transaction });
    }
  });
}

/** SQL creating the standard `updated_at` trigger for a table. */
export function updatedAtTrigger(table: string): string {
  return `CREATE TRIGGER ${table}_set_updated_at BEFORE UPDATE ON ${table}
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()`;
}
