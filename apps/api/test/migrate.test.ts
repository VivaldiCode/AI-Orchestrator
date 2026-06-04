import { describe, expect, it } from 'vitest';
import { splitStatements } from '../src/db/migrate';

describe('SQL statement splitter', () => {
  it('splits on top-level semicolons and strips comments', () => {
    const sql = `
      -- a comment
      CREATE TABLE x (a int);
      CREATE INDEX i ON x (a);
    `;
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('CREATE TABLE x');
    expect(stmts[1]).toContain('CREATE INDEX i');
  });

  it('does not split on semicolons inside string literals', () => {
    const stmts = splitStatements(`INSERT INTO y VALUES ('a;b;c');`);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("'a;b;c'");
  });

  it('keeps dollar-quoted blocks intact', () => {
    const sql = `DO $$ BEGIN PERFORM 1; PERFORM 2; END $$;\nSELECT 1;`;
    const stmts = splitStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain('PERFORM 1; PERFORM 2;');
    expect(stmts[1]).toBe('SELECT 1');
  });
});
