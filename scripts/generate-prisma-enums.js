#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd());
const schemaPath = path.join(root, 'backend', 'prisma', 'schema.prisma');
const outDir = path.join(root, 'frontend', 'src', 'generated');
const outFile = path.join(outDir, 'prisma-enums.ts');

function extractEnum(content, name) {
  const re = new RegExp(`enum\\s+${name}\\s*\\{([\\s\\S]*?)\\}`);
  const m = content.match(re);
  if (!m) return null;
  const body = m[1];
  const values = body
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\/\/.*$/, '').trim())
    .map((s) => s.replace(/,?$/, '').trim())
    .filter(Boolean);
  return values;
}

async function main() {
  if (!fs.existsSync(schemaPath)) {
    console.error('schema.prisma not found at', schemaPath);
    process.exit(1);
  }

  const schema = fs.readFileSync(schemaPath, 'utf8');
  const roles = extractEnum(schema, 'UserRole');
  if (!roles) {
    console.error('UserRole enum not found in schema.prisma');
    process.exit(1);
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const enumLines = roles.map((r) => `  ${r} = '${r}',`).join('\n');
  const roleArray = `[${roles.map((r) => `UserRole.${r}`).join(', ')}]`;

  const content = `// GENERATED FROM prisma/schema.prisma - do not edit manually\n` +
    `export enum UserRole {\n${enumLines}\n}\n\n` +
    `export const USER_ROLES: UserRole[] = ${roleArray};\n\n` +
    `export interface User {\n` +
    `  id: string;\n` +
    `  name: string;\n` +
    `  email: string;\n` +
    `  username: string;\n` +
    `  role: UserRole;\n` +
    `  regionCode?: string | null;\n` +
    `  isActive?: boolean;\n` +
    `}\n`;

  fs.writeFileSync(outFile, content, 'utf8');
  console.log('Wrote', outFile);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
