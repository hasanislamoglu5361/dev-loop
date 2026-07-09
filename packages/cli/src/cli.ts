import { Command } from 'commander';
import { checkConfigFile } from '@dev-loop/core';

export function createCli(): Command {
  const program = new Command()
    .name('dev-loop')
    .description('AI-powered development loop automation')
    .version('0.1.0');

  program
    .command('config-check')
    .description('Validate dev-loop.yaml and print actionable errors')
    .option('-p, --project-dir <dir>', 'project directory containing dev-loop.yaml', process.cwd())
    .action((options: { projectDir: string }) => {
      const result = checkConfigFile(options.projectDir);

      if (!result.success) {
        console.error(result.message);
        process.exitCode = 1;
        return;
      }

      console.log(`${result.configPath} is valid.`);
    });

  return program;
}
