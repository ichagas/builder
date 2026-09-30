/**
 * docker compose applies every infra/migrations/*.sql as an initdb script and
 * the API runner then applies them again, so ALTERs on columns that a later
 * migration drops must be guarded. (Verified end to end against Postgres by
 * applying all files with psql and then running runMigrations().)
 */
import fs from "fs";
import path from "path";

const dir = path.resolve(__dirname, "../../../../../infra/migrations");

describe("migration 010 is re-runnable after 011 dropped the column", () => {
  const sql = fs.readFileSync(path.join(dir, "010_make_secret_columns_nullable.sql"), "utf8");

  it("only alters connection_string when the column exists", () => {
    expect(sql).toMatch(/IF EXISTS\s*\(\s*SELECT 1 FROM information_schema\.columns/);
    expect(sql).toMatch(/column_name = 'connection_string'/);
    const alter = sql.indexOf("ALTER COLUMN connection_string DROP NOT NULL");
    expect(alter).toBeGreaterThan(sql.indexOf("IF EXISTS"));
  });
});
