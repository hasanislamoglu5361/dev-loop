import { Command } from 'commander';

export function createCli(): Command {
  return new Command()
    .name('dev-loop')
    .description('AI-powered development loop automation')
    .version('0.1.0');
}
