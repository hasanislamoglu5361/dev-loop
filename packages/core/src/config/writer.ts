import * as fs from 'node:fs';
import YAML from 'yaml';

export function writeYamlFile(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, YAML.stringify(value), 'utf-8');
}
